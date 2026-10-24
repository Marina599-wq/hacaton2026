// server/src/app.js
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Подключение роутов API
app.use('/api', routes);

// Обработка 404
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } });
});

// Централизованная обработка ошибок
app.use(errorHandler);

export default app;