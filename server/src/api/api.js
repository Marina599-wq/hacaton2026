import axios from 'axios';

// Создаем инстанс Axios с базовым URL вашего бэкенда
export const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// 🔒 Интерцептор запросов (Request Interceptor)
// Срабатывает перед каждым отправленным запросом
api.interceptors.request.use(
  (config) => {
    // Достаем токен из localStorage
    const token = localStorage.getItem('token');
    
    // Если токен есть — автоматически добавляем его в заголовки
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 🛡️ Интерцептор ответов (Response Interceptor) — опционально, но очень полезно
// Обрабатывает ситуацию, если токен протух (ошибка 401)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Токен недействителен или истек -> удаляем его и кидаем на страницу входа
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);