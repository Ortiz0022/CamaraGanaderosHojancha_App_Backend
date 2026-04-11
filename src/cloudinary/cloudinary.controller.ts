import {
  Controller,
  Get,
  Query,
  Delete,
  UseInterceptors,
  UploadedFile,
  Post,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { v2 as cloudinary } from 'cloudinary'
import { CloudinaryService } from './cloudinary.service'

@Controller('cloudinary')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) { }

  @Get('usage')
  usage() {
    return this.cloudinaryService.getUsage()
  }

  @Get('gallery')
  getGallery(
    @Query('maxResults') maxResults?: string,
    @Query('nextCursor') nextCursor?: string,
  ) {
    return this.cloudinaryService.getGallery({
      maxResults: maxResults ? Number(maxResults) : 50,
      nextCursor,
    })
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('overwrite') overwrite?: string,
  ) {
    if (!file) throw new BadRequestException('File is required')

    const isOverwrite = overwrite === 'true'

    if (!isOverwrite) {
      const publicId = this.cloudinaryService.getPublicId(file.originalname, '')
      const existing = await this.cloudinaryService.findOne(publicId)
      if (existing) {
        throw new ConflictException(
          `Ya existe una imagen con el nombre "${file.originalname}" en la raíz`,
        )
      }
    }

    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'image',
            use_filename: true,
            unique_filename: false,
            overwrite: isOverwrite,
          },
          (err, res) => {
            if (err) return reject(err)
            resolve(res)
          },
        )
        .end(file.buffer)
    })

    return {
      public_id: result.public_id,
      url: result.secure_url,
    }
  }

  // ✅ CAMBIO: ahora por query param, no por :publicId
  @Get('asset')
  async getOne(@Query('publicId') publicId: string) {
    if (!publicId) {
      throw new BadRequestException('publicId is required')
    }

    const asset = await this.cloudinaryService.findOne(publicId)
    if (!asset) {
      throw new NotFoundException(`Asset ${publicId} not found`)
    }

    return asset
  }

  // ✅ CAMBIO: ahora por query param, no por :publicId
  @Delete('asset')
  async delete(@Query('publicId') publicId: string) {
    if (!publicId) {
      throw new BadRequestException('publicId is required')
    }

    return this.cloudinaryService.delete(publicId)
  }

  @Get('health')
  async health() {
    return this.cloudinaryService.healthCheck()
  }

  @Post('inspect-file')
  @UseInterceptors(FileInterceptor('file'))
  inspectFile(@UploadedFile() file: Express.Multer.File) {
    return this.cloudinaryService.inspectIncomingFile(file)
  }

  @Post('upload-safe')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSafe(
    @UploadedFile() file: Express.Multer.File,
    @Query('overwrite') overwrite?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required')
    }

    const isOverwrite = overwrite === 'true'

    try {
      if (!isOverwrite) {
        const publicId = this.cloudinaryService.getPublicId(
          file.originalname,
          'gallery',
        )
        const existing = await this.cloudinaryService.findOne(publicId)
        if (existing) {
          throw new ConflictException(
            `Ya existe una imagen con el nombre "${file.originalname}" en la galería`,
          )
        }
      }

      const result = await this.cloudinaryService.uploadBufferSafe(
        file,
        isOverwrite,
      )
      return result
    } catch (error: any) {
      if (error instanceof ConflictException) throw error

      throw new InternalServerErrorException({
        message: 'Cloudinary upload failed',
        error: error?.message ?? 'Unknown error',
      })
    }
  }
}