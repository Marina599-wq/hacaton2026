// server/src/utils/errors.js
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }

  static badRequest(message) {
    return new ApiError(400, message);
  }

  static unauthorized(message = 'Неавторизован') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Доступ запрещен') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Ресурс не найден') {
    return new ApiError(404, message);
  }
}