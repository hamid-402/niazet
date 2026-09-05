import { Controller, Get, Param } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/services')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  list() {
    return this.catalog.listPublic();
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.catalog.getPublicBySlug(slug);
  }
}
