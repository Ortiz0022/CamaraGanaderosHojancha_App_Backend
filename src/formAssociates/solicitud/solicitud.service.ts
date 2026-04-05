import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Solicitud } from './entities/solicitud.entity';
import { Associate } from 'src/formAssociates/associate/entities/associate.entity';
import { Persona } from 'src/formAssociates/persona/entities/persona.entity';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { ChangeSolicitudStatusDto } from './dto/change-solicitud-status.dto';
import { SolicitudStatus } from './dto/solicitud-status.enum';
import { Propietario } from '../propietario/entities/propietario.entity';
import { PersonaService } from '../persona/persona.service';
import { NucleoFamiliarService } from '../nucleo-familiar/nucleo-familiar.service';
import { NucleoFamiliar } from '../nucleo-familiar/entities/nucleo-familiar.entity';
import { FincaService } from 'src/formFinca/finca/finca.service';
import { GeografiaService } from 'src/formFinca/geografia/geografia.service';
import { PropietarioService } from '../propietario/propietario.service';
import { Finca } from 'src/formFinca/finca/entities/finca.entity';
import { DropboxService } from 'src/dropbox/dropbox.service';
import { HatoService } from 'src/formFinca/hato/hato.service';
import { AnimalService } from 'src/formFinca/animal/animal.service';
import { ForrajeService } from 'src/formFinca/forraje/forraje.service';
import { RegistrosProductivosService } from 'src/formFinca/registros-productivos/registros-productivos.service';
import { FuentesAguaService } from 'src/formFinca/fuente-agua/fuente-agua.service';
import { MetodoRiegoService } from 'src/formFinca/metodo-riego/metodo-riego.service';
import { ActividadesAgropecuariasService } from 'src/formFinca/actividad-agropecuaria/actividad.service';
import { FincaOtroEquipoService } from 'src/formFinca/otros-equipos/finca-otro-equipo.service';
import { InfraestructuraProduccionService } from 'src/formFinca/equipo/equipo.service';
import { TiposCercaService } from 'src/formFinca/tipo-cerca/tipo-cerca.service';
import { FincaTipoCercaService } from 'src/formFinca/finca-tipo-cerca/finca-tipo-cerca.service';
import { FincaInfraestructurasService } from 'src/formFinca/finca-infraestructura/fincaInfraestructura.service';
import { CorrienteElectrica } from 'src/formFinca/corriente-electrica/entities/corriente.entity';
import { CorrienteElectricaService } from 'src/formFinca/corriente-electrica/corriente.service';
import { AccesoService } from 'src/formFinca/acceso/acceso.service';
import { CanalesComercializacionService } from 'src/formFinca/canal-comercializacion/canal.service';
import { NecesidadesService } from 'src/formFinca/necesidades/necesidades.service';
import { EmailService } from 'src/email/email.service';
import { ValidateSolicitudDto } from './dto/validate-solicitud.dto';

