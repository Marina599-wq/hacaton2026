# API-контракт «Прогноз кассовых разрывов»

> Фиксируется до параллельной разработки фронта и бэка (ТЗ §8). Формат — JSON.
> Базовый путь: `/api`. Все эндпоинты, кроме `/auth/register` и `/auth/login`,
> требуют `Authorization: Bearer <token>`.

## Формат ошибки

Единый формат: `4xx/5xx → { "error": { "code": "STRING", "message": "STRING" } }`

| Код | HTTP | Когда |
|---|---|---|
| `UNAUTHENTICATED` | 401 | нет/истёк токен |
| `UNAUTHORIZED` | 403 | нет доступа к ресурсу (чужие данные) |
| `NOT_FOUND` | 404 | ресурс не найден |
| `VALIDATION` | 422 | ошибка валидации (в message — поле) |
| `RISK_NOT_DELETABLE` | 400 | попытка удалить авто-риск |
| `FILE_INVALID` | 422 | файл выписки: формат/размер/колонки |
| `RATE_LIMITED` | 429 | rate limit на `/auth/*` |
| `INTERNAL` | 500 | ошибка сервера |

## Общие типы

```ts
User { id, email, companyName, inn, minBalance }
Operation {
  id, date: "YYYY-MM-DD", amount: number > 0,
  direction: "in" | "out",
  category: "income" | "expense" | "payment" | "tax" | "salary" | "other",
  counterpartyName: string,   // обезличено
  counterpartyInn: string,    // обезличено
  purpose: string,
  balanceEndOfDay: number,
  source: "import" | "manual" | "bank_stub" | "self_loan" | "bank_loan" | "payment"
}
Risk {
  id, title,
  type: "income_loss" | "unplanned_expense",
  amount: number, dateFrom: "YYYY-MM-DD", dateTo: string | null,
  probability: number 0..1,
  source: "auto" | "manual", active: boolean
}
ForecastResult {
  series: [{ date, income, expense, balance }],   // по дням горизонта
  gapDate: string | null,
  gapProbabilityPct: number 0..100,
  gapAmount: number
}
Paged<T> { items: T[], total: number, page: number, pages: number }
```

**Обезличивание** (ТЗ §5.5, §7): `counterpartyName` = первые 2 символа + `***`
(например, `ОО***`); `counterpartyInn` = `77******12`. Выполняется при сохранении импорта; полные данные в БД не хранятся.

## Эндпоинты

### POST /auth/register — multipart/form-data

Поля: `email`, `password` (≥ 8), `companyName`, `inn` (10 или 12 цифр),
либо `file` (csv/xlsx ≤ 5 МБ), либо `useDemoData=true` (seed-набор, обязателен для демо).

- `201` → `{ "token": "…", "user": User }` — пользователь сразу залогинен.
- Ошибки: `409 CONFLICT` (email занят), `422 VALIDATION`, `422 FILE_INVALID`.

### POST /auth/login

`{ "email", "password" }` → `200 { "token", "user" }`; `401 UNAUTHENTICATED`.

### GET /auth/me → `{ "user": User }`

### GET /dashboard?horizon=30|60|90 (по умолчанию 90)

```json
{
  "balance": 1234567.89,
  "threshold": 0,
  "horizon": 90,
  "summary": { "income": 0, "expense": 0, "balanceChange": 0 },
  "forecast": { "series": [], "gapDate": "2026-11-02", "gapProbabilityPct": 64, "gapAmount": 185000 },
  "dangerDays": ["2026-11-02"],
  "goodDays": ["2026-11-15"]
}
```

### GET /operations?month=YYYY-MM&category=&page=1&limit=20

`category`: `income|expense|payment|tax|salary|other` или пусто (= все). → `Paged<Operation>`.

### GET /operations/:id → `Operation` (404 при отсутствии / не владельца)

### POST /operations

```json
{ "date": "2026-10-25", "amount": 15000, "direction": "out", "counterpartyName": "ИП Смирнов", "purpose": "Аренда офиса" }
```
→ `201 Operation` (`source="manual"`, `balanceEndOfDay` считает сервер).

### GET /history/summary?month=YYYY-MM&category=

`category`: `income|expense|payment` или пусто (= все операции месяца).

```json
{ "month": "2026-09", "total": 540000, "groups": [ { "key": "tax", "label": "Налоги", "amount": 120000 } ] }
```
Группы: для расходов — по категориям, для доходов — по контрагентам.

### GET /risks → `Risk[]`
### POST /risks

```json
{ "title": "Срыв поставки", "type": "income_loss", "amount": 200000, "dateFrom": "2026-11-01", "dateTo": "2026-11-15", "probability": 0.4 }
```
→ `201 Risk` (`source="manual"`, `active` по умолчанию `true`).

### PATCH /risks/:id

Любое подмножество: `{ "active": false }`, `{ "amount": 150000, "probability": 0.3 }` → `Risk`.

### DELETE /risks/:id → `204`; для `source="auto"` → `400 RISK_NOT_DELETABLE`.

### GET /gap/self-loans → `{ "items": [Operation] }` (операции с `source="self_loan"`)

### POST /gap/self-loan

`{ "amount": 185000 }` (amount > 0) → `{ "operation": Operation }`
(`source="self_loan"`, дата = дата ближайшего разрыва; прогноз пересчитывается).

### DELETE /gap/self-loan/:operationId → `204` (операция удаляется, прогноз пересчитывается)

### POST /bank/loan (заглушка, задержка 500–1000 мс)

`{ "amount": 185000, "termDays": 90 }` →
`{ "status": "approved", "ratePct": 14.5, "operation": Operation }`
(`source="bank_loan"`; `ratePct` — константа из конфига бэкенда).

### POST /bank/payments (заглушка, задержка 500–1000 мс)

```json
{ "type": "tax", "recipient": "ФНС", "amount": 90000, "date": "2026-10-28", "purpose": "НДС" }
```
`type`: `tax|salary|rent|supplier|other` (аренда/поставщики мапятся на категорию `other`).

```json
{
  "status": "accepted",
  "operation": { "…": "…" },
  "warning": { "gapGrows": true, "newGapAmount": 240000, "message": "Платёж увеличивает кассовый разрыв" }
}
```
`warning` опционален — приchodzi только если расчёт показывает рост разрыва.

### GET /bank/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD (заглушка)

→ `{ "operations": [Operation] }` (`source="bank_stub"`).

### POST /sandbox/simulate

```json
{ "name": "Покупка автомобиля", "amount": 600000, "date": "2026-11-01", "direction": "out", "repeats": 1 }
```
`repeats ≥ 1` (1 = одноразово, N = ежемесячно N раз).

```json
{
  "base":     { "series": [], "gapDate": "2026-11-02", "gapProbabilityPct": 64, "gapAmount": 185000 },
  "scenario": { "series": [], "gapDate": "2026-10-28", "gapProbabilityPct": 87, "gapAmount": 512000 },
  "delta": { "gapProbabilityPct": 23, "gapAmount": 327000 }
}
```
`delta = scenario − base` (п.п. для вероятности, рубли для суммы; отрицательное = разрыв стал меньше).
Сценарий **не сохраняется** в реальные операции.

### GET /calendar?month=YYYY-MM

```json
{
  "month": "2026-11",
  "days": [
    {
      "date": "2026-11-02",
      "status": "danger",
      "expectedIncome": 0,
      "expectedExpense": 240000,
      "expectedBalance": -185000,
      "reasons": ["Налог НДС", "Зарплата", "Автоматический риск: сезонный спад"]
    }
  ]
}
```
`status`: `danger` (остаток < порога / топ-по отрицательному дневному изменению) | `good` (доход > среднего дневного × 1,2) | `neutral`.

### POST /support/tickets

`{ "subject", "kind": "problem" | "question", "message" }` → `201 { "id", "status": "new" }`

### GET /support/tickets → `SupportTicket[]` (только свои, newest first)

## Демо-данные

Seed создаёт пользователя `demo@cashflow.ru / demo1234` с 18–24 месяцами операций,
из которых алгоритм гарантированно находит разрыв в ближайшие 30–60 дней (демо-критерий, ТЗ §10).

## Примечания

- Все деньги — рубли (`number`); фронт форматирует `1 234 567,89 ₽`.
- Горизонт прогноза: только 30/60/90 дней.
- Монте-Карло: N = 1000, фиксированный seed → воспроизводимость результата.
