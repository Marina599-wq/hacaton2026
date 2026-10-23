import { useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, errorMessage } from '@/api';
import { Button, Card, EmptyState, Field, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { currentMonth, formatDate, formatRub, shiftMonth, todayISO } from '@/lib/format';
import type { BankPaymentResponse, BankPaymentType, Operation } from '@/types/api';

const TYPES: Array<{ value: BankPaymentType; label: string }> = [
  { value: 'tax', label: 'Налоги' },
  { value: 'salary', label: 'Зарплата' },
  { value: 'rent', label: 'Аренда' },
  { value: 'supplier', label: 'Поставщики' },
  { value: 'other', label: 'Прочее' },
];

export default function Payments() {
  const [type, setType] = useState<BankPaymentType>('tax');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BankPaymentResponse | null>(null);

  const [pullBusy, setPullBusy] = useState(false);
  const [pulled, setPulled] = useState<Operation[] | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!recipient.trim() || !Number.isFinite(value) || value <= 0 || !date) {
      setError('Заполните получателя, сумму и дату');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await api.bank.payments({
          type,
          recipient: recipient.trim(),
          amount: value,
          date,
          purpose: purpose.trim(),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function pull() {
    setPullBusy(true);
    try {
      const res = await api.bank.transactions({ from: shiftMonth(currentMonth(), -1), to: todayISO() });
      setPulled(res.operations);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPullBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Новый платёж (заглушка банка)">
        <div className="mb-3 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium',
                type === t.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Получатель">
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Название получателя" />
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
          <Field label="Дата">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Назначение (необязательно)">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Оплата по договору..." />
          </Field>
          {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy}>
              Отправить платёж
            </Button>
          </div>
        </form>

        {result && (
          <div className="mt-4 space-y-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              Платёж принят банком (статус: {result.status}). {formatDate(result.operation.date)} ·{' '}
              {formatRub(result.operation.amount)} записан как расход.
            </div>
            {result.warning?.gapGrows && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <b>Внимание:</b> этот платёж увеличивает кассовый разрыв
                {result.warning.newGapAmount != null ? ` — новая сумма: ${formatRub(result.warning.newGapAmount)}` : ''}.
              </div>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Подтянуть операции из банка"
        action={
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={pullBusy} onClick={pull}>
            Подтянуть
          </Button>
        }
      >
        {pulled == null ? (
          <EmptyState title="Данных пока нет" hint="Заглушка банка вернёт последние операции со счёта" />
        ) : pulled.length === 0 ? (
          <EmptyState title="Операций не найдено" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pulled.map((op) => (
              <li key={op.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{op.counterpartyName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {formatDate(op.date)} · {op.purpose}
                  </p>
                </div>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    op.direction === 'in' ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {op.direction === 'in' ? '+' : '−'}
                  {formatRub(op.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
