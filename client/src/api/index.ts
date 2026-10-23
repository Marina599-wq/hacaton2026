import { http } from './client';
export { errorMessage } from './client';
import type {
  AuthResponse,
  BankLoanRequest,
  BankLoanResponse,
  BankPaymentRequest,
  BankPaymentResponse,
  CalendarResponse,
  CreateOperationRequest,
  CreateRiskRequest,
  CreateTicketRequest,
  DashboardResponse,
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
} from '@/types/api';

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '',
  );
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

export const api = {
  auth: {
    login: (body: { email: string; password: string }) =>
      http.post<AuthResponse>('/auth/login', body),
    /** multipart: email, password, companyName, inn + file (csv/xlsx) или useDemoData=true */
    register: (formData: FormData) => http.upload<AuthResponse>('/auth/register', formData),
    me: () => http.get<{ user: User }>('/auth/me'),
  },
  dashboard: (horizon: Horizon) => http.get<DashboardResponse>(`/dashboard${qs({ horizon })}`),
  operations: {
    list: (q: { month: string; category?: string; page?: number; limit?: number }) =>
      http.get<Paged<Operation>>(`/operations${qs({ ...q })}`),
    get: (id: string) => http.get<Operation>(`/operations/${id}`),
    create: (body: CreateOperationRequest) => http.post<Operation>('/operations', body),
  },
  history: {
    summary: (q: { month: string; category?: HistoryCategory | string }) =>
      http.get<HistorySummary>(`/history/summary${qs({ month: q.month, category: q.category || undefined })}`),
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
    transactions: (q: { from: string; to: string }) =>
      http.get<{ operations: Operation[] }>(`/bank/transactions${qs(q)}`),
  },
  sandbox: {
    simulate: (body: SandboxSimulateRequest) =>
      http.post<SandboxSimulateResponse>('/sandbox/simulate', body),
  },
  calendar: {
    month: (month: string) => http.get<CalendarResponse>(`/calendar${qs({ month })}`),
  },
  support: {
    createTicket: (body: CreateTicketRequest) => http.post<SupportTicket>('/support/tickets', body),
    listTickets: () => http.get<SupportTicket[]>('/support/tickets'),
  },
};
