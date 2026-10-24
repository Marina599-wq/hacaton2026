import { Router } from 'express';
import { calendarController } from '../controllers/calendar.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);
router.get('/events', calendarController.events);

export default router;