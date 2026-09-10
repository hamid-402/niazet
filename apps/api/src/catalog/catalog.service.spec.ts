import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';

describe('CatalogService admin builders', () => {
  function setup() {
    const prisma = {
      serviceLine: { findUnique: jest.fn() },
      serviceFormField: { create: jest.fn() },
      qcChecklistTemplate: { findFirst: jest.fn(), create: jest.fn() },
      qcChecklistItem: { create: jest.fn() },
    };
    return { service: new CatalogService(prisma as never), prisma };
  }

  it('stores normalized form options under the selected service', async () => {
    const { service, prisma } = setup();
    prisma.serviceLine.findUnique.mockResolvedValue({ id: 'service-1' });
    prisma.serviceFormField.create.mockResolvedValue({ id: 'field-1' });

    await service.addFormField('service-1', {
      label: 'نوع خروجی',
      fieldKey: 'output_type',
      fieldType: 'select',
      required: true,
      options: ['PDF', 'DOCX'],
    });

    expect(prisma.serviceFormField.create).toHaveBeenCalledWith({
      data: {
        serviceId: 'service-1',
        label: 'نوع خروجی',
        fieldKey: 'output_type',
        fieldType: 'select',
        required: true,
        options: ['PDF', 'DOCX'],
      },
    });
  });

  it('does not attach a QC item to a template from another service', async () => {
    const { service, prisma } = setup();
    prisma.qcChecklistTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.addQcItem('service-1', 'template-2', {
        label: 'کنترل فایل خروجی',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.qcChecklistItem.create).not.toHaveBeenCalled();
  });

  it('creates a QC item only after service-template ownership is verified', async () => {
    const { service, prisma } = setup();
    prisma.qcChecklistTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
    });
    prisma.qcChecklistItem.create.mockResolvedValue({ id: 'item-1' });

    await service.addQcItem('service-1', 'template-1', {
      label: 'کنترل فایل خروجی',
      sortOrder: 2,
    });

    expect(prisma.qcChecklistItem.create).toHaveBeenCalledWith({
      data: {
        templateId: 'template-1',
        label: 'کنترل فایل خروجی',
        sortOrder: 2,
      },
    });
  });
});
