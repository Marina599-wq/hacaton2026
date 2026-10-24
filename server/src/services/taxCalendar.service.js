// Детерминированный налоговый календарь (ТЗ-доп. §4.1 В):
// чистый сервис — возвращает черновики PlannedEvent, запись в БД делает контроллер.
const TAX_DEMO_FLOOR = 150000;
const TAX_DEMO_AMOUNT = 180000;
const TAX_BASE_SALARY = 65000;
const SALARY_TAX_RATE = 0.30;
const QUARTERLY_RATE = 0.06;
const QUARTERLY_REIMBURSE_CAP_PCT = 0.5;

const round2 = (v) => Math.round(v * 100) / 100;
const toUtcDay = (d) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
const dayUtc = (dayIdx) => new Date(dayIdx * 86400000);

// Черновик события: базовые поля PlannedEvent (без userId/id — их проставляет контроллер)
function draft(type, title, amount, expectedDate, direction) {
  return {
    type, title, amount: round2(Math.abs(amount)), direction: direction ?? 'out',
    expectedDate: new Date(expectedDate),
    counterpartyName: 'ФН***',
    counterpartyInn: '77******00',
    counterpartyRisk: 'low',
    source: 'tax_calendar',
    status: 'pending',
    active: true,
    deferralDays: 0,
  };
}

export function calculateUpcomingTaxes(operations, fromDate, horizonDays) {
  const from = toUtcDay(fromDate);
  const end = from + horizonDays - 1;
  const byDay = (date) => toUtcDay(new Date(date));
  const result = [];

  // 1) ЕНП: 28-е число каждого месяца окна; база — расходы категории salary прошлого месяца × 0.30, иначе 65 000
  for (let d = from; d <= end; d++) {
    const dt = dayUtc(d);
    if (dt.getUTCDate() === 28) {
      const prev = new Date(dt.getTime() - 30 * 86400000); // предшествующий календарный месяц
      const prevStart = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), 1));
      const prevEnd = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0));
      const salaries = operations
        .filter((op) => op.category === 'salary' && op.direction === 'out'
          && byDay(op.date) >= toUtcDay(prevStart) && byDay(op.date) <= toUtcDay(prevEnd))
        .reduce((s, op) => s + op.amount, 0);
      const base = salaries > 0 ? salaries * SALARY_TAX_RATE : TAX_BASE_SALARY;
      result.push(draft('tax', `Единый налоговый платёж (ЕНП) за ${prev.getUTCMonth() + 1} месяц`, base, dt));
    }
  }

  // 2) Квартальные: 28-е апреля/июля/октября/января — 6% поступлений за 90 дней минус взносы (≤50%)
  for (let d = from; d <= end; d++) {
    const dt = dayUtc(d);
    if (dt.getUTCDate() !== 28) continue;
    if (![3, 6, 9, 0].includes(dt.getUTCMonth())) continue; // апрель, июль, октябрь, январь
    const income = operations
      .filter((op) => op.direction === 'in' && !op.source?.includes('loan')
        && byDay(op.date) >= d - 90 && byDay(op.date) <= d)
      .reduce((s, op) => s + op.amount, 0);
    const contributions = operations
      .filter((op) => op.category === 'tax' && op.direction === 'out'
        && byDay(op.date) >= d - 90 && byDay(op.date) <= d)
      .reduce((s, op) => s + op.amount, 0);
    const reduced = Math.max(0, income - Math.min(contributions, income * QUARTERLY_REIMBURSE_CAP_PCT));
    result.push(draft('tax', `Аванс по УСН (6%) и 1/3 НДС за квартал`, reduced * QUARTERLY_RATE, dt));
  }

  // 3) Демо-минимум: если расчёт на 28-е текущего месяца < 150 000 → детерминированные 180 000
  const nowDay = toUtcDay(new Date());
  const nowDate = dayUtc(nowDay);
  const idx28 = toUtcDay(new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 28)));
  const on28 = result.filter((ev) => byDay(ev.expectedDate) === idx28).reduce((s, ev) => s + ev.amount, 0);
  if (on28 > 0 && on28 < TAX_DEMO_FLOOR) {
    result.push(draft('tax', 'Единый налоговый платёж (ЕНП) и аванс по УСн', TAX_DEMO_AMOUNT, dayUtc(idx28)));
  }

  // Возвращаем события с датами внутри [fromDate, fromDate + horizonDays)
  const fromIdx = toUtcDay(fromDate);
  const endIdx = fromIdx + horizonDays - 1;
  return result.filter((ev) => { const d = byDay(ev.expectedDate); return d >= fromIdx && d <= endIdx; });
}
