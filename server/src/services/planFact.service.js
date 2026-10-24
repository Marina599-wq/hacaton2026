// server/src/services/planFact.service.js
// Вкладка «План-факт» (ТЗ-доработка WP-5): сопоставление плановых событий месяца
// и фактических операций по группам. Чистые данные, без записей в БД.
import { prisma } from '../config/db.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @returns {{ month: string, total: object, groups: Array<{ key, label, planned, actual, delta }> }}
 */
export class PlanFactService {
  async forMonth(userId, month) {
    // Валидация месяца: ГГГГ-ММ
    if (!/^\d{4}-\d{2}$/.test(month)) month = new Date().toISOString().slice(0, 7);
    const [year, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(year, m - 1, 1));
    const to = new Date(Date.UTC(year, m, 0, 23, 59, 59));

    const [events, operations] = await Promise.all([
      this.getEvents(userId, from, to),
      this.getOperations(userId, from, to),
    ]);

    // План: события месяца (все статусы — план остаётся планом)
    const plannedIn = (e) => e.direction === 'in';
    const plannedOut = (e) => e.direction === 'out';
    const isTax = (e) => e.type === 'tax';
    const isLoanLike = (e) => /кредит|займ|loan|банковск/i.test(`${e.title ?? ''} ${e.counterpartyName ?? ''}`);

    const groups = [
      { key: 'client_in', label: 'Оплата от контрагентов', planned: 0, actual: 0 },
      { key: 'other_in', label: 'Остальные поступления', planned: 0, actual: 0 },
      { key: 'tax', label: 'Налоги', planned: 0, actual: 0 },
      { key: 'salary', label: 'Зарплата', planned: 0, actual: 0 },
      { key: 'payments', label: 'Аренда/кредит/комиссии', planned: 0, actual: 0 },
      { key: 'other_out', label: 'Остальные списания', planned: 0, actual: 0 },
    ];
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));

    for (const e of events) {
      if (isTax(e)) byKey.tax.planned += e.amount;
      else if (plannedIn(e)) {
        if (isLoanLike(e)) byKey.other_in.planned += e.amount;
        else byKey.client_in.planned += e.amount;
      } else if (plannedOut(e)) {
        byKey.other_out.planned += e.amount;
      }
    }

    // Факт: операции месяца
    for (const op of operations) {
      const amt = Number(op.amount) || 0;
      if (op.direction === 'in') {
        if (op.category === 'tax') byKey.tax.actual += amt;
        else if (op.category === 'salary') byKey.salary.actual += amt;
        else byKey.other_in.actual += amt;
      } else {
        if (op.category === 'tax') byKey.tax.actual += amt;
        else if (op.category === 'salary') byKey.salary.actual += amt;
        else if (op.category === 'payment') byKey.payments.actual += amt;
        else byKey.other_out.actual += amt;
      }
    }

    for (const g of groups) {
      g.planned = round2(g.planned);
      g.actual = round2(g.actual);
      g.delta = round2(g.actual - g.planned);
    }

    const total = {
      plannedIn: round2(byKey.client_in.planned + byKey.other_in.planned),
      actualIn: round2(byKey.other_in.actual + byKey.tax.actual + byKey.salary.actual),
      plannedOut: round2(byKey.tax.planned + byKey.salary.planned + byKey.payments.planned + byKey.other_out.planned),
      actualOut: round2(byKey.tax.actual + byKey.salary.actual + byKey.payments.actual + byKey.other_out.actual),
    };
    total.deltaIn = round2(total.actualIn - total.plannedIn);
    total.deltaOut = round2(total.actualOut - total.plannedOut);

    return { month, total, groups };
  }

  async getEvents(userId, from, to) {
    return prisma.plannedEvent.findMany({ where: { userId, expectedDate: { gte: from, lte: to } } });
  }

  async getOperations(userId, from, to) {
    return prisma.operation.findMany({ where: { userId, date: { gte: from, lte: to } } });
  }
}

export const planFactService = new PlanFactService();
