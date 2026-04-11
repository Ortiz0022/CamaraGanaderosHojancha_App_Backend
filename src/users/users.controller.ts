import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  ParseIntPipe,
} from "@nestjs/common";

import { Roles } from "src/auth/roles.decorator";
import { Public } from "src/auth/public.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";
import type { CurrentUserData } from "src/auth/current-user.interface";

import { UsersService } from "./users.service";

import { CreateUserDto } from "./dto/CreateUserDto";
import { UpdateUserDto } from "./dto/UpdateUserDto";
import { AdminSetPasswordDto } from "./dto/AdminSetPasswordDto";
import { ConfirmEmailChangeDto, RequestEmailChangeDto } from "./dto/EmailChange";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  // CONFIGURACIÓN (solo ADMIN)

  @Get()
  @Roles("ADMIN")
  findAll() {
    return this.usersService.findAllUsers();
  }

  @Get(":id")
  @Roles("ADMIN")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOneUser(id);
  }

  @Post()
  @Public()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.createUser(dto, user.id);
  }

  @Patch(":id")
  @Roles("ADMIN")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.updateUser(id, dto, user.id);
  }

  @Patch(":id/password")
  @Roles("ADMIN")
  setPassword(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AdminSetPasswordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.adminSetPassword(id, dto.password, user.id);
  }

  @Patch(":id/deactivate")
  @Roles("ADMIN")
  deactivate(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.setActive(id, false, user.id);
  }

  @Patch(":id/activate")
  @Roles("ADMIN")
  activate(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.setActive(id, true, user.id);
  }

  // Cambio de email con confirmación

  @Post(":id/request-email-change")
  @Roles("ADMIN", "JUNTA")
  requestEmailChange(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RequestEmailChangeDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.requestEmailChange(id, dto.newEmail, user.id);
  }

  // Confirmación pública desde link en correo

  @Public()
  @Post("confirm-email-change")
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.usersService.confirmEmailChange(dto.token);
  }
}