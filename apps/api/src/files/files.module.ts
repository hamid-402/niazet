import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FileCleanupService } from './file-cleanup.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    MulterModule.register({ storage: undefined }),
  ],
  controllers: [FilesController],
  providers: [FilesService, FileCleanupService],
  exports: [FilesService],
})
export class FilesModule {}
