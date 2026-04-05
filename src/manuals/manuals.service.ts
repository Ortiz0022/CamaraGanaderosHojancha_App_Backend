import { Injectable, NotFoundException } from '@nestjs/common';
import { DropboxService } from '../dropbox/dropbox.service';
import { ManualItem } from './types/manual-item.type';

@Injectable()
export class ManualsService {
  private readonly manualsPath = '/Manuales';

  constructor(private readonly dropboxService: DropboxService) {}

  private getExtension(fileName: string): string {
    return fileName.split('.').pop()?.toLowerCase() || '';
  }

  private isPreviewable(fileName: string): boolean {
    const ext = this.getExtension(fileName);
    return [
      'pdf',
      'png',
      'jpg',
      'jpeg',
      'webp',
      'gif',
      'txt',
    ].includes(ext);
  }

  async listManuals(): Promise<ManualItem[]> {
    const entries = await this.dropboxService.listFolder(this.manualsPath);

    const filesOnly = entries.filter((entry: any) => entry['.tag'] === 'file');

    return filesOnly.map((file: any) => ({
      name: file.name,
      path: file.path_lower ?? file.path_display,
      size: file.size ?? 0,
      extension: this.getExtension(file.name),
      clientModified: file.client_modified,
      serverModified: file.server_modified,
      previewable: this.isPreviewable(file.name),
    }));
  }

  async getManualBuffer(path: string): Promise<Buffer> {
    return this.dropboxService.downloadFile(path);
  }

  async getManualMetadata(path: string) {
    const metadata = await this.dropboxService.getFileMetadata(path);

    if (!metadata || metadata['.tag'] !== 'file') {
      throw new NotFoundException('Archivo no encontrado');
    }

    return metadata;
  }
}