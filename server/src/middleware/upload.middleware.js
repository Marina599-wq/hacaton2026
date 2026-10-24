// server/src/middleware/upload.middleware.js
import multer from 'multer';
import { ApiError } from '../utils/errors.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  // 25 МБ: полный файл all_operations.csv (~222 тыс. строк) тоже проходит
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(csv|xlsx)$/i)) {
      cb(null, true);
    } else {
      cb(ApiError.badRequest('Поддерживаются только форматы CSV и XLSX'));
    }
  }
});