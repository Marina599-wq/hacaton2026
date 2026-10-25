// server/prisma/seed/index.js
// ТЗ-доработка WP-7 §13: демо-данные — выписки из test-data/demo/, а не генератор
// (demo-data.js удалён). Контракт (docs/api-contract.md): demo@cashflow.ru / demo1234,
// 18–24 месяца операций, разрыв гарантированно находится моделью на горизонте 30–60 дней.
// Файлы в test-data/demo/ выбирает node server/scripts/pick-demo.mjs (критерии ТЗ §13).
// Отчёт аудита §2.2/§2.4: у демо-учётки должен быть план (PlannedEvent по каждому типу:
// договор, счёт, налог, просроченный платёж), чтобы план-факт не был нулевым, и дефолтный
// порог разрыва T (User.minBalance) = P25-квантиль остатков выписки — на C001/asOf=2026-09-29
// на главной виден будущий разрыв (gapDate в будущем, gapProbabilityPct > 0; docs/backtest-results.json:
// на C001 фактический разрыв случился при пороге P25).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { parseBankStatement } from '../../src/utils/parser.js';

const DEMO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-data/demo');
const prisma = new PrismaClient();

// Тот же percentile (линейная интерполяция), что в server/src/utils/backtestMetrics.js
function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

async function main() {
  console.log('🌱 Starting seed...');

  const files = fs.existsSync(DEMO_DIR)
    ? fs.readdirSync(DEMO_DIR).filter((f) => f.endsWith('.csv')).sort()
    : [];
  if (files.length === 0) {
    console.error('❌ Демо-выписки не найдены: test-data/demo/ пустая.');
    console.error('   Положите файлы: node server/scripts/pick-demo.mjs (критерии ТЗ §13, описано в test-data/demo/README.md).');
    process.exit(1);
  }

  // Сначала разбираем все выписки (данные + P25-порог), потом пишем в БД
  const parsedFiles = [];
  let lastDate = null;
  for (const file of files) {
    const parsed = await parseBankStatement(fs.readFileSync(path.join(DEMO_DIR, file)), file);
    if (parsed.operations.length === 0) {
      throw new Error('Демо-выписка пустая: ' + file);
    }
    parsedFiles.push({ file, operations: parsed.operations });
    lastDate = parsed.operations[parsed.operations.length - 1].date;
  }

  // Порог разрыва T демо-юзера — P25-квантиль остатков последней демо-выписки
  // (по дням, как в бэктесте). В docs/backtest-results.json на C001 разрыв случился при P25;
  // T ≈ 1,49 млн ₽ (остаток на 2026-09-29 ≈ 1,72 млн ₽ → разрыв в будущем, а не «порог уже нарушен»).
  const balByDay = new Map();
  for (const op of parsedFiles[parsedFiles.length - 1].operations) {
    balByDay.set(new Date(op.date).toISOString().slice(0, 10), op.balanceEndOfDay); // строки хронологические
  }
  const p25 = Math.round(percentile([...balByDay.values()], 25));

  // Контракт: демо@cashflow.ru / demo1234
  const hashedPassword = await bcrypt.hash('demo1234', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@cashflow.ru' },
    update: { minBalance: p25 },
    create: {
      email: 'demo@cashflow.ru',
      passwordHash: hashedPassword,
      // Название и вид бизнеса — из companies.csv датасета; до получения датасета — нейтральная заглушка
      companyName: 'Демо-компания (выписка организаторов)',
      inn: '0000000001',
      minBalance: p25, // дефолтный порог разрыва T = P25 остатков (см. выше)
    },
  });
  console.log(`✅ Демо-пользователь: ${demoUser.email} (T = ${p25.toLocaleString('ru-RU')} ₽)`);

  // Удаляем старые операции и плановые события, если они были
  await prisma.operation.deleteMany({ where: { userId: demoUser.id } });
  await prisma.plannedEvent.deleteMany({ where: { userId: demoUser.id } });

  // Записываем пачками по 500 штук (createMany батчи — защита от SQLite-лимита, WP-7 §1)
  const batchSize = 500;
  let total = 0;
  for (const { file, operations } of parsedFiles) {
    // Категоризация уже выполнена в парсере (WP-3); служебные поля — не в схеме Prisma.
    const rows = operations.map((op) => {
      const { companyId, categorizeRule, ...rest } = op;
      return { ...rest, userId: demoUser.id, source: 'demo' };
    });
    for (let i = 0; i < rows.length; i += batchSize) {
      await prisma.operation.createMany({ data: rows.slice(i, i + batchSize) });
    }
    total += rows.length;
    console.log(`📦 ${file}: ${rows.length} операций`);
  }

  // Плановые события демо (аудит §2.2/§2.4: план-факт не должен быть нулевым).
  // Даты согласованы с asOf демо (2026-09-29) и данными C001:
  // - налог: ЕНП 225 983 ₽ 18.09.2026 реально есть в выписке (факт: paid) + октябрьский в плане;
  // - договор/счёт: контрагенты и суммы — из реальных регулярных платёжей C001;
  // - просроченный платёж: входящий счёт, ожидали 15.09.2026, оплата не поступила (overdue);
  // - крупная плановая покупка 20.10.2026 (900 000 ₽): уводит медианный путь остатка ниже T,
  //   поэтому на главной виден БУДУЩИЙ разрыв (gapDate=2026-10-20, вероятность > 0 при T=P25).
  const allInn = new Set(parsedFiles.flatMap((f) => f.operations.map((o) => o.counterpartyInn)));
  const fact = (where) => prisma.operation.findFirst({ where: { userId: demoUser.id, ...where } });
  const paidTax = await fact({ externalId: 'C001-001106' }); // ЕНП 225 983 ₽ от 18.09.2026 в C001
  const events = [
    // 1) Договор (исходящий, будущий): регулярное пополнение топливных карт по договору № 9161
    {
      type: 'contract', direction: 'out', amount: 200000, expectedDate: new Date('2026-10-08T00:00:00Z'),
      issueDate: new Date('2026-09-01T00:00:00Z'), status: 'pending', source: '1c',
      counterpartyName: 'ООО «Топливная компания-660»', counterpartyInn: '0062343230',
      title: 'Оплата по договору № 9161 (топливные карты), октябрь 2026',
    },
    // 2) Счёт (входящий, будущий): от регулярного клиента C001 (150 487,80 ₽ за 28.09.2026)
    {
      type: 'invoice', direction: 'in', amount: 150487.8, expectedDate: new Date('2026-10-15T00:00:00Z'),
      issueDate: new Date('2026-09-25T00:00:00Z'), status: 'pending', source: 'edo',
      counterpartyName: 'ООО «Торговый дом-169»', counterpartyInn: '0084388330',
      title: 'Оплата по счёту № 901 от 25.09.2026',
    },
    // 3) Налог (будущий): ЕНП по образцу сентября (225 983 ₽, 28-е число месяца)
    {
      type: 'tax', direction: 'out', amount: 225983, expectedDate: new Date('2026-10-18T00:00:00Z'),
      issueDate: new Date('2026-09-18T00:00:00Z'), status: 'pending', source: 'tax-calendar',
      counterpartyName: 'Казначейство России (ФНС России)', counterpartyInn: '7727406020',
      title: 'Единый налоговый платеж (октябрь 2026)',
    },
    // 4) Просроченный платёж (входящий): счёт от 05.09.2026, ожидался 15.09.2026, оплата не поступила.
    //    ИНН 0091011200 отсутствует в выписке C001 — reconcile стабильно держит статус overdue.
    {
      type: 'invoice', direction: 'in', amount: 120000, expectedDate: new Date('2026-09-15T00:00:00Z'),
      issueDate: new Date('2026-09-05T00:00:00Z'), status: 'overdue', source: '1c',
      counterpartyName: 'ООО «Логистик-300»', counterpartyInn: '0091011200',
      title: 'Оплата по счёту № 902 от 05.09.2026 (не поступила)',
    },
    // 5) Крупный одноразовый плановый платёж (capex): будущая дата, источник — план пользователя
    {
      type: 'contract', direction: 'out', amount: 900000, expectedDate: new Date('2026-10-20T00:00:00Z'),
      issueDate: new Date('2026-09-10T00:00:00Z'), status: 'pending', source: 'manual',
      title: 'Капитальные расходы: покупка двух грузовиков',
    },
  ];
  // 6) Налог с фактом (paid) — только если факт-операция нашлась в выписке (иначе дубль №3 уже покрывает тип tax)
  if (paidTax && allInn.has('7727406020')) {
    events.push({
      type: 'tax', direction: 'out', amount: 225983, expectedDate: new Date('2026-09-18T00:00:00Z'),
      issueDate: new Date('2026-08-25T00:00:00Z'), status: 'paid', paidAmount: 225983,
      factOperationId: paidTax.id, source: 'tax-calendar',
      counterpartyName: 'Казначейство России (ФНС России)', counterpartyInn: '7727406020',
      title: 'Единый налоговый платеж (сентябрь 2026)',
    });
  }
  // Защита от замены демо-датасета: просроченный платёж создаём только если его ИНН чужд выписке
  const seedEvents = events.filter((e) => e.status !== 'overdue' || !allInn.has(e.counterpartyInn));
  await prisma.plannedEvent.createMany({
    data: seedEvents.map((e) => ({ ...e, userId: demoUser.id, active: true })),
  });
  console.log(`📅 Плановые события: ${seedEvents.length} (T = P25 = ${p25.toLocaleString('ru-RU')} ₽)`);

  // ТЗ-доработка WP-7 §9/§13: опорная дата демо — последняя дата выписки;
  // для демо-пользователя задаётся FORECAST_AS_OF (см. server/.env.example).
  console.log(`✨ Seed завершён: ${total} операций. FORECAST_AS_OF для демо: ${String(lastDate).slice(0, 10)}`);
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при сидировании:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });