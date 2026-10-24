import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatRub } from '@/lib/format';

const PALETTE = ['#34d399', '#10b981', '#059669', '#94a3b8', '#64748b', '#475569', '#f43f5e'];

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
        <Tooltip
          formatter={(value) => formatRub(Number(value))}
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            fontSize: 12,
            color: '#f1f5f9',
          }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconSize={12}
          wrapperStyle={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
