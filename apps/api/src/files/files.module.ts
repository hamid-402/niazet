import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FileCleanupService } from './file-cleanup.service';
import { AntivirusService } from './antivirus.service';
import { ObjectStorageService } from './object-storage.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    MulterModule.register({ storage: undefined }),
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    FileCleanupService,
    AntivirusService,
    ObjectStorageService,
  ],
  exports: [
    FilesService,
    FileCleanupService,
    AntivirusService,
    ObjectStorageService,
  ],
})
export class FilesModule {}
