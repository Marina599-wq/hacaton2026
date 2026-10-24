// server/src/schemas/operations.schema.js
import { z } from 'zod';

export const createOperationSchema = {
  body: z.object({
    date: z.string().optional(),
    amount: z.number().positive('Сумма должна быть больше 0'),
    direction: z.enum(['in', 'out']),
    category: z.string().optional(),
    counterpartyName: z.string().optional(),
    counterpartyInn: z.string().optional(),
    purpose: z.string().optional()
  })
};