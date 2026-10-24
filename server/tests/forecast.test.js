import { test } from 'vitest';
import assert from 'node:assert/strict';
import { calculateForecast } from '../src/services/forecast.service.js';

const TODAY = '2026-09-30';
const op = (date, amount, direction, purpose, extra = {}) => ({
  date, amount, direction, purpose, counterpartyInn: extra.inn ?? '1', counterpartyName: extra.name ?? 'К', source: 'import', balanceEndOfDay: extra.bal, ...extra
});
const monthly = (day, amount, purpose, months = ['04', '05', '06', '07', '08', '09'], dir = 'out', extra = {}) =>
  months.map((m) => op(`2026-${m}-${String(day).padStart(2, '0')}`, amount, dir, purpose, extra));
// фоновая активность, чтобы окно статистики и история были содержательными
const background = () => Array.from({ length: 180 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 3, 1) + i * 86_400_000).toISOString().slice(0, 10);
  return op(d, 10_000 + (i % 7) * 1_000, i % 2 ? 'in' : 'out', `Операция ${i % 5}`, { inn: String(100 + (i % 5)) });
});

test('детерминизм: одинаковый вход → одинаковый результат', () => {
  const ops = [...background(), ...monthly(10, 50_000, 'Аренда')];
  const a = calculateForecast(ops, [], 500_000, 30, 0, { today: TODAY });
  const b = calculateForecast(ops, [], 500_000, 30, 0, { today: TODAY });
  assert.deepEqual(a, b);
});

test('регулярный платёж находится и проецируется на нужный день', () => {
  const ops = [...background(), ...monthly(14, 50_000, 'Аренда офиса')]; // 14.10.2026 — среда
  const r = calculateForecast(ops, [], 500_000, 30, 0, { today: TODAY });
  const rent = r.regularPayments.find((p) => p.title.includes('Аренда'));
  assert.ok(rent && rent.dayOfMonth === 14 && rent.amount === 50_000);
  assert.ok(r.forecastSeries.find((p) => p.date === '2026-10-14').reasons.some((x) => x.type === 'regular'));
});

test('«протухший» регулярный платёж (последний раз > 45 дней назад) не проецируется', () => {
  const ops = [...background(), ...monthly(10, 50_000, 'Аренда офиса', ['04', '05', '06'])];
  const r = calculateForecast(ops, [], 500_000, 30, 0, { today: TODAY });
  assert.equal(r.regularPayments.filter((p) => p.title.includes('Аренда')).length, 0);
});

test('платёж, выпавший на выходной, переносится на понедельник', () => {
  const ops = [...background(), ...monthly(3, 70_000, 'Лизинг')]; // 03.10.2026 — суббота
  const r = calculateForecast(ops, [], 500_000, 30, 0, { today: TODAY });
  const has = (date) => r.forecastSeries.find((p) => p.date === date).reasons.some((x) => x.type === 'regular');
  assert.equal(has('2026-10-03'), false);
  assert.equal(has('2026-10-05'), true);
});

test('разовые нерабочие операции (заём учредителя) не влияют на прогноз', () => {
  const clean = background();
  const polluted = [...clean, op('2026-08-10', 25_000_000, 'in', 'Предоставление беспроцентного займа по договору № 1')];
  const a = calculateForecast(clean, [], 500_000, 30, 0, { today: TODAY });
  const b = calculateForecast(polluted, [], 500_000, 30, 0, { today: TODAY });
  assert.deepEqual(a.forecastSeries.map((p) => p.income), b.forecastSeries.map((p) => p.income));
});

test('выводы владельцем не уводят остаток ниже «пола» в базовом прогнозе', () => {
  const ops = Array.from({ length: 150 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 4, 1) + i * 86_400_000).toISOString().slice(0, 10);
    return i % 7 === 4
      ? op(date, 400_000, 'out', 'Перевод собственных средств на личную карту', { bal: 1_000_000 })
      : op(date, 20_000, 'in', 'Выручка', { bal: 1_000_000 });
  });
  const r = calculateForecast(ops, [], 300_000, 30, 0, { today: TODAY });
  assert.ok(r.forecastSeries.every((p) => p.balance >= 0)); // вывод ограничен остатком над полом
  assert.ok(r.forecastSeries.some((p) => p.ownerWithdrawal === 0));
  assert.ok(r.dataQuality.warnings.some((w) => w.includes('выводы')));
});

test('probableGapDate есть тогда и только тогда, когда вероятность ≥ порога', () => {
  const ops = [...background(), ...monthly(10, 80_000, 'Аренда')];
  for (const T of [0, 200_000, 600_000, 5_000_000]) {
    const r = calculateForecast(ops, [], 500_000, 30, T, { today: TODAY });
    assert.equal(r.probableGapDate !== null, r.gapProbabilityPct >= 50, `T=${T}`);
  }
});

test('риск: включённый ухудшает, выключенный не влияет; займ уменьшает разрыв, его возврат — увеличивает', () => {
  const ops = background();
  const T = 600_000;
  const base = calculateForecast(ops, [], 500_000, 30, T, { today: TODAY });
  const risk = { title: 'Потеря клиента', type: 'income_loss', amount: 200_000, dateFrom: '2026-10-05', dateTo: '2026-10-10', probability: 0.5, active: true };
  assert.ok(calculateForecast(ops, [risk], 500_000, 30, T, { today: TODAY }).gapAmount >= base.gapAmount);
  assert.deepEqual(calculateForecast(ops, [{ ...risk, active: false }], 500_000, 30, T, { today: TODAY }).forecastSeries, base.forecastSeries);

  const loan = { ...op('2026-10-02', 300_000, 'in', 'Займ', { source: 'bank_loan' }) };
  const repay = { ...op('2026-10-25', 330_000, 'out', 'Возврат займа', { source: 'bank_loan' }) };
  const withLoan = calculateForecast([...ops, loan], [], 500_000, 30, T, { today: TODAY });
  const withRepay = calculateForecast([...ops, loan, repay], [], 500_000, 30, T, { today: TODAY });
  assert.ok(withLoan.gapAmount < base.gapAmount);
  assert.ok(withRepay.minForecastBalance < withLoan.minForecastBalance);
});

test('короткая история помечается низкой достоверностью, плохие входные данные — исключения', () => {
  const r = calculateForecast(background().slice(-20), [], 100_000, 30, 0, { today: TODAY });
  assert.equal(r.dataQuality.level, 'low');
  assert.throws(() => calculateForecast([], [], NaN, 30, 0, { today: TODAY }), TypeError);
  assert.throws(() => calculateForecast([], [], 1, 0, 0, { today: TODAY }), RangeError);
});