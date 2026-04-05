import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import express from 'express';
import { ManualsService } from './manuals.service';

@Controller('manuals')
export class ManualsController {
  constructor(private readonly manualsService: ManualsService) {}

  @Get()
  async listManuals() {
    return this.manualsService.listManuals();
  }

  @Get('preview')
  async previewManual(
    @Query('path') path: string,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<StreamableFile> {
    if (!path) {
      throw new BadRequestException('El parámetro path es requerido');
    }

    const metadata = await this.manualsService.getManualMetadata(path);
    const buffer = await this.manualsService.getManualBuffer(path);

    const fileName = metadata.name;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      txt: 'text/plain; charset=utf-8',
    };

    res.set({
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });

    return new StreamableFile(buffer);
  }

  @Get('download')
  async downloadManual(
    @Query('path') path: string,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<StreamableFile> {
    if (!path) {
      throw new BadRequestException('El parámetro path es requerido');
    }

    const metadata = await this.manualsService.getManualMetadata(path);
    const buffer = await this.manualsService.getManualBuffer(path);

    const fileName = metadata.name;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      txt: 'text/plain; charset=utf-8',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };

    res.set({
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    });

    return new StreamableFile(buffer);
  }
}