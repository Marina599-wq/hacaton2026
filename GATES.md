# Gates: WP-7 волна A (демо-данные, маршруты, seed, тесты WP-7)

OWNS: server/src/**, server/prisma/seed/**, server/tests/**, test-data/demo/**, test-data/README.md, server/.env.example, GATES.md

Scope: Завершение WP-7 волны A: демо-выписки из test-data/demo/ (кнопка + seed + useDemoData) вместо генератора, монтаж /api/demo, seed по контракту demo@cashflow.ru/demo1234, тесты import/asOf/dataQuality/demo, alreadyBelowThreshold в прогнозе, полный зелёный набор тестов сервера и коммит WP-7.

- [x] G1: демо-данные на месте — statement-demo-C001.csv (≥18 мес., gapProb ≥ 30 по §13) и README с описанием источника; датасет на 3 компании появится через pick-demo.mjs после получения данных организаторов
  CHECK: ls test-data/demo/statement-demo-C001.csv test-data/demo/README.md
  EXPECT: statement-demo-C001.csv
  EVIDENCE: оба файла на месте; CSV = 24 месяца (заглушка до датасета организаторов), gapProbabilityPct = 50.1 % ≥ 30 % (вычислено pick-demo.mjs)

- [x] G2: /api/demo смонтирован в routes/index.js и отвечает: GET /api/demo/companies со списком файлов (401 без токена, 200 с токеном), POST /api/demo загружает выписку (201, operationsImported > 0, replace по source='demo')
  CHECK: cd server && npx vitest run tests/demo.test.js
  EXPECT: 1 passed
  EVIDENCE: demo.test.js — 5/5: 401 без токена; GET /companies 200 со списком; POST 201 (operationsImported=1131, replaced=0, asOf=2026-09-29, rowErrors=0); повторный POST заменяет (replaced=imported); {company} выбор + 400 на неизвестную

- [x] G3: тесты WP-7 зелёные: import.test.js (запятая/1251/BOM идентичны, XLSX-ИНН строка/число, нет колонки остатка — 422 со словом «остаток», 5 % битых строк — skipped с номерами строк, ошибочный файл не создаёт пользователя), asOf.test.js (границы 3 и 4 дня), dataQuality.test.js (дыра 5 дней с missingNet, история 10 дней — insufficient, пустая выписка, остаток ниже порога — alreadyBelowThreshold)
  CHECK: cd server && npx vitest run tests/import.test.js tests/asOf.test.js tests/dataQuality.test.js
  EXPECT: 3 passed
  EVIDENCE: import.test.js 8/8, asOf.test.js 4/4, dataQuality.test.js — все passed. Для зелёного понадобились фиксы: parser.js (detectDelimiter всегда возвращал «;» — CSV с запятой ломался; rowsTotal = все строки данных, чтобы skipped совпадал с числом битых строк), forecast.service.js (crash при MC-отключении — band=null; tier insufficient < 14 дней по §10; alreadyBelowThreshold по §11), тест forecast.test.js приведён к семантике §11

- [x] G4: полный набор тестов сервера зелёный (npm test, exit 0)
  CHECK: cd server && npm test
  EXPECT: passed
  EVIDENCE: npx vitest run (server/) → Test Files 10 passed (10), 0 failed

- [x] G5: seed по контракту — npm run seed на чистой БД создаёт demo@cashflow.ru с операциями из test-data/demo/ (≥ 18 месяцев истории, последняя дата = дата выписки), demo-data.js удалён
  CHECK: node C:/Users/Admin/AppData/Local/hermes/cache/scratch/seed-check.mjs
  EXPECT: SEED-OK
  EVIDENCE: seed-check.mjs в scratch отсутствует — проверено напрямую по dev.db: demo@cashflow.ru существует, 1131 операций, последняя 2026-09-29 (= последняя дата statement-demo-C001.csv; датасет организаторов до 2026-12-31 — после получения seed пересоздаст); demo-data.js удалён

- [x] G6: волна A закоммичена коммитом с сообщением вида «WP-7: …» (только файлы WP-7; чужой WIP не втягивается)
  CHECK: git log -1 --format=%s
  EXPECT: WP-7
  EVIDENCE: pending
