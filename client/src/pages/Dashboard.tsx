import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  PiggyBank,
  Plus,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, errorMessage } from '@/api';
import { useAsync } from '@/hooks/useAsync';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Toggle,
} from '@/components/ui';
import { ForecastChart } from '@/components/charts/ForecastChart';
import { cn } from '@/lib/cn';
import { formatDate, formatRub, todayISO } from '@/lib/format';
import type { Direction, Horizon, Risk, RiskType } from '@/types/api';

const HORIZONS: Horizon[] = [30, 60, 90];

const RISK_TYPES: Array<{ value: RiskType; label: string }> = [
  { value: 'income_loss', label: 'Потеря дохода' },
  { value: 'unplanned_expense', label: 'Внеплановый расход' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [horizon, setHorizon] = useState<Horizon>(90);
  const [showOpModal, setShowOpModal] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const dashboard = useAsync(() => api.dashboard(horizon), [horizon]);
  const risks = useAsync(() => api.risks.list(), []);
  const selfLoans = useAsync(() => api.gap.selfLoans(), []);

  const d = dashboard.data;

  function refreshAll() {
    dashboard.refetch();
    risks.refetch();
    selfLoans.refetch();
  }

  async function toggleRisk(risk: Risk) {
    try {
      await api.risks.update(risk.id, { active: !risk.active });
      setActionError(null);
      refreshAll();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function removeRisk(risk: Risk) {
    try {
      await api.risks.remove(risk.id);
      setActionError(null);
      refreshAll();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function cancelSelfLoan(operationId: string) {
    try {
      await api.gap.cancelSelfLoan(operationId);
      setActionError(null);
      refreshAll();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="shrink-0 text-lg leading-none text-red-400 hover:text-red-600"
            aria-label="Скрыть"
          >
            ×
          </button>
        </div>
      )}

      {!d && dashboard.loading && <DashboardSkeleton />}
      {!d && dashboard.error && (
        <Card>
          <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />
        </Card>
      )}

      {d && (
        <>
          {dashboard.loading && (
            <div className="h-1 overflow-hidden rounded-full bg-blue-100">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
            </div>
          )}
          {dashboard.error && !dashboard.loading && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
              Ошибка обновления данных: {dashboard.error.message}. Показаны последние загруженные значения.
            </div>
          )}

          {/* 1. Общий баланс */}
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Остаток на счёте</p>
                <p className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">{formatRub(d.balance)}</p>
                <p className="mt-1 text-xs text-slate-500">Порог разрыва: {formatRub(d.threshold)}</p>
              </div>
              <p className="text-xs text-slate-400">Обновлено: данные из банка (заглушка)</p>
            </div>
          </Card>

          {/* 2. График с разрывами */}
          <Card
            title="Доходы, расходы и прогноз остатка"
            action={
              <div className="flex rounded-lg border border-slate-200 p-0.5">
                {HORIZONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium',
                      horizon === h ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {h} дн
                  </button>
                ))}
              </div>
            }
          >
            <ForecastChart series={d.forecast.series} dangerDays={d.dangerDays} threshold={d.threshold} />
            <p className="mt-2 text-xs text-slate-500">
              Красные зоны — дни, где прогноза остатка ниже порога (кассовый разрыв).
            </p>
          </Card>

          {/* 3. Сводка + ручная операция */}
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Доход за период" value={formatRub(d.summary.income)} tone="up" icon={ArrowUpRight} />
              <SummaryCard label="Расход за период" value={formatRub(d.summary.expense)} tone="down" icon={ArrowDownRight} />
              <SummaryCard
                label="Изменение остатка"
                value={`${d.summary.balanceChange >= 0 ? '+' : '−'}${formatRub(Math.abs(d.summary.balanceChange))}`}
                tone={d.summary.balanceChange >= 0 ? 'up' : 'down'}
                icon={d.summary.balanceChange >= 0 ? ArrowUpRight : ArrowDownRight}
              />
            </div>
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowOpModal(true)}>
              Добавить операцию вручную
            </Button>
          </div>

          {/* 4. Риски */}
          <Card
            title="Риски"
            action={
              <Button variant="ghost" size="sm" icon={Plus} onClick={() => setShowRiskModal(true)}>
                Добавить риск
              </Button>
            }
          >
            {risks.error ? (
              <ErrorState error={risks.error} onRetry={risks.refetch} />
            ) : risks.loading && !risks.data ? (
              <div className="space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : !risks.data || risks.data.length === 0 ? (
              <EmptyState title="Рисков пока нет" hint="Добавьте риск вручную — он будет учтён в прогнозе" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {risks.data.map((risk) => (
                  <li key={risk.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">{risk.title}</p>
                        <Badge tone={risk.source === 'auto' ? 'blue' : 'violet'}>
                          {risk.source === 'auto' ? 'авто' : 'ручной'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatRub(risk.amount)} · вероятность {Math.round(risk.probability * 100)}% ·{' '}
                        {formatDate(risk.dateFrom)}
                        {risk.dateTo ? `–${formatDate(risk.dateTo)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {risk.source === 'manual' && (
                        <button
                          onClick={() => removeRisk(risk)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          title="Удалить риск"
                        >
                          <X size={15} />
                        </button>
                      )}
                      <Toggle
                        checked={risk.active}
                        onChange={() => toggleRisk(risk)}
                        label={`Учитывать: ${risk.title}`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Включение, выключение или добавление риска сразу пересчитывает график и кассовый разрыв.
            </p>
          </Card>

          {/* 5. Кассовый разрыв */}
          <Card title="Кассовый разрыв">
            {d.forecast.gapDate ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
                    <AlertTriangle size={22} />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">
                      Ближайший разрыв — <span className="font-semibold text-slate-900">{formatDate(d.forecast.gapDate)}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span>
                        Вероятность:{' '}
                        <span className="font-semibold text-red-600">
                          {Math.round(d.forecast.gapProbabilityPct)}%
                        </span>
                      </span>
                      <span>
                        Сумма: <span className="font-semibold text-red-600">{formatRub(d.forecast.gapAmount)}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button icon={PiggyBank} onClick={() => setShowLoanModal(true)}>
                    Занять у себя
                  </Button>
                  <Button variant="secondary" icon={Wallet} onClick={() => navigate('/bank-stub')}>
                    Запрос у банка
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={22} />
                <p className="text-sm text-slate-600">На горизонте {d.horizon} дней разрыва не предвидится.</p>
              </div>
            )}

            {selfLoans.data && selfLoans.data.items.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Активные самозаймы</p>
                <ul className="divide-y divide-slate-100">
                  {selfLoans.data.items.map((op) => (
                    <li key={op.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-slate-600">
                        {formatDate(op.date)} · {formatRub(op.amount)} (внесено в счёт)
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => cancelSelfLoan(op.id)}>
                        Вернуть
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selfLoans.error && <p className="mt-3 text-xs text-red-500">Не удалось загрузить самозаймы</p>}
          </Card>
        </>
      )}

      {/* Модалки */}
      {showOpModal && (
        <Modal open title="Добавить операцию вручную" onClose={() => setShowOpModal(false)}>
          <AddOperationForm
            onSaved={() => {
              setShowOpModal(false);
              setActionError(null);
              refreshAll();
            }}
            onCanceled={() => setShowOpModal(false)}
          />
        </Modal>
      )}

      {showRiskModal && (
        <Modal open title="Добавить риск" onClose={() => setShowRiskModal(false)}>
          <AddRiskForm
            onSaved={() => {
              setShowRiskModal(false);
              setActionError(null);
              refreshAll();
            }}
            onCanceled={() => setShowRiskModal(false)}
          />
        </Modal>
      )}

      {showLoanModal && d && (
        <Modal open title="Занять у себя" onClose={() => setShowLoanModal(false)}>
          <SelfLoanForm
            gapAmount={d.forecast.gapAmount}
            gapDate={d.forecast.gapDate}
            onSaved={() => {
              setShowLoanModal(false);
              setActionError(null);
              refreshAll();
            }}
            onCanceled={() => setShowLoanModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: 'up' | 'down';
  icon: LucideIcon;
}) {
  const cls = tone === 'up' ? 'text-emerald-600' : 'text-red-600';
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <Icon size={16} className={cls} />
      </div>
      <p className={cn('mt-1 text-xl font-bold tabular-nums sm:text-2xl', cls)}>{value}</p>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-72 w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

function AddOperationForm({ onSaved, onCanceled }: { onSaved: () => void; onCanceled: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('out');
  const [counterparty, setCounterparty] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Сумма должна быть больше нуля');
      return;
    }
    if (!date) {
      setError('Укажите дату');
      return;
    }
    if (!purpose.trim()) {
      setError('Укажите назначение платежа');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.operations.create({
        date,
        amount: value,
        direction,
        counterpartyName: counterparty.trim() || undefined,
        purpose: purpose.trim(),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Сумма">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Тип">
        <Select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
          <option value="in">Доход</option>
          <option value="out">Расход</option>
        </Select>
      </Field>
      <Field label="Контрагент (необязательно)">
        <Input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Название контрагента"
        />
      </Field>
      <Field label="Назначение платежа">
        <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Оплата услуг..." />
      </Field>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCanceled}>
          Отмена
        </Button>
        <Button type="submit" loading={busy}>
          Добавить
        </Button>
      </div>
    </form>
  );
}

function AddRiskForm({ onSaved, onCanceled }: { onSaved: () => void; onCanceled: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<RiskType>('unplanned_expense');
  const [amount, setAmount] = useState('');
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState('');
  const [probability, setProbability] = useState('50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    const prob = Number(probability);
    if (!title.trim()) {
      setError('Укажите название риска');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Сумма должна быть больше нуля');
      return;
    }
    if (!Number.isFinite(prob) || prob < 0 || prob > 100) {
      setError('Вероятность — от 0 до 100%');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.risks.create({
        title: title.trim(),
        type,
        amount: value,
        dateFrom,
        dateTo: dateTo || null,
        probability: prob / 100,
        active: true,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Название">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: срыв поставки от ключевого клиента" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Тип">
          <Select value={type} onChange={(e) => setType(e.target.value as RiskType)}>
            {RISK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Сумма">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата начала">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="Дата окончания (необязательно)">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>
      <Field label="Вероятность реализации, %" hint="0–100">
        <Input type="number" min="0" max="100" value={probability} onChange={(e) => setProbability(e.target.value)} />
      </Field>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCanceled}>
          Отмена
        </Button>
        <Button type="submit" loading={busy}>
          Добавить риск
        </Button>
      </div>
    </form>
  );
}

function SelfLoanForm({
  gapAmount,
  gapDate,
  onSaved,
  onCanceled,
}: {
  gapAmount: number;
  gapDate: string | null;
  onSaved: () => void;
  onCanceled: () => void;
}) {
  const [amount, setAmount] = useState(() => (gapAmount > 0 ? String(Math.round(gapAmount)) : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Сумма должна быть больше нуля');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.gap.selfLoan({ amount: value });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-slate-600">
        Размер разрыва: <b>{formatRub(gapAmount)}</b>
        {gapDate ? ` · дата разрыва: ${formatDate(gapDate)}` : ''}. Внесите собственные средства — прогноз
        пересчитается, разрыв уменьшится.
      </p>
      <Field label="Сумма из собственных средств" hint={gapDate ? `Зачислится на счёт ${formatDate(gapDate)}` : undefined}>
        <Input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCanceled}>
          Отмена
        </Button>
        <Button type="submit" loading={busy}>
          Применить
        </Button>
      </div>
    </form>
  );
}
