// server/tests/forecast.test.js
import { describe, it, expect } from 'vitest';
import { calculateForecast } from '../src/services/forecast.service.js';

describe('Движок прогнозирования кассовых разрывов', () => {
  it('должен корректно рассчитывать прогноз на заданный горизонт', () => {
    // Подготовим фейковые операции для теста
    const mockOperations = [
      { date: new Date('2026-01-01'), amount: 100000, direction: 'in', category: 'income' },
      { date: new Date('2026-01-05'), amount: 80000, direction: 'out', category: 'expense' }
    ];

    const currentBalance = 150000;
    const horizonDays = 30;
    const minThreshold = 0;

    const result = calculateForecast(mockOperations, [], currentBalance, horizonDays, minThreshold);

    // Проверяем структуру возвращаемого объекта по ТЗ
    expect(result).toHaveProperty('forecastSeries');
    expect(result).toHaveProperty('gapProbabilityPct');
    expect(result).toHaveProperty('gapAmount');
    expect(result).toHaveProperty('dangerDays');
    expect(result).toHaveProperty('goodDays');

    // Проверяем, что серия прогноза сгенерирована ровно на 30 дней
    expect(result.forecastSeries.length).toBe(horizonDays);
    
    // Проверяем, что вероятность — это число от 0 до 100
    expect(typeof result.gapProbabilityPct).toBe('number');
    expect(result.gapProbabilityPct).toBeGreaterThanOrEqual(0);
    expect(result.gapProbabilityPct).toBeLessThanOrEqual(100);
  });
});