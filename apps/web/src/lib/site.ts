export const SITE_NAME = 'نیازت با ما';
export const SITE_DESCRIPTION = 'سامانه خدمات مدیریت‌شده با اجرای داخلی، پرداخت امن، کنترل کیفیت و تحویل قابل پیگیری';

function resolveSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    const url = new URL(configured || 'http://localhost:3002');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported site URL protocol');
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return new URL('http://localhost:3002');
  }
}

export const SITE_URL = resolveSiteUrl();

export function absoluteUrl(path = '/') {
  return new URL(path, SITE_URL).toString();
}
