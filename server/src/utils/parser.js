// server/src/utils/parser.js
import { Readable } from 'node:stream';

/**
 * Простой парсер CSV/текстовых банковских выписок
 * Ожидает формат: Дата, Сумма, Направление (in/out), Контрагент, ИНН, Назначение, Остаток
 */
export async function parseBankStatement(buffer, filename) {
  const content = buffer.toString('utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  
  const operations = [];
  // Пропускаем заголовок (первую строку)
  const startIndex = lines[0].toLowerCase().includes('дата') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].split(';').map(p => p.trim());
    if (parts.length >= 7) {
      operations.push({
        date: new Date(parts[0]),
        amount: parseFloat(parts[1].replace(',', '.')),
        direction: parts[2], // 'in' or 'out'
        category: parts[2] === 'in' ? 'income' : 'expense',
        counterpartyName: parts[3],
        counterpartyInn: parts[4],
        purpose: parts[5],
        balanceEndOfDay: parseFloat(parts[6].replace(',', '.'))
      });
    }
  }

  return operations;
}