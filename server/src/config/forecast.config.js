export const FORECAST_CONFIG = {
  defaultHorizonDays: 30, // Горизонт прогноза по умолчанию (30, 60, 90)
  minThresholdDefault: 0, // Минимальный порог остатка (T)
  monteCarloSimulations: 1000, // Количество прогонов для расчёта вероятности
  regularityToleranceDays: 3, // Допуск в днях для регулярных платежей
  seasonalityDropThreshold: 0.20, // Порог сезонного спада дохода (20%)
  expenseVolatilityThreshold: 0.15, // Порог роста расходов (15%)
  loanRatePct: 0.15 // Условная ставка банковского займа, % (ТЗ §5.7)
};
