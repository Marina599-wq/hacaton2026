import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/summary', async (req, res, next) => {
  try {
    const operations = await prisma.operation.findMany({
      where: { userId: req.user.id },
      orderBy: { date: 'desc' },
    });
    res.json({ items: operations });
  } catch (err) {
    next(err);
  }
});

export default router;