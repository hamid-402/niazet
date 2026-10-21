import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

const PUBLIC_SITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${absoluteUrl('/')}#organization`,
      name: SITE_NAME,
      url: absoluteUrl('/'),
      description: SITE_DESCRIPTION,
    },
    {
      '@type': 'WebSite',
      '@id': `${absoluteUrl('/')}#website`,
      name: SITE_NAME,
      url: absoluteUrl('/'),
      inLanguage: 'fa-IR',
      publisher: { '@id': `${absoluteUrl('/')}#organization` },
    },
    {
      '@type': 'Service',
      '@id': `${absoluteUrl('/services')}#managed-service`,
      name: 'خدمات مدیریت‌شده نیازت',
      serviceType: 'خدمات تخصصی مدیریت‌شده',
      url: absoluteUrl('/services'),
      description: SITE_DESCRIPTION,
      provider: { '@id': `${absoluteUrl('/')}#organization` },
    },
  ],
};

export function PublicStructuredData() {
  const json = JSON.stringify(PUBLIC_SITE_SCHEMA).replaceAll('<', '\\u003c');
  return <script id="public-site-structured-data" type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
