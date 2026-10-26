import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { PricingService } from './pricing.service';

const packageId = 'a2c1d3e4-1234-4234-8234-123456789abc';
function setup(overrides: Record<string, unknown> = {}) {
  const fixture = Object.freeze({
    id: 'service-1',
    slug: 'design',
    isActive: true,
    pricingModel: 'fixed',
    basePrice: 100000,
    packages: Object.freeze([
      Object.freeze({
        id: packageId,
        serviceId: 'service-1',
        isActive: true,
        price: 200000,
      }),
    ]),
    ...overrides,
  });
  const catalog = { getPublicBySlug: jest.fn().mockResolvedValue(fixture) };
  return {
    service: new PricingService(catalog as unknown as CatalogService),
    catalog,
    fixture,
  };
}

describe('PricingService read-only catalog estimates', () => {
  it('uses server catalog and returns only allowlisted, nonbinding fields', async () => {
    const { service, catalog, fixture } = setup({ privateField: 'not public' });
    const snapshot = JSON.stringify(fixture);
    const result = await service.calculate({
      serviceSlug: 'design',
      priority: 'urgent',
    });
    expect(catalog.getPublicBySlug).toHaveBeenCalledWith('design');
    expect(catalog.getPublicBySlug).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      policy_version: 'zeus-estimate-v1',
      currency: 'IRT',
      is_binding: false,
      payment_allowed: false,
      availability: 'not_checked',
      capacity_reserved: false,
      requires_operational_confirmation: true,
      service_slug: 'design',
      package_id: null,
      priority: 'urgent',
      status: 'estimated',
      base_price: 100000,
      surcharge_pct: 30,
      surcharge_amount: 30000,
      final_price: 130000,
      message:
        'صرفاً برآورد قیمت؛ پرداخت، رزرو ظرفیت و تعهد تحویل ایجاد نمی‌کند.',
    });
    expect(JSON.stringify(fixture)).toBe(snapshot);
  });

  it('uses the selected active package price without creating a same-day promise', async () => {
    const { service } = setup();
    expect(
      await service.calculate({
        serviceSlug: 'design',
        packageId,
        priority: 'same_day',
      }),
    ).toMatchObject({
      final_price: 360000,
      package_id: packageId,
      capacity_reserved: false,
      availability: 'not_checked',
      payment_allowed: false,
    });
  });

  it.each(['manual_quote', 'formula'])(
    'does not convert %s placeholder price into a quote',
    async (pricingModel) => {
      const { service } = setup({ pricingModel });
      expect(
        await service.calculate({
          serviceSlug: 'design',
          packageId,
          priority: 'urgent',
        }),
      ).toMatchObject({
        status: 'quote_required',
        base_price: null,
        final_price: null,
        surcharge_pct: null,
      });
    },
  );

  it('does not fall back to service price for an unpriced selected package', async () => {
    const { service } = setup({
      packages: [
        { id: packageId, serviceId: 'service-1', isActive: true, price: null },
      ],
    });
    expect(
      await service.calculate({
        serviceSlug: 'design',
        packageId,
        priority: 'normal',
      }),
    ).toMatchObject({ status: 'quote_required', final_price: null });
  });

  it('treats absent base price as quote required but zero as a valid estimate', async () => {
    expect(
      await setup({ basePrice: null }).service.calculate({
        serviceSlug: 'design',
        priority: 'normal',
      }),
    ).toMatchObject({ status: 'quote_required', final_price: null });
    expect(
      await setup({ basePrice: 0 }).service.calculate({
        serviceSlug: 'design',
        priority: 'same_day',
      }),
    ).toMatchObject({
      status: 'estimated',
      final_price: 0,
      payment_allowed: false,
    });
  });

  it.each([
    [],
    [{ id: packageId, serviceId: 'foreign', isActive: true, price: 1 }],
    [{ id: packageId, serviceId: 'service-1', isActive: false, price: 1 }],
  ])('rejects missing, foreign or inactive packages %#', async (...items) => {
    // Each table row is itself the package list (Jest spreads array rows).
    const packages = items;
    const { service } = setup({ packages });
    await expect(
      service.calculate({
        serviceSlug: 'design',
        packageId,
        priority: 'normal',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('propagates catalog 404 and refuses an inactive service', async () => {
    const { service, catalog } = setup();
    catalog.getPublicBySlug.mockRejectedValue(new NotFoundException());
    await expect(
      service.calculate({ serviceSlug: 'missing', priority: 'normal' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      setup({ isActive: false }).service.calculate({
        serviceSlug: 'design',
        priority: 'normal',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects corrupt fixed catalog prices', async () => {
    await expect(
      setup({ basePrice: -1 }).service.calculate({
        serviceSlug: 'design',
        priority: 'normal',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
