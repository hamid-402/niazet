import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import { PricingService } from './pricing.service';

@Controller('v1/pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @Post('calculate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimit({ name: 'pricing-estimate', limit: 60, windowMs: 60_000 })
  calculate(@Body() dto: CalculatePriceDto) {
    return this.pricing.calculate(dto);
  }
}
