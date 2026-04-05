import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { Dropbox } from 'dropbox';
@Injectable()
export class DropboxService {
  constructor(@Inject('DROPBOX') private dbx: Dropbox) {
    if (!dbx) {
      console.warn(
        '⚠️  Dropbox no configurado. Ejecuta /auth/dropbox para obtener el refresh token.'
      );
    }
  }

  /**
   * Valida que Dropbox esté inicializado antes de usarlo
   * @throws BadRequestException si no está configurado
   */
  private ensureInitialized() {
    if (!this.dbx) {
      throw new BadRequestException(
        'Dropbox no está configurado. Por favor, configura DROPBOX_REFRESH_TOKEN en .env y reinicia el servidor.'
      );
    }
  }

  /**
   * Sube un archivo a Dropbox
   * @param file - Archivo de Multer
   * @param dropboxPath - Ruta en Dropbox donde se guardará
   * @returns URL pública del archivo
   */
  async uploadFile(
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  dropboxPath: string,
): Promise<string> {
  this.ensureInitialized();

  try {
    let fullPath = `${dropboxPath}/${file.originalname}`;
    if (!fullPath.startsWith("/")) fullPath = `/${fullPath}`;
    fullPath = fullPath.replace(/\/+/g, "/");

    const response = await this.dbx.filesUpload({
      path: fullPath,
      contents: file.buffer,
      mode: { ".tag": "overwrite" },
      //autorename: true,
    });

    // ✅ DEVOLVER EL PATH (rápido)
    return response.result.path_lower ?? response.result.path_display!;
  } catch (error: any) {
    console.error("[Dropbox] Error al subir archivo:", error.message);
    throw new BadRequestException(`Error al subir archivo a Dropbox: ${error.message}`);
  }
}


