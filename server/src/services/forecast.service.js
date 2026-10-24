// server/src/services/forecast.service.js
// Прогноз кассовых разрывов (ТЗ §6): детерминированный расчёт, без БД и LLM.
// Даты — календарные дни UTC; «сегодня» = options.today; прогноз со завтрашнего дня;
// операции с будущими датами (в т. ч. займы) считаются запланированными событиями.
import { FORECAST_CONFIG } from '../config/forecast.config.js';

const DAY_MS = 86_400_000;
const FINANCING_SOURCES = new Set(['self_loan', 'bank_loan']);
const FINANCING_TITLES = {
  self_loan: 'Заём из собственных средств',
  bank_loan: 'Банковский заём'
};

/* ----------------------------- даты и утилиты ----------------------------- */

const round2 = (value) => Math.round(value * 100) / 100;
const toIso = (dayIdx) => new Date(dayIdx * DAY_MS).toISOString().slice(0, 10);
// 1970-01-01 — четверг (4); результат: 0 = воскресенье … 6 = суббота
const weekdayOf = (dayIdx) => (((dayIdx + 4) % 7) + 7) % 7;

function toDayIndex(value) {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / DAY_MS) : null;
}

function resolveToday(today) {
  if (today === undefined || today === null) {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
  }
  const idx = toDayIndex(today);
  if (idx === null) throw new TypeError('options.today: некорректная дата');
  return idx;
}

function civil(dayIdx) {
  const d = new Date(dayIdx * DAY_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

function shiftMonths(dayIdx, months) {
  const { y, m, d } = civil(dayIdx);
  return Date.UTC(y, m + months, d) / DAY_MS;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizeProbability(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n > 1 ? n / 100 : n, 1); // допускаем и 0..1, и 0..100
}

const MONTH_NAMES = /(?<![а-яе])(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яе]*/g;

// «Аренда офиса за март 2026» и «аренда офиса за апрель 2026» → один ключ
function normalizePurpose(purpose) {
  return String(purpose ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(MONTH_NAMES, ' ')
    .replace(/[^а-яеa-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------- детерминированный генератор ------------------------- */

// mulberry32: небольшой быстрый PRNG, воспроизводимый по seed
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Нормальное распределение N(0,1), преобразование Бокса — Мюллера
function createNormalSampler(rng) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    while (u === 0) u = rng();
    const v = rng();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    spare = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  };
}

/* ------------------------------ подготовка данных ------------------------------ */

function normalizeOperations(operations, cfg) {
  const result = [];
  for (const op of operations ?? []) {
    const day = toDayIndex(op?.date);
    const amount = Math.abs(Number(op?.amount));
    if (day === null || !Number.isFinite(amount) || amount === 0) continue;
    if (op.direction !== 'in' && op.direction !== 'out') continue;
    const { y, m, d } = civil(day);
    result.push({
      day,
      dom: d,
      monthKey: y * 12 + m,
      amount,
      direction: op.direction,
      inn: op.counterpartyInn ?? '',
      name: op.counterpartyName ?? '',
      purpose: op.purpose ?? '',
      source: op.source ?? '',
      isFinancing: FINANCING_SOURCES.has(op.source),
      // переводы между своими счетами — не доход и не расход, в историю не входят
      isTransfer: Boolean(cfg.excludeInternalTransfers && cfg.internalTransferPattern.test(op.purpose ?? ''))
    });
  }
  return result;
}

// Регулярный платёж: тот же контрагент + назначение, повторяющийся день месяца (±допуск) в 3+ из последних 6 месяцев; сумма/день — медианные. Займы не учитываются.
function detectRegularPayments(history, today, cfg) {
  const windowStart = shiftMonths(today, -cfg.regularityWindowMonths);
  const groups = new Map();

  for (const op of history) {
    if (op.isFinancing || op.isTransfer || op.day < windowStart || op.day > today) continue;
    const purposeKey = normalizePurpose(op.purpose);
    if (!op.inn && !purposeKey) continue;
    const key = [op.direction, op.inn, op.name, purposeKey].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(op);
  }

  const regular = [];
  for (const [key, groupOps] of groups) {
    // Один контрагент может платить в несколько дат (аванс + расчёт) — кластеры по дню месяца
    for (const ops of clusterByDayOfMonth(groupOps, cfg.regularityToleranceDays)) {
      if (ops.length < cfg.regularityMinMonths) continue;
      const medianDay = median(ops.map((op) => op.dom));
      const matching = ops.filter((op) => Math.abs(op.dom - medianDay) <= cfg.regularityToleranceDays);
      const months = new Set(matching.map((op) => op.monthKey));
      if (months.size < cfg.regularityMinMonths) continue;
      if (matching.length / months.size > cfg.regularityMaxOpsPerMonth) continue;

      regular.push({
        key,
        direction: matching[0].direction,
        dayOfMonth: Math.round(medianDay),
        amount: round2(median(matching.map((op) => op.amount))),
        monthsCount: months.size,
        title: matching[0].purpose || matching[0].name || 'Регулярный платёж',
        ops: matching
      });
    }
  }
  return regular;
}

// Жадная кластеризация по дню месяца: в кластер попадают операции в пределах ±tolerance
function clusterByDayOfMonth(ops, tolerance) {
  const sorted = [...ops].sort((a, b) => a.dom - b.dom || a.day - b.day);
  const clusters = [];
  for (const op of sorted) {
    const current = clusters.at(-1);
    if (current && op.dom - current[0].dom <= tolerance * 2) current.push(op);
    else clusters.push([op]);
  }
  return clusters;
}

// Нерегулярная часть: среднее и σ дневных сумм по дню недели за последние 6 месяцев; регулярные платежи и займы исключены.
function calculateWeekdayStats(history, regularOps, today, cfg) {
  const zero = { avgIncome: 0, avgExpense: 0, stdIncome: 0, stdExpense: 0 };
  const base = history.filter((op) => !op.isFinancing && !op.isTransfer && op.day <= today);
  if (!base.length) {
    return { byWeekday: Array.from({ length: 7 }, () => ({ ...zero })), avgDailyIncome: 0, windowDays: 0 };
  }

  const earliest = base.reduce((min, op) => Math.min(min, op.day), Infinity);
  const windowStart = Math.max(shiftMonths(today, -cfg.statsWindowMonths), earliest);
  const windowDays = today - windowStart + 1;
  const incomes = new Float64Array(windowDays);
  const expenses = new Float64Array(windowDays);
  let totalIncome = 0;

  for (const op of base) {
    if (op.day < windowStart) continue;
    if (op.direction === 'in') totalIncome += op.amount;
    if (regularOps.has(op)) continue;
    (op.direction === 'in' ? incomes : expenses)[op.day - windowStart] += op.amount;
  }

  const acc = Array.from({ length: 7 }, () => ({ n: 0, sIn: 0, sOut: 0, qIn: 0, qOut: 0 }));
  for (let k = 0; k < windowDays; k++) {
    const a = acc[weekdayOf(windowStart + k)];
    a.n++;
    a.sIn += incomes[k];
    a.sOut += expenses[k];
    a.qIn += incomes[k] * incomes[k];
    a.qOut += expenses[k] * expenses[k];
  }

  const stdOf = (sum, sumSq, n) => (n > 1 ? Math.sqrt(Math.max(0, (sumSq - (sum * sum) / n) / (n - 1))) : 0);
  const byWeekday = acc.map((a) => ({
    avgIncome: a.n ? a.sIn / a.n : 0,
    avgExpense: a.n ? a.sOut / a.n : 0,
    stdIncome: stdOf(a.sIn, a.qIn, a.n),
    stdExpense: stdOf(a.sOut, a.qOut, a.n)
  }));

  return { byWeekday, avgDailyIncome: totalIncome / windowDays, windowDays };
}

// Будущие операции (в т. ч. займы) и события песочницы, разложенные по дням горизонта.
function collectScheduledEvents(normalized, extraEvents, today, horizon) {
  const byDay = Array.from({ length: horizon }, () => []);

  for (const op of normalized) {
    const i = op.day - today - 1;
    if (i < 0 || i >= horizon) continue;
    byDay[i].push({
      kind: op.isFinancing ? 'financing' : 'scheduled',
      direction: op.direction,
      amount: op.amount,
      title: op.isFinancing ? FINANCING_TITLES[op.source] : op.purpose || op.name || 'Запланированная операция'
    });
  }

  for (const ev of extraEvents ?? []) {
    const day = toDayIndex(ev?.date);
    const amount = Math.abs(Number(ev?.amount));
    if (day === null || !Number.isFinite(amount) || amount === 0) continue;
    if (ev.direction !== 'in' && ev.direction !== 'out') continue;
    const i = day - today - 1;
    if (i < 0 || i >= horizon) continue;
    byDay[i].push({
      kind: 'scenario',
      direction: ev.direction,
      amount,
      title: ev.title || ev.name || 'Сценарий'
    });
  }
  return byDay;
}

// Активные риски: сумма на весь период равномерно распределяется по дням и умножается на вероятность.
function buildRiskPlans(risks, today, horizon) {
  const plans = [];
  for (const risk of risks ?? []) {
    if (!risk || risk.active === false) continue;
    const from = toDayIndex(risk.dateFrom);
    if (from === null) continue;
    let to = toDayIndex(risk.dateTo);
    if (to === null || to < from) to = from;

    const amount = Math.abs(Number(risk.amount));
    const probability = normalizeProbability(risk.probability);
    if (!Number.isFinite(amount) || amount === 0 || probability === 0) continue;

    const startI = Math.max(from - today - 1, 0);
    const endI = Math.min(to - today - 1, horizon - 1);
    if (endI < startI) continue;

    plans.push({
      title: risk.title || 'Риск',
      type: risk.type,
      probability,
      dailyAmount: amount / (to - from + 1),
      startI,
      endI
    });
  }
  return plans;
}

function buildDailyPlan({ today, horizon, regular, scheduled }) {
  const days = [];
  for (let i = 0; i < horizon; i++) {
    const dayIdx = today + 1 + i;
    const { y, m, d } = civil(dayIdx);
    const dim = daysInMonth(y, m);
    const day = {
      date: toIso(dayIdx),
      weekday: weekdayOf(dayIdx),
      regularIn: 0,
      regularOut: 0,
      scheduledIn: 0,
      scheduledOut: 0,
      operatingIn: 0, // доход без займов — для «хороших» дней
      reasons: []
    };

    // Регулярный платёж срабатывает один раз в месяц; 31-е в коротком месяце → последний день
    for (const pay of regular) {
      if (d !== Math.min(pay.dayOfMonth, dim)) continue;
      const signed = pay.direction === 'in' ? pay.amount : -pay.amount;
      if (pay.direction === 'in') {
        day.regularIn += pay.amount;
        day.operatingIn += pay.amount;
      } else {
        day.regularOut += pay.amount;
      }
      day.reasons.push({ type: 'regular', title: pay.title, amount: signed });
    }

    for (const ev of scheduled[i]) {
      if (ev.direction === 'in') {
        day.scheduledIn += ev.amount;
        if (ev.kind !== 'financing') day.operatingIn += ev.amount;
      } else {
        day.scheduledOut += ev.amount;
      }
      day.reasons.push({
        type: ev.kind,
        title: ev.title,
        amount: round2(ev.direction === 'in' ? ev.amount : -ev.amount)
      });
    }
    days.push(day);
  }
  return days;
}

/* ------------------------------- Монте-Карло ------------------------------- */

// Монте-Карло (ТЗ §6.3): доля прогонов, где остаток ниже T; доход/расход ~ N(среднее, σ) по дню недели; риски реализуются целиком со своей вероятностью.
function simulateGapProbability({ days, stats, riskPlans, currentBalance, threshold, runs, seed }) {
  const rng = createRng(seed);
  const normal = createNormalSampler(rng);
  const horizon = days.length;
  const fixedNet = days.map((d) => d.regularIn + d.scheduledIn - d.regularOut - d.scheduledOut);
  const realized = new Array(riskPlans.length).fill(false);
  const shortfalls = new Float64Array(runs);
  let gaps = 0;

  for (let r = 0; r < runs; r++) {
    for (let k = 0; k < riskPlans.length; k++) realized[k] = rng() < riskPlans[k].probability;

    let balance = currentBalance;
    let minBalance = Infinity;
    for (let i = 0; i < horizon; i++) {
      const st = stats.byWeekday[days[i].weekday];
      const income = Math.max(0, st.avgIncome + st.stdIncome * normal());
      const expense = Math.max(0, st.avgExpense + st.stdExpense * normal());

      let loss = 0;
      for (let k = 0; k < riskPlans.length; k++) {
        const plan = riskPlans[k];
        if (realized[k] && i >= plan.startI && i <= plan.endI) loss += plan.dailyAmount;
      }

      balance += income - expense + fixedNet[i] - loss;
      if (balance < minBalance) minBalance = balance;
    }

    if (minBalance < threshold) gaps++;
    shortfalls[r] = Math.max(0, threshold - minBalance);
  }

  return { probabilityPct: (gaps / runs) * 100, medianShortfall: median(shortfalls) };
}

/* ---------------------------------- API ---------------------------------- */

/**
 * Прогноз кассовых разрывов.
 * @param operations история/будущие операции; risks — риски; currentBalance — остаток на сегодня;
 *        horizonDays — горизонт; minThreshold — порог T.
 * @param options today (тесты), extraEvents (песочница), goodDayThreshold, seed, config.
 */
export function calculateForecast(
  operations,
  risks = [],
  currentBalance,
  horizonDays = FORECAST_CONFIG.defaultHorizonDays,
  minThreshold = FORECAST_CONFIG.minThresholdDefault,
  options = {}
) {
  const cfg = { ...FORECAST_CONFIG, ...(options.config ?? {}) };
  if (!Number.isFinite(currentBalance)) throw new TypeError('currentBalance должен быть числом');
  const horizon = Math.trunc(Number(horizonDays));
  if (!(horizon >= 1 && horizon <= cfg.maxHorizonDays)) {
    throw new RangeError(`horizonDays должен быть от 1 до ${cfg.maxHorizonDays}`);
  }
  const threshold = Number.isFinite(minThreshold) ? minThreshold : cfg.minThresholdDefault;

  const today = resolveToday(options.today);
  const normalized = normalizeOperations(operations, cfg);
  const history = normalized.filter((op) => op.day <= today);

  // 1–2. Регулярная и нерегулярная части
  const regular = detectRegularPayments(history, today, cfg);
  const regularOps = new Set(regular.flatMap((payment) => payment.ops));
  const stats = calculateWeekdayStats(history, regularOps, today, cfg);

  // 3. План по дням: регулярные платежи, будущие операции, риски
  const scheduled = collectScheduledEvents(normalized, options.extraEvents, today, horizon);
  const riskPlans = buildRiskPlans(risks, today, horizon);
  const days = buildDailyPlan({ today, horizon, regular, scheduled });

  const goodDayThreshold = Number.isFinite(options.goodDayThreshold)
    ? options.goodDayThreshold
    : stats.avgDailyIncome * cfg.goodDayMultiplier;

  // 4. Базовый прогноз: B(d) = B(d−1) + Δ(d)
  const forecastSeries = [];
  const gapDays = [];
  const goodDays = [];
  let balance = currentBalance;
  let minBalance = Infinity;
  let gapDate = null;

  days.forEach((day, i) => {
    const st = stats.byWeekday[day.weekday];
    const income = st.avgIncome + day.regularIn + day.scheduledIn;
    const expense = st.avgExpense + day.regularOut + day.scheduledOut;

    let riskLoss = 0;
    const reasons = [...day.reasons];
    for (const plan of riskPlans) {
      if (i < plan.startI || i > plan.endI) continue;
      const expected = plan.dailyAmount * plan.probability;
      riskLoss += expected;
      reasons.push({ type: 'risk', title: plan.title, amount: -round2(expected) });
    }

    const delta = income - expense - riskLoss;
    balance += delta;
    if (balance < minBalance) minBalance = balance;

    const isDanger = balance < threshold;
    if (isDanger) {
      gapDays.push(day.date);
      if (gapDate === null) gapDate = day.date;
    } else if (st.avgIncome + day.operatingIn >= goodDayThreshold && goodDayThreshold > 0) {
      goodDays.push(day.date);
    }

    forecastSeries.push({
      date: day.date,
      balance: round2(balance),
      income: round2(income),
      expense: round2(expense),
      riskLoss: round2(riskLoss),
      delta: round2(delta),
      isDanger,
      reasons
    });
  });

  // Дни с наибольшим отрицательным изменением остатка (для календаря, ТЗ §5.11)
  const outflowPeakDays = forecastSeries
    .map((point, i) => ({ date: point.date, delta: point.delta, i }))
    .filter((point) => point.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.i - b.i)
    .slice(0, cfg.outflowPeakDaysCount)
    .map((point) => point.date)
    .sort();

  // 5. Вероятность и сумма разрыва
  const monteCarlo = simulateGapProbability({
    days,
    stats,
    riskPlans,
    currentBalance,
    threshold,
    runs: cfg.monteCarloSimulations,
    seed: Number.isFinite(options.seed) ? options.seed : cfg.monteCarloSeed
  });

  // gapAmount — сколько внести в день разрыва, чтобы закрыть разрыв на базовом прогнозе; медиана по прогонам — gapAmountMedian.
  const gapAmount = gapDate ? Math.max(0, threshold - minBalance) : 0;

  return {
    gapDate,
    gapProbabilityPct: Math.round(monteCarlo.probabilityPct * 10) / 10,
    gapAmount: round2(gapAmount),
    gapAmountMedian: round2(monteCarlo.medianShortfall),
    minForecastBalance: round2(minBalance),
    forecastSeries,
    dangerDays: gapDays,
    outflowPeakDays,
    goodDays,
    goodDayThreshold: round2(goodDayThreshold),
    regularPayments: regular.map(({ ops, key, ...payment }) => payment)
  };
}

// События песочницы (ТЗ §5.9): разовый платёж или ежемесячная серия из `repeats`; передаются через options.extraEvents.
export function buildScenarioEvents({ name = 'Сценарий', amount, date, repeats = 1, direction = 'out' }) {
  const start = toDayIndex(date);
  if (start === null) throw new TypeError('date: некорректная дата сценария');
  const { y, m, d } = civil(start);
  const count = Math.max(1, Math.trunc(Number(repeats)) || 1);

  return Array.from({ length: count }, (_, i) => {
    const day = Date.UTC(y, m + i, Math.min(d, daysInMonth(y, m + i))) / DAY_MS;
    return { date: toIso(day), amount: Math.abs(Number(amount)), direction, title: name };
  });
}
