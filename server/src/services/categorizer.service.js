/**
 * ТЗ-доработка WP-3 §1: модуль категоризации (чистые функции, без БД).
 *
 * categorize(operation, context?) → { subcategory, category (legacy 4), confidence (0..1), rule }
 *   operation — объект вида parseBankStatement(): { date, amount, direction, counterpartyInn, purpose, ... }
 *   context — { userInn?, operations? }:
 *     userInn    — ИНН владельца (для own_funds-эвристики);
 *     operations — все операции текущей выписки (для п.2.2: refund_out в 24 ч после refund_in
 *                  тем же контрагентом) и ИНН-эвристики (p.2.4).
 *
 * Правила и таксономия — src/config/categories.config.js (порядок = приоритет, TZ §2.4).
 * legacy — свёртка в 4 категории интерфейса (income/expense/transfer/refund), TZ §10:
 *   transfer ← own_funds_in/out;  refund ← refund_in/out;  unknown → по direction.
 */
import {
  SUBCATEGORIES,
  SUBCATEGORY_BY_ID,
  RULES,
  RULE_CONFIDENCE,
  UNKNOWN_CONFIDENCE,
  UNKNOWN_SUB,
  legacyForSub,
  INN_HEURISTIC,
  OWN_FUNDS_PATTERN,
  TAX_PATTERNS,
} from '../config/categories.config.js';
import { normalizeForRules } from '../utils/text.js';

const DAY_MS = 86_400_000;
const REFUND_WINDOW_MS = 24 * 3_600_000; // п.2.2: 24 часа

/** legacy-категория по подкатегории и направлению (для форм, где legacy выбирается напрямую). */
export function legacyCategory(direction, subcategory) {
  return legacyForSub(subcategory, direction);
}

/**
 * Категоризация одной операции.
 * @param {object} op { date: Date|string, direction: 'in'|'out', purpose?, counterpartyInn?, counterpartyName?, amount? }
 * @param {{ userInn?: string, operations?: Array }} [ctx]
 * @returns {{ subcategory: string, category: string, confidence: number, rule: string }}
 */
export function categorize(op, ctx = {}) {
  const dir = op.direction;
  const norm = normalizeForRules(op.purpose);
  const ops = ctx.operations ?? [];

  for (const rule of RULES) {
    // П.2.2 (refunds): исходящий с «возвратом» + входящий тем же контрагентом в 24 ч → refund_out
    if (rule.id === 'refund') {
      if (dir === 'out' && rule.regex.test(norm)) {
        const within24h = ops.some(
          (o) =>
            o.direction === 'in' &&
            op.counterpartyInn &&
            o.counterpartyInn === op.counterpartyInn &&
            rule.regex.test(normalizeForRules(o.purpose)) &&
            Math.abs(new Date(o.date).getTime() - new Date(op.date).getTime()) <= REFUND_WINDOW_MS,
        );
        if (within24h) return buildResult(dir, 'refund_out', rule.id, 'refund-24h');
      }
    }

    // own_funds: ИНН-эвристика (своя карточка) + текст «перевод собственных средств»
    if (rule.id === 'own_funds') {
      const byInn = ctx.userInn && op.counterpartyInn && ctx.userInn === op.counterpartyInn;
      const byText = OWN_FUNDS_PATTERN.test(norm);
      if (byInn || byText) {
        return buildResult(dir, dir === 'in' ? 'own_funds_in' : 'own_funds_out', rule.id, byInn ? 'inn' : 'text');
      }
      continue;
    }

    // ИНН-эвристика (p.2.4): 2+ поступления с одним ИНН за 90 дней, контрагенты различаются
    if (rule.id === 'inn_heuristic') {
      if (dir !== 'in' || !op.counterpartyInn) continue;
      const lookback = 90 * DAY_MS;
      const peers = ops.filter(
        (o) =>
          o.direction === 'in' &&
          o.counterpartyInn === op.counterpartyInn &&
          Math.abs(new Date(o.date).getTime() - new Date(op.date).getTime()) <= lookback,
      );
      if (peers.length >= INN_HEURISTIC.minRepetitions) {
        return buildResult(dir, 'revenue_clients', rule.id, 'inn-heuristic');
      }
      continue;
    }

    if (rule.regex && rule.regex.test(norm)) {
      return buildResult(dir, rule.subcategory(dir), rule.id, 'regex');
    }
  }

  // Все правила не совпали → unknown (p.2.4, п.3: доля unknown+other ≤ 10 %)
  return {
    subcategory: dir === 'in' ? 'unknown' : 'other_out',
    category: dir === 'in' ? 'income' : 'expense',
    confidence: UNKNOWN_CONFIDENCE,
    rule: 'unknown',
  };
}

function buildResult(dir, sub, ruleId, ruleSource) {
  const meta = SUBCATEGORY_BY_ID[sub];
  return {
    subcategory: sub,
    category: meta?.legacy ?? (dir === 'in' ? 'income' : 'expense'),
    confidence: RULE_CONFIDENCE[ruleId] ?? 0.5,
    rule: ruleSource,
  };
}

/**
 * Категоризация всей выписки одним проходом (для импорта): каждая операция
 * видит всю выписку как контекст (для п.2.2 и p.2.4).
 * @param {Array} operations — операции parseBankStatement()
 * @param {string} [userInn]
 * @returns {Array} — операции с полями subcategory/category/confidence/categorySource
 */
export function categorizeStatement(operations, userInn) {
  return operations.map((op) => {
    const r = categorize(op, { userInn, operations: operations });
    return {
      ...op,
      subcategory: r.subcategory,
      category: r.category,
      categoryConfidence: r.confidence,
      categorySource: 'rule',
      categorizeRule: r.rule,
    };
  });
}

/** Каталог подкатегорий (для GET /categories и UI). */
export function listSubcategories() {
  return SUBCATEGORIES.map((s) => ({ ...s }));
}

/**
 * Проверка slug'а подкатегории (+ опциональная совместимость с направлением).
 * @returns {string|null} slug или null (неизвестный/несовместимый)
 */
export function resolveSubcategory(sub, direction) {
  const meta = typeof sub === 'string' ? SUBCATEGORY_BY_ID[sub] : null;
  if (!meta) return null;
  if (direction && meta.direction !== direction) return null;
  return meta.id;
}

/**
 * Каталог категорий для GET /categories: legacy-категории с подкатегориями
 * и меткой «Не категоризовано» (filter: subcategory IS NULL).
 */
export function categoryCatalog() {
  const byCategory = {};
  for (const sc of SUBCATEGORIES) {
    (byCategory[sc.legacy] ??= { id: sc.legacy, subcategoryIds: [], labels: {} });
    byCategory[sc.legacy].subcategoryIds.push(sc.id);
    byCategory[sc.legacy].labels[sc.id] = sc.label;
  }
  const legacyLabels = {
    income: 'Поступления',
    expense: 'Расходы',
    tax: 'Налоги',
    salary: 'Зарплата',
    payment: 'Платежи',
    other: 'Другое',
  };
  const categories = Object.values(byCategory).map((c) => ({
    id: c.id,
    label: legacyLabels[c.id] ?? c.id,
    subcategoryIds: c.subcategoryIds,
    subcategoryLabels: c.labels,
  }));
  categories.push({ id: 'uncategorized', label: 'Не категоризовано', subcategoryIds: [], subcategoryLabels: {} });
  return { categories, subcategories: listSubcategories() };
}

export { SUBCATEGORIES, SUBCATEGORY_BY_ID, RULES, legacyForSub };
