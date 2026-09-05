import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileKind } from '@prisma/client';
import type { Request, Response } from 'express';
import { join } from 'path';
import {
  FilesService,
  MAX_FILE_SIZE_BYTES,
  UPLOAD_ROOT,
  isAllowedMimeType,
} from './files.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { RateLimit } from '../common/decorators/rate-limit.decorator';

@Controller('v1/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @RateLimit({ name: 'file-upload', limit: 20, windowMs: 10 * 60 * 1000 })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
      fileFilter: (_req, file, callback) =>
        callback(null, isAllowedMimeType(file.mimetype)),
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('orderId') orderId: string,
    @Body('fileKind') fileKind: FileKind = FileKind.input,
  ) {
    return this.files.saveUploadedFile({
      orderId,
      uploadedByUserId: user.id,
      fileKind,
      file,
    });
  }

  @Get(':id/signed-url')
  @RateLimit({ name: 'file-signed-url', limit: 60, windowMs: 60 * 1000 })
  signedUrl(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.files.createSignedUrl(id, user);
  }

  @Public()
  @Get('download')
  async download(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const file = await this.files.resolveSignedToken(token, req.ip);
    return res.download(join(UPLOAD_ROOT, file.storageKey), file.originalName);
  }
}
