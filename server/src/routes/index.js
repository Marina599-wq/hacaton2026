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
import userRoutes from './user.routes.js';
import plannedEventsRoutes from './plannedEvents.routes.js';
import integrationsRoutes from './integrations.routes.js';
import counterpartyRoutes from './counterparty.routes.js';
import categoriesRoutes from './categories.routes.js';
import demoRoutes from './demo.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/operations', operationsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/demo', demoRoutes);
router.use('/risks', risksRoutes);
router.use('/gap', gapRoutes);
router.use('/calendar', calendarRoutes);
router.use('/sandbox', sandboxRoutes);
router.use('/bank', bankRoutes);
router.use('/support', supportRoutes);
router.use('/history', historyRoutes);
router.use('/user', userRoutes);
router.use('/planned-events', plannedEventsRoutes);
router.use('/integrations', integrationsRoutes);
router.use('/counterparty', counterpartyRoutes);

export default router;