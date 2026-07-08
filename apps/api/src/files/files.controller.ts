import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileKind } from '@prisma/client';
import type { Response } from 'express';
import { join } from 'path';
import { FilesService, UPLOAD_ROOT } from './files.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('v1/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
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
  signedUrl(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.files.createSignedUrl(id, user.id);
  }

  @Public()
  @Get('download')
  async download(@Query('token') token: string, @Res() res: Response) {
    const file = await this.files.resolveSignedToken(token);
    return res.download(join(UPLOAD_ROOT, file.storageKey), file.originalName);
  }
}