  /**
   * Elimina un archivo de Dropbox usando su URL
   * @param url - URL del archivo en Dropbox
   */
  async deleteFile(url: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Extraer el path del archivo desde la URL
      const pathMatch = url.match(/\/s\/[^\/]+\/(.+)\?/);
      if (!pathMatch) {
        throw new Error('URL de Dropbox inválida');
      }

      const path = `/${pathMatch[1]}`;
      
      
      await this.dbx.filesDeleteV2({ path });
      
    } catch (error: any) {
      console.error('[Dropbox] Error al eliminar archivo:', error.message);
      throw new BadRequestException(
        `Error al eliminar archivo de Dropbox: ${error.message}`,
      );
    }
  }

  /**
   * Crea una carpeta en Dropbox si no existe
   * @param path - Ruta de la carpeta a crear
   */
  async ensureFolder(path: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      
      await this.dbx.filesCreateFolderV2({
        path,
        autorename: false,
      });
      
    } catch (error: any) {
      // 409 significa que la carpeta ya existe (esto está bien)
      if (error.status === 409) {
        return;
      }
      
      console.error('[Dropbox] Error al crear carpeta:', error.message);
      throw error;
    }
  }

  /**
   * Lista archivos en una carpeta de Dropbox
   * @param path - Ruta de la carpeta
   * @returns Lista de archivos y carpetas
   */
  async listFolder(path: string): Promise<any> {
    this.ensureInitialized();
    
    try {
      const response = await this.dbx.filesListFolder({ path });
      return response.result.entries;
    } catch (error: any) {
      // 409 en Dropbox = path no encontrado o no es carpeta — relanzar tal cual
      // para que el llamador pueda distinguir "no existe" de otros errores
      if (error?.status === 409) {
        throw error;
      }
      console.error('[Dropbox] Error al listar carpeta:', error.message);
      throw new BadRequestException(
        `Error al listar carpeta de Dropbox: ${error.message}`,
      );
    }
  }

  /**
   * Verifica si una carpeta existe en Dropbox sin lanzar excepción
   * @returns true si existe, false si no
   */
  async folderExists(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      let p = path;
      if (!p.startsWith('/')) p = `/${p}`;
      p = p.replace(/\/+/g, '/');
      await this.dbx.filesGetMetadata({ path: p });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene información de un archivo
   * @param path - Ruta del archivo
   * @returns Metadata del archivo
   */
  async getFileMetadata(path: string): Promise<any> {
    this.ensureInitialized();
    
    try {
      
      const response = await this.dbx.filesGetMetadata({ path });

      
      return response.result;
    } catch (error: any) {
      console.error('[Dropbox] Error al obtener metadata:', error.message);
      throw new BadRequestException(
        `Error al obtener información del archivo: ${error.message}`,
      );
    }
  }

  /**
   * Descarga un archivo de Dropbox
   * @param path - Ruta del archivo
   * @returns Buffer del archivo
   */
  async downloadFile(path: string): Promise<Buffer> {
    this.ensureInitialized();

    try {
      const response = await this.dbx.filesDownload({ path });

      // @ts-ignore
      const fileBinary = response.result.fileBinary;

      if (Buffer.isBuffer(fileBinary)) {
        return fileBinary;
      }

      if (fileBinary?.arrayBuffer) {
        const arr = await fileBinary.arrayBuffer();
        return Buffer.from(arr);
      }

      return Buffer.from(fileBinary);
    } catch (error: any) {
      console.error('[Dropbox] Error al descargar archivo:', error.message);
      throw new BadRequestException(
        `Error al descargar archivo de Dropbox: ${error.message}`,
      );
    }
  }

  /**
   * Mueve o renombra un archivo/carpeta
   * @param fromPath - Ruta origen
   * @param toPath - Ruta destino
   */
  async moveFile(fromPath: string, toPath: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      
      await this.dbx.filesMoveV2({
        from_path: fromPath,
        to_path: toPath,
        autorename: false,
      });
      
    } catch (error: any) {
      console.error('[Dropbox] Error al mover archivo:', error.message);
      throw new BadRequestException(
        `Error al mover archivo en Dropbox: ${error.message}`,
      );
    }
  }

  /**
   * Copia un archivo
   * @param fromPath - Ruta origen
   * @param toPath - Ruta destino
   */
  async copyFile(fromPath: string, toPath: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      
      await this.dbx.filesCopyV2({
        from_path: fromPath,
        to_path: toPath,
        autorename: false,
      });
      
    } catch (error: any) {
      console.error('[Dropbox] Error al copiar archivo:', error.message);
      throw new BadRequestException(
        `Error al copiar archivo en Dropbox: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene el espacio de almacenamiento usado
   * @returns Información de uso de espacio
   */
  async getSpaceUsage(): Promise<any> {
    this.ensureInitialized();
    
    try {
      
      const response = await this.dbx.usersGetSpaceUsage();
      
      const used = response.result.used;
      const allocated = response.result.allocation['.tag'] === 'individual' 
        ? response.result.allocation.allocated 
        : 0;
      
      
      return {
        used,
        allocated,
        usedGB: (used / 1024 / 1024 / 1024).toFixed(2),
        allocatedGB: (allocated / 1024 / 1024 / 1024).toFixed(2),
      };
    } catch (error: any) {
      console.error('[Dropbox] Error al obtener uso de espacio:', error.message);
      throw new BadRequestException(
        `Error al obtener información de espacio: ${error.message}`,
      );
    }
  }

  async getOrCreateSharedLinkAssociates(path: string): Promise<string> {
    this.ensureInitialized();

    try {
      // Normalizar path
      let p = path;
      if (!p.startsWith('/')) p = `/${p}`;
      p = p.replace(/\/+/g, '/');

      // 1) Si ya existe un link, reutilizarlo
      const existing = await this.dbx.sharingListSharedLinks({
        path: p,
        direct_only: true,
      });

      const existingUrl = existing.result?.links?.[0]?.url;
      if (existingUrl) return existingUrl;

      // 2) Si no existe, crearlo
      const created = await this.dbx.sharingCreateSharedLinkWithSettings({
        path: p,
        settings: {
          requested_visibility: { '.tag': 'public' },
          audience: { '.tag': 'public' },
          access: { '.tag': 'viewer' },
        },
      });

      const createdUrl = created.result?.url;
      if (!createdUrl) throw new Error('No se pudo crear el shared link');

      return createdUrl;
    } catch (error: any) {
      console.error('[Dropbox] Error shared link:', error?.message);
      throw new BadRequestException(
        `Error al generar link de Dropbox: ${error?.message}`,
      );
    }
  }

  async getOrCreateSharedLinkVolunteers(path: string): Promise<string> {
    this.ensureInitialized();

    try {
      let p = path;
      if (!p.startsWith("/")) p = `/${p}`;
      p = p.replace(/\/+/g, "/");

      // 1) Intentar listar links existentes
      const listed = await this.dbx.sharingListSharedLinks({
        path: p,
        direct_only: true,
      });

      const existing = listed.result.links?.[0]?.url;
      if (existing) return existing;

      // 2) Crear uno nuevo
      const created = await this.dbx.sharingCreateSharedLinkWithSettings({
        path: p,
        settings: {
          requested_visibility: { ".tag": "public" },
          audience: { ".tag": "public" },
          access: { ".tag": "viewer" },
        },
      });

      const createdUrl = created.result?.url;
      if (!createdUrl) throw new Error('No se pudo crear el shared link');
      return createdUrl;
    } catch (error: any) {
      console.error("[Dropbox] Error getOrCreateSharedLink:", error?.message || error);
      throw new BadRequestException(`Error al generar link de Dropbox: ${error?.message || "Desconocido"}`);
    }
  }
}