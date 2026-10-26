import { BadRequestException } from '@nestjs/common';
import { assertPublicComment } from './reviews.service';
describe('moderated public review contact/identifier boundary', () => {
  it.each([
    '09121234567',
    '۰۹۱۲۱۲۳۴۵۶۷',
    'کاربر test@example.org',
    'https://example.org',
    '@staff_name',
    '<script>x</script>',
    '6c355310-e54c-4b49-8c8d-becb723d7072',
  ])('rejects public PII/markup %s', (value) => {
    expect(() => assertPublicComment(value)).toThrow(BadRequestException);
  });
  it('allows empty rating-only review and plain Persian text', () => {
    expect(assertPublicComment('  ')).toBeNull();
    expect(assertPublicComment(' خروجی باکیفیت بود ')).toBe(
      'خروجی باکیفیت بود',
    );
  });
});
