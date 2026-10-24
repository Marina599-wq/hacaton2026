// server/src/schemas/operations.schema.js
import { z } from 'zod';

export const createOperationSchema = {
  body: z.object({
    date: z.string(),
    amount: z.number().positive('Сумма должна быть больше 0'),
    direction: z.enum(['in', 'out']),
    category: z.string(),
    counterpartyName: z.string(),
    counterpartyInn: z.string(),
    purpose: z.string()
  })
};