import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/services/', '/status'],
      disallow: ['/api/', '/account/', '/admin/', '/dashboard', '/executor/', '/orders/', '/support/', '/tickets/', '/wallet'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
