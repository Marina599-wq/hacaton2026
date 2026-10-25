// server/prisma/seed/index.js
// ТЗ-доработка WP-7 §13: демо-данные — выписки из test-data/demo/, а не генератор
// (demo-data.js удалён). Контракт (docs/api-contract.md): demo@cashflow.ru / demo1234,
// 18–24 месяца операций, разрыв гарантированно находится моделью на горизонте 30–60 дней.
// Файлы в test-data/demo/ выбирает node server/scripts/pick-demo.mjs (критерии ТЗ §13).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { parseBankStatement } from '../../src/utils/parser.js';

const DEMO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-data/demo');
const prisma = new PrismaClient();

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

  // Контракт: демо@cashflow.ru / demo1234
  const hashedPassword = await bcrypt.hash('demo1234', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@cashflow.ru' },
    update: {},
    create: {
      email: 'demo@cashflow.ru',
      passwordHash: hashedPassword,
      // Название и вид бизнеса — из companies.csv датасета; до получения датасета — нейтральная заглушка
      companyName: 'Демо-компания (выписка организаторов)',
      inn: '0000000001',
      minBalance: 0,
    },
  });
  console.log(`✅ Демо-пользователь: ${demoUser.email}`);

  // Удаляем старые операции, если они были
  await prisma.operation.deleteMany({ where: { userId: demoUser.id } });

  // Записываем пачками по 500 штук (createMany батчи — защита от SQLite-лимита, WP-7 §1)
  const batchSize = 500;
  let total = 0;
  let lastDate = null;
  for (const file of files) {
    const parsed = await parseBankStatement(fs.readFileSync(path.join(DEMO_DIR, file)), file);
    if (parsed.operations.length === 0) {
      throw new Error('Демо-выписка пустая: ' + file);
    }
    // Категоризация уже выполнена в парсере (WP-3); служебные поля — не в схеме Prisma.
    const rows = parsed.operations.map((op) => {
      const { companyId, categorizeRule, ...rest } = op;
      return { ...rest, userId: demoUser.id, source: 'demo' };
    });
    for (let i = 0; i < rows.length; i += batchSize) {
      await prisma.operation.createMany({ data: rows.slice(i, i + batchSize) });
    }
    total += rows.length;
    lastDate = parsed.operations[parsed.operations.length - 1].date;
    console.log(`📦 ${file}: ${rows.length} операций`);
  }

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