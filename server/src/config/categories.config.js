/**
 * ТЗ-доработка WP-3: каталог подкатегорий и правила категоризации.
 *
 * Таксономия (17 слогов, слог = каталог, не «договорённость между модулями»):
 *   in  (8): revenue_clients, revenue_acquiring, revenue_marketplace, loan_in,
 *            own_funds_in, refund_in, other_in, unknown
 *   out (9): salary, tax, rent, loan_payment, bank_fee, suppliers,
 *            own_funds_out, refund_out, other_out
 * Итого 8 + 9 = 17.
 *
 * `legacy` — свёртка в 4 legacy-категории интерфейса (income/expense/transfer/refund):
 *   income ← все in, кроме own_funds_in (transfer) и refund_in (refund);
 *   expense ← все out, кроме own_funds_out (transfer) и refund_out (refund);
 *   own_funds_in/out ← transfer;  refund_in/out ← refund;  unknown → legacy по direction.
 */

export const SUBCATEGORIES = [
  { id: 'revenue_clients', direction: 'in', legacy: 'income', label: 'Выручка: клиенты' },
  { id: 'revenue_acquiring', direction: 'in', legacy: 'income', label: 'Выручка: эквайринг' },
  { id: 'revenue_marketplace', direction: 'in', legacy: 'income', label: 'Выручка: маркетплейс' },
  { id: 'loan_in', direction: 'in', legacy: 'income', label: 'Полученный займ' },
  { id: 'own_funds_in', direction: 'in', legacy: 'income', label: 'Свои средства: внесение' },
  { id: 'refund_in', direction: 'in', legacy: 'income', label: 'Возврат (входящий)' },
  { id: 'other_in', direction: 'in', legacy: 'income', label: 'Прочие поступления' },
  { id: 'unknown', direction: 'in', legacy: 'income', label: 'Неизвестно' },
  { id: 'salary', direction: 'out', legacy: 'salary', label: 'Зарплата' },
  { id: 'tax', direction: 'out', legacy: 'tax', label: 'Налоги' },
  { id: 'rent', direction: 'out', legacy: 'payment', label: 'Аренда' },
  { id: 'loan_payment', direction: 'out', legacy: 'payment', label: 'Платёж по займу' },
  { id: 'bank_fee', direction: 'out', legacy: 'payment', label: 'Комиссия банка' },
  { id: 'suppliers', direction: 'out', legacy: 'expense', label: 'Поставщики' },
  { id: 'own_funds_out', direction: 'out', legacy: 'expense', label: 'Свои средства: вывод' },
  { id: 'refund_out', direction: 'out', legacy: 'expense', label: 'Возврат (исходящий)' },
  { id: 'other_out', direction: 'out', legacy: 'expense', label: 'Прочие списания' },
];

export const SUBCATEGORY_BY_ID = Object.fromEntries(SUBCATEGORIES.map((s) => [s.id, s]));

export function legacyForSub(subcategory, direction) {
  const s = SUBCATEGORY_BY_ID[subcategory];
  if (s) return s.legacy;
  return direction === 'in' ? 'income' : 'expense';
}

/** Инн контрагента → legacy / direction-нейтральный slug unknown. */
export const UNKNOWN_SUB = 'unknown';

// ── Правила (порядок = приоритет; ID правила — для аудита) ──────────────────
// TZ §2.4: порядок 1) возвраты, 2) налоги, 3) зарплата, 4) свои средства,
// 5) займы, 6) поставщики, 7) эквайринг/маркетплейс, 8) комиссии, 9) аренда,
// 10) выручка от юрлиц, 11) эвристика по ИНН, 12) unknown.
export const RULES = [
  {
    id: 'refund',
    subcategory: (dir) => (dir === 'in' ? 'refund_in' : 'refund_out'),
    regex: /(возврат|вернул\s+средств|возврат\s+средств|перенаправлен\s+в\s+счёт\s+клиента)/i,
    confidence: 0.9,
    note: 'Слово «возврат» в назначении; поступление в течение 24 часов после refund_in тем же контрагентом — refund_out (p.2.2)',
  },
  {
    id: 'tax',
    subcategory: () => 'tax',
    regex: /(налог|налоги|сб\s+в\s+бюджет|единый\s+налог(?:овый)?\s+плате?ж|\bнп\b|успн|внп|аванс\s+по\s+налог|фсфр|сбор(?:а)?\s+по\s+налог|платёж\s+в\s+фнс)/i,
    confidence: 0.95,
    note: 'Номер ТИН, период (месяц/квартал) или упоминание «налог»; «перевод на 30 дней» — НЕ налог',
  },
  {
    id: 'salary',
    subcategory: () => 'salary',
    regex: /(зарплат(?:а|ные)|з\/п\b|\bсп\b.*работ|работника|аванс\s+(?:по|зарплат)|выплата\s+по\s+смете|расчёт\s+с\s+работни)/i,
    confidence: 0.95,
  },
  {
    id: 'own_funds',
    subcategory: (dir) => (dir === 'in' ? 'own_funds_in' : 'own_funds_out'),
    regex: null, // только эвристика: ИНН контрагента = ИНН владельца
    confidence: 0.95,
    note: 'ИНН контрагента совпадает с ИНН владельца (ctx.userInn)',
  },
  {
    id: 'loan',
    subcategory: (dir) => (dir === 'in' ? 'loan_in' : 'loan_payment'),
    regex: /займ(?:а|ов)?|по(?:гашени|гашение)\s+(?:с)займ|(?:выплат|платеж(?:а)?|по)\s+по\s+займ|кредит(?:н)?ы?й\s+договор|по\s+(?:кредит|договору)\s+кредит/i,
    confidence: 0.9,
    note: 'loan_in — «займ средств, предоставленный…»; loan_payment — погашение/выплата по договору займа',
  },
  {
    id: 'supplier',
    subcategory: () => 'suppliers',
    regex: /постав(ш|л)|поставщ|закуп|компл(?:емен|ект)\s+товар|оплат(?:а)?\s+(?:товар|услуг|работ)\s+пост/i,
    confidence: 0.8,
  },
  {
    id: 'acquiring',
    subcategory: () => 'revenue_acquiring',
    regex: /эквайринг|merch|merchant|клиринг|офис\-магистраль|элетрон\+|электрон(?:ный)?\s*\+|офис\s*магистраль/i,
    confidence: 0.9,
  },
  {
    id: 'marketplace',
    subcategory: () => 'revenue_marketplace',
    regex: /маркетплейс|marketplace|авито|avito|озон|wild\s*berries|ярдена|бербер/i,
    confidence: 0.9,
  },
  {
    id: 'bank_fee',
    subcategory: () => 'bank_fee',
    regex: /комисси(?:я|и)\s+(?:за\s+)?(?:о|обслуж)|обслуживание\s+счёта|платеж(?:ное)\s+обслуживание/i,
    confidence: 0.9,
  },
  {
    id: 'rent',
    subcategory: () => 'rent',
    regex: /аренд(?:а|ное|ные)/i,
    confidence: 0.8,
  },
  {
    id: 'revenue_clients',
    subcategory: () => 'revenue_clients',
    regex: /договор|акт|счёт(?:а)?\s+на\s+оплату|заказ(?:а)?\s+на\s+работы|оплат(?:а)?\s+по\s+(?:договор|смете|заявк)|поступ(?:ление|ив)ла?\s+заказ|за\s+(?:товар|услуг|работ)/i,
    confidence: 0.85,
  },
  {
    id: 'inn_heuristic',
    subcategory: () => 'revenue_clients',
    regex: null, // 2+ поступления с одним ИНН за последние 90 дней, контрагенты различаются (p.2.4)
    confidence: 0.75,
  },
];

// Платежи 99-й серии, «налог» — налоги
const NALOG_SERIES = /99/; // серия кода ОКТМД 99

export const TAX_PATTERNS = {
  tinn: /\b([а-яё]{2})(\d{4})\b/i, // ТИН: 2 буквы + 4 цифры (КЗ)
  period: /за\s+(?:январ|феврал|март|апрел|ма[йй]|июн|июл|август|сентябр|октябр|ноябр|декабр)\w*|за\s+\d\s+(?:квартал|мес)/i,
  enp: /единый\s+налог(?:овый)?\s+плате?ж|\bнп\b|успн|внп/i,
  vat: /\sндс\b|налог\s+на\s+добавленн/i,
};

export const OWN_FUNDS_PATTERN = /перевод\s+(?:собственных|своих)\s+средств|между\s+(?:своими|собственными)\s+счётами/i;

/** Эвристика ИНН (p.2.4): 2+ поступления с одним ИНН за последние 90 дней. */
export const INN_HEURISTIC = { lookbackDays: 90, minRepetitions: 2 };

/** Доверие по правилам (0..1), п.2.3: «каждая операция получает одну из 17 категорий
 *  с доверием и источником правила» — `rule` в ответе = id правила. */
export const RULE_CONFIDENCE = Object.fromEntries(
  RULES.map((r) => [r.id, r.confidence ?? 0.5]),
);
export const UNKNOWN_CONFIDENCE = 0.2;
