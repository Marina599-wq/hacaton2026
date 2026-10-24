import { describe, it, expect } from 'vitest';
import { checkCounterparty, ensureCounterpartyRisk } from '../src/services/counterpartyCheck.service.js';
import { calculateUpcomingTaxes } from '../src/services/taxCalendar.service.js';
import { maskName, maskInn } from '../src/utils/masking.js';

describe('counterparty check (реестры)', () => {
  it('ИНН на 12/99/66 — высокий риск, p=0.75', () => {
    for (const inn of ['77******12', '50******99', '77******66']) {
      const r = checkCounterparty(inn);
      expect(r.riskLevel).toBe('high');
      expect(r.delayProbability).toBe(0.75);
      expect(r.bankruptcy).toBe(true);
      expect(r.taxDebts).toBe(480000);
    }
  });

  it('ИНН на 44/55/77 — средний риск, p=0.45', () => {
    for (const inn of ['77******44', '50******55', '77******77']) {
      const r = checkCounterparty(inn);
      expect(r.riskLevel).toBe('medium');
      expect(r.delayProbability).toBe(0.45);
      expect(r.bankruptcy).toBe(false);
    }
  });

  it('остальные ИНН — низкий риск', () => {
    const r = checkCounterparty('77******02');
    expect(r.riskLevel).toBe('low');
    expect(r.delayProbability).toBe(0.05);
    expect(r.taxDebts).toBe(0);
  });

  it('auto-risk: входящее событие от high-контрагента создаёт Risk 0.75', async () => {
    const created = [];
    const db = {
      risk: {
        findFirst: async () => null,
        create: async ({ data }) => (created.push(data), data),
      },
    };
    const event = {
      userId: 'u1', direction: 'in', amount: 250000,
      expectedDate: new Date('2026-10-25T00:00:00Z'), counterpartyName: 'Кл***',
    };
    const res = await ensureCounterpartyRisk(db, event, checkCounterparty('77******12'));
    expect(res.probability).toBe(0.75);
    expect(res.type).toBe('income_loss');
    expect(res.source).toBe('auto');
    // дедупликация: повторный вызов не создаёт вторую запись
    db.risk.findFirst = async () => ({ id: 'x' });
    const res2 = await ensureCounterpartyRisk(db, event, checkCounterparty('77******12'));
    expect(res2.id).toBe('x');
    expect(created.length).toBe(1);
  });
});

describe('tax calendar (ЕНП/УСН)', () => {
  const ops = [
    // зарплата за сентябрь: 300 000 → ЕНП = 90 000
    { date: new Date('2026-09-05T00:00:00Z'), amount: 300000, direction: 'out', category: 'salary', source: 'import' },
    // поступления: 1 000 000 (не займы)
    { date: new Date('2026-09-15T00:00:00Z'), amount: 1000000, direction: 'in', category: 'income', source: 'import' },
  ];

  it('ЕНП на 28-е: 30% зарплаты прошлого месяца', () => {
    const drafts = calculateUpcomingTaxes(ops, new Date('2026-10-01T00:00:00Z'), 30);
    const enp = drafts.find((d) => d.title.includes('ЕНП') && d.title.includes('9'));
    expect(enp).toBeTruthy();
    expect(enp.amount).toBe(90000);
    expect(enp.source).toBe('tax_calendar');
    expect(enp.direction).toBe('out');
  });

  it('без истории зарплаты — базовая константа 65 000', () => {
    const drafts = calculateUpcomingTaxes([], new Date('2026-10-01T00:00:00Z'), 30);
    const enp = drafts.find((d) => d.title.startsWith('Единый налоговый платёж (ЕНП)'));
    expect(enp.amount).toBe(65000);
  });

  it('квартальный налог (6% УСН) — 28-е месяца, следующего за кварталом', () => {
    const drafts = calculateUpcomingTaxes(ops, new Date('2026-10-01T00:00:00Z'), 90);
    const quarterly = drafts.find((d) => d.title.includes('УСН'));
    // 6% от 1 000 000 = 60 000
    expect(quarterly).toBeTruthy();
    expect(quarterly.amount).toBe(60000);
    const day = new Date(quarterly.expectedDate);
    expect(day.getUTCDate()).toBe(28);
  });

  it('демо-минимум: расчёт < 150 000 на 28-е текущей → 180 000', () => {
    const now = new Date();
    const drafts = calculateUpcomingTaxes(
      [{ date: new Date(now.getTime() - 60 * 86400000), amount: 10000, direction: 'in', category: 'income', source: 'import' }],
      now, 30,
    );
    const floor = drafts.find((d) => d.title === 'Единый налоговый платёж (ЕНП) и аванс по УСн');
    expect(floor).toBeTruthy();
    expect(floor.amount).toBe(180000);
  });
});

describe('masking', () => {
  it('name: первые 2 буквы + ***', () => {
    expect(maskName('ООО Клевер')).toBe('ОО***');
    expect(maskName('Сбер')).toBe('Сб***');
  });

  it('inn: первые 2 + ****** + последние 2', () => {
    expect(maskInn('7701234512')).toBe('77******12');
    expect(maskInn('77******12')).toBe('77******12');
  });
});
