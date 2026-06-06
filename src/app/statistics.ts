export interface FieldStat {
  field: string;
  count: number;
  min: number;
  max: number;
  average: number;
  unit: 'number' | 'minutes';
}

export interface CategoryStat {
  field: string;
  distinctCount: number;
  topValues: { value: string; count: number }[];
}

function isNullLike(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === '-' || normalized === 'null' || normalized === 'undefined';
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function parseNumberLike(value: unknown): { value: number; unit: 'number' | 'minutes' } | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, unit: 'number' };
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const durationMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (durationMatch) {
    const first = Number(durationMatch[1]);
    const second = Number(durationMatch[2]);
    const third = Number(durationMatch[3] ?? 0);
    if ([first, second, third].every(Number.isFinite)) {
      return {
        value: round(first + second / 60 + third / 3600, 3),
        unit: 'minutes',
      };
    }
  }

  const normalized = trimmed.replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { value: Number(normalized), unit: 'number' };
  }

  return null;
}

function getYearValue(record: Record<string, unknown>) {
  const yearKey = Object.keys(record).find((key) => /^(yil|yıl|year)$/i.test(key.trim()));
  if (!yearKey) return null;
  const raw = record[yearKey];
  const year = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  return Number.isInteger(year) ? { key: yearKey, year } : null;
}

export function computeRecordStatistics(records: Record<string, unknown>[]) {
  const usableRecords = records.filter((record) =>
    Object.entries(record).some(([key, value]) => key !== '_id' && !isNullLike(value))
  );
  const fields = Array.from(new Set(usableRecords.flatMap((record) => Object.keys(record)))).filter(
    (field) => field !== '_id'
  );

  const numericStats: FieldStat[] = fields
    .map((field) => {
      const parsed = usableRecords
        .map((record) => parseNumberLike(record[field]))
        .filter((item): item is { value: number; unit: 'number' | 'minutes' } => Boolean(item));
      if (!parsed.length) return null;
      const unit = parsed.some((item) => item.unit === 'minutes') ? 'minutes' : 'number';
      const values = parsed.map((item) => item.value);
      const sum = values.reduce((total, value) => total + value, 0);
      return {
        field,
        count: values.length,
        min: round(Math.min(...values)),
        max: round(Math.max(...values)),
        average: round(sum / values.length),
        unit,
      };
    })
    .filter((item): item is FieldStat => Boolean(item))
    .filter((item) => item.field.toLocaleLowerCase('tr-TR') !== 'yil' && item.field.toLocaleLowerCase('tr-TR') !== 'yıl')
    .slice(0, 8);

  const categoricalStats: CategoryStat[] = fields
    .filter((field) => !numericStats.some((stat) => stat.field === field))
    .map((field) => {
      const counts = new Map<string, number>();
      for (const record of usableRecords) {
        const value = record[field];
        if (isNullLike(value)) continue;
        const label = String(value).trim();
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return {
        field,
        distinctCount: counts.size,
        topValues: Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([value, count]) => ({ value, count })),
      };
    })
    .filter((item) => item.distinctCount > 0)
    .slice(0, 6);

  const yearRows = usableRecords
    .map((record) => ({ record, yearInfo: getYearValue(record) }))
    .filter((item): item is { record: Record<string, unknown>; yearInfo: { key: string; year: number } } =>
      Boolean(item.yearInfo)
    )
    .sort((a, b) => a.yearInfo.year - b.yearInfo.year);

  const trendInsights =
    yearRows.length >= 2
      ? numericStats
          .map((stat) => {
            const first = yearRows[0]!;
            const last = yearRows[yearRows.length - 1]!;
            const firstValue = parseNumberLike(first.record[stat.field]);
            const lastValue = parseNumberLike(last.record[stat.field]);
            if (!firstValue || !lastValue) return null;
            const change = round(lastValue.value - firstValue.value);
            const direction = change > 0 ? 'artis' : change < 0 ? 'azalis' : 'degisim yok';
            return {
              field: stat.field,
              fromYear: first.yearInfo.year,
              toYear: last.yearInfo.year,
              fromValue: round(firstValue.value),
              toValue: round(lastValue.value),
              change,
              direction,
              unit: stat.unit,
            };
          })
          .filter(Boolean)
      : [];

  const insightSentences = [
    `Analize dahil edilen kullanilabilir kayit sayisi: ${usableRecords.length}.`,
    numericStats.length
      ? `Sayisal/sure benzeri alanlar: ${numericStats.map((stat) => stat.field).join(', ')}.`
      : '',
    trendInsights.length
      ? `Yil bazli karsilastirma yapilabiliyor: ${trendInsights
          .slice(0, 4)
          .map((item: any) => `${item.field} ${item.fromYear}-${item.toYear} ${item.direction} (${item.change} ${item.unit})`)
          .join('; ')}.`
      : '',
  ].filter(Boolean);

  return {
    sampledRecordCount: records.length,
    usableRecordCount: usableRecords.length,
    fields,
    numericStats,
    categoricalStats,
    trendInsights,
    insightSentences,
  };
}
