import { useState, type FormEvent } from 'react';
import { Info } from 'lucide-react';
import { api, errorMessage } from '@/api';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { ScenarioCompareChart } from '@/components/charts/ScenarioCompareChart';
import { cn } from '@/lib/cn';
import { formatDate, formatRub, formatSignedRub, todayISO } from '@/lib/format';
import type { SandboxDirection, SandboxSimulateResponse } from '@/types/api';

export default function Sandbox() {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [direction, setDirection] = useState<SandboxDirection>('out');
  const [repeats, setRepeats] = useState('1');
  // ТЗ-доработка WP-4: отрицательные сценарии «что, если»
  const [excludeLoans, setExcludeLoans] = useState(false);
  const [excludeClientPayments, setExcludeClientPayments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SandboxSimulateResponse | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    const rep = Number(repeats);
    if (!name.trim()) {
      setError('Укажите название сценария');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Сумма должна быть больше нуля');
      return;
    }
    if (!Number.isInteger(rep) || rep < 1) {
      setError('Повторение: целое число от 1 (1 = одноразово)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api.sandbox.simulate({
          name: name.trim(),
          amount: value,
          date,
          direction,
          repeats: rep,
          excludeLoans,
          excludeClientPayments,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const probDelta = result?.delta.gapProbabilityPct ?? 0;
  const amountDelta = result?.delta.gapAmount ?? 0;

  return (
    <div className="space-y-4">
      <Card title="Песочница: сценарий без последствий">
        <p className="mb-3 text-sm text-slate-400">
          Эмулируйте возможную трату или доход (например, покупку автомобиля) — система посчитает
          сценарный прогноз на тех же данных и покажет разницу.
        </p>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Название" hint="Например: Покупка автомобиля">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
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
          <Field label="Тип">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as SandboxDirection)}>
              <option value="out">Расход</option>
              <option value="in">Доход</option>
            </Select>
          </Field>
          <Field label="Повторение" hint="1 — одноразово, N — ежемесячно N раз">
            <Input type="number" min="1" step="1" value={repeats} onChange={(e) => setRepeats(e.target.value)} />
          </Field>
          {/* ТЗ-доработка WP-4: отрицательные сценарии «что, если» */}
          <div className="rounded-lg bg-slate-800/60 p-3 sm:col-span-2">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Отрицательные сценарии «что, если»
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={excludeLoans}
                  onChange={(e) => setExcludeLoans(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                Займ не получен (плановые поступления по кредитам/займам не приходят)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={excludeClientPayments}
                  onChange={(e) => setExcludeClientPayments(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                Оплата от клиента не получена (плановые оплаты по договорам/счётам не приходят)
              </label>
            </div>
          </div>
          <div className="sm:col-span-2 sm:flex sm:justify-end">
            <Button type="submit" loading={busy} className="w-full sm:w-56">
              Рассчитать сценарий
            </Button>
          </div>
          {error && <p className="text-xs text-rose-400 sm:col-span-2">{error}</p>}
        </form>
      </Card>

      {result && (
        <Card title={`Сравнение: ${result.base.series.length > 0 ? 'базовый прогноз vs сценарий' : 'сценарий'}`}>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 sm:pr-6">Параметр</th>
                  <th className="pb-2 pr-4 sm:pr-6">Базовый прогноз</th>
                  <th className="pb-2 pr-4 sm:pr-6">Сценарий</th>
                  <th className="pb-2">Изменение</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr>
                  <td className="py-2 pr-4 text-slate-400 sm:pr-6">Дата разрыва</td>
                  <td className="whitespace-nowrap pr-4 sm:pr-6">{result.base.gapDate ? formatDate(result.base.gapDate) : '—'}</td>
                  <td className="whitespace-nowrap pr-4 sm:pr-6">{result.scenario.gapDate ? formatDate(result.scenario.gapDate) : '—'}</td>
                  <td className="text-slate-400">—</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-slate-400 sm:pr-6">Вероятность разрыва</td>
                  <td className="whitespace-nowrap pr-4 sm:pr-6">{result.base.gapProbabilityPct != null ? `${Math.round(result.base.gapProbabilityPct)}%` : '—'}</td>
                  <td className="whitespace-nowrap pr-4 sm:pr-6">{result.scenario.gapProbabilityPct != null ? `${Math.round(result.scenario.gapProbabilityPct)}%` : '—'}</td>
                  <td
                    className={cn(
                      'font-medium',
                      probDelta > 0 ? 'text-rose-400' : probDelta < 0 ? 'text-emerald-400' : 'text-slate-400',
                    )}
                  >
                    {probDelta > 0 ? '+' : ''}
                    {Math.round(probDelta)} п.п.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-slate-400 sm:pr-6">Сумма разрыва</td>
                  <td className="whitespace-nowrap pr-4 sm:pr-6">{formatRub(result.base.gapAmount)}</td>
                  <td className="whitespace-nowrap pr-4 sm:pr-6">{formatRub(result.scenario.gapAmount)}</td>
                  <td
                    className={cn(
                      'font-medium',
                      amountDelta > 0 ? 'text-rose-400' : amountDelta < 0 ? 'text-emerald-400' : 'text-slate-400',
                    )}
                  >
                    {formatSignedRub(amountDelta)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ScenarioCompareChart base={result.base} scenario={result.scenario} />
          <p className="mt-2 text-xs text-slate-500">
            Красные зоны — дни, где остаток сценария ниже порога T (кассовый разрыв).
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-800 p-3 text-xs text-slate-400">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              Данные песочницы не сохраняются в реальные операции и не влияют на основной прогноз.
              {result.excludedEvents ? ` Отрицательным сценарием выключено плановых поступлений: ${result.excludedEvents}.` : ''}
            </span>
          </div>
        </Card>
      )}

      {!result && (
        <p className="text-xs text-slate-400">
          После расчёта здесь появятся сравнение вероятности и суммы разрыва, а также графики базового
          прогноза и сценария.
        </p>
      )}
    </div>
  );
}
