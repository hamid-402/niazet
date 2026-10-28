import {
  normalizeVerifiedEmailAddress,
  parsePasswordIdentifier,
} from './verified-identifier-contract';

describe('verified identity lookup contract (not ownership evidence)', () => {
  it.each(['09120000009', '۰۹۱۲۰۰۰۰۰۰۹', '٠٩١٢٠٠٠٠٠٠٩', ' 09120000009 '])(
    'normalizes an explicit mobile identifier: %s',
    (input) => {
      expect(parsePasswordIdentifier(input)).toEqual({
        kind: 'phone',
        phone: '09120000009',
      });
    },
  );
  it('keeps plus addressing and uses an explicit ASCII case-folded lookup key', () => {
    expect(normalizeVerifiedEmailAddress(' Owner+Tag@EXAMPLE.COM ')).toBe(
      'owner+tag@example.com',
    );
    expect(parsePasswordIdentifier('Owner+Tag@EXAMPLE.COM')).toEqual({
      kind: 'email',
      email: 'owner+tag@example.com',
    });
  });
  it.each([
    '',
    null,
    9,
    {},
    'owner@example',
    'Name <owner@example.com>',
    'owner\n@example.com',
    'ow ner@example.com',
    'مالک@example.com',
    'owner@exаmple.com',
    'owner@example.com\u0000',
    'a'.repeat(255) + '@example.com',
  ])('rejects ambiguous/control/unsupported email input: %p', (input) => {
    expect(() => normalizeVerifiedEmailAddress(input)).toThrow();
  });
  it.each([
    '0912 0000009',
    '+989120000009',
    '9120000009',
    '091200000090',
    '0912000000',
    '09١۲۰\u200d۰۰۰۰۰۰۹',
    '',
    null,
    {},
  ])(
    'never guesses a country prefix or ignores internal characters: %p',
    (input) => {
      expect(() => parsePasswordIdentifier(input)).toThrow();
    },
  );
});
