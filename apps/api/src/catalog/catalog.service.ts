import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAcceptanceCriterionDto,
  CreateFormFieldDto,
  CreatePackageDto,
  CreateQcItemDto,
  CreateQcTemplateDto,
  CreateServiceDto,
  UpdateServiceDto,
} from './dto/service.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.serviceLine.findMany({
      where: { isActive: true },
      include: {
        packages: { where: { isActive: true } },
        formFields: { orderBy: { sortOrder: 'asc' } },
        acceptanceCriteria: true,
      },
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
      include: {
        packages: true,
        formFields: { orderBy: { sortOrder: 'asc' } },
        acceptanceCriteria: true,
        qcChecklistTemplates: { include: { items: true } },
      },
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
    return this.prisma.serviceLine.update({
      where: { id },
      data: { isActive },
    });
  }

  async addPackage(serviceId: string, dto: CreatePackageDto) {
    await this.getForAdmin(serviceId);
    return this.prisma.servicePackage.create({ data: { ...dto, serviceId } });
  }

  async addFormField(serviceId: string, dto: CreateFormFieldDto) {
    await this.getForAdmin(serviceId);
    const { options, ...data } = dto;
    return this.prisma.serviceFormField.create({
      data: {
        ...data,
        serviceId,
        options: options?.length ? options : undefined,
      },
    });
  }

  async addAcceptanceCriterion(
    serviceId: string,
    dto: CreateAcceptanceCriterionDto,
  ) {
    await this.getForAdmin(serviceId);
    return this.prisma.serviceAcceptanceCriteria.create({
      data: { serviceId, description: dto.description },
    });
  }

  async addQcTemplate(serviceId: string, dto: CreateQcTemplateDto) {
    await this.getForAdmin(serviceId);
    return this.prisma.qcChecklistTemplate.create({
      data: { serviceId, name: dto.name },
      include: { items: true },
    });
  }

  async addQcItem(serviceId: string, templateId: string, dto: CreateQcItemDto) {
    const template = await this.prisma.qcChecklistTemplate.findFirst({
      where: { id: templateId, serviceId },
      select: { id: true },
    });
    if (!template) {
      throw new NotFoundException('قالب کنترل کیفیت برای این خدمت یافت نشد.');
    }
    return this.prisma.qcChecklistItem.create({
      data: { templateId, label: dto.label, sortOrder: dto.sortOrder ?? 0 },
    });
  }
}
