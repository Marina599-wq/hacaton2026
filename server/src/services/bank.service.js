import { prisma } from '../config/db.js';
import { calculateForecast } from './forecast.service.js';
import { FORECAST_CONFIG } from '../config/forecast.config.js';
import { bankAdapter } from '../bank-stub/bank-stub.adapter.js';

const PAYMENT_CATEGORY = {
  tax: 'tax',
  salary: 'salary',
  rent: 'expense',
  supplier: 'expense',
  other: 'other',
};

export class BankService {
  async connect(userId, data) {
    return bankAdapter.connect(data);
  }

  async sync(userId) {
    return bankAdapter.sync();
  }

  async listAccounts(userId) {
    return bankAdapter.accounts();
  }

  /** Операции пользователя в диапазоне дат (для «Подтянуть операции из банка»). */
  async transactions(userId, from, to) {
    const where = { userId };
    const date = {};
    if (from) date.gte = new Date(from);
    if (to) date.lte = new Date(to);
    if (Object.keys(date).length > 0) where.date = date;
    const operations = await prisma.operation.findMany({ where, orderBy: { date: 'desc' } });
    return { operations };
  }

  /** Условный банковский займ (ТЗ §5.7): кредит поступлением, ставка — константа из конфига. */
  async loan(userId, { amount, termDays }) {
    const sum = Number(amount);
    if (!Number.isFinite(sum) || sum <= 0) {
      throw new BankValidationError('Сумма займа должна быть положительной');
    }

    const operations = await prisma.operation.findMany({ where: { userId }, orderBy: { date: 'asc' } });
    const balance = operations.length > 0 ? operations[operations.length - 1].balanceEndOfDay : 0;
    const op = await prisma.operation.create({
      data: {
        userId,
        date: new Date(),
        amount: sum,
        direction: 'in',
        category: 'income',
        counterpartyName: 'Банк (условный)',
        counterpartyInn: '0000000000',
        purpose: `Условный банковский займ${termDays ? `, срок ${termDays} дн.` : ''}`,
        balanceEndOfDay: balance + sum,
        source: 'bank_loan',
      },
    });
    return {
      status: 'approved',
      ratePct: FORECAST_CONFIG.loanRatePct ?? 0,
      operation: op,
    };
  }

  /** Ожидание платежа: списание + предупреждение, если прогноз показывает новый разрыв. */
  async payment(userId, { type, recipient, amount, date, purpose }) {
    const sum = Number(amount);
    if (!Number.isFinite(sum) || sum <= 0) {
      throw new BankValidationError('Сумма платежа должна быть положительной');
    }

    const [operations, risks, user] = await Promise.all([
      prisma.operation.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
      prisma.risk.findMany({ where: { userId, active: true } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    const balance = operations.length > 0 ? operations[operations.length - 1].balanceEndOfDay : 0;
    const minThreshold = user?.minBalance ?? 0;
    const payDate = date ? new Date(date) : new Date();
    if (Number.isNaN(payDate.getTime())) payDate.setTime(Date.now());

    const op = await prisma.operation.create({
      data: {
        userId,
        date: payDate,
        amount: sum,
        direction: 'out',
        category: PAYMENT_CATEGORY[type] || 'other',
        counterpartyName: String(recipient || 'Получатель').slice(0, 120),
        counterpartyInn: '0000000000',
        purpose: String(purpose || type || 'Платёж').slice(0, 200),
        balanceEndOfDay: balance - sum,
        source: 'payment',
      },
    });

    // Предупреждение: появился ли новый разрыв после платежа.
    let warning = null;
    try {
      const after = calculateForecast(
        [...operations, { ...op, date: payDate }],
        risks,
        op.balanceEndOfDay,
        90,
        minThreshold,
      );
      if (after.gapDate) {
        warning = {
          gapGrows: true,
          newGapAmount: after.gapAmount,
          message: `После платежа остаток может упасть ниже порога — прогноз разрыва ${after.gapAmount.toLocaleString('ru-RU')} ₽.`,
        };
      }
    } catch {
      // Прогноз не критичен для записи платежа — возвращаем без warning.
    }

    return { status: 'accepted', operation: op, warning };
  }
}

export class BankValidationError extends Error {}

export const bankService = new BankService();
