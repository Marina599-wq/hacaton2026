import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatRub } from '@/lib/format';

const PALETTE = ['#2563eb', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#06b6d4', '#64748b'];

export function CategoryPie({
  items,
  height = 240,
}: {
  items: Array<{ key: string; label: string; value: number }>;
  height?: number;
}) {
  const data = items.map((it, i) => ({ ...it, fill: PALETTE[i % PALETTE.length] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="52%" outerRadius="78%" paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatRub(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
