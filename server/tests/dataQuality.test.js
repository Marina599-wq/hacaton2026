// server/tests/dataQuality.test.js — ТЗ-доработка WP-7 §1, §8–§13: качество выписки, asOf, категоризация
import { describe, it, expect } from 'vitest';
import { findGaps, analyzeStatement, summarizeByDay } from '../src/utils/dataQuality.js';
import { getAsOfDate } from '../src/utils/asOf.js';
import { categorize, SUBCATEGORIES, categoryForSub } from '../src/utils/categorizer.js';

const D = (s) => new Date(s + 'T00:00:00Z');
const dayIdx = (s) => Math.floor(D(s).getTime() / 86_400_000);
const op = (date, amount, direction = 'out', extra = {}) => ({
  date: D(date).toISOString(),
  amount,
  direction,
  counterpartyName: 'Контрагент',
  counterpartyInn: '1234567890',
  purpose: '',
  balanceEndOfDay: 0,
  ...extra,
});

describe('findGaps (ТЗ-доработка §8)', () => {
  it('пустые дни без прыжка остатка — не пропуск', () => {
    const ops = [
      op('2024-10-01', 100, 'in', { balanceEndOfDay: 100 }),
      op('2024-10-04', 50, 'out', { balanceEndOfDay: 50 }),
      op('2024-10-05', 10, 'out', { balanceEndOfDay: 40 }),
    ];
    const { gaps, gapDaySet } = findGaps(ops);
    // 1-е (100) → 4-е (50): ожидаемый 100 + net(4-е) = 100 − 50 = 50 — совпадает, пропусков нет
    expect(gaps.length).toBe(0);
    expect(gapDaySet.has(dayIdx('2024-10-02'))).toBe(false);
  });

  it('день с прыжком остатка в пустом участке — пропуск', () => {
    const ops = [
      op('2024-10-01', 100, 'in', { balanceEndOfDay: 100 }),
      op('2024-10-10', 10, 'out', { balanceEndOfDay: 1500 }), // остаток вырос на 1400, а net(10-е) = −10
      op('2024-10-11', 5, 'out', { balanceEndOfDay: 1495 }),
    ];
    const { gaps, gapDaySet } = findGaps(ops);
    expect(gaps.length).toBe(1);
    expect(gaps[0].from).toBe('2024-10-02');
    expect(gaps[0].to).toBe('2024-10-09');
    expect(gapDaySet.size).toBe(8);
    expect(gapDaySet.has(dayIdx('2024-10-05'))).toBe(true);
  });
});

describe('summarizeByDay', () => {
  it('агрегирует net и остаток конца дня', () => {
    const ops = [op('2024-10-01', 100, 'in', { balanceEndOfDay: 300 }), op('2024-10-01', 40, 'out', { balanceEndOfDay: 260 })];
    const s = summarizeByDay(ops);
    const e = s.get(dayIdx('2024-10-01'));
    expect(e.net).toBe(60);
    expect(e.balance).toBe(300); // остаток дня = максимум по операции
  });
});

describe('analyzeStatement (ТЗ-доработка §1)', () => {
  it('считает пустые ИНН, овердрафт и уровень истории', () => {
    const ops = [
      op('2024-01-05', 50, 'out', { counterpartyInn: '' }),
      op('2024-01-06', 50, 'out', { balanceEndOfDay: -5 }),
      op('2024-01-07', 50, 'out', { balanceEndOfDay: 45 }),
    ];
    const q = analyzeStatement(ops);
    expect(q.emptyInnCount).toBe(1);
    expect(q.overdraftDays).toBe(1);
    expect(q.level).toBe('insufficient'); // 3 дня
    expect(q.gaps.length).toBe(0);
  });

  it('пустая выписка — уровень insufficient', () => {
    const q = analyzeStatement([]);
    expect(q.level).toBe('insufficient');
    expect(q.historyDays).toBe(0);
  });
});

describe('getAsOfDate (ТЗ-доработка §9)', () => {
  it('свежая выписка (≤ 3 дн.) — текущая дата', () => {
    expect(getAsOfDate(D('2025-01-02'), D('2025-01-04'))).toBe('2025-01-04');
  });

  it('старая выписка — последняя дата операции', () => {
    expect(getAsOfDate(D('2024-10-01'), D('2025-01-01'))).toBe('2024-10-01');
  });

  it('без операций — null', () => {
    expect(getAsOfDate(null, D('2025-01-01'))).toBe(null);
  });
});

describe('categorize (ТЗ-доработка §2)', () => {
  it('возвраты: «возврат» в назначении/контрагенте → refund_in/refund_out (high)', () => {
    const out = categorize({ ...op('2024-05-01', 100, 'out'), purpose: 'Возврат по договору 12' });
    expect(out.subcategory).toBe('refund_out');
    expect(out.confidence).toBe('high');

    const inn = categorize({ ...op('2024-05-01', 100, 'in'), counterpartyName: 'ВОЗВРАТ СЧЁТА' });
    expect(inn.subcategory).toBe('refund_in');
  });

  it('зарплата / налоги / аренда / кредит / страхование / поставщик', () => {
    expect(categorize(op('2024-05-01', 100, 'out', { purpose: 'Зарплата июнь' })).subcategory).toBe('salary');
    expect(categorize(op('2024-05-01', 100, 'out', { purpose: 'Налог за 2 кв.' })).subcategory).toBe('tax');
    expect(categorize(op('2024-05-01', 100, 'out', { purpose: 'Аренда офиса' })).subcategory).toBe('rent');
    expect(categorize(op('2024-05-01', 100, 'out', { purpose: 'Платёж по кредиту' })).subcategory).toBe('loan');
    expect(categorize(op('2024-05-01', 100, 'out', { purpose: 'Страховые взносы' })).subcategory).toBe('insur');
    expect(categorize(op('2024-05-01', 100, 'out', { purpose: 'Оплата поставщику' })).subcategory).toBe('supp');
  });

  it('категория выводится из подкатегории', () => {
    expect(categoryForSub('salary')).toBe('salary');
    expect(categoryForSub('refund_in')).toBe('income');
    expect(categoryForSub('loan')).toBe('payment');
  });

  it('статический список подкатегорий §2.1 (13 шт.)', () => {
    expect(SUBCATEGORIES.length).toBe(13);
    for (const sc of SUBCATEGORIES) expect(['in', 'out']).toContain(sc.direction);
  });
});
