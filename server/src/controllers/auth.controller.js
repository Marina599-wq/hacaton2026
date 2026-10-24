// server/src/controllers/auth.controller.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
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
      const { operations: rawOps, meta, warnings } = await parseBankStatement(req.file.buffer, req.file.originalname);
      // Данные организаторов (test-data/*.csv) уже обезличены на источнике — маскируем только легаси-выписки
      const opsToCreate = rawOps.map(op => {
        const { name, inn: mInn } = meta.format === 'organizer'
          ? { name: op.counterpartyName, mInn: 0 }
          : anonymizeCounterparty(op.counterpartyName, op.counterpartyInn);
        const { companyId, ...rest } = op;
        return {
          ...rest,
          counterpartyName: meta.format === 'organizer' ? name : name,
          counterpartyInn: meta.format === 'organizer' ? op.counterpartyInn : mInn,
          userId: user.id,
          source: 'import'
        };
      });
      await prisma.operation.createMany({ data: opsToCreate });
      // warnings не бросаем — часть строк может быть некорректной в реальной выгрузке
      // Строка про импорт — без имени файла: только число строк, пропущенных и предупреждений.
      logger.info('import', { lines: opsToCreate.length, skipped: meta.rowsSkipped, warnings: warnings.length });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN }
    );

    res.status(201).json({ token, user: { id: user.id, email: user.email, companyName: user.companyName, inn: user.inn, minBalance: user.minBalance ?? 0 } });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw ApiError.unauthorized('Неверный email или пароль', 'INVALID_CREDENTIALS');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw ApiError.unauthorized('Неверный email или пароль', 'INVALID_CREDENTIALS');

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN }
    );

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