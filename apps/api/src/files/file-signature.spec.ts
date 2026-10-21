import { matchesDeclaredMime } from './file-signature';

describe('file signature validation', () => {
  it('accepts matching signatures', () => {
    expect(
      matchesDeclaredMime(Buffer.from('%PDF-1.7'), 'application/pdf'),
    ).toBe(true);
    expect(
      matchesDeclaredMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'),
    ).toBe(true);
    expect(matchesDeclaredMime(Buffer.from('متن امن'), 'text/plain')).toBe(
      true,
    );
  });

  it('rejects a mismatched declaration and binary disguised as text', () => {
    expect(
      matchesDeclaredMime(Buffer.from('not a pdf'), 'application/pdf'),
    ).toBe(false);
    expect(matchesDeclaredMime(Buffer.from([0, 1, 2]), 'text/plain')).toBe(
      false,
    );
  });
});
