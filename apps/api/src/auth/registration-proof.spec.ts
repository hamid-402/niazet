import { registrationProof } from './registration-proof';
describe('registration proof material', () => {
  it('binds phone, display name, password and OTP without bcrypt truncation', () => {
    const longName = 'نام فارسی طولانی '.repeat(8);
    const base = registrationProof(
      '09120000001',
      longName,
      'Strong-Pass123!',
      '123456',
    );
    expect(Buffer.byteLength(base)).toBeLessThan(72);
    for (const args of [
      ['09120000002', longName, 'Strong-Pass123!', '123456'],
      ['09120000001', longName + 'X', 'Strong-Pass123!', '123456'],
      ['09120000001', longName, 'Strong-Pass123?', '123456'],
      ['09120000001', longName, 'Strong-Pass123!', '654321'],
    ])
      expect(
        registrationProof(...(args as [string, string, string, string])),
      ).not.toBe(base);
  });
  it('normalizes display-name edge whitespace but never alters passwords', () => {
    expect(registrationProof('phone', ' name ', undefined, 'code')).toBe(
      registrationProof('phone', 'name', undefined, 'code'),
    );
    expect(registrationProof('phone', 'name', ' pass ', 'code')).not.toBe(
      registrationProof('phone', 'name', 'pass', 'code'),
    );
  });
});
