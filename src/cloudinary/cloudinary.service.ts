import { Injectable } from '@nestjs/common'
import { v2 as cloudinary } from 'cloudinary'

@Injectable()
export class CloudinaryService {
  constructor() {
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME
    const api_key = process.env.CLOUDINARY_API_KEY
    const api_secret = process.env.CLOUDINARY_API_SECRET

    if (!cloud_name || !api_key || !api_secret) {
      throw new Error(
        `Cloudinary env missing: ${
          !cloud_name ? 'CLOUDINARY_CLOUD_NAME ' : ''
        }${!api_key ? 'CLOUDINARY_API_KEY ' : ''}${
          !api_secret ? 'CLOUDINARY_API_SECRET' : ''
        }`,
      )
    }

    cloudinary.config({
      cloud_name,
      api_key,
      api_secret,
      secure: true,
    })
  }

  getPublicId(filename: string, folder: string = 'gallery') {
    if (!filename) return ''
    const lastDot = filename.lastIndexOf('.')
    const nameWithSpaces =
      lastDot === -1 ? filename : filename.substring(0, lastDot)
    // Reemplazamos todos los espacios por guiones bajos
    const name = nameWithSpaces.replace(/\s+/g, '_')
    return folder ? `${folder}/${name}` : name
  }

  async getUsage() {
    const usage = await cloudinary.api.usage()
    return usage
  }

  // ✅ Galería: IMÁGENES + VIDEOS
// ✅ Galería: IMÁGENES + VIDEOS con URLs "compatibles" para navegador
async getGallery(params?: { maxResults?: number; nextCursor?: string }) {
  const max = params?.maxResults ?? 50
  const cursor = params?.nextCursor

  const images = await cloudinary.api.resources({
    type: 'upload',
    resource_type: 'image',
    max_results: max,
    next_cursor: cursor,
  })

  const videos = await cloudinary.api.resources({
    type: 'upload',
    resource_type: 'video',
    max_results: max,
    next_cursor: cursor,
  })

  const merged = [
    ...(images.resources ?? []),
    ...(videos.resources ?? []),
  ].sort((a: any, b: any) => {
    const da = a?.created_at ? new Date(a.created_at).getTime() : 0
    const db = b?.created_at ? new Date(b.created_at).getTime() : 0
    return db - da
  })

  const items = merged.map((r: any) => {
    const resource_type: 'image' | 'video' = r.resource_type === 'video' ? 'video' : 'image'
    const type = r.type ?? 'upload'

    // ✅ URL original
    const url = r.secure_url ?? r.url

    // ✅ URL “compat” para navegador:
    // - imágenes: f_auto,q_auto (convierte HEIC/AVIF a algo compatible si hace falta)
    // - videos: f_mp4 + vc_h264 (convierte HEVC/MOV a MP4 H.264)
    const displayUrl =
      resource_type === 'video'
        ? cloudinary.url(r.public_id, {
            secure: true,
            resource_type,
            type,
            transformation: [
              { fetch_format: 'mp4', video_codec: 'h264' as any },
              { quality: 'auto' },
            ],
          })
        : cloudinary.url(r.public_id, {
            secure: true,
            resource_type,
            type,
            transformation: [{ fetch_format: 'auto' }, { quality: 'auto' }],
          })

    // ✅ Thumb para video (frame en segundo 0)
    const thumbUrl =
      resource_type === 'video'
        ? cloudinary.url(r.public_id, {
            secure: true,
            resource_type,
            type,
            transformation: [{ start_offset: 0 }, { fetch_format: 'jpg' }, { quality: 'auto' }],
          })
        : displayUrl

    return {
      public_id: r.public_id,
      resource_type,
      type,
      url,
      displayUrl,
      thumbUrl,
      created_at: r.created_at,
      bytes: r.bytes,
      format: r.format,
      width: r.width,
      height: r.height,
    }
  })

  return {
    nextCursor: null,
    items,
  }
}

  // ✅ Eliminar: intenta image y si no, intenta video
  async delete(publicId: string) {
    // Cloudinary destroy requiere resource_type correcto
    try {
      const r1 = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
      })
      // si borró o al menos respondió algo distinto a "not found"
      if (r1?.result && r1.result !== 'not found') return r1
    } catch (_) {
      // seguimos a video
    }

    return cloudinary.uploader.destroy(publicId, { resource_type: 'video' })
  }

  async findOne(publicId: string) {
    try {
      // Intentamos buscarlo como imagen
      const result = await cloudinary.api.resource(publicId, {
        resource_type: 'image',
      })
      return result
    } catch (error: any) {
      const httpCode = error?.http_code || error?.error?.http_code
      if (httpCode !== 404) throw error
    }

    try {
      // Intentamos como video
      const result = await cloudinary.api.resource(publicId, {
        resource_type: 'video',
      })
      return result
    } catch (error: any) {
      const httpCode = error?.http_code || error?.error?.http_code
      if (httpCode === 404) return null
      throw error
    }
  }

  async healthCheck() {
  const usage = await cloudinary.api.usage();

  return {
    ok: true,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    plan: usage?.plan,
    credits: usage?.credits,
    storage: usage?.storage,
    bandwidth: usage?.bandwidth,
    transformations: usage?.transformations,
  };
}

async uploadBufferSafe(file: Express.Multer.File, overwrite = false) {
  if (!file) {
    throw new Error('No file received');
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new Error('File buffer is empty or missing');
  }

  const mimetype = file.mimetype ?? '';
  const isVideo = mimetype.startsWith('video/');
  const resource_type: 'image' | 'video' = isVideo ? 'video' : 'image';

  // Generamos el publicId explícitamente para evitar discrepancias
  const public_id = this.getPublicId(file.originalname, ''); // Sin folder aquí porque pasamos folder aparte

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type,
          public_id,
          folder: 'gallery',
          use_filename: false, // Desactivamos esto para usar nuestro ID exacto
          unique_filename: false,
          overwrite: overwrite,
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }

          resolve({
            public_id: result?.public_id,
            url: result?.secure_url ?? result?.url,
            secure_url: result?.secure_url,
            resource_type: result?.resource_type,
            format: result?.format,
            bytes: result?.bytes,
            original_filename: file.originalname,
            mimetype: file.mimetype,
          });
        },
      )
      .end(file.buffer);
  });
}

async inspectIncomingFile(file: Express.Multer.File) {
  return {
    exists: !!file,
    originalname: file?.originalname,
    mimetype: file?.mimetype,
    size: file?.size,
    hasBuffer: !!file?.buffer,
    bufferLength: file?.buffer?.length ?? 0,
  };
}
}
