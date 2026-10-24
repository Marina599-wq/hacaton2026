import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatRub } from '@/lib/format';

/**
 * Палитра «In Color Balance»: шалфей и олива для доходных категорий,
 * серо-голубые — расходы, чтобы сегменты не сливались в одно кольцо.
 */
const PALETTE = ['#9cad76', '#7f915f', '#495736', '#979aa1', '#7c7e86', '#5f616a', '#f43f5e'];

function PieTooltip({
  active,
  payload,
  items,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; payload?: { fill?: string; label?: string } }>;
  items: Array<{ value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const total = items.reduce((sum, it) => sum + it.value, 0);
  const item = payload[0];
  const value = Number(item.value) || 0;
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  const color = item.payload?.fill ?? '#979aa1';
  const name = item.payload?.label ?? item.name ?? '';
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 shadow-xl">
      <div className="flex items-center gap-2 font-medium">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
        {name}
      </div>
      <div className="mt-1 tabular-nums">{formatRub(value)} · {share}%</div>
      <div className="mt-0.5 text-slate-400">всего {formatRub(total)}</div>
    </div>
  );
}

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
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={62}
          outerRadius={96}
          paddingAngle={3}
          stroke="#1f2024"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
        </Pie>
        <Tooltip content={<PieTooltip items={items} />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconSize={12}
          wrapperStyle={{ fontSize: 12, color: '#979aa1', lineHeight: 1.8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
