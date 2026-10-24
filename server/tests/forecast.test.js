// server/tests/forecast.test.js
import { describe, it, expect } from 'vitest';
import { calculateForecast, buildScenarioEvents } from '../src/services/forecast.service.js';

// «Сегодня» зафиксировано: понедельник, 15 июня 2026
const TODAY = '2026-06-15';
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь'];

const op = (date, amount, direction, extra = {}) => ({
  date: new Date(date),
  amount,
  direction,
  counterpartyInn: '7701234567',
  counterpartyName: 'Ро***',
  purpose: 'Платёж',
  ...extra
});

// Аренда 10-го числа каждого месяца за последние `months` месяцев
function monthlyRent(amount, months = 6) {
  return Array.from({ length: months }, (_, i) =>
    op(`2026-${String(6 - i).padStart(2, '0')}-10`, amount, 'out', {
      purpose: `Аренда офиса за ${MONTHS[5 - i]} 2026`
    })
  );
}

const run = (operations, risks, balance, horizon = 60, threshold = 0, options = {}) =>
  calculateForecast(operations, risks, balance, horizon, threshold, { today: TODAY, ...options });

describe('Прогноз кассовых разрывов', () => {
  it('возвращает структуру по ТЗ и серию ровно на горизонт', () => {
    const result = run(monthlyRent(50000), [], 300000, 30);
    for (const key of ['gapDate', 'gapProbabilityPct', 'gapAmount', 'forecastSeries', 'dangerDays', 'goodDays']) {
      expect(result).toHaveProperty(key);
    }
    expect(result.forecastSeries).toHaveLength(30);
    expect(result.forecastSeries[0].date).toBe('2026-06-16');
    expect(result.gapProbabilityPct).toBeGreaterThanOrEqual(0);
    expect(result.gapProbabilityPct).toBeLessThanOrEqual(100);
  });

  it('детерминирован: одинаковые данные дают одинаковый результат, включая вероятность', () => {
    const risks = [
      { title: 'Потеря клиента', type: 'income_loss', amount: 200000, dateFrom: '2026-06-20', dateTo: '2026-06-30', probability: 0.4, active: true }
    ];
    const a = run(monthlyRent(50000), risks, 120000);
    const b = run(monthlyRent(50000), risks, 120000);
    expect(b).toEqual(a);
  });

  it('выявляет регулярный платёж и применяет его один раз в месяц', () => {
    const result = run(monthlyRent(50000), [], 1_000_000, 60);
    expect(result.regularPayments).toHaveLength(1);
    expect(result.regularPayments[0]).toMatchObject({ dayOfMonth: 10, amount: 50000, direction: 'out', monthsCount: 6 });

    const hits = result.forecastSeries.filter((p) => p.reasons.some((r) => r.type === 'regular'));
    expect(hits.map((p) => p.date)).toEqual(['2026-07-10', '2026-08-10']);
    expect(hits[0].expense).toBe(50000);
  });

  it('не считает платёж регулярным, если он был меньше чем в 3 месяцах', () => {
    const result = run(monthlyRent(50000, 2), [], 1_000_000, 60);
    expect(result.regularPayments).toHaveLength(0);
    expect(result.forecastSeries.some((p) => p.reasons.some((r) => r.type === 'regular'))).toBe(false);
  });

  it('находит дату, сумму и вероятность разрыва', () => {
    // Горизонт 30 дней: аренда списывается один раз, 10 июля → остаток −50 000
    const result = run(monthlyRent(150000), [], 100000, 30);
    expect(result.gapDate).toBe('2026-07-10');
    expect(result.gapAmount).toBe(50000);
    expect(result.gapProbabilityPct).toBe(100);
    expect(result.dangerDays[0]).toBe('2026-07-10');
    expect(result.forecastSeries.find((p) => p.date === '2026-07-10').isDanger).toBe(true);

    // Горизонт 60 дней: второе списание 10 августа → минимум −200 000
    expect(run(monthlyRent(150000), [], 100000, 60).gapAmount).toBe(200000);
  });

  it('риск уменьшает остаток на сумму × вероятность; выключенный риск не влияет', () => {
    const risk = { title: 'Потеря дохода', type: 'income_loss', amount: 300000, dateFrom: '2026-06-20', dateTo: '2026-06-24', probability: 0.5, active: true };
    const base = run([], [], 1_000_000, 30);
    const withRisk = run([], [risk], 1_000_000, 30);
    const disabled = run([], [{ ...risk, active: false }], 1_000_000, 30);

    const last = (r) => r.forecastSeries.at(-1).balance;
    expect(last(withRisk)).toBe(last(base) - 150000);
    expect(disabled).toEqual(base);
  });

  it('риск без разрыва в базовом прогнозе даёт ненулевую вероятность разрыва', () => {
    const risk = { title: 'Крупный платёж', type: 'unplanned_expense', amount: 300000, dateFrom: '2026-06-20', probability: 0.5, active: true };
    const result = run([], [risk], 200000, 30);
    expect(result.gapDate).toBeNull(); // в среднем остаток 200 000 − 150 000 > 0
    expect(result.gapProbabilityPct).toBeGreaterThan(40);
    expect(result.gapProbabilityPct).toBeLessThan(60);
  });

  it('займ у себя / банковский займ в дату разрыва закрывает разрыв', () => {
    const gap = run(monthlyRent(150000), [], 100000, 60);
    for (const source of ['self_loan', 'bank_loan']) {
      const loan = op(gap.gapDate, gap.gapAmount, 'in', { source, counterpartyInn: '', counterpartyName: '', purpose: 'Заём' });
      const result = run([...monthlyRent(150000), loan], [], 100000, 60);
      expect(result.gapDate).toBeNull();
      expect(result.gapAmount).toBe(0);
      expect(result.gapProbabilityPct).toBe(0);
    }
  });

  it('займы из прошлого не попадают в статистику доходов', () => {
    const pastLoan = op('2026-05-04', 500000, 'in', { source: 'self_loan', counterpartyInn: '', purpose: 'Заём' });
    const result = run([pastLoan], [], 100000, 30);
    expect(result.forecastSeries.every((p) => p.income === 0)).toBe(true);
  });

  it('считает среднее по дню недели из сумм операций', () => {
    // Каждый понедельник по 7000 ₽ от разных контрагентов (регулярности нет)
    const ops = [];
    let monday = Date.parse('2025-12-01');
    for (let i = 0; monday <= Date.parse(TODAY); i++, monday += 7 * 86_400_000) {
      ops.push(op(new Date(monday), 7000, 'in', { counterpartyInn: `770${i}`, purpose: `Оплата ${i}` }));
    }
    const result = run(ops, [], 0, 14);
    const byDate = Object.fromEntries(result.forecastSeries.map((p) => [p.date, p]));
    expect(byDate['2026-06-22'].income).toBeCloseTo(7000, 2); // понедельник
    expect(byDate['2026-06-23'].income).toBe(0); // вторник
  });

  it('песочница: сценарий меняет прогноз, базовый прогноз остаётся прежним', () => {
    const base = run(monthlyRent(50000), [], 400000, 60);
    const events = buildScenarioEvents({ name: 'Покупка автомобиля', amount: 500000, date: '2026-06-20' });
    const scenario = run(monthlyRent(50000), [], 400000, 60, 0, { extraEvents: events });

    expect(scenario.gapDate).toBe('2026-06-20');
    expect(scenario.gapAmount).toBeGreaterThan(base.gapAmount);
    expect(scenario.gapProbabilityPct).toBeGreaterThan(base.gapProbabilityPct);
    expect(run(monthlyRent(50000), [], 400000, 60)).toEqual(base);
  });

  it('buildScenarioEvents: ежемесячная серия с переносом на последний день месяца', () => {
    const events = buildScenarioEvents({ amount: 1000, date: '2026-01-31', repeats: 3 });
    expect(events.map((e) => e.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('проверяет входные параметры', () => {
    expect(() => calculateForecast([], [], NaN, 30, 0, { today: TODAY })).toThrow(TypeError);
    expect(() => calculateForecast([], [], 0, 0, 0, { today: TODAY })).toThrow(RangeError);
  });
});