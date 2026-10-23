import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ForecastResult } from '@/types/api';
import { formatRub, formatRubShort } from '@/lib/format';

/** Сравнение «базовый прогноз vs сценарий» для песочницы */
export function ScenarioCompareChart({
  base,
  scenario,
  height = 260,
}: {
  base: ForecastResult;
  scenario: ForecastResult;
  height?: number;
}) {
  const byDate = new Map<string, { date: string; base?: number; scenario?: number }>();
  for (const p of base.series) byDate.set(p.date, { date: p.date, base: p.balance });
  for (const p of scenario.series) {
    const row = byDate.get(p.date) ?? { date: p.date };
    row.scenario = p.balance;
    byDate.set(p.date, row);
  }
  const data = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(5)}
          tick={{ fontSize: 11, fill: '#64748b' }}
          minTickGap={28}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => formatRubShort(v)}
          tick={{ fontSize: 11, fill: '#64748b' }}
          width={72}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip formatter={(value, name) => [formatRub(Number(value)), String(name)]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="base" name="Базовый прогноз" stroke="#64748b" strokeWidth={2} dot={false} />
        <Line dataKey="scenario" name="Сценарий" stroke="#2563eb" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
