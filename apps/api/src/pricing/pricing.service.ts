import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import { calculatePrice } from './pricing-calculation';

@Injectable()
export class PricingService {
  constructor(private readonly catalog: CatalogService) {}

  async calculate(dto: CalculatePriceDto) {
    const service = await this.catalog.getPublicBySlug(dto.serviceSlug);
    if (!service.isActive) {
      throw new NotFoundException('خدمت مورد نظر یافت نشد.');
    }
    const selectedPackage = dto.packageId
      ? service.packages.find(
          (item) =>
            item.id === dto.packageId &&
            item.serviceId === service.id &&
            item.isActive,
        )
      : undefined;
    if (dto.packageId && !selectedPackage) {
      throw new NotFoundException('بسته فعال برای این خدمت یافت نشد.');
    }
    const context = {
      policy_version: 'zeus-estimate-v1',
      currency: 'IRT',
      is_binding: false,
      payment_allowed: false,
      availability: 'not_checked',
      capacity_reserved: false,
      requires_operational_confirmation: true,
      service_slug: service.slug,
      package_id: selectedPackage?.id ?? null,
      priority: dto.priority,
    } as const;
    const basePrice = selectedPackage
      ? selectedPackage.price
      : service.basePrice;
    // A numeric placeholder on a negotiated/formula service is not a quote.
    if (service.pricingModel !== 'fixed' || basePrice == null) {
      return {
        ...context,
        status: 'quote_required' as const,
        base_price: null,
        surcharge_pct: null,
        surcharge_amount: null,
        final_price: null,
        message: 'قیمت قطعی پس از بررسی و تأیید جداگانه مشخص می‌شود.',
      };
    }
    return {
      ...context,
      status: 'estimated' as const,
      ...calculatePrice(basePrice, dto.priority),
      message:
        'صرفاً برآورد قیمت؛ پرداخت، رزرو ظرفیت و تعهد تحویل ایجاد نمی‌کند.',
    };
  }
}
