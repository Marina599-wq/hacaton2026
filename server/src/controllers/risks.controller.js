// server/src/controllers/risks.controller.js
import { prisma } from '../config/db.js';

export async function getRisks(req, res, next) {
  try {
    const risks = await prisma.risk.findMany({ where: { userId: req.user.userId } });
    res.json(risks);
  } catch (err) {
    next(err);
  }
}

export async function createRisk(req, res, next) {
  try {
    const { title, type, amount, dateFrom, dateTo, probability } = req.body || {};
    if (!title) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Название риска обязательно' },
      });
    }
    const risk = await prisma.risk.create({
      data: {
        userId: req.user.userId,
        title,
        type,
        amount,
        dateFrom: new Date(dateFrom),
        dateTo: dateTo ? new Date(dateTo) : null,
        probability,
        source: 'manual',
        active: true
      }
    });
    res.status(201).json(risk);
  } catch (err) {
    next(err);
  }
}

export async function updateRisk(req, res, next) {
  try {
    const { id } = req.params;
    // Только контрактные поля (RiskPatch), без userId/связей — защита от масс-assignment.
    const { title, type, amount, dateFrom, dateTo, probability, active } = req.body || {};
    const data = {};
    if (title !== undefined) data.title = String(title).slice(0, 120);
    if (type !== undefined) data.type = type;
    if (amount !== undefined) data.amount = Number(amount);
    if (dateFrom !== undefined) data.dateFrom = new Date(dateFrom);
    if (dateTo !== undefined) data.dateTo = dateTo ? new Date(dateTo) : null;
    if (probability !== undefined) data.probability = Number(probability);
    if (active !== undefined) data.active = Boolean(active);

    if (Object.keys(data).length === 0) return res.json({ success: true });

    const result = await prisma.risk.updateMany({
      where: { id, userId: req.user.userId },
      data
    });
    // Если риска нет/чужая — 404, а не молчаливый success (frontend ждёт Risk).
    if (result.count === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Риск не найден' },
      });
    }
    const risk = await prisma.risk.findUnique({ where: { id } });
    res.json(risk);
  } catch (err) {
    next(err);
  }
}

export async function deleteRisk(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.risk.deleteMany({ where: { id, userId: req.user.userId } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}