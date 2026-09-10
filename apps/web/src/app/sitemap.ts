import type { MetadataRoute } from 'next';
import { publicApiFetch } from '@/lib/server-api';
import { absoluteUrl } from '@/lib/site';
import type { ServiceLine } from '@/lib/types';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/services'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/status'), changeFrequency: 'hourly', priority: 0.4 },
  ];

  let services: ServiceLine[] = [];
  try {
    services = await publicApiFetch<ServiceLine[]>('/services');
  } catch {
    // Static public routes remain discoverable if the catalog is temporarily unavailable.
  }

  const serviceRoutes: MetadataRoute.Sitemap = services.map((service) => ({
    url: absoluteUrl(`/services/${encodeURIComponent(service.slug)}`),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...serviceRoutes];
}
