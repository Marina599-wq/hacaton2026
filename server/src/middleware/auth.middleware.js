// server/src/middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/errors.js';

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Токен авторизации отсутствует'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded; // { userId, email }
    next();
  } catch (e) {
    return next(ApiError.unauthorized('Недействительный или истекший токен'));
  }
}