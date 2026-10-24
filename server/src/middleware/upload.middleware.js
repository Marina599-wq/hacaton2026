// server/src/middleware/upload.middleware.js
import multer from 'multer';
import { ApiError } from '../utils/errors.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 МБ
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(csv|xlsx)$/)) {
      cb(null, true);
    } else {
      cb(ApiError.badRequest('Поддерживаются только форматы CSV и XLSX'));
    }
  }
});