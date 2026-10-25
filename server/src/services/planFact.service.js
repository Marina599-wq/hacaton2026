// server/src/services/planFact.service.js
// ТЗ-доработка WP-5: сверка плановых событий с фактом (чистая reconcile + запись в БД),
// график «План-факт» по периодам (день/неделя) и предупреждения (alerts).
// Legacy: forMonth (GET /dashboard/plan-fact, docs/api-contract.md) сохранён ниже.
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/errors.js';
import { FORECAST_CONFIG } from '../config/forecast.config.js';
import { calculateForecast } from './forecast.service.js';

const DAY_MS = 86_400_000;
const round2 = (n) => Math.round(n * 100) / 100;
const dayOnly = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};
const daysBetween = (a, b) => Math.round((dayOnly(b).getTime() - dayOnly(a).getTime()) / DAY_MS);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Метка контрагента для сообщений (ТЗ WP-5 п.6: «от Кл***») — первые 2 символа + ***
export function maskName(name) {
  const s = String(name || '').trim();
  return s.length > 2 ? `${s.slice(0, 2)}***` : '***';
}

/**
 * Чистая функция сверки (ТЗ WP-5 п.1): сопоставление событий с операциями без БД.
 * @param events  массив { id, direction, amount, counterpartyInn?, expectedDate, status, paidAmount?, factOperationId?, deviationDays? }
 * @param operations массив { id, direction, amount, counterpartyInn?, date }
 * @param today Date (или ISO-строка)
 * @param config { planGraceDays, planMatchAmountTolerancePct, planPartialMinPct }
 * @returns { results: Array<{ id, status, paidAmount, factOperationId, deviationDays }> }
 *   paid      — операция в окне [exp−3д, exp+grace], сумма ≥ (1 − tol)·A (±1 %);
 *   partial   — сумма окна от 10 % до 99 % плана (хранится paidAmount, остаток идёт в прогноз);
 *   paid_late — операция найдена после окна, но ≤ today (deviationDays = дни от expectedDate);
 *   overdue   — today > exp + grace и совпадений нет;  pending — иначе.
 * Идемпотентна: одинаковые входные данные → одинаковый результат.
 */
export function reconcile(events, operations, today, config = FORECAST_CONFIG) {
  const now = dayOnly(today).getTime();
  const grace = config.planGraceDays ?? 3;
  const partialMin = (config.planPartialMinPct ?? 10) / 100;
  const tol = (config.planMatchAmountTolerancePct ?? 1) / 100;
  const results = [];

  for (const ev of events || []) {
    const A = Math.abs(Number(ev.amount));
    if (!Number.isFinite(A) || A === 0) continue;
    const expMs = dayOnly(ev.expectedDate).getTime();
    const winStart = expMs - 3 * DAY_MS;
    const winEnd = expMs + grace * DAY_MS;
    const evInn = ev.counterpartyInn && ev.counterpartyInn !== 'SELF' ? ev.counterpartyInn : null;

    let windowSum = 0;
    let windowOp = null;
    let lateSum = 0;
    let lateOp = null;

    for (const op of operations || []) {
      if (op.direction !== ev.direction) continue;
      // ИНН: если у события ИНН есть — операция обязана иметь СОВПАДАЮЩИЙ ИНН (чужой не подходит)
      if (evInn && op.counterpartyInn !== evInn) continue;
      const amt = Math.abs(Number(op.amount));
      if (!Number.isFinite(amt) || amt === 0) continue;
      const t = dayOnly(op.date).getTime();
      if (t >= winStart && t <= winEnd) {
        windowSum += amt;
        if (!windowOp) windowOp = op;
      } else if (t > winEnd && t <= now) {
        lateSum += amt;
        if (!lateOp) lateOp = op;
      }
    }

    let status;
    let paidAmount = 0;
    let factOperationId = null;
    let deviationDays = null;
    const r = windowSum / A;
    if (windowOp && r >= 1 - tol) {
      status = 'paid';
      paidAmount = round2(windowSum);
      factOperationId = windowOp.id;
    } else if (windowOp && windowSum / A >= partialMin) {
      status = 'partial';
      paidAmount = round2(windowSum);
      factOperationId = windowOp.id;
    } else if (lateOp && lateSum / A >= partialMin) {
      status = 'paid_late';
      paidAmount = round2(lateSum);
      factOperationId = lateOp.id;
      deviationDays = daysBetween(ev.expectedDate, lateOp.date);
    } else if (now > winEnd) {
      status = 'overdue';
    } else {
      status = 'pending';
    }

    results.push({ id: ev.id, status, paidAmount, factOperationId, deviationDays });
  }

  return { results };
}

/** Чистые предупреждения WP-5 п.6 (без БД): просроченные планы + недозарегистрированные регулярки + разрыв */
export function buildPlanFactAlerts({ events = [], forecast = {}, operations = [], today = new Date() }) {
  const alerts = [];
  const now = dayOnly(today).getTime();
  const dayStr = (d) => {
    const x = dayOnly(d);
    return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}`;
  };
  const fmt = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));

  // 1) planned_overdue: активные события в статусе overdue (входящие — «не пришёл платёж»)
  for (const ev of events) {
    if (ev.active === false || ev.status !== 'overdue' || ev.direction !== 'in') continue;
    const days = Math.round((now - dayOnly(ev.expectedDate).getTime()) / DAY_MS);
    alerts.push({
      id: `planned_overdue_${ev.id}`,
      type: 'planned_overdue',
      severity: 'warning',
      title: 'Плановый платёж не получен',
      message: `Ожидаемый платёж ${fmt(ev.amount)} ₽ ${ev.counterpartyName ? `от ${maskName(ev.counterpartyName)}` : `«${maskName(ev.title)}»`} не пришёл с ${dayStr(ev.expectedDate)} (просрочка ${days} дн.)`,
      date: isoDay(ev.expectedDate),
      amount: ev.amount
    });
  }

  // 2) regular_missing: регулярный входящий платёж (ИНН + сумма) без операции ±30 % после ожидаемой даты
  for (const reg of forecast.regularPayments || []) {
    if (reg.direction !== 'in' || !reg.inn || reg.inn === 'SELF' || (reg.monthsCount ?? 0) < 2) continue;
    const lastOp = (operations || [])
      .filter((o) => o.direction === 'in' && o.counterpartyInn === reg.inn)
      .sort((a, b) => (a.date > b.date ? 1 : -1))[0];
    if (!lastOp) continue;
    // Ожидаемое вхождение: день месяца dayOfMonth регулярного через 1 месяц (2, если ещё не впереди)
    const base = dayOnly(lastOp.date);
    const dom = Math.min(Math.max(reg.dayOfMonth ?? 15, 1), 28);
    let expected = new Date(base.getFullYear(), base.getMonth() + 1, dom);
    if (expected.getTime() <= base.getTime()) expected = new Date(base.getFullYear(), base.getMonth() + 2, dom);
    if (expected.getTime() > now) continue; // дата ещё не прошла — не «не пришёл»
    const lo = expected.getTime() - 3 * DAY_MS;
    const hi = expected.getTime() + 3 * DAY_MS;
    const matched = (operations || []).some(
      (o) => o.direction === 'in'
        && o.counterpartyInn === reg.inn
        && o.date.getTime() >= lo && o.date.getTime() <= hi
        && Math.abs(Number(o.amount)) >= 0.7 * reg.amount && Math.abs(Number(o.amount)) <= 1.3 * reg.amount
    );
    if (matched) continue;
    const days = Math.round((now - expected.getTime()) / DAY_MS);
    alerts.push({
      id: `regular_missing_${reg.key ?? reg.inn}`,
      type: 'regular_missing',
      severity: 'warning',
      title: 'Регулярный платёж не получен',
      message: `Регулярный платёж ${fmt(reg.amount)} ₽ от ${maskName(reg.title || reg.inn)} не пришёл с ${dayStr(expected)} (просрочка ${days} дн.)`,
      date: isoDay(expected),
      amount: reg.amount
    });
  }

  // 3) Появился разрыв после пересчёта — дополнительно critical
  if (forecast.gapDate) {
    alerts.push({
      id: 'gap_forecast',
      type: 'gap_forecast',
      severity: 'critical',
      title: 'Ожидаемый разрыв кассы',
      message: `Ожидаемый разрыв остатка ${dayStr(forecast.gapDate)} (вероятность ${Math.round((forecast.gapProbability ?? 0) * 100)} %)`,
      date: isoDay(forecast.gapDate),
      amount: null
    });
  }

  return alerts;
}

const RECONCILABLE = ['pending', 'paid', 'partial', 'paid_late', 'overdue'];
const FACT_EXCLUDED_SUBCATEGORIES = ['own_funds_in', 'own_funds_out', 'loan_in'];

export class PlanFactService {
  /**
   * ТЗ WP-5 п.3: сверка перед чтением плановых событий / после добавления операций.
   * Идемпотентна: значения не меняются — записи в БД нет (повторный вызов ничего не меняет).
   * @returns {number} число событий, чьи статусы изменились
   */
  async reconcileForUser(userId) {
    const events = await prisma.plannedEvent.findMany({
      where: { userId, active: true, status: { in: RECONCILABLE } }
    });
    if (!events.length) return 0;
    const operations = await prisma.operation.findMany({
      where: { userId },
      select: { id: true, direction: true, amount: true, counterpartyInn: true, date: true }
    });
    const { results } = reconcile(events, operations, new Date(), FORECAST_CONFIG);
    let changed = 0;
    for (const r of results) {
      const ev = events.find((e) => e.id === r.id);
      const changedFields =
        ev.status !== r.status
        || Math.abs((ev.paidAmount ?? 0) - r.paidAmount) > 0.01
        || (ev.factOperationId ?? null) !== r.factOperationId
        || (ev.deviationDays ?? null) !== r.deviationDays;
      if (changedFields) {
        await prisma.plannedEvent.update({
          where: { id: r.id },
          data: { status: r.status, paidAmount: r.paidAmount, factOperationId: r.factOperationId, deviationDays: r.deviationDays }
        });
        changed += 1;
      }
    }
    return changed;
  }

  /**
   * ТЗ WP-5 п.4: график «План-факт». План — прогноз на cut = начало периода − 1 день
   * (данные/события, известные на cut: issueDate ≤ cut), факт — операции периода без own_funds_in/out и loan_in.
   * Меньше 90 дней истории до cut → HTTPError 400.
   */
  async planFact(userId, days = 30, granularity = 'day') {
    // 400 VALIDATION (WP-6: типизированный код)
    const d = [30, 60, 90].includes(Number(days)) ? Number(days) : 30;
    const step = granularity === 'week' ? 7 : 1;
    const today = dayOnly(new Date());
    const from = new Date(today.getTime() - (d - 1) * DAY_MS);
    const cut = new Date(from.getTime() - DAY_MS);

    const [periodOps, planEvents, allOpDates] = await Promise.all([
      prisma.operation.findMany({ where: { userId, date: { gte: from, lte: today } } }),
      prisma.plannedEvent.findMany({
        where: {
          userId,
          active: true,
          status: { in: RECONCILABLE },
          OR: [{ issueDate: null }, { issueDate: { lte: cut } }]
        }
      }),
      prisma.operation.findMany({ where: { userId }, select: { date: true } })
    ]);

    // 90 дней истории до cut (ТЗ WP-5 п.4)
    let earliest = null;
    for (const r of allOpDates) earliest = earliest === null ? r.date.getTime() : Math.min(earliest, r.date.getTime());
    if (earliest === null || (cut.getTime() - earliest) / DAY_MS < FORECAST_CONFIG.planFactMinHistoryDays) {
      throw ApiError.badRequest('Для графика «План-факт» нужно минимум 90 дней истории операций до начала расчётного окна. Импортируйте более полную выписку.');
    }

    // План: прогноз, построенный на cut по данным, известным на cut (mean90 — быстрый детерминированный подход)
    const fullOps = await prisma.operation.findMany({ where: { userId, date: { lte: cut } } });
    const sorted = [...fullOps].sort((a, b) => (a.date > b.date ? 1 : -1));
    const currentBalance = sorted.length ? sorted[sorted.length - 1].balanceEndOfDay ?? 0 : 0;
    const forecast = calculateForecast(
      sorted,
      [],
      currentBalance,
      d,
      0,
      {
        plannedEvents: planEvents,
        today: isoDay(cut),
        mcDisabled: true, // план-факт: только детерминированные линии (без MC-расчётов)
        forecastDate: isoDay(cut),
        startDate: isoDay(from),
        base: 'mean90'
      }
    );

    // daily-план: forecastSeries[{ date (ISO), income, expense }] — индексируем по дате (startDate + i)
    const planByDate = new Map((forecast.forecastSeries || []).map((p) => [p.date, p]));
    const factInByDay = {};
    const factOutByDay = {};
    for (const op of periodOps) {
      if (FACT_EXCLUDED_SUBCATEGORIES.includes(op.subcategory)) continue;
      const key = isoDay(op.date);
      if (op.direction === 'in') factInByDay[key] = (factInByDay[key] || 0) + Math.abs(Number(op.amount) || 0);
      else factOutByDay[key] = (factOutByDay[key] || 0) + Math.abs(Number(op.amount) || 0);
    }

    const periods = [];
    for (let i = 0; i < d; i += step) {
      const bFrom = new Date(from.getTime() + i * DAY_MS);
      let bTo = new Date(from.getTime() + (i + step - 1) * DAY_MS);
      if (bTo.getTime() > today.getTime()) bTo = today;
      let planIn = 0;
      let planOut = 0;
      let factIn = 0;
      let factOut = 0;
      for (let t = bFrom.getTime(); t <= bTo.getTime(); t += DAY_MS) {
        const key = isoDay(new Date(t));
        const p = planByDate.get(key);
        planIn += p ? p.income : 0;
        planOut += p ? p.expense : 0;
        factIn += factInByDay[key] || 0;
        factOut += factOutByDay[key] || 0;
      }
      const planNet = round2(planIn - planOut);
      const factNet = round2(factIn - factOut);
      const deviationNet = round2(factNet - planNet);
      const threshold = Math.max(
        (FORECAST_CONFIG.planFactDeviationPct / 100) * Math.abs(planNet),
        FORECAST_CONFIG.planFactDeviationMinRub
      );
      periods.push({
        from: isoDay(bFrom),
        to: isoDay(bTo),
        planIn: round2(planIn),
        planOut: round2(planOut),
        factIn: round2(factIn),
        factOut: round2(factOut),
        planNet,
        factNet,
        deviationNet,
        significant: Math.abs(deviationNet) >= threshold
      });
    }

    return {
      days: d,
      granularity: step === 7 ? 'week' : 'day',
      cut: isoDay(cut),
      base: 'mean90',
      periods
    };
  }

  // ===== Legacy (GET /dashboard/plan-fact?month=, docs/api-contract.md) =====
  async forMonth(userId, month) {
    if (!/^\d{4}-\d{2}$/.test(month)) month = new Date().toISOString().slice(0, 7);
    const [year, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(year, m - 1, 1));
    const to = new Date(Date.UTC(year, m, 0, 23, 59, 59));

    const [events, operations] = await Promise.all([
      this.getEvents(userId, from, to),
      this.getOperations(userId, from, to)
    ]);

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
      else if (e.direction === 'in') {
        if (isLoanLike(e)) byKey.other_in.planned += e.amount;
        else byKey.client_in.planned += e.amount;
      } else if (e.direction === 'out') {
        byKey.other_out.planned += e.amount;
      }
    }

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
