
import { Associate } from "src/formAssociates/associate/entities/associate.entity";
import { Propietario } from "src/formAssociates/propietario/entities/propietario.entity";
import { Personal } from "src/personal/entities/personal.entity";
import { Column, CreateDateColumn, Entity, OneToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity('personas')
@Unique(['cedula'])
export class Persona {
  @PrimaryGeneratedColumn()
  idPersona: number;

  // Datos personales
  @Column({ type: 'varchar', length: 12 })
  cedula: string;

  @Column({ type: 'varchar', length: 30 })
  nombre: string;

  @Column({ type: 'varchar', length: 30 })
  apellido1: string;

  @Column({ type: 'varchar', length: 30 })
  apellido2: string;

  @Column({ type: 'date' })
  fechaNacimiento: string;

  // Contacto
  @Column({ type: 'varchar', length: 12 })
  telefono: string;

  @Column({ type: 'varchar', length: 100 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cedulaUrl?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relación 1:1 con Asociado
  @OneToOne(() => Associate, (associate) => associate.persona)
  asociado?: Associate;

  @OneToOne(() => Propietario, (propietario) => propietario.persona)
  propietario?: Propietario;

  @OneToOne(() => Personal, (personal) => personal.persona)
  personal?: Personal;
}