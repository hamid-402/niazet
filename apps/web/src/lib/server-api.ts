import 'server-only';

const INTERNAL_API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

export async function publicApiFetch<T>(path: string, revalidate = 300): Promise<T> {
  const response = await fetch(`${INTERNAL_API_URL}${path}`, {
    next: { revalidate },
    headers: { 'X-Correlation-Id': crypto.randomUUID() },
  });
  if (!response.ok) throw new Error(`Public API request failed with ${response.status}`);
  return response.json() as Promise<T>;
}
