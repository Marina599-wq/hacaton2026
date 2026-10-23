# Cashflow Gap — прогноз кассовых разрывов (Hacaton 2026)

Веб-приложение для малого бизнеса / ИП: по истории операций по банковскому счёту
детерминированно прогнозирует кассовые разрывы (дата, вероятность, сумма) и
предлагает закрыть разрыв — «занять у себя» или «запрос у банка» (заглушка).

## Стек

- **Frontend** (`client/`): React 18 + Vite + TypeScript + Tailwind CSS + Recharts + Zustand
- **Backend** (`server/`, ветка backend): Node.js + Express + Prisma/SQLite
- **Контракт API**: `docs/api-contract.md` · **ТЗ**: `TZ_cashflow_gap_app.md`

## Запуск клиента (5 шагов)

1. `npm install --prefix client`
2. `npm run dev` (из корня) — dev-сервер на http://localhost:5173,
   запросы `/api` проксируются на http://localhost:3001 (бэкенд)
3. Открыть http://localhost:5173
4. Войти (`demo@cashflow.ru` / `demo1234` — после seed бэкенда)
   или «Регистрация» → «Использовать демо-данные»
5. Сборка: `npm run build` → `client/dist`

> После появления `server/` корневые скрипты обновятся под
> `npm install && npm run dev` из корня для клиента и сервера (ТЗ §10).

## Структура `client/src`

```
pages/        Auth, Dashboard, Payments, History, OperationDetails,
              Support, Sandbox, Calendar, BankStub
components/   ui/ (кнопки, карточки, модалки, состояния), layout/ (хедер, нижняя навигация),
              charts/ (прогноз с красными зонами, круговая, сравнение сценариев)
api/          типизированный клиент к API (fetch, JWT, единый формат ошибок)
store/        zustand: авторизация (token + user, persist в localStorage)
hooks/        useAsync — loading/error/data для любого запроса
lib/          форматирование (1 234 567,89 ₽), утилиты дат/месяцев
types/        типы API-контракта
```

Конвенции: алиас `@/` → `src/`, ESLint + Prettier, все запросы держат состояния
загрузка / ошибка / пусто (ТЗ §10). Визуальная полировка — после Figma-макетов.