@Injectable()
export class SolicitudService {
  constructor(
    @InjectRepository(Solicitud)
    private solicitudRepository: Repository<Solicitud>,
    @InjectRepository(Associate)
    private associateRepository: Repository<Associate>,
    @InjectRepository(Persona)            
    private personaRepository: Repository<Persona>, 
    @InjectRepository(Finca)             
    private fincaRepository: Repository<Finca>,     
    private personaService: PersonaService,
    private nucleoFamiliarService: NucleoFamiliarService, 
    private fincaService: FincaService,
    private geografiaService: GeografiaService,
    private propietarioService: PropietarioService,
    private dropboxService: DropboxService,  
    private hatoService: HatoService,
    private animalService: AnimalService,
    private forrajeService: ForrajeService,
    private registrosProductivosService: RegistrosProductivosService,
    private fuentesAguaService: FuentesAguaService,
    private metodoRiegoService: MetodoRiegoService,
    private actividadesAgropecuariasService: ActividadesAgropecuariasService,
    private infraestructuraProduccionService: InfraestructuraProduccionService,
    private fincaOtroEquipoService: FincaOtroEquipoService,
    private tiposCercaService: TiposCercaService,
    private fincaTipoCercaService: FincaTipoCercaService,
    private fincaInfraestructurasService: FincaInfraestructurasService,
    private corrienteElectricaService: CorrienteElectricaService,
    private accesoService: AccesoService,
    private canalesComercializacionService: CanalesComercializacionService,
    private necesidadesService: NecesidadesService,
    private dataSource: DataSource,
    private emailService: EmailService,
  ) {}

  
async validateBeforeCreate(dto: ValidateSolicitudDto) {
  await this.validateOrThrow(dto);
  return { ok: true };
}
async create(createDto: CreateSolicitudDto): Promise<Solicitud> {
  const queryRunner = this.dataSource.createQueryRunner()
  await queryRunner.connect()
  await queryRunner.startTransaction()

  let createdId: number | null = null

  try {
    const personaAsociado = await this.personaService.createInTransaction(
      createDto.persona,
      queryRunner.manager,
    )

    const existingAsociado = await queryRunner.manager.findOne(Associate, {
      where: { persona: { idPersona: personaAsociado.idPersona } },
    })

    if (existingAsociado) {
      throw new ConflictException('Ya existe un asociado con esta cédula.')
    }

    let nucleoFamiliar: NucleoFamiliar | null = null
    if (createDto.nucleoFamiliar) {
      nucleoFamiliar = await this.nucleoFamiliarService.createInTransaction(
        {
          nucleoHombres: createDto.nucleoFamiliar.nucleoHombres,
          nucleoMujeres: createDto.nucleoFamiliar.nucleoMujeres,
        },
        queryRunner.manager,
      )
    }

    const asociado = queryRunner.manager.create(Associate, {
      persona: personaAsociado,
      viveEnFinca: createDto.datosAsociado.viveEnFinca,
      marcaGanado: createDto.datosAsociado.marcaGanado,
      CVO: createDto.datosAsociado.CVO,
      estado: false,
    })

    if (nucleoFamiliar) asociado.nucleoFamiliar = nucleoFamiliar

    await queryRunner.manager.save(asociado)

    if (createDto.necesidades && createDto.necesidades.length > 0) {
      await this.necesidadesService.createManyInTransaction(
        createDto.necesidades,
        asociado,
        queryRunner.manager,
      )
    }

    let propietario: Propietario | null = null

    if (createDto.propietario) {
      const cedAsoc = (personaAsociado.cedula ?? '').trim()
      const emailAsoc = (personaAsociado.email ?? '').trim().toLowerCase()

      const cedProp = (createDto.propietario.persona.cedula ?? '').trim()
      const emailProp = (createDto.propietario.persona.email ?? '')
        .trim()
        .toLowerCase()

      const esLaMismaPersona =
        (cedProp && cedProp === cedAsoc) ||
        (emailProp && emailProp === emailAsoc)

      if (esLaMismaPersona) {
        propietario = await this.propietarioService.createInTransaction(
          personaAsociado,
          queryRunner.manager,
        )
      } else {
        const personaPropietario = await this.personaService.createInTransaction(
          createDto.propietario.persona,
          queryRunner.manager,
        )

        propietario = await this.propietarioService.createInTransaction(
          personaPropietario,
          queryRunner.manager,
        )
      }
    }

    const geografia = await this.geografiaService.findOrCreateInTransaction(
      createDto.datosFinca.geografia,
      queryRunner.manager,
    )

    let corriente: CorrienteElectrica | null = null
    if (createDto.corrienteElectrica) {
      corriente =
        await this.corrienteElectricaService.findOrCreateInTransaction(
          createDto.corrienteElectrica,
          queryRunner.manager,
        )
    }

    const finca = await this.fincaService.createInTransaction(
      {
        nombre: createDto.datosFinca.nombre,
        areaHa: createDto.datosFinca.areaHa,
        numeroPlano: createDto.datosFinca.numeroPlano,
      },
      {
        idAsociado: asociado.idAsociado,
        geografia,
        propietario: propietario || undefined,
        corriente: corriente || undefined,
      },
      queryRunner.manager,
    )

    if (createDto.hato) {
      const hato = await this.hatoService.createInTransaction(
        createDto.hato,
        finca,
        queryRunner.manager,
      )

      if (createDto.animales && createDto.animales.length > 0) {
        await this.animalService.createManyInTransaction(
          createDto.animales,
          hato,
          queryRunner.manager,
        )

        await this.hatoService.updateTotalInTransaction(
          hato,
          queryRunner.manager,
        )
      }
    }

    if (createDto.forrajes && createDto.forrajes.length > 0) {
      await this.forrajeService.createManyInTransaction(
        createDto.forrajes,
        finca,
        queryRunner.manager,
      )
    }

    if (createDto.registrosProductivos) {
      await this.registrosProductivosService.createInTransaction(
        createDto.registrosProductivos,
        finca,
        queryRunner.manager,
      )
    }

    if (createDto.fuentesAgua && createDto.fuentesAgua.length > 0) {
      await this.fuentesAguaService.createManyInTransaction(
        createDto.fuentesAgua,
        finca,
        queryRunner.manager,
      )
    }

    if (createDto.metodosRiego && createDto.metodosRiego.length > 0) {
      await this.metodoRiegoService.createManyInTransaction(
        createDto.metodosRiego,
        finca,
        queryRunner.manager,
      )
    }

    if (createDto.actividades && createDto.actividades.length > 0) {
      await this.actividadesAgropecuariasService.createManyInTransaction(
        createDto.actividades,
        finca,
        queryRunner.manager,
      )
    }

    if (createDto.infraestructuraProduccion) {
      await this.infraestructuraProduccionService.createInTransaction(
        createDto.infraestructuraProduccion,
        finca,
        queryRunner.manager,
      )
    }

    if (createDto.otrosEquipos && createDto.otrosEquipos.length > 0) {
      await this.fincaOtroEquipoService.createManyInTransaction(
        createDto.otrosEquipos,
        finca,
        queryRunner.manager,
      )
    }

    if (createDto.accesos && createDto.accesos.length > 0) {
      await this.accesoService.createManyInTransaction(
        createDto.accesos,
        finca,
        queryRunner.manager,
      )
    }

    if (createDto.tipoCerca) {
      const tiposCercaConfig = [
        { key: 'alambrePuas', active: createDto.tipoCerca.alambrePuas },
        { key: 'viva', active: createDto.tipoCerca.viva },
        { key: 'electrica', active: createDto.tipoCerca.electrica },
        { key: 'pMuerto', active: createDto.tipoCerca.pMuerto },
      ]

      for (const config of tiposCercaConfig) {
        if (!config.active) continue

        const tipoCercaData: any = {
          alambrePuas: config.key === 'alambrePuas',
          viva: config.key === 'viva',
          electrica: config.key === 'electrica',
          pMuerto: config.key === 'pMuerto',
        }

        try {
          const tipoCerca =
            await this.tiposCercaService.findOrCreateInTransaction(
              tipoCercaData,
              queryRunner.manager,
            )

          await this.fincaTipoCercaService.linkInTransaction(
            {
              idFinca: finca.idFinca,
              idTipoCerca: tipoCerca.idTipoCerca,
            },
            finca,
            tipoCerca,
            queryRunner.manager,
          )
        } catch (error) {
          console.error(
            `❌ Error al vincular tipo de cerca "${config.key}":`,
            error,
          )
        }
      }
    }

    if (createDto.infraestructuras && createDto.infraestructuras.length > 0) {
      await this.fincaInfraestructurasService.linkManyByNameInTransaction(
        createDto.infraestructuras,
        finca,
        queryRunner.manager,
      )
    }

    const solicitud = queryRunner.manager.create(Solicitud, {
      persona: personaAsociado,
      asociado,
      // ✅ Después
      fechaSolicitud: this.getCostaRicaDateString(),
      createdAt: this.getCostaRicaDateString(),
      estado: SolicitudStatus.PENDIENTE,
    })

    await queryRunner.manager.save(solicitud)
    createdId = solicitud.idSolicitud

    await queryRunner.commitTransaction()
  } catch (error) {
    await queryRunner.rollbackTransaction()
    throw error
  } finally {
    await queryRunner.release()
  }

  const createdSolicitud = await this.findOne(createdId!)

  await this.sendCreationEmails(createdSolicitud)

  return createdSolicitud
}

private async sendCreationEmails(solicitud: Solicitud): Promise<void> {
  try {
    const email = solicitud.persona?.email
    const nombre = `${solicitud.persona?.nombre || ''} ${solicitud.persona?.apellido1 || ''}`.trim()
    const cedula = solicitud.persona?.cedula || 'No indicada'

    if (email) {
      await this.emailService.sendAssociateApplicationReceivedEmail(
        email,
        nombre,
      )
    }

    await this.emailService.sendNewAssociateApplicationNotificationEmail({
      applicantName: nombre || 'Sin nombre',
      applicantEmail: email || 'Sin correo',
      applicantId: cedula,
    })
  } catch (error) {
    console.error(
      'Error al enviar correos de creación de solicitud de asociado:',
      error,
    )
  }
}

private getCostaRicaDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // Devuelve "2026-03-27"
}

