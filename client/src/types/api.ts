/**
 * Типы API-контракта. Контракт фиксируется в docs/api-contract.md —
 * при расхождении менять и то, и другое вместе.
 */

export type Direction = 'in' | 'out';

export type OperationCategory = 'income' | 'expense' | 'payment' | 'tax' | 'salary' | 'other';
export type OperationSource = 'import' | 'manual' | 'bank_stub' | 'self_loan' | 'bank_loan' | 'payment';

export interface Operation {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // всегда положительное число
  direction: Direction;
  category: OperationCategory;
  counterpartyName: string; // обезличено: первые 2 символа + ***
  counterpartyInn: string; // обезличено: 77******12
  purpose: string;
  balanceEndOfDay: number;
  source: OperationSource;
}

export type RiskType = 'income_loss' | 'unplanned_expense';

export interface Risk {
  id: string;
  title: string;
  type: RiskType;
  amount: number;
  dateFrom: string;
  dateTo: string | null;
  probability: number; // 0..1
  source: 'auto' | 'manual';
  active: boolean;
}

export interface CreateRiskRequest {
  title: string;
  type: RiskType;
  amount: number;
  dateFrom: string;
  dateTo?: string | null;
  probability: number; // 0..1
  active?: boolean;
}

export interface ForecastPoint {
  date: string;
  income: number;
  expense: number;
  balance: number; // прогноза остаток на конец дня
}

export interface ForecastResult {
  series: ForecastPoint[];
  gapDate: string | null;
  gapProbabilityPct: number; // 0..100
  gapAmount: number;
}

export type Horizon = 30 | 60 | 90;

export interface DashboardResponse {
  balance: number;
  /** Бэк может не отдавать порог (PATCH /user ещё не реализован) — тогда UI показывает пустое поле. */
  threshold?: number;
  horizon: number;
  /** Условная ставка банковского займа, % (фиксированная константа из конфига, ТЗ §5.7). Опционально. */
  loanRatePct?: number;
  summary: {
    income: number;
    expense: number;
    balanceChange: number;
  };
  forecast: ForecastResult;
  dangerDays: string[];
  goodDays: string[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

/** Категории для переключателя «История»: Все / Расходы / Доходы / Платежи */
export type HistoryCategory = '' | 'expense' | 'income' | 'payment';

export interface HistorySummary {
  month: string; // YYYY-MM
  total: number;
  groups: Array<{ key: string; label: string; amount: number }>;
}

export interface User {
  id: string;
  email: string;
  companyName: string;
  inn: string;
  minBalance: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CreateOperationRequest {
  date: string;
  amount: number;
  direction: Direction;
  counterpartyName?: string;
  purpose: string;
  category?: OperationCategory;
}

export interface SupportTicket {
  id: string;
  subject: string;
  kind: 'problem' | 'question';
  message: string;
  status: string; // 'new' | 'in_progress' | 'resolved' | 'closed'
  createdAt: string;
}

export interface CreateTicketRequest {
  subject: string;
  kind: 'problem' | 'question';
  message: string;
}

export type SandboxDirection = 'in' | 'out';

export interface SandboxSimulateRequest {
  name: string;
  amount: number;
  date: string;
  direction: SandboxDirection;
  repeats: number; // 1 = одноразово, N = ежемесячно N раз
}

export interface SandboxSimulateResponse {
  base: ForecastResult;
  scenario: ForecastResult;
  /** scenario − base: п.п. для вероятности, рубли для суммы (отрицательное = разрыв меньше) */
  delta: {
    gapProbabilityPct: number;
    gapAmount: number;
  };
}

export type DayStatus = 'danger' | 'good' | 'neutral';

export interface CalendarDay {
  date: string;
  status: DayStatus;
  expectedIncome: number;
  expectedExpense: number;
  expectedBalance: number;
  reasons: string[];
}

export interface CalendarResponse {
  month: string;
  days: CalendarDay[];
}

export type BankPaymentType = 'tax' | 'salary' | 'rent' | 'supplier' | 'other';

export interface BankPaymentRequest {
  type: BankPaymentType;
  recipient: string;
  amount: number;
  date: string;
  purpose: string;
}

export interface BankPaymentResponse {
  status: 'accepted';
  operation: Operation;
  warning?: {
    gapGrows: boolean;
    newGapAmount: number | null;
    message: string | null;
  };
}

export interface BankLoanRequest {
  amount: number;
  termDays: number;
}

export interface BankLoanResponse {
  status: 'approved';
  /** Условная ставка — константа из конфига бэкенда */
  ratePct: number;
  operation: Operation;
}
