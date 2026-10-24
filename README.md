# Cashflow Gap — прогноз кассовых разрывов (Hacaton 2026)

Веб-приложение для малого бизнеса / ИП: по истории операций по банковскому счёту
детерминированно прогнозирует кассовые разрывы (дата, вероятность, сумма) и
предлагает закрыть разрыв — «занять у себя» или «запрос у банка» (заглушка).

## Стек

- **Frontend** (`client/`): React 18 + Vite + TypeScript + Tailwind CSS + Recharts + Zustand
- **Backend** (`server/`): Node.js + Express + Prisma/SQLite
- **Контракт API**: `docs/api-contract.md` · **ТЗ**: `TZ_cashflow_gap_app.md`

## Запуск клиента

1. `npm install --prefix client`
2. `npm run dev` (из корня) — dev-сервер на http://localhost:5173,
   запросы `/api` проксируются на бэкенд (по умолчанию http://localhost:3001,
   цель меняется переменной окружения `VITE_PROXY_TARGET`)
3. Открыть http://localhost:5173
4. Войти (`demo@cashflow.ru` / `demo1234` — после seed бэкенда)
   или «Регистрация» → «Использовать демо-данные»
5. Сборка: `npm run build` → `client/dist`

## Запуск бэкенда (`server/`)

1. `npm install` (из `server/`)
2. `cp .env.example .env` (SQLite-файл создаётся автоматически)
3. `npx prisma db push` — схема
4. `npm run seed` — демо-данные
5. `npm run dev` — http://localhost:5000/api

Клиент подключается к живому бэкенду через прокси Vite:
`VITE_PROXY_TARGET=http://localhost:5000 npm run dev` (из `client/`).

## Структура `client/src`

```
pages/        Auth, Dashboard, Payments, History, OperationDetails,
              Support, Sandbox, Calendar, BankStub
components/   ui/ (кнопки, карточки, модалки, состояния), layout/ (хедер, нижняя навигация),
              charts/ (прогноз с красными зонами, круговая, сравнение сценариев)
api/          типизированный клиент к API (fetch, JWT, единый формат ошибок,
              нормализаторы ответов реального бэкенда в контрактную форму)
store/        zustand: авторизация (token + user, persist в localStorage)
hooks/        useAsync — loading/error/data для любого запроса
lib/          форматирование (1 234 567,89 ₽), утилиты дат/месяцев
types/        типы API-контракта
```

Конвенции: алиас `@/` → `src/`, ESLint + Prettier, все запросы держат состояния
загрузка / ошибка / пусто (ТЗ §10).
