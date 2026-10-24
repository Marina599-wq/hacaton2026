import { Router } from 'express';
import authRoutes from './auth.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import operationsRoutes from './operations.routes.js';
import risksRoutes from './risks.routes.js';
import gapRoutes from './gap.routes.js';
import calendarRoutes from './calendar.routes.js';
import sandboxRoutes from './sandbox.routes.js';
import bankRoutes from './bank.routes.js';
import supportRoutes from './support.routes.js';
import historyRoutes from './history.routes.js'; // Убедитесь, что этот файл создан или добавьте ниже

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/operations', operationsRoutes);
router.use('/risks', risksRoutes);
router.use('/gap', gapRoutes);
router.use('/calendar', calendarRoutes);
router.use('/sandbox', sandboxRoutes);
router.use('/bank', bankRoutes);
router.use('/support', supportRoutes);
router.use('/history', historyRoutes);

export default router;