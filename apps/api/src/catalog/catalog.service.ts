import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackageDto, CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.serviceLine.findMany({
      where: { isActive: true },
      include: { packages: { where: { isActive: true } } },
      orderBy: { title: 'asc' },
    });
  }

  async getPublicBySlug(slug: string) {
    const service = await this.prisma.serviceLine.findUnique({
      where: { slug },
      include: {
        packages: { where: { isActive: true } },
        formFields: { orderBy: { sortOrder: 'asc' } },
        acceptanceCriteria: true,
      },
    });

    if (!service || !service.isActive) {
      throw new NotFoundException('خدمت مورد نظر یافت نشد.');
    }

    return service;
  }

  listAllForAdmin() {
    return this.prisma.serviceLine.findMany({
      include: { packages: true, formFields: true, qcChecklistTemplates: { include: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForAdmin(id: string) {
    const service = await this.prisma.serviceLine.findUnique({
      where: { id },
      include: {
        packages: true,
        formFields: true,
        acceptanceCriteria: true,
        qcChecklistTemplates: { include: { items: true } },
      },
    });
    if (!service) {
      throw new NotFoundException('خدمت مورد نظر یافت نشد.');
    }
    return service;
  }

  create(dto: CreateServiceDto) {
    return this.prisma.serviceLine.create({ data: dto });
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.getForAdmin(id);
    return this.prisma.serviceLine.update({ where: { id }, data: dto });
  }

  async setActive(id: string, isActive: boolean) {
    await this.getForAdmin(id);
    return this.prisma.serviceLine.update({ where: { id }, data: { isActive } });
  }

  async addPackage(serviceId: string, dto: CreatePackageDto) {
    await this.getForAdmin(serviceId);
    return this.prisma.servicePackage.create({ data: { ...dto, serviceId } });
  }
}
