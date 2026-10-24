// server/src/routes/operations.routes.js
import { Router } from 'express';
import { getOperations, createOperation, getOperationById } from '../controllers/operations.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createOperationSchema } from '../schemas/operations.schema.js';

const router = Router();

router.use(authMiddleware);
router.get('/', getOperations);
router.post('/', validate(createOperationSchema), createOperation);
router.get('/:id', getOperationById);

export default router;