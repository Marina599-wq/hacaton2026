// server/prisma/seed/demo-data.js

export function generateDemoTransactions() {
  const transactions = [];
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 18); // 18 месяцев назад

  let currentBalance = 600000; // Начальный капитал 600 000 руб.
  const today = new Date();

  const currDate = new Date(startDate);
  
  while (currDate <= today) {
    const day = currDate.getDate();
    const weekday = currDate.getDay(); // 0 - воскресенье, 6 - суббота

    // 1. Аренда (каждое 5-е число месяца)
    if (day === 5) {
      currentBalance -= 75000;
      transactions.push({
        date: new Date(currDate),
        amount: 75000,
        direction: 'out',
        category: 'expense',
        counterpartyName: 'АО Недвижимость Сервис',
        counterpartyInn: '7704567890',
        purpose: 'Оплата аренды офиса',
        balanceEndOfDay: currentBalance,
        source: 'import'
      });
    }

    // 2. Зарплата (каждое 20-е число месяца)
    if (day === 20) {
      currentBalance -= 220000;
      transactions.push({
        date: new Date(currDate),
        amount: 220000,
        direction: 'out',
        category: 'salary',
        counterpartyName: 'Сотрудники компании',
        counterpartyInn: '0000000000',
        purpose: 'Выплата заработной платы',
        balanceEndOfDay: currentBalance,
        source: 'import'
      });
    }

    // 3. Налоги (каждое 28-е число месяца)
    if (day === 28) {
      currentBalance -= 95000;
      transactions.push({
        date: new Date(currDate),
        amount: 95000,
        direction: 'out',
        category: 'tax',
        counterpartyName: 'ИФНС России № 43 по г. Москве',
        counterpartyInn: '7743000000',
        purpose: 'Уплата страховых взносов и налогов',
        balanceEndOfDay: currentBalance,
        source: 'import'
      });
    }

    // 4. Поступления от клиентов (в будни)
    if (weekday !== 0 && weekday !== 6 && day % 3 === 0) {
      const incomeAmount = Math.floor(Math.random() * 70000) + 30000;
      currentBalance += incomeAmount;
      transactions.push({
        date: new Date(currDate),
        amount: incomeAmount,
        direction: 'in',
        category: 'income',
        counterpartyName: 'ООО ТехноПром',
        counterpartyInn: '7712345678',
        purpose: 'Оплата по договору поставки',
        balanceEndOfDay: currentBalance,
        source: 'import'
      });
    }

    // 5. Хозяйственные расходы (в будни)
    if (weekday !== 0 && weekday !== 6 && day % 2 === 0) {
      const expenseAmount = Math.floor(Math.random() * 12000) + 2000;
      currentBalance -= expenseAmount;
      transactions.push({
        date: new Date(currDate),
        amount: expenseAmount,
        direction: 'out',
        category: 'expense',
        counterpartyName: 'ООО Офис Снаб',
        counterpartyInn: '7723456789',
        purpose: 'Хозяйственные расходы',
        balanceEndOfDay: currentBalance,
        source: 'import'
      });
    }

    currDate.setDate(currDate.getDate() + 1);
  }

  return { transactions };
}