import { isValidIranianShaba } from './withdrawals.service';

describe('Iranian Shaba validation', () => {
  it('validates IBAN mod-97, not only its shape', () => {
    expect(isValidIranianShaba('IR820540102680020817909002')).toBe(true);
    expect(isValidIranianShaba('IR820540102680020817909003')).toBe(false);
    expect(isValidIranianShaba('820540102680020817909002')).toBe(false);
  });
});
