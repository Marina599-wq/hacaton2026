// client/src/components/PlanFactCard.tsx
// Вкладка «План-факт» на дашборде (ТЗ-доработка WP-5): план vs факт за месяц по группам.
import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '@/api';
import { useAsync } from '@/hooks/useAsync';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { currentMonth, formatRub, monthLabel, shiftMonth } from '@/lib/format';

export function PlanFactCard() {
  const [month, setMonth] = useState(currentMonth());
  const pf = useAsync(() => api.planFact.month(month), [month]);

  const data = pf.data;

  return (
    <Card
      title="План-факт"
      action={
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Предыдущий месяц" />
          <span className="min-w-24 text-center text-xs font-medium text-slate-300">{monthLabel(month)}</span>
          <Button variant="secondary" size="sm" icon={ArrowRight} onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Следующий месяц" />
        </div>
      }
    >
      {pf.error ? (
        <ErrorState error={pf.error} onRetry={pf.refetch} />
      ) : !data ? (
        <div className="space-y-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-800/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Поступления: план → факт</p>
              <p className="mt-1 font-semibold tabular-nums text-slate-200">
                {formatRub(data.total.plannedIn)} → {formatRub(data.total.actualIn)}
              </p>
              <p className={cn('text-xs', data.total.deltaIn >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {data.total.deltaIn >= 0 ? '+' : '−'}
                {formatRub(Math.abs(data.total.deltaIn))}
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Списания: план → факт</p>
              <p className="mt-1 font-semibold tabular-nums text-slate-200">
                {formatRub(data.total.plannedOut)} → {formatRub(data.total.actualOut)}
              </p>
              <p className={cn('text-xs', data.total.deltaOut <= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {data.total.deltaOut <= 0 ? '−' : '+'}
                {formatRub(Math.abs(data.total.deltaOut))}
              </p>
            </div>
          </div>

          {data.groups.length === 0 ? (
            <EmptyState title="Нет плановых событий и операций за месяц" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1.5">Группа</th>
                  <th className="py-1.5 text-right">План</th>
                  <th className="py-1.5 text-right">Факт</th>
                  <th className="py-1.5 text-right">Разница</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.groups.map((g) => (
                  <tr key={g.key}>
                    <td className="py-2 text-slate-300">{g.label}</td>
                    <td className="py-2 text-right tabular-nums text-slate-400">{formatRub(g.planned)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-200">{formatRub(g.actual)}</td>
                    <td
                      className={cn(
                        'py-2 text-right tabular-nums font-medium',
                        g.delta === 0 ? 'text-slate-500' : g.delta > 0 ? 'text-emerald-400' : 'text-rose-400',
                      )}
                    >
                      {g.delta === 0 ? '±0' : `${g.delta > 0 ? '+' : '−'}${formatRub(Math.abs(g.delta))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-slate-500">
            План — плановые события месяца (договоры, счета, налоги). Факт — операции счёта за тот же месяц.
          </p>
        </div>
      )}
    </Card>
  );
}
