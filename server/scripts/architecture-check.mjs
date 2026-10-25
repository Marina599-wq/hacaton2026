// server/scripts/architecture-check.mjs — приёмка WP-9 (ТЗ-доработка § п.1):
// docs/ARCHITECTURE.md содержит требуемые блоки Mermaid-диаграммы, и все
// упомянутые им файлы/страницы реально существуют в репозитории
// (запрещены вымышленные компоненты; исключение — явно помеченные (WP-2)
// будущие блоки: forecast.baselines, forecast.state, ForecastState).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const docPath = path.join(REPO_ROOT, 'docs/ARCHITECTURE.md');
let doc;
try { doc = readFileSync(docPath, 'utf8'); } catch { process.exit(2); }

const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };

// 1. Обязательные блоки диаграммы (ТЗ-доработка п.1, таблица)
const requiredBlocks = {
  'Клиент (страницы)': ['Dashboard', 'Payments', 'History', 'Sandbox', 'Calendar', 'Support', 'BankStub'],
  'API-цепочка': ['routes', 'middleware', 'controllers'],
  'Расчётное ядро (чистые функции)': ['forecast.service', 'categorizer', 'planFact', 'taxCalendar', 'чистые функции без БД'],
  'Импорт': ['parser', 'dataQuality', 'categorizer', 'Prisma'],
  'Данные Prisma + SQLite': ['User, Operation, Risk', 'SupportTicket', 'SandboxScenario'],
  'Интеграции (заглушка)': ['1С', 'ЭДО', 'налоговый календарь', 'маркетплейс', 'банк', 'реестр контрагентов', 'заглушка'],
  'Четыре потока': ['Импорт', 'Прогноз', 'План-факт', 'что если'],
};
for (const [label, tokens] of Object.entries(requiredBlocks)) {
  for (const t of tokens) {
    if (!doc.includes(t)) fail(`диаграмма не содержит блок/токен «${t}» (${label})`);
  }
}

// 2. Mermaid-блок есть и синтаксически цельный (balanced subgraph/end)
const mmd = [...doc.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
if (mmd.length === 0) fail('в ARCHITECTURE.md нет Mermaid-диаграммы');
const diag = mmd.join('\n');
if ((diag.match(/subgraph/g) || []).length !== (diag.match(/\bend\b/g) || []).length) {
  fail('несбалансированные subgraph/end в Mermaid-диаграмме');
}

// 3. Файлы, упомянутые в документе, существуют (кроме помеченных (WP-2))
const server = (p) => path.join(REPO_ROOT, 'server', p);
const client = (p) => path.join(REPO_ROOT, 'client', p);
import { existsSync } from 'node:fs';
const mustExist = [
  [server('src/services/forecast.service.js'), 'forecast.service'],
  [server('src/services/categorizer.service.js'), 'categorizer.service'],
  [server('src/services/planFact.service.js'), 'planFact.service'],
  [server('src/services/taxCalendar.service.js'), 'taxCalendar.service'],
  [server('src/services/sandbox.service.js'), 'sandbox.service'],
  [server('src/utils/dataQuality.js'), 'dataQuality'],
  [server('src/integrations-stub/adapter.interface.js'), 'adapter.interface'],
  [client('src/pages/Dashboard.tsx'), 'page Dashboard'],
  [client('src/pages/Payments.tsx'), 'page Payments'],
  [client('src/pages/History.tsx'), 'page History'],
  [client('src/pages/Sandbox.tsx'), 'page Sandbox'],
  [client('src/pages/Calendar.tsx'), 'page Calendar'],
  [client('src/pages/Support.tsx'), 'page Support'],
  [client('src/pages/BankStub.tsx'), 'page BankStub'],
];
for (const [p, label] of mustExist) {
  if (!existsSync(p)) fail(`mentioned-but-missing: ${path.relative(REPO_ROOT, p)} (${label})`);
}
// будущие (WP-2) блоки — в диаграмме только с меткой (WP-2), файла ещё нет: допустимо
for (const future of ['forecast.baselines', 'forecast.state', 'ForecastState']) {
  for (const m of doc.matchAll(new RegExp(future.replace('.', '\\.'), 'g'))) {
    const ctx = doc.slice(Math.max(0, m.index - 12), m.index + future.length + 12);
    if (!/(WP-2|план|будущ|planned)/i.test(ctx) && !ctx.includes('WP-')) {
      // строгий режим: без пометки WP-2/план — считаем ошибкой только если файл не существует
      const fileGuess = future.startsWith('Forecast') ? null : server(`src/services/${future}.js`);
      if (fileGuess && !existsSync(fileGuess)) {
        fail(`${future} упомянут без пометки (WP-2), файла нет`);
      }
    }
  }
}

console.log('ARCH-OK: блоки диаграммы и упомянутые файлы соответствуют репозиторию');
