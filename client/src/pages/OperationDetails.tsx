import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/api';
import { useAsync } from '@/hooks/useAsync';
import { Badge, Card, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate, formatRub } from '@/lib/format';
import type { OperationCategory, OperationSource } from '@/types/api';

const CATEGORY_LABELS: Record<OperationCategory, string> = {
  income: 'Доход',
  expense: 'Расход',
  payment: 'Платёж',
  tax: 'Налоги',
  salary: 'Зарплата',
  other: 'Прочее',
};

const SOURCE_LABELS: Record<OperationSource, string> = {
  import: 'Импорт выписки',
  manual: 'Добавлено вручную',
  bank_stub: 'Из банка (заглушка)',
  self_loan: 'Самозайм',
  bank_loan: 'Банковский займ (заглушка)',
  payment: 'Платёж со страницы «Оплата»',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-48 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 sm:pt-0.5">{label}</dt>
      <dd className="flex-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export default function OperationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const op = useAsync(() => api.operations.get(id ?? ''), [id]);

  if (!id) return <Navigate to="/history" replace />;

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/history')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={16} /> Назад к истории
      </button>

      {op.loading && (
        <Card>
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        </Card>
      )}

      {op.error && (
        <Card>
          <ErrorState error={op.error} onRetry={op.refetch} />
        </Card>
      )}

      {op.data && (
        <Card title="Операция">
          <dl className="grid">
            <Row label="Дата операции">{formatDate(op.data.date)}</Row>
            <Row label="Сумма и направление">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'text-xl font-bold tabular-nums',
                    op.data.direction === 'in' ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {op.data.direction === 'in' ? '+' : '−'}
                  {formatRub(op.data.amount)}
                </span>
                <Badge tone={op.data.direction === 'in' ? 'green' : 'red'}>
                  {op.data.direction === 'in' ? 'Поступление' : 'Списание'}
                </Badge>
              </span>
            </Row>
            <Row label="Контрагент">
              <span>
                {op.data.counterpartyName} · ИНН {op.data.counterpartyInn}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">Данные обезличены при сохранении</span>
            </Row>
            <Row label="Назначение платежа">{op.data.purpose}</Row>
            <Row label="Остаток на счёте (конец дня)">{formatRub(op.data.balanceEndOfDay)}</Row>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="gray">{CATEGORY_LABELS[op.data.category] ?? op.data.category}</Badge>
            <Badge tone="blue">{SOURCE_LABELS[op.data.source] ?? op.data.source}</Badge>
          </div>
        </Card>
      )}
    </div>
  );
}
