// server/src/controllers/operations.controller.js
import { prisma } from '../config/db.js';
import { anonymizeCounterparty } from '../utils/anonymizer.js';

export async function getOperations(req, res, next) {
  try {
    const userId = req.user.userId;
    const { month, category, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (category) where.category = category;
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