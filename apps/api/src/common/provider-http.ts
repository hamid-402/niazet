import { BadGatewayException } from '@nestjs/common';

/** Never propagate provider payloads/URLs: they may contain credentials or PII. */
export async function providerJson(url: string, body: unknown) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type':
          body instanceof URLSearchParams
            ? 'application/x-www-form-urlencoded'
            : 'application/json',
      },
      body: body instanceof URLSearchParams ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('provider_http_error');
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new BadGatewayException(
      'ارتباط با سرویس‌دهنده برقرار نشد؛ دوباره تلاش کنید.',
    );
  }
}
