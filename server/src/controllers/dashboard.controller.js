// server/src/controllers/dashboard.controller.js
import { prisma } from '../config/db.js';
import { calculateForecast } from '../services/forecast.service.js';
import { FORECAST_CONFIG } from '../config/forecast.config.js';

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

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Текущий баланс — баланс последней операции или 0
    const currentBalance = operations.length > 0 
      ? operations[operations.length - 1].balanceEndOfDay 
      : 0;

    // Рассчитываем прогноз кассовых разрывов (только активные риски)
    const minThreshold = user?.minBalance ?? 0;
    const forecastResult = calculateForecast(operations, risks, currentBalance, horizon, minThreshold);

    // Подсчет итогов за последние 30 дней (доход, расход, остаток)
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const recentOps = operations.filter(op => new Date(op.date) >= thirtyDaysAgo);
    const totalIncome = recentOps.filter(op => op.direction === 'in').reduce((sum, op) => sum + op.amount, 0);
    const totalExpense = recentOps.filter(op => op.direction === 'out').reduce((sum, op) => sum + op.amount, 0);

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
      ...forecastResult
    });
  } catch (err) {
    next(err);
  }
}