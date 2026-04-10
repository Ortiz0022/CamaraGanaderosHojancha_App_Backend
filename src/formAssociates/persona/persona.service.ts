import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { CreatePersonaDto } from './dto/create-persona.dto';
import { UpdatePersonaDto } from './dto/update-persona.dto';
import { Persona } from './entities/persona.entity';
import { PersonaFormLookupDto } from './dto/persona-form-lookup.dto';

@Injectable()
export class PersonaService {
  constructor(
    @InjectRepository(Persona)
    private personaRepository: Repository<Persona>,
  ) { }

  // Método público (con validaciones completas)
  async create(createPersonaDto: CreatePersonaDto): Promise<Persona> {
    // Verificar si ya existe una persona con esa cédula
    const existingByCedula = await this.personaRepository.findOne({
      where: { cedula: createPersonaDto.cedula },
    });

    if (existingByCedula) {
      throw new ConflictException(
        `Ya existe una persona con la cédula ${createPersonaDto.cedula}`,
      );
    }

    const persona = this.personaRepository.create(createPersonaDto);
    return this.personaRepository.save(persona);
  }

  // ✅ Método transaccional (sin validaciones, usa EntityManager externo)
  async createInTransaction(
    createPersonaDto: CreatePersonaDto,
    manager: EntityManager,
  ): Promise<Persona> {
    const repo = manager.getRepository(Persona);

    const cedula = (createPersonaDto.cedula ?? "").trim();
    if (!cedula) {
      throw new BadRequestException("La cédula es requerida");
    }

    // 1) Buscar por cédula
    const existente = await repo.findOne({ where: { cedula } });

    if (existente) {
      // 2) Autorellenar en backend (sin sobre-escribir lo existente)
      //    Solo completa campos vacíos en BD con lo que venga en el DTO
      const merged: Persona = repo.merge(existente, {
        nombre: existente.nombre || createPersonaDto.nombre,
        apellido1: existente.apellido1 || createPersonaDto.apellido1,
        apellido2: existente.apellido2 || createPersonaDto.apellido2,
        telefono: existente.telefono || createPersonaDto.telefono,
        email: existente.email || createPersonaDto.email,
        fechaNacimiento: existente.fechaNacimiento || createPersonaDto.fechaNacimiento,
        direccion: existente.direccion || createPersonaDto.direccion,
        cedulaUrl: existente.cedulaUrl || (createPersonaDto as any).cedulaUrl,
      });

      return repo.save(merged);
    }

    // 3) Si no existe, crear normal
    const persona = repo.create(createPersonaDto);
    return repo.save(persona);
  }


  async findByCedulaForForms(cedula: string): Promise<PersonaFormLookupDto> {
    const v = (cedula ?? '').trim();
    if (!v) {
      // si preferís, podés tirar BadRequest; aquí lo dejo como not found
      throw new NotFoundException('Cédula requerida');
    }

    // Usá tu repo normal (o manager si estás dentro de transacción)
    const repo: Repository<Persona> = this.personaRepository; // ajustá si tu service lo inyecta

    const persona = await repo.findOne({ where: { cedula: v } });

    if (!persona) {
      throw new NotFoundException(`No existe persona con cédula ${v}`);
    }

    const direccion = persona.direccion ?? '';

    const dto: PersonaFormLookupDto = {
      found: true,
      persona: {
        idPersona: persona.idPersona,
        cedula: persona.cedula,
        nombre: persona.nombre,
        apellido1: persona.apellido1,
        apellido2: persona.apellido2,
        telefono: persona.telefono,
        email: persona.email,
        fechaNacimiento: persona.fechaNacimiento,
        direccion: persona.direccion ?? undefined,
      },
      volunteerIndividual: {
        idNumber: persona.cedula,
        name: persona.nombre,
        lastName1: persona.apellido1,
        lastName2: persona.apellido2,
        phone: persona.telefono,
        email: persona.email,
        birthDate: persona.fechaNacimiento,
        address: direccion,
      },
      representanteOrganizacion: {
        persona: {
          cedula: persona.cedula,
          nombre: persona.nombre,
          apellido1: persona.apellido1,
          apellido2: persona.apellido2,
          telefono: persona.telefono,
          email: persona.email,
          fechaNacimiento: persona.fechaNacimiento,
          direccion: persona.direccion ?? undefined,
        },
      },
      legacy: {
        firstname: persona.nombre,
        lastname1: persona.apellido1,
        lastname2: persona.apellido2,
      },
    };

    return dto;
  }

  async findAll(): Promise<Persona[]> {
    return this.personaRepository.find({
      relations: ['asociado'],
    });
  }


  async findOne(id: number): Promise<Persona> {
    const persona = await this.personaRepository.findOne({
      where: { idPersona: id },
      relations: ['asociado'],
    });

    if (!persona) {
      throw new NotFoundException(`Persona con ID ${id} no encontrada`);
    }

    return persona;
  }

  async findByCedula(cedula: string): Promise<Persona> {
    const persona = await this.personaRepository.findOne({
      where: { cedula },
      relations: ['asociado'],
    });

    if (!persona) {
      throw new NotFoundException(`Persona con cédula ${cedula} no encontrada`);
    }

    return persona;
  }

  async findByEmail(email: string): Promise<Persona> {
    const persona = await this.personaRepository.findOne({
      where: { email },
      relations: ['asociado'],
    });

    if (!persona) {
      throw new NotFoundException(`Persona con email ${email} no encontrada`);
    }

    return persona;
  }

  async update(
    id: number,
    updatePersonaDto: UpdatePersonaDto,
  ): Promise<Persona> {
    const persona = await this.findOne(id);


    Object.assign(persona, updatePersonaDto);
    return this.personaRepository.save(persona);
  }

  async remove(id: number): Promise<void> {
    const persona = await this.findOne(id);

    // Verificar si tiene un asociado vinculado
    if (persona.asociado) {
      throw new ConflictException(
        `No se puede eliminar la persona porque está asociada a un asociado activo`,
      );
    }

    await this.personaRepository.remove(persona);
  }
}