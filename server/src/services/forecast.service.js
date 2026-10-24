// server/src/services/forecast.service.js
import { FORECAST_CONFIG } from '../config/forecast.config.js';

/**
 * Основная функция расчёта прогноза кассовых разрывов
 * @param {Array} operations - История операций пользователя
 * @param {Array} risks - Активные риски (авто + ручные)
 * @param {number} currentBalance - Текущий баланс счёта
 * @param {number} horizonDays - Горизонт прогноза (30, 60, 90)
 * @param {number} minThreshold - Порог безопасного остатка
 */
export function calculateForecast(operations, risks = [], currentBalance, horizonDays = 30, minThreshold = 0) {
  const forecastSeries = [];
  let runningBalance = currentBalance;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Расчёт среднего изменения по дням недели для нерегулярных операций
  const weekdayStats = calculateWeekdayStats(operations);

  // 2. Выявление регулярных платежей (аренда, налоги, зарплата)
  const regularPaymentsMap = detectRegularPayments(operations);

  let firstGapDate = null;
  let minForecastBalance = currentBalance;
  const dangerDays = [];
  const goodDays = [];

  // Средний дневной доход для расчёта "хороших дней"
  const avgDailyIncome = Object.values(weekdayStats).reduce((acc, curr) => acc + curr.avgIncome, 0) / 7;
  const goodDayThreshold = avgDailyIncome * 1.2;

  // 3. Построение прогноза день за днем на горизонт H
  for (let i = 1; i <= horizonDays; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);
    
    const dayOfWeek = targetDate.getDay();
    const dayOfMonth = targetDate.getDate();

    // Базовое изменение от нерегулярных операций
    const stats = weekdayStats[dayOfWeek] || { avgIncome: 0, avgExpense: 0 };
    let expectedDelta = stats.avgIncome - stats.avgExpense;

    // Добавляем регулярные платежи, если они приходятся на этот день месяца
    let regularDelta = 0;
    regularPaymentsMap.forEach(payment => {
      if (Math.abs(payment.dayOfMonth - dayOfMonth) <= FORECAST_CONFIG.regularityToleranceDays) {
        regularDelta += (payment.direction === 'in' ? payment.amount : -payment.amount);
      }
    });
    expectedDelta += regularDelta;

    // Учитываем влияние активных рисков на этот день
    let riskDelta = 0;
    risks.forEach(risk => {
      if (risk.active) {
        const riskDateFrom = new Date(risk.dateFrom);
        const riskDateTo = risk.dateTo ? new Date(risk.dateTo) : riskDateFrom;
        if (targetDate >= riskDateFrom && targetDate <= riskDateTo) {
          const dailyRiskImpact = (risk.amount * risk.probability) / Math.max(1, (riskDateTo - riskDateFrom) / (1000 * 60 * 60 * 24));
          if (risk.type === 'income_loss') {
            riskDelta -= dailyRiskImpact;
          } else if (risk.type === 'unplanned_expense') {
            riskDelta -= dailyRiskImpact;
          }
        }
      }
    });
    expectedDelta += riskDelta;

    runningBalance += expectedDelta;
    
    if (runningBalance < minForecastBalance) {
      minForecastBalance = runningBalance;
    }

    const isDanger = runningBalance < minThreshold;
    if (isDanger && !firstGapDate) {
      firstGapDate = targetDate.toISOString().split('T')[0];
    }

    if (isDanger) {
      dangerDays.push(targetDate.toISOString().split('T')[0]);
    } else if (expectedDelta >= goodDayThreshold) {
      goodDays.push(targetDate.toISOString().split('T')[0]);
    }

    forecastSeries.push({
      date: targetDate.toISOString().split('T')[0],
      balance: Math.round(runningBalance * 100) / 100,
      isDanger
    });
  }

  // 4. Расчёт вероятности разрыва методом Монте-Карло (N = 1000)
  const gapProbabilityPct = calculateMonteCarloProbability(operations, risks, currentBalance, horizonDays, minThreshold);

  // 5. Сумма разрыва
  const gapAmount = firstGapDate ? Math.max(0, minThreshold - minForecastBalance) : 0;

  return {
    gapDate: firstGapDate,
    gapProbabilityPct: Math.round(gapProbabilityPct * 10) / 10,
    gapAmount: Math.round(gapAmount * 100) / 100,
    forecastSeries,
    dangerDays,
    goodDays
  };
}

/**
 * Вспомогательная функция: статистика по дням недели
 */
function calculateWeekdayStats(operations) {
  const statsByDay = {}; // 0..6
  for (let i = 0; i < 7; i++) {
    statsByDay[i] = { incomeSum: 0, incomeCount: 0, expenseSum: 0, expenseCount: 0 };
  }

  operations.forEach(op => {
    const day = new Date(op.date).getDay();
    if (op.direction === 'in') {
      statsByDay[day].incomeSum += op.amount;
      statsByDay[day].incomeCount++;
    } else {
      statsByDay[day].expenseSum += op.amount;
      statsByDay[day].expenseCount++;
    }
  });

  const result = {};
  for (let i = 0; i < 7; i++) {
    result[i] = {
      avgIncome: statsByDay[i].incomeCount > 0 ? statsByDay[i].incomeCount / 52 : 0, // усреднение по году
      avgExpense: statsByDay[i].expenseCount > 0 ? statsByDay[i].expenseCount / 52 : 0
    };
  }
  return result;
}

/**
 * Вспомогательная функция: поиск регулярных платежей
 */
function detectRegularPayments(operations) {
  // Упрощенный детектор регулярных платежей по контрагентам и суммам
  const map = new Map();
  operations.forEach(op => {
    const day = new Date(op.date).getDate();
    const key = `${op.counterpartyInn}_${Math.round(op.amount / 1000)}`;
    if (!map.has(key)) {
      map.set(key, { dayOfMonth: day, amount: op.amount, direction: op.direction, count: 1 });
    } else {
      const item = map.get(key);
      item.count++;
    }
  });

  const regular = [];
  map.forEach(item => {
    if (item.count >= 3) { // повторялось минимум 3 раза
      regular.push(item);
    }
  });
  return regular;
}

/**
 * Расчёт вероятности методом Монте-Карло
 */
function calculateMonteCarloProbability(operations, risks, currentBalance, horizonDays, minThreshold) {
  let gapCount = 0;
  const runs = FORECAST_CONFIG.monteCarloSimulations;

  for (let r = 0; r < runs; r++) {
    let balance = currentBalance;
    let hasGap = false;

    for (let i = 1; i <= horizonDays; i++) {
      // Добавляем случайный шум (нормальное распределение)
      const randomNoise = (Math.random() - 0.5) * 15000;
      balance += randomNoise;

      if (balance < minThreshold) {
        hasGap = true;
        break;
      }
    }

    if (hasGap) gapCount++;
  }

  return (gapCount / runs) * 100;
}