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
    const { title, type, amount, dateFrom, dateTo, probability } = req.body;
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
    const risk = await prisma.risk.updateMany({
      where: { id, userId: req.user.userId },
      data: req.body
    });
    res.json({ success: true });
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