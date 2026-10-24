// server/src/controllers/auth.controller.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/errors.js';
import { generateDemoTransactions } from '../../prisma/seed/demo-data.js';
import { parseBankStatement } from '../utils/parser.js';
import { anonymizeCounterparty } from '../utils/anonymizer.js';

export async function register(req, res, next) {
  try {
    const { email, password, companyName, inn, useDemoData } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw ApiError.badRequest('Пользователь с таким email уже существует');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, companyName, inn }
    });

    if (useDemoData === 'true' || useDemoData === true) {
      const { transactions } = generateDemoTransactions();
      await prisma.operation.createMany({
        data: transactions.map(tx => ({ ...tx, userId: user.id }))
      });
    } else if (req.file) {
      const rawOps = await parseBankStatement(req.file.buffer, req.file.originalname);
      const opsToCreate = rawOps.map(op => {
        const { name, inn: mInn } = anonymizeCounterparty(op.counterpartyName, op.counterpartyInn);
        return {
          ...op,
          counterpartyName: name,
          counterpartyInn: mInn,
          userId: user.id,
          source: 'import'
        };
      });
      await prisma.operation.createMany({ data: opsToCreate });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });

    res.status(201).json({ token, user: { id: user.id, email: user.email, companyName: user.companyName, inn: user.inn, minBalance: user.minBalance ?? 0 } });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw ApiError.badRequest('Неверный email или пароль');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw ApiError.badRequest('Неверный email или пароль');

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });

    res.json({ token, user: { id: user.id, email: user.email, companyName: user.companyName, inn: user.inn } });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, companyName: true, inn: true, minBalance: true }
    });
    // Контракт: { user: User }
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const { minBalance } = req.body;
    const userId = req.user.userId;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { minBalance: Number(minBalance) },
      select: { id: true, email: true, companyName: true, inn: true, minBalance: true }
    });

    res.json(updatedUser);
  } catch (err) {
    next(err);
  }
}