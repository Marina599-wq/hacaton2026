// server/src/controllers/gap.controller.js
import { prisma } from '../config/db.js';

export async function getSelfLoans(req, res, next) {
  try {
    const userId = req.user.userId;
    const items = await prisma.operation.findMany({
      where: { userId, source: 'self_loan' },
      orderBy: { date: 'desc' },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function selfLoan(req, res, next) {
  try {
    const { amount, gapDate } = req.body;
    const userId = req.user.userId;

    const lastOp = await prisma.operation.findFirst({
      where: { userId },
      orderBy: { date: 'desc' }
    });

    const currentBalance = lastOp ? lastOp.balanceEndOfDay : 0;

    const operation = await prisma.operation.create({
      data: {
        userId,
        date: gapDate ? new Date(gapDate) : new Date(),
        amount,
        direction: 'in',
        category: 'income',
        counterpartyName: 'Собственные средства',
        counterpartyInn: '0000000000',
        purpose: 'Покрытие кассового разрыва (Занять у себя)',
        balanceEndOfDay: currentBalance + amount,
        source: 'self_loan'
      }
    });

    res.status(201).json(operation);
  } catch (err) {
    next(err);
  }
}

export async function cancelSelfLoan(req, res, next) {
  try {
    const { operationId } = req.params;
    await prisma.operation.deleteMany({
      where: { id: operationId, userId: req.user.userId, source: 'self_loan' }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}