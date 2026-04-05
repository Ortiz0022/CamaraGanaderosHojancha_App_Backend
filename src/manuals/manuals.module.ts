import { Module } from '@nestjs/common';
import { DropboxModule } from '../dropbox/dropbox.module';
import { ManualsController } from './manuals.controller';
import { ManualsService } from './manuals.service';

@Module({
  imports: [DropboxModule],
  controllers: [ManualsController],
  providers: [ManualsService],
})
export class ManualsModule {}