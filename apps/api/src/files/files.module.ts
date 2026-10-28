import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FileCleanupService } from './file-cleanup.service';
import { AntivirusService } from './antivirus.service';
import { ObjectStorageService } from './object-storage.service';
import { OutputPublicationService } from './output-publication.service';
import {
  AdminOutputPublicationController,
  CustomerOutputPublicationController,
} from './output-publication.controller';
import { IdempotencyService } from '../finance/idempotency.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    MulterModule.register({ storage: undefined }),
  ],
  controllers: [
    FilesController,
    AdminOutputPublicationController,
    CustomerOutputPublicationController,
  ],
  providers: [
    FilesService,
    FileCleanupService,
    AntivirusService,
    ObjectStorageService,
    OutputPublicationService,
    IdempotencyService,
  ],
  exports: [
    FilesService,
    FileCleanupService,
    AntivirusService,
    ObjectStorageService,
  ],
})
export class FilesModule {}