private async validateOrThrow(
  dto: ValidateSolicitudDto,
  manager?: EntityManager,
): Promise<void> {
  const solicitudRepo: Repository<Solicitud> = manager
    ? manager.getRepository(Solicitud)
    : this.solicitudRepository;

  const personaRepo: Repository<Persona> = manager
    ? manager.getRepository(Persona)
    : this.personaRepository;

  const associateRepo: Repository<Associate> = manager
    ? manager.getRepository(Associate)
    : this.associateRepository;

  const cedula = (dto?.cedula ?? '').trim();
  if (!cedula) throw new BadRequestException('Debe proporcionar la cédula');

  // 1) Buscar persona (si no existe, no hay pendiente en DB)
  const persona = await personaRepo.findOne({ where: { cedula } });
  if (!persona) return;

  // 2) Si tiene SOLICITUD PENDIENTE => bloquear
  const pendiente = await solicitudRepo.findOne({
    where: {
      persona: { idPersona: persona.idPersona } as any,
      estado: SolicitudStatus.PENDIENTE,
    },
    relations: ['persona'],
  });

  if (pendiente) {
    throw new ConflictException({
      code: 'SOLICITUD_PENDIENTE_ASOCIADO',
      message: 'Ya enviaste una solicitud de asociado y está en revisión.',
    });
  }

  // 3) Si ya es asociado (opcional pero recomendado)
  const existingAsociado = await associateRepo.findOne({
    where: { persona: { idPersona: persona.idPersona } as any },
    relations: ['persona'],
  });

  if (existingAsociado) {
    throw new ConflictException({
      code: 'YA_ES_ASOCIADO',
      message: 'Ya eres asociado/a en el sistema.',
    });
  }
}

  async findAllPaginated(params: {
    page?: number;
    limit?: number;
    estado?: string;
    search?: string;
    sort?: string;
  }): Promise<{ items: Solicitud[]; total: number; page: number; pages: number }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.solicitudRepository
      .createQueryBuilder('solicitud')
      .leftJoinAndSelect('solicitud.persona', 'persona')
      .leftJoinAndSelect('solicitud.asociado', 'asociado')
      .leftJoinAndSelect('asociado.persona', 'asociadoPersona')
      .leftJoinAndSelect('asociado.nucleoFamiliar', 'nucleoFamiliar')
      .leftJoinAndSelect('asociado.fincas', 'fincas')
      .leftJoinAndSelect('fincas.geografia', 'geografia');

    if (params.estado) {
      queryBuilder.andWhere('solicitud.estado = :estado', { estado: params.estado });
    }

    if (params.search) {
      queryBuilder.andWhere(
        '(persona.cedula LIKE :search OR persona.nombre LIKE :search OR persona.email LIKE :search)',
        { search: `%${params.search}%` },
      );
    }

    if (params.sort) {
      const [field, order] = params.sort.split(':');
      queryBuilder.orderBy(`solicitud.${field}`, order.toUpperCase() as 'ASC' | 'DESC');
    } else {
      queryBuilder.orderBy('solicitud.createdAt', 'DESC');
    }

    const [items, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    return {
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async findAll() {
    return this.solicitudRepository.find({
      relations: [
        'persona',
        'asociado',
        'asociado.persona',
        'asociado.nucleoFamiliar',
        'asociado.fincas',
        'asociado.fincas.geografia',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Solicitud> {
    const solicitud = await this.solicitudRepository.findOne({
      where: { idSolicitud: id },
      relations: [
        'persona',
        'asociado',
        'asociado.persona',
        'asociado.nucleoFamiliar',
        'asociado.fincas',
        'asociado.fincas.geografia',

      ],
    });
  
    if (!solicitud) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }
  
    return solicitud;
  }

async findOneComplete(id: number): Promise<Solicitud> {
  const solicitud = await this.solicitudRepository.findOne({
    where: { idSolicitud: id },
    relations: [
      // Persona del solicitante
      'persona',

      // Asociado + persona
      'asociado',
      'asociado.persona',
      'asociado.nucleoFamiliar',
      'asociado.necesidades',

      // FINCAS
      'asociado.fincas',
      'asociado.fincas.geografia',
      'asociado.fincas.propietario',
      'asociado.fincas.propietario.persona',
      'asociado.fincas.corriente',

      // HATO + ANIMALES
      'asociado.fincas.hato',
      'asociado.fincas.hato.animales',

      // FORRAJES
      'asociado.fincas.forrajes',

      // REGISTROS PRODUCTIVOS
      'asociado.fincas.registrosProductivos',

      // FUENTES DE AGUA
      'asociado.fincas.fuentesAgua',

      // MÉTODOS DE RIEGO
      'asociado.fincas.metodosRiego',

      // ACTIVIDADES
      'asociado.fincas.actividades',

      // ✅ INFRAESTRUCTURA (tu OneToOne)
      'asociado.fincas.infraestructura',

      // OTROS EQUIPOS
      'asociado.fincas.otrosEquipos',

      // TIPOS DE CERCA
      'asociado.fincas.tipoCercaLinks',
      'asociado.fincas.tipoCercaLinks.tipoCerca',

      // INFRAESTRUCTURAS (muchos a muchos por tabla intermedia)
      'asociado.fincas.infraLinks',
      'asociado.fincas.infraLinks.infraestructura',

      // ACCESOS
      'asociado.fincas.accesos',

      // CANALES
      'asociado.fincas.canalesComercializacion',
    ],
  });

  if (!solicitud) {
    throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
  }

  return solicitud;
}

async algunaFuncionQueAntesFallaba(id: number) {
  return this.findOneComplete(id); 
}

  async changeStatus(
    id: number,
    changeStatusDto: ChangeSolicitudStatusDto,
  ): Promise<Solicitud> {
    const solicitud = await this.solicitudRepository.findOne({
      where: { idSolicitud: id },
      relations: [
        'persona',
        'asociado',
        'asociado.persona',
        'asociado.nucleoFamiliar',
        'asociado.fincas',
        'asociado.fincas.geografia',
        ],
    });
  
    if (!solicitud) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }
  
    if (
      changeStatusDto.estado === SolicitudStatus.RECHAZADO &&
      !changeStatusDto.motivo
    ) {
      throw new BadRequestException(
        'El motivo es obligatorio cuando se rechaza una solicitud',
      );
    }
  
    const canProcess =
    solicitud.estado === SolicitudStatus.PENDIENTE ||
    solicitud.estado === SolicitudStatus.RECHAZADO;

    if (!canProcess) {
      throw new BadRequestException(
        'Solo se pueden procesar solicitudes pendientes o rechazadas',
      );
    }
  
    solicitud.estado = changeStatusDto.estado;
    solicitud.fechaResolucion = new Date();
    if (changeStatusDto.motivo !== undefined) {
      solicitud.motivo = changeStatusDto.motivo; 
    }
    await this.solicitudRepository.save(solicitud);
    await this.sendStatusChangeEmail(solicitud, changeStatusDto);
  
    if (changeStatusDto.estado === SolicitudStatus.APROBADO) {
      solicitud.asociado.estado = true;
      await this.associateRepository.save(solicitud.asociado);
  
      this.copyDocumentsToEntities(solicitud).catch(err => {
        console.error('Error copiando documentos:', err);
      });
    }
  
    return solicitud;
  }
  async remove(id: number): Promise<void> {
    const solicitud = await this.solicitudRepository.findOne({
      where: { idSolicitud: id },
      relations: ['asociado'],
    });

    if (!solicitud) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }

    if (solicitud.estado === SolicitudStatus.APROBADO) {
      throw new BadRequestException(
        'No se puede eliminar una solicitud aprobada',
      );
    }

    if (solicitud.asociado) {
      await this.associateRepository.remove(solicitud.asociado);
    }

    await this.solicitudRepository.remove(solicitud);
  }

private async sendStatusChangeEmail(
  solicitud: Solicitud,
  changeStatusDto: ChangeSolicitudStatusDto,
): Promise<void> {
  try {
    const email = solicitud.persona?.email;
    const nombre = `${solicitud.persona?.nombre || ''} ${solicitud.persona?.apellido1 || ''}`.trim();

    if (!email) {
      console.warn(`No se encontró email para la solicitud ${solicitud.idSolicitud}`);
      return;
    }

    // Enviar correo según el estado
    if (changeStatusDto.estado === SolicitudStatus.APROBADO) {
      await this.emailService.sendApplicationApprovedEmailAssociates(
        email,
        nombre,
      );
    } else if (changeStatusDto.estado === SolicitudStatus.RECHAZADO) {
      await this.emailService.sendApplicationRejectionEmailAssociates(
        email,
        nombre,
        changeStatusDto.motivo || 'No se especificó un motivo',
      );
    }
  } catch (error) {
    console.error('Error al enviar correo de notificación:', error);
    // No lanzamos el error para no interrumpir el flujo principal
  }
}

  async findByStatus(status: SolicitudStatus) {
    return this.solicitudRepository.find({
      where: { estado: status },
      relations: [
        'persona',
        'asociado',
        'asociado.persona',
        'asociado.nucleoFamiliar',
        'asociado.fincas',
        'asociado.fincas.geografia',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async countByStatus(status: SolicitudStatus): Promise<number> {
    return this.solicitudRepository.count({
      where: { estado: status },
    });
  }

  async getStats() {
    const total = await this.solicitudRepository.count();
    const pendientes = await this.countByStatus(SolicitudStatus.PENDIENTE);
    const aprobadas = await this.countByStatus(SolicitudStatus.APROBADO);
    const rechazadas = await this.countByStatus(SolicitudStatus.RECHAZADO);

    return {
      total,
      pendientes,
      aprobadas,
      rechazadas,
    };
  }
  // ========== MÉTODOS DE DROPBOX ==========

async uploadDocuments(
  idSolicitud: number,
  files: {
    cedula?: any[];
    planoFinca?: any[];
  },
): Promise<any> {
  const tAll = Date.now();

  // 1) Medir findOne
  const t0 = Date.now();
  const solicitud = await this.solicitudRepository.findOne({
    where: { idSolicitud },
    relations: ["persona", "asociado"],
  });
  console.log("[perf] findOne ms:", Date.now() - t0);

  if (!solicitud) {
    throw new NotFoundException(`Solicitud con ID ${idSolicitud} no encontrada`);
  }

  const formData = {
    cedula: [] as string[],
    planoFinca: [] as string[],
  };

  try {
    const nombreCarpeta = `${solicitud.persona.nombre}-${solicitud.persona.apellido1}-${solicitud.persona.cedula}`
      .toLowerCase()
      .replace(/\s+/g, "-");

    // 2) Medir Dropbox uploads (paralelo)
    const uploads: Promise<void>[] = [];

    if (files.cedula?.length) {
      for (const file of files.cedula) {
        uploads.push(
          this.dropboxService
            .uploadFile(file, `/Solicitudes Asociados/${nombreCarpeta}/cedula`)
            .then((path) => {
              formData.cedula.push(path);
            }),
        );
      }
    }

    if (files.planoFinca?.length) {
      for (const file of files.planoFinca) {
        uploads.push(
          this.dropboxService
            .uploadFile(file, `/Solicitudes Asociados/${nombreCarpeta}/plano`)
            .then((path) => {
              formData.planoFinca.push(path);
            }),
        );
      }
    }

    const t1 = Date.now();
    await Promise.all(uploads);
    console.log("[perf] dropbox uploads ms:", Date.now() - t1);

    solicitud.formData = formData;

    // 3) Medir save
    const t2 = Date.now();
    await this.solicitudRepository.save(solicitud);
    console.log("[perf] db save ms:", Date.now() - t2);

    console.log("[perf] total uploadDocuments ms:", Date.now() - tAll);

    return {
      message: "Documentos subidos exitosamente",
      urls: formData,
    };
  } catch (error: any) {
    console.error("[Service] Error al subir documentos:", error.message);
    throw new BadRequestException(`Error al subir documentos: ${error.message}`);
  }
}

  private async copyDocumentsToEntities(solicitud: Solicitud): Promise<void> {
    // Copiar cédula a Persona
    if (solicitud.cedulaUrlTemp && solicitud.persona) {
      solicitud.persona.cedulaUrl = solicitud.cedulaUrlTemp;
      await this.personaRepository.save(solicitud.persona);
    }

    // Copiar plano de finca a la primera Finca del asociado
    if (solicitud.planoFincaUrlTemp && solicitud.asociado?.fincas?.[0]) {
      const finca = solicitud.asociado.fincas[0];
      finca.planoFincaUrl = solicitud.planoFincaUrlTemp;
      await this.fincaRepository.save(finca);
    }
  }

  private buildNombreCarpetaFromPersona(persona: Persona) {
    return `${persona.nombre}-${persona.apellido1}-${persona.cedula}`
      .toLowerCase()
      .replace(/\s+/g, "-");
  }

  // ✅ 1) Lo que pediste: por asociado específico
  async getDocumentsFolderLinkByAsociado(idAsociado: number) {
    const solicitud = await this.solicitudRepository.findOne({
      where: { asociado: { idAsociado } as any },
      relations: ["persona", "asociado"],
      order: { createdAt: "DESC" },
    });

    if (!solicitud) {
      throw new NotFoundException(`No existe solicitud para el asociado ID ${idAsociado}`);
    }

    // ✅ Verificar que haya documentos antes de retornar link
    const hasDocs =
      (solicitud.formData?.cedula?.length ?? 0) > 0 ||
      (solicitud.formData?.planoFinca?.length ?? 0) > 0;

    if (!hasDocs) {
      throw new BadRequestException('Este asociado no tiene documentos adjuntos.');
    }

    const nombreCarpeta = this.buildNombreCarpetaFromPersona(solicitud.persona);
    const folderPath = `/Solicitudes Asociados/${nombreCarpeta}`;

    const url = await this.dropboxService.getOrCreateSharedLinkAssociates(folderPath);

    return { url, path: folderPath };
  }

  // ✅ 2) por idSolicitud (para el modal de solicitud)
  async getDocumentsFolderLinkBySolicitud(idSolicitud: number) {
    const solicitud = await this.solicitudRepository.findOne({
      where: { idSolicitud },
      relations: ["persona", "asociado"],
    });

    if (!solicitud) throw new NotFoundException(`Solicitud con ID ${idSolicitud} no encontrada`);

    // ✅ Verificar que haya documentos antes de retornar link
    const hasDocs =
      (solicitud.formData?.cedula?.length ?? 0) > 0 ||
      (solicitud.formData?.planoFinca?.length ?? 0) > 0;

    if (!hasDocs) {
      throw new BadRequestException('Esta solicitud no tiene documentos adjuntos.');
    }

    const nombreCarpeta = this.buildNombreCarpetaFromPersona(solicitud.persona);
    const folderPath = `/Solicitudes Asociados/${nombreCarpeta}`;

    const url = await this.dropboxService.getOrCreateSharedLinkAssociates(folderPath);

    return { url, path: folderPath };
  }
}