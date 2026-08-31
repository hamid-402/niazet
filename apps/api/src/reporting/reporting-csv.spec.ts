import { buildReportCsv } from './reporting-csv';

describe('report CSV export', () => {
  it('adds UTF-8 BOM, quotes columns and neutralizes spreadsheet formulas', () => {
    const csv = buildReportCsv([
      {
        section: 'staff',
        entity: '=HYPERLINK("https://bad.test")',
        metric: 'alias',
        value: '+120',
        unit: '@unit',
      },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""https://bad.test"")"');
    expect(csv).toContain('"\'+120"');
    expect(csv).toContain('"\'@unit"');
  });

  it('escapes embedded quotes and keeps a fixed auditable schema', () => {
    const csv = buildReportCsv([
      {
        section: 'quality',
        entity: 'QC "first"',
        metric: 'rate',
        value: 87.5,
        unit: 'percent',
      },
    ]);
    expect(csv).toContain('"section","entity","metric","value","unit"');
    expect(csv).toContain('"QC ""first"""');
  });
});
