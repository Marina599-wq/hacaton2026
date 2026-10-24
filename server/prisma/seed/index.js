// server/prisma/seed/index.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateDemoTransactions } from './demo-data.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  const hashedPassword = await bcrypt.hash('demo12345', 10);

  // Создаем демо-пользователя строго по полям схемы Prisma
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      passwordHash: hashedPassword,
      companyName: 'ИП Технологии Будущего',
      inn: '773123456789',
      minBalance: 0
    },
  });

  console.log(`✅ Демо-пользователь создан: ${demoUser.email}`);

  // Удаляем старые операции, если они были
  await prisma.operation.deleteMany({
    where: { userId: demoUser.id }
  });

  // Генерируем транзакции
  const { transactions } = generateDemoTransactions();

  console.log(`📦 Загрузка ${transactions.length} исторических транзакций...`);

  // Записываем пачками по 500 штук
  const batchSize = 500;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize).map(tx => ({
      ...tx,
      userId: demoUser.id
    }));
    await prisma.operation.createMany({
      data: batch
    });
  }

  console.log('✨ Сидирование успешно завершено!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при сидировании:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });