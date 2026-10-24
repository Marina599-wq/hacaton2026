import { http } from './client';
export { errorMessage } from './client';
import type {
  AuthResponse,
  BankLoanRequest,
  BankLoanResponse,
  BankPaymentRequest,
  BankPaymentResponse,
  CalendarDay,
  CreateOperationRequest,
  CreateRiskRequest,
  CreateTicketRequest,
  DashboardResponse,
  CalendarResponse,
  HistoryCategory,
  HistorySummary,
  Horizon,
  Operation,
  Paged,
  Risk,
  SandboxSimulateRequest,
  SandboxSimulateResponse,
  SupportTicket,
  User,
  ForecastPoint,
} from '@/types/api';

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '',
  );
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

/** Русские подписи категорий для нормализации бэкенд-сводки (бэк отдаёт категории как ключи). */
const HISTORY_CATEGORY_LABELS: Record<string, string> = {
  income: 'Доход',
  expense: 'Расход',
  payment: 'Платёж',
  tax: 'Налоги',
  salary: 'Зарплата',
  other: 'Прочее',
};

export const api = {
  auth: {
    login: (body: { email: string; password: string }) =>
      http.post<AuthResponse>('/auth/login', body),
    /** multipart: email, password, companyName, inn + file (csv/xlsx) или useDemoData=true */
    register: (formData: FormData) => http.upload<AuthResponse>('/auth/register', formData),
    me: () => http.get<{ user: User }>('/auth/me'),
  },
  user: {
    /** Обновление профиля; `minBalance` — порог разрыва T (ТЗ §14). */
    update: (body: Partial<Pick<User, 'companyName' | 'inn' | 'minBalance'>>) =>
      http.patch<User>('/user', body),
  },
  dashboard: async (horizon: Horizon): Promise<DashboardResponse> => {
    // Реальный бэк (ветка Backend) отдаёт другой набор полей:
    // currentBalance / summary.balance / forecastSeries / gapDate… на верхнем уровне.
    // Нормализуем в контрактную форму; контрактные ключи имеют приоритет,
    // чтобы и заглушка, и бэк работали без переключения.
    const d = await http.get<Record<string, unknown>>('/dashboard' + qs({ horizon: String(horizon) }));
    const summary = (d.summary ?? {}) as Record<string, unknown>;
    const series = Array.isArray(d.forecastSeries)
      ? (d.forecastSeries as Array<Record<string, unknown>>).map((p) => ({
          date: String(p.date ?? ''),
          income: Number(p.income ?? 0),
          expense: Number(p.expense ?? 0),
          balance: Number(p.balance ?? 0),
        }))
      : (((d.forecast as Record<string, unknown> | undefined)?.series ?? []) as unknown as ForecastPoint[]);
    const fc = (d.forecast ?? {}) as Record<string, unknown>;
    return {
      balance: Number(d.currentBalance ?? d.balance ?? 0),
      threshold: typeof d.threshold === 'number' ? d.threshold : undefined,
      horizon: Number(d.horizon ?? horizon),
      loanRatePct: typeof d.loanRatePct === 'number' ? d.loanRatePct : undefined,
      summary: {
        income: Number(summary.income ?? 0),
        expense: Number(summary.expense ?? 0),
        balanceChange: Number(summary.balanceChange ?? summary.balance ?? 0),
      },
      forecast: {
        series,
        gapDate: (d.gapDate ?? fc.gapDate ?? null) as string | null,
        gapProbabilityPct: Number(d.gapProbabilityPct ?? fc.gapProbabilityPct ?? 0),
        gapAmount: Number(d.gapAmount ?? fc.gapAmount ?? 0),
      },
      dangerDays: (Array.isArray(d.dangerDays) ? d.dangerDays : []) as string[],
      goodDays: (Array.isArray(d.goodDays) ? d.goodDays : []) as string[],
    };
  },
  operations: {
    // Бэк (ветка Backend) отдаёт «голый» массив, а не Paged — оборачиваем.
    list: async (q: { month: string; category?: string; page?: number; limit?: number }): Promise<Paged<Operation>> => {
      const d = await http.get<Operation[] | Paged<Operation>>(`/operations${qs({ ...q })}`);
      if (Array.isArray(d)) return { items: d, total: d.length, page: q.page ?? 1, pages: 1 };
      return d;
    },
    get: (id: string) => http.get<Operation>(`/operations/${id}`),
    create: (body: CreateOperationRequest) => http.post<Operation>('/operations', body),
  },
  history: {
    // Бэк отдаёт { items: Operation[] } (без month/groups/total) — собираем сводку сами;
    // контрактная форма {month,total,groups} проходит как есть.
    summary: async (q: { month: string; category?: HistoryCategory | string }): Promise<HistorySummary> => {
      const raw = await http.get<HistorySummary | { items?: Operation[] }>(
        `/history/summary${qs({ month: q.month, category: q.category || undefined })}`,
      );
      if (raw && !Array.isArray(raw) && 'groups' in raw) return raw as HistorySummary;
      const ops = (raw as { items?: Operation[] } | undefined)?.items ?? [];
      const inMonth = ops.filter((o) => o.date && o.date.slice(0, 7) === q.month);
      const byCat = new Map<string, number>();
      inMonth.forEach((o) => byCat.set(o.category, (byCat.get(o.category) ?? 0) + o.amount));
      const groups = [...byCat.entries()].map(([key, amount]) => ({
        key,
        label: HISTORY_CATEGORY_LABELS[key] ?? key,
        amount,
      }));
      return {
        month: q.month,
        total: inMonth.reduce((s, o) => s + o.amount, 0),
        groups,
      };
    },
  },
  risks: {
    list: () => http.get<Risk[]>('/risks'),
    create: (body: CreateRiskRequest) => http.post<Risk>('/risks', body),
    update: (id: string, body: Partial<Risk>) => http.patch<Risk>(`/risks/${id}`, body),
    remove: (id: string) => http.del<void>(`/risks/${id}`),
  },
  gap: {
    selfLoans: () => http.get<{ items: Operation[] }>('/gap/self-loans'),
    selfLoan: (body: { amount: number }) =>
      http.post<{ operation: Operation }>('/gap/self-loan', body),
    cancelSelfLoan: (operationId: string) => http.del<void>(`/gap/self-loan/${operationId}`),
  },
  bank: {
    loan: (body: BankLoanRequest) => http.post<BankLoanResponse>('/bank/loan', body),
    payments: (body: BankPaymentRequest) => http.post<BankPaymentResponse>('/bank/payments', body),
    /** Синк с банком (заглушка): новые банковские операции записываются в БД. */
    sync: () => http.post<{ synced: boolean; new: number; operations: Operation[] }>('/bank/sync'),
    transactions: (q: { from: string; to: string }) =>
      http.get<{ operations: Operation[] }>(`/bank/transactions${qs(q)}`),
    /** Импорт банковской выписки (CSV, формат тестовых данных организаторов или легаси).
     *  Multipart: file — CSV, replace='true' — заменить ранее импортированные. */
    importStatement: (file: File, replace: boolean) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('replace', replace ? 'true' : 'false');
      return http.upload<{ imported: number; skipped: number; removed: number; format: string; companyId: string | null; warnings: string[] }>('/operations/import', fd);
    },
  },
  sandbox: {
    simulate: (body: SandboxSimulateRequest) =>
      http.post<SandboxSimulateResponse>('/sandbox/simulate', body),
  },
  calendar: {
    /** Контрактный GET /calendar/month?month=YYYY-MM; ответ нормализуем к контракту. */
    month: async (month: string): Promise<CalendarResponse> => {
      const data: unknown = await http.get(`/calendar/month?month=${month}`);
      const days: CalendarDay[] = Array.isArray(data)
        ? data.filter(
            (d): d is CalendarDay =>
              !!d && typeof d === 'object' && 'date' in d && 'status' in d,
          )
        : Array.isArray((data as CalendarResponse | null)?.days)
          ? (data as CalendarResponse).days
          : [];
      return { month, days };
    },
  },
  support: {
    createTicket: (body: CreateTicketRequest) => http.post<SupportTicket>('/support/tickets', body),
    listTickets: () => http.get<SupportTicket[]>('/support/tickets'),
  },
};
