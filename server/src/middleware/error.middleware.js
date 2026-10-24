// server/src/middleware/error.middleware.js
import { ApiError } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  console.error('❌ Ошибка:', err);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { code: 'API_ERROR', message: err.message }
    });
  }

  return res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Внутренняя ошибка сервера' }
  });
}