import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource } from 'typeorm';
import { CreateVoluntarioIndividualDto } from './dto/create-voluntario-individual.dto';
import { UpdateVoluntarioIndividualDto } from './dto/update-voluntario-individual.dto';
import { VoluntarioIndividual } from './entities/voluntario-individual.entity';
import { PersonaService } from '../../formAssociates/persona/persona.service';
import { QueryVoluntarioIndividualDto } from './dto/query-voluntario-individual.dto';
import { Persona } from 'src/formAssociates/persona/entities/persona.entity';

@Injectable()
export class VoluntarioIndividualService {
  constructor(
    @InjectRepository(VoluntarioIndividual)
    private voluntarioRepository: Repository<VoluntarioIndividual>,
    @InjectRepository(Persona)
    private personaRepository: Repository<Persona>,
    private personaService: PersonaService,
     private dataSource: DataSource,
  ) {}

  // Método transaccional (sin validaciones, usa EntityManager externo)
  async createInTransaction(
  dto: CreateVoluntarioIndividualDto,
  manager: EntityManager,
): Promise<VoluntarioIndividual> {
  const persona = await this.personaService.createInTransaction(dto.persona, manager);

  const repo = manager.getRepository(VoluntarioIndividual);

  // Buscar si ya existe voluntario para esa persona
  const existente = await repo.findOne({
    where: { persona: { idPersona: persona.idPersona } as any },
    relations: ["persona"],
  });

  if (existente) {
    // opcional: rellenar campos vacíos del voluntario
    const merged = repo.merge(existente, {
      motivacion: existente.motivacion || dto.motivacion,
      habilidades: existente.habilidades || dto.habilidades,
      experiencia: existente.experiencia || dto.experiencia,
      nacionalidad: existente.nacionalidad || dto.nacionalidad,
      // isActive NO lo tocamos aquí (solo con aprobación)
    });
    return repo.save(merged);
  }

  const voluntario = repo.create({
    persona,
    motivacion: dto.motivacion,
    habilidades: dto.habilidades,
    experiencia: dto.experiencia,
    nacionalidad: dto.nacionalidad,
    isActive: false,
  });

  return repo.save(voluntario);
}


  // Listado paginado - SOLO voluntarios con solicitud APROBADA
  async findAll(query?: QueryVoluntarioIndividualDto) {
  const { isActive, search, page = 1, limit = 20, sort } = query || {};

  // ✅ SOLUCIÓN: Convertir manualmente string a boolean
  let isActiveBoolean: boolean | undefined;
  if (isActive !== undefined) {
    if (typeof isActive === 'string') {
      isActiveBoolean = isActive === 'true';
    } else {
      isActiveBoolean = isActive;
    }
  }

  const queryBuilder = this.voluntarioRepository
    .createQueryBuilder('voluntario')
    .leftJoinAndSelect('voluntario.persona', 'persona')
    .leftJoinAndSelect('voluntario.areasInteres', 'areasInteres')
    .leftJoinAndSelect('voluntario.disponibilidades', 'disponibilidades')
    .leftJoinAndSelect('voluntario.solicitud', 'solicitud');

  queryBuilder.andWhere('solicitud.estado = :estadoSolicitud', {
    estadoSolicitud: 'APROBADO',
  });

  // ✅ Usar la versión convertida
  if (isActiveBoolean !== undefined) {
    queryBuilder.andWhere('voluntario.isActive = :isActive', { 
      isActive: isActiveBoolean 
    });
  }

  if (search) {
    queryBuilder.andWhere(
      '(persona.nombre LIKE :search OR persona.apellido1 LIKE :search OR persona.apellido2 LIKE :search OR persona.cedula LIKE :search OR persona.email LIKE :search)',
      { search: `%${search}%` },
    );
  }

  if (sort) {
    const [field, order] = sort.split(':');
    const orderDirection = order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    if (field.startsWith('persona.')) {
      queryBuilder.orderBy(field, orderDirection);
    } else {
      queryBuilder.orderBy(`voluntario.${field}`, orderDirection);
    }
  } else {
    queryBuilder.orderBy('voluntario.createdAt', 'DESC');
  }

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

  async findOne(id: number): Promise<VoluntarioIndividual> {
    const voluntario = await this.voluntarioRepository.findOne({
      where: { idVoluntario: id },
      relations: [
        'persona',
        'solicitud',
        'areasInteres',
        'disponibilidades',
      ],
    });

    if (!voluntario) {
      throw new NotFoundException(`Voluntario con ID ${id} no encontrado`);
    }

    return voluntario;
  }

async update(
  id: number,
  updateVoluntarioDto: UpdateVoluntarioIndividualDto,
): Promise<VoluntarioIndividual> {
  const voluntario = await this.findOne(id);

  // Extraer campos que pertenecen a Persona
  const { telefono, email, direccion, ...voluntarioFields } = updateVoluntarioDto;

  // Actualizar campos de Persona si existen
  if (telefono !== undefined || email !== undefined || direccion !== undefined) {
    const personaUpdate: any = {};
    if (telefono !== undefined) personaUpdate.telefono = telefono;
    if (email !== undefined) personaUpdate.email = email;
    if (direccion !== undefined) personaUpdate.direccion = direccion;

    await this.personaRepository.update(
      voluntario.persona.idPersona,
      personaUpdate
    );

    // RECARGAR la persona después de actualizarla
    voluntario.persona = await this.personaRepository.findOne({
      where: { idPersona: voluntario.persona.idPersona },
    }) || voluntario.persona;
  }

  // Actualizar campos del voluntario
  if (voluntarioFields.motivacion !== undefined) {
    voluntario.motivacion = voluntarioFields.motivacion;
  }

  if (voluntarioFields.habilidades !== undefined) {
    voluntario.habilidades = voluntarioFields.habilidades;
  }

  if (voluntarioFields.experiencia !== undefined) {
    voluntario.experiencia = voluntarioFields.experiencia;
  }

  if (voluntarioFields.nacionalidad !== undefined) {
    voluntario.nacionalidad = voluntarioFields.nacionalidad;
  }

  // Validar que no se active si la solicitud no está aprobada
  if (voluntarioFields.isActive !== undefined && voluntarioFields.isActive === true) {
    if (voluntario.solicitud?.estado !== 'APROBADO') {
      throw new BadRequestException(
        'No se puede activar un voluntario cuya solicitud no está aprobada',
      );
    }
  }

  if (voluntarioFields.isActive !== undefined) {
    voluntario.isActive = voluntarioFields.isActive;
  }

  // Guardar voluntario
  const savedVoluntario = await this.voluntarioRepository.save(voluntario);

  //Retornar con todas las relaciones recargadas
  return this.findOne(savedVoluntario.idVoluntario);
}
  // Toggle de estado (activar/desactivar)
  async toggleStatus(id: number): Promise<VoluntarioIndividual> {
    const voluntario = await this.voluntarioRepository.findOne({
      where: { idVoluntario: id },
      relations: ['persona', 'solicitud'],
    });

    if (!voluntario) {
      throw new NotFoundException(`Voluntario con ID ${id} no encontrado`);
    }

    // Validar que no se active si la solicitud no está aprobada
    if (!voluntario.isActive && voluntario.solicitud?.estado !== 'APROBADO') {
      throw new BadRequestException(
        'No se puede activar un voluntario cuya solicitud no está aprobada',
      );
    }

    voluntario.isActive = !voluntario.isActive;
    return this.voluntarioRepository.save(voluntario);
  }

  async remove(id: number): Promise<void> {
    const voluntario = await this.findOne(id);

    // No se puede eliminar si está activo
    if (voluntario.isActive) {
      throw new BadRequestException(
        'No se puede eliminar un voluntario activo. Desactívelo primero.',
      );
    }

    // Verificar si tiene una solicitud vinculada
    if (voluntario.solicitud) {
      throw new ConflictException(
        'No se puede eliminar el voluntario porque tiene una solicitud activa',
      );
    }

    await this.voluntarioRepository.remove(voluntario);
  }

  // Estadísticas
  async getStats() {
    const total = await this.voluntarioRepository.count();
    const activos = await this.voluntarioRepository.count({
      where: { isActive: true },
    });
    const inactivos = await this.voluntarioRepository.count({
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