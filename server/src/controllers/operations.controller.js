// server/src/controllers/operations.controller.js
import { prisma } from '../config/db.js';
import { anonymizeCounterparty } from '../utils/anonymizer.js';
import { parseBankStatement } from '../utils/parser.js';
import { ApiError } from '../utils/errors.js';

/**
 * Фильтр по категории в терминах UI:
 * - income/expense — по направлению (все поступления / все списания, включая налоги и зарплату)
 * - payment — платёжные категории (payment, tax, salary)
 * - остальные — точное совпадение категории
 */
export function categoryWhere(category) {
  switch (category) {
    case 'income':
      return { direction: 'in' };
    case 'expense':
      return { direction: 'out' };
    case 'payment':
      return { category: { in: ['payment', 'tax', 'salary'] } };
    default:
      return { category };
  }
}

export async function getOperations(req, res, next) {
  try {
    const userId = req.user.userId;
    const { month, category, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (category) Object.assign(where, categoryWhere(category));
    if (month) {
      const [year, m] = month.split('-');
      const startDate = new Date(year, parseInt(m, 10) - 1, 1);
      const endDate = new Date(year, parseInt(m, 10), 0, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    }

    const operations = await prisma.operation.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      take: parseInt(limit, 10)
    });

    res.json(operations);
  } catch (err) {
    next(err);
  }
}

export async function createOperation(req, res, next) {
  try {
    const userId = req.user.userId;
    const { date, amount, direction, category, counterpartyName, counterpartyInn, purpose } = req.body || {};

    if (!amount || !direction) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Сумма и направление обязательны' },
      });
    }
    if (!['in', 'out'].includes(direction)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Направление: in или out' },
      });
    }

    const { name, inn } = anonymizeCounterparty(counterpartyName, counterpartyInn);

    const lastOp = await prisma.operation.findFirst({
      where: { userId },
      orderBy: { date: 'desc' }
    });

    const currentBalance = lastOp ? lastOp.balanceEndOfDay : 0;
    const newBalance = direction === 'in' ? currentBalance + amount : currentBalance - amount;

    const operation = await prisma.operation.create({
      data: {
        userId,
        date: date ? new Date(date) : new Date(),
        amount,
        direction,
        category: category || (direction === 'in' ? 'income' : 'expense'),
        counterpartyName: name,
        counterpartyInn: inn,
        purpose,
        balanceEndOfDay: newBalance,
        source: 'manual'
      }
    });

    res.status(201).json(operation);
  } catch (err) {
    next(err);
  }
}

export async function getOperationById(req, res, next) {
  try {
    const { id } = req.params;
    const operation = await prisma.operation.findFirst({
      where: { id, userId: req.user.userId }
    });
    if (!operation) return res.status(404).json({ error: { message: 'Операция не найдена' } });

    res.json(operation);
  } catch (err) {
    next(err);
  }
}

/**
 * Импорт банковской выписки (CSV) в БД пользователя.
 * Multipart: file — CSV (формат организаторов test-data или легаси 7 колонок),
 * replace='true' — сначала удалить ранее импортированные операции (source='import').
 */
export async function importStatement(req, res, next) {
  try {
    const userId = req.user.userId;
    if (!req.file) throw ApiError.badRequest('Файл выписки не получен (поле file)');

    const { operations, meta, warnings } = await parseBankStatement(req.file.buffer, req.file.originalname);
    if (operations.length === 0) {
      throw ApiError.badRequest('В файле не найдено корректных операций выписки');
    }

    // Замена: убираем предыдущие импорты (повторная подгрузка другой выписки)
    let removed = 0;
    if (String(req.body?.replace) === 'true') {
      const r = await prisma.operation.deleteMany({ where: { userId, source: 'import' } });
      removed = r.count;
    }

    // Дедупликация: пропуск операций, уже существующих по externalId
    const existing = await prisma.operation.findMany({
      where: { userId, externalId: { not: null } },
      select: { externalId: true },
    });
    const have = new Set(existing.map((o) => o.externalId));
    const toCreate = operations
      .filter((op) => !op.externalId || !have.has(op.externalId))
      .map((op) => {
        const { companyId, ...rest } = op;
        // Тестовые данные организаторов обезличены на источнике;
        // для реальных легаси-выписок контрагентов маскируем
        const anon = meta.format === 'legacy' ? anonymizeCounterparty(rest.counterpartyName, rest.counterpartyInn) : null;
        return {
          ...rest,
          counterpartyName: anon ? anon.name : rest.counterpartyName,
          counterpartyInn: anon ? anon.inn : rest.counterpartyInn,
          userId,
          source: 'import',
        };
      });

    if (toCreate.length > 0) {
      await prisma.operation.createMany({ data: toCreate });
    }

    res.status(201).json({
      imported: toCreate.length,
      skipped: operations.length - toCreate.length,
      removed,
      format: meta.format,
      companyId: meta.companyId,
      warnings: warnings.slice(0, 20),
    });
  } catch (err) {
    next(err);
  }
}