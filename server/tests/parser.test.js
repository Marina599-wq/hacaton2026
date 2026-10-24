// server/tests/parser.test.js
import { describe, it, expect } from 'vitest';
import { parseBankStatement } from '../src/utils/parser.js';

describe('Parser', () => {
  it('должен корректно парсить CSV-буфер банковской выписки', async () => {
    const mockCsv = "Дата;Сумма;Направление;Контрагент;ИНН;Назначение;Остаток\n2026-01-01;100000;in;ООО Ромашка;7701234567;Оплата по договору;600000";
    const buffer = Buffer.from(mockCsv, 'utf-8');
    
    const result = await parseBankStatement(buffer, 'statement.csv');
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].amount).toBe(100000);
    expect(result[0].direction).toBe('in');
    expect(result[0].counterpartyName).toBe('ООО Ромашка');
  });
});