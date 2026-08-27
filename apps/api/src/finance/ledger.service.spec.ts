import { buildLedgerCsv } from './ledger.service';

describe('ledger CSV export', () => {
  it('exports auditable columns and neutralizes spreadsheet formulas', () => {
    const csv = buildLedgerCsv([
      {
        id: 'ledger-1',
        createdAt: new Date('2026-08-27T10:00:00.000Z'),
        amount: 120_000,
        referenceType: 'payment',
        referenceId: '=HYPERLINK("https://example.test")',
        correctionOfId: null,
        createdByUserId: 'admin-1',
        debitAccount: { accountType: 'payment_gateway_clearing' },
        creditAccount: { accountType: 'platform_escrow' },
      },
    ]);

    expect(csv).toContain('"created_at"');
    expect(csv).toContain('"120000"');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(csv).not.toContain('\r\n=HYPERLINK');
  });

  it('escapes quotes and keeps an empty optional value', () => {
    const csv = buildLedgerCsv([
      {
        id: 'ledger-"quoted"',
        createdAt: new Date('2026-08-27T10:00:00.000Z'),
        amount: 1,
        referenceType: 'refund',
        referenceId: 'ref-1',
        correctionOfId: null,
        createdByUserId: null,
        debitAccount: { accountType: 'platform_escrow' },
        creditAccount: { accountType: 'customer_wallet' },
      },
    ]);
    expect(csv).toContain('"ledger-""quoted"""');
    expect(csv.endsWith(',""')).toBe(true);
  });
});
