import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { CreateOrganizacionDto } from './dto/create-organizacion.dto';
import { UpdateOrganizacionDto } from './dto/update-organizacion.dto';
import { QueryOrganizacionDto } from './dto/query-organizacion.dto';
import { Organizacion } from './entities/organizacion.entity';

@Injectable()
export class OrganizacionService {
  constructor(
    @InjectRepository(Organizacion)
    private organizacionRepository: Repository<Organizacion>,
  ) { }

  async createInTransaction(
    createOrganizacionDto: CreateOrganizacionDto,
    manager: EntityManager,
  ): Promise<Organizacion> {
    const repo = manager.getRepository(Organizacion);

    const cedJ = (createOrganizacionDto.cedulaJuridica ?? '').trim();

    // 1) Si existe por cédula jurídica, reusar
    const existente = await repo.findOne({ where: { cedulaJuridica: cedJ } });
    if (existente) {
      // Si querés, aquí podríamos permitir actualizar campos. Por ahora reusamos.
      return existente;
    }


    const organizacion = repo.create(createOrganizacionDto);
    return repo.save(organizacion);
  }

  async findAll(query?: QueryOrganizacionDto) {
    const { isActive, search, page = 1, limit = 20, sort } = query || {};

    let isActiveBoolean: boolean | undefined;
    if (isActive !== undefined) {
      if (typeof isActive === 'string') {
        isActiveBoolean = isActive === 'true';
      } else {
        isActiveBoolean = isActive;
      }
    }

    const queryBuilder = this.organizacionRepository
      .createQueryBuilder('organizacion')
      .leftJoinAndSelect('organizacion.representantes', 'representantes')
      .leftJoinAndSelect('representantes.persona', 'persona')
      .leftJoinAndSelect('organizacion.razonesSociales', 'razonesSociales')
      .leftJoinAndSelect('organizacion.areasInteres', 'areasInteres')
      .leftJoinAndSelect('organizacion.disponibilidades', 'disponibilidades')
      .leftJoin('organizacion.solicitud', 'solicitud');

    // REGLA DE NEGOCIO: Solo mostrar organizaciones con solicitud APROBADA
    queryBuilder.andWhere('solicitud.estado = :estadoSolicitud', {
      estadoSolicitud: 'APROBADO',
    });

    // Filtro por isActive
    if (isActiveBoolean !== undefined) {
      queryBuilder.andWhere('organizacion.isActive = :isActive', {
        isActive: isActiveBoolean,
      });
    }

    // Búsqueda por texto
    if (search) {
      queryBuilder.andWhere(
        '(organizacion.nombre LIKE :search OR organizacion.cedulaJuridica LIKE :search OR organizacion.email LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Ordenamiento
    if (sort) {
      const [field, order] = sort.split(':');
      const orderDirection = order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      queryBuilder.orderBy(`organizacion.${field}`, orderDirection);
    } else {
      queryBuilder.orderBy('organizacion.createdAt', 'DESC');
    }

    // Paginación
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<Organizacion> {
    const organizacion = await this.organizacionRepository.findOne({
      where: { idOrganizacion: id },
      relations: [
        'solicitud',
        'representantes',
        'representantes.persona',
        'razonesSociales',
        'areasInteres',
        'disponibilidades',
      ],
    });

    if (!organizacion) {
      throw new NotFoundException(`Organización con ID ${id} no encontrada`);
    }

    return organizacion;
  }

  async findByEmail(email: string): Promise<Organizacion> {
    const organizacion = await this.organizacionRepository.findOne({
      where: { email },
      relations: ['solicitud'],
    });

    if (!organizacion) {
      throw new NotFoundException(
        `Organización con email ${email} no encontrada`,
      );
    }

    return organizacion;
  }

  async update(
    id: number,
    updateOrganizacionDto: UpdateOrganizacionDto,
  ): Promise<Organizacion> {
    const organizacion = await this.findOne(id);

    // Validar que no se active si la solicitud no está aprobada
    if (
      updateOrganizacionDto.isActive !== undefined &&
      updateOrganizacionDto.isActive === true
    ) {
      if (organizacion.solicitud?.estado !== 'APROBADO') {
        throw new BadRequestException(
          'No se puede activar una organización cuya solicitud no está aprobada',
        );
      }
    }


    Object.assign(organizacion, updateOrganizacionDto);
    return this.organizacionRepository.save(organizacion);
  }

  // ✅ NUEVO: Toggle de estado
  async toggleStatus(id: number): Promise<Organizacion> {
    const organizacion = await this.organizacionRepository.findOne({
      where: { idOrganizacion: id },
      relations: ['solicitud'],
    });

    if (!organizacion) {
      throw new NotFoundException(`Organización con ID ${id} no encontrada`);
    }

    if (!organizacion.isActive && organizacion.solicitud?.estado !== 'APROBADO') {
      throw new BadRequestException(
        'No se puede activar una organización cuya solicitud no está aprobada',
      );
    }

    organizacion.isActive = !organizacion.isActive;
    return this.organizacionRepository.save(organizacion);
  }

  async remove(id: number): Promise<void> {
    const organizacion = await this.findOne(id);

    if (organizacion.isActive) {
      throw new BadRequestException(
        'No se puede eliminar una organización activa. Desactívela primero.',
      );
    }

    if (organizacion.solicitud) {
      throw new ConflictException(
        `No se puede eliminar la organización porque tiene una solicitud activa`,
      );
    }

    await this.organizacionRepository.remove(organizacion);
  }

  // ✅ NUEVO: Estadísticas
  async getStats() {
    const total = await this.organizacionRepository.count();
    const activos = await this.organizacionRepository.count({
      where: { isActive: true },
    });
    const inactivos = await this.organizacionRepository.count({
      where: { isActive: false },
    });

    return {
      total,
      activos,
      inactivos,
      porcentajeActivos: total > 0 ? ((activos / total) * 100).toFixed(2) : 0,
    };
  }
}