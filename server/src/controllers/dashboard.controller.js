// server/src/controllers/dashboard.controller.js
import { prisma } from '../config/db.js';
import { calculateForecast } from '../services/forecast.service.js';
import { FORECAST_CONFIG } from '../config/forecast.config.js';
import { markOverdueEvents } from './plannedEvents.controller.js';
import { getAsOfDate } from '../utils/asOf.js';
import { analyzeStatement } from '../utils/dataQuality.js';
import { env } from '../config/env.js';

export async function getDashboard(req, res, next) {
  try {
    const userId = req.user.userId;
    const horizon = parseInt(req.query.horizon || '30', 10);

    const operations = await prisma.operation.findMany({
      where: { userId },
      orderBy: { date: 'asc' }
    });

    const risks = await prisma.risk.findMany({
      where: { userId, active: true }
    });

    // Плановые события (ТЗ-доп.): активные и неоплаченные; детектор просрочки обновляет статусы
    const plannedEvents = await prisma.plannedEvent.findMany({
      where: { userId, active: true, status: { not: 'paid' } },
    });
    if (plannedEvents.length) await markOverdueEvents(prisma, userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Текущий баланс — баланс последней операции или 0
    const currentBalance = operations.length > 0 
      ? operations[operations.length - 1].balanceEndOfDay 
      : 0;

    // Опорная дата прогноза (ТЗ-доработка WP-7 §9): свежая выписка (≤ 3 дн.) — текущая дата,
    // старая — последняя дата выписки; override демо-даты через FORECAST_AS_OF
    const lastOpDate = operations.length ? operations[operations.length - 1].date : null;
    const asOf = env.FORECAST_AS_OF || getAsOfDate(lastOpDate, new Date()) || new Date().toISOString().slice(0, 10);

    // Рассчитываем прогноз кассовых разрывов (только активные риски)
    const minThreshold = user?.minBalance ?? 0;
    // ТЗ-доработка WP-7 §9: при истории ≤ 14 дней Монте-Карло не запускать
    const historyDays = operations.length > 1 ? Math.round((lastOpDate - operations[0].date) / 86_400_000) + 1 : 0;
    const forecastResult = calculateForecast(operations, risks, currentBalance, horizon, minThreshold, {
      plannedEvents, // ТЗ-доп. §4.3: плановые события в расчётном ядре и Монте-Карло
      today: asOf,
      mcDisabled: historyDays <= 14,
    });

    // Подсчет итогов за последние 30 дней (доход, расход, остаток)
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const recentOps = operations.filter(op => new Date(op.date) >= thirtyDaysAgo);
    const totalIncome = recentOps.filter(op => op.direction === 'in').reduce((sum, op) => sum + op.amount, 0);
    const totalExpense = recentOps.filter(op => op.direction === 'out').reduce((sum, op) => sum + op.amount, 0);

    // Качество данных выписки (ТЗ-доработка WP-7 §1, §10, §13): пропуски, пустые ИНН, овердрафт
    const statementQuality = analyzeStatement(operations);

    res.json({
      currentBalance,
      // Контрактные ключи (docs/api-contract.md): threshold/loanRatePct
      threshold: minThreshold,
      loanRatePct: FORECAST_CONFIG.loanRatePct,
      summary: {
        income: Math.round(totalIncome * 100) / 100,
        expense: Math.round(totalExpense * 100) / 100,
        balanceChange: Math.round((totalIncome - totalExpense) * 100) / 100,
        balance: currentBalance
      },
      ...forecastResult,
      // Слитое поле качества (ТЗ-доработка §1, §10): уровень ядра + пропуски/пустые ИНН/овердрафт + опорная дата
      dataQuality: {
        ...forecastResult.dataQuality,
        gapsDays: statementQuality.gaps.reduce((sum, g) => sum + Math.round((new Date(g.to) - new Date(g.from)) / 86_400_000) + 1, 0),
        gaps: statementQuality.gaps,
        emptyInnRows: statementQuality.emptyInnCount,
        emptyPurposeRows: statementQuality.emptyPurposeCount,
        overdraftDays: statementQuality.overdraftDays,
        historyLevel: statementQuality.level,
        historyDays: statementQuality.historyDays,
        asOf
      }
    });
  } catch (err) {
    next(err);
  }
}