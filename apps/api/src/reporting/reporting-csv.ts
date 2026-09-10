export interface ReportCsvRow {
  section: string;
  entity: string;
  metric: string;
  value: string | number;
  unit?: string;
}

function csvCell(value: string | number | undefined) {
  const raw = value == null ? '' : String(value);
  const protectedValue = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function buildReportCsv(rows: ReportCsvRow[]) {
  const header = ['section', 'entity', 'metric', 'value', 'unit'];
  const content = [
    header,
    ...rows.map((row) => [
      row.section,
      row.entity,
      row.metric,
      row.value,
      row.unit,
    ]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  return `\uFEFF${content}`;
}
