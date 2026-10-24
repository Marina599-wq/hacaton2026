import { prisma } from '../config/db.js';
import { calculateForecast } from './forecast.service.js';

const HORIZON_DAYS = 90;

/** Прогноз движка -> контрактная форма ForecastResult (series с income/expense, dangerDays). */
function toContractForecast(fc, threshold) {
  return {
    series: fc.forecastSeries.map((p) => ({ date: p.date, income: p.income ?? 0, expense: p.expense ?? 0, balance: p.balance })),
    gapDate: fc.gapDate ?? null,
    gapProbabilityPct: fc.gapProbabilityPct ?? 0,
    gapAmount: fc.gapAmount ?? 0,
    dangerDays: fc.dangerDays ?? [],
    threshold,
  };
}

export class SandboxService {
  /**
   * Сценарий: базовый прогноз vs прогноз с N синтетическими операциями
   * (amount, direction, начиная с date; repeats>1 — ежемесячно).
   * Сценарий в БД не пишет (операции не создаются) — только сохраняет карточку для аудита.
   */
  async simulate(userId, data = {}) {
    const name = String(data.name || 'Сценарий');
    const amount = Number(data.amount) || 0;
    const direction = data.direction === 'in' ? 'in' : 'out';
    const repeats = Math.max(1, Math.min(36, Number(data.repeats) || 1));
    const startDate = data.date ? new Date(data.date) : new Date();
    if (Number.isNaN(startDate.getTime())) startDate.setTime(Date.now());

    const [operations, risks, user] = await Promise.all([
      prisma.operation.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
      prisma.risk.findMany({ where: { userId, active: true } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    const currentBalance = operations.length > 0 ? operations[operations.length - 1].balanceEndOfDay : 0;
    const minThreshold = user?.minBalance ?? 0;

    const baseFc = calculateForecast(operations, risks, currentBalance, HORIZON_DAYS, minThreshold);

    const synthetic = [];
    for (let i = 0; i < repeats; i += 1) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + i);
      synthetic.push({
        date: d.toISOString().split('T')[0],
        amount,
        direction,
        category: direction === 'in' ? 'income' : 'expense',
        counterpartyName: 'Песочница',
        counterpartyInn: '0000000000',
        purpose: name,
        source: 'sandbox',
        balanceEndOfDay: 0,
      });
    }
    const scenarioFc = calculateForecast([...operations, ...synthetic], risks, currentBalance, HORIZON_DAYS, minThreshold);

    const base = toContractForecast(baseFc, minThreshold);
    const scenario = toContractForecast(scenarioFc, minThreshold);

    await prisma.sandboxScenario.create({
      data: {
        userId,
        name: name.slice(0, 120),
        amount,
        date: startDate,
        repeats,
      },
    });

    return {
      base,
      scenario,
      delta: {
        gapProbabilityPct: Math.round((scenario.gapProbabilityPct - base.gapProbabilityPct) * 10) / 10,
        gapAmount: Math.round((scenario.gapAmount - base.gapAmount) * 100) / 100,
      },
    };
  }

  async reset(userId) {
    await prisma.sandboxScenario.deleteMany({ where: { userId } });
    return { reset: true };
  }
}

export const sandboxService = new SandboxService();
