import { prisma } from '../server.js';

export class DashboardService {
  async getOverview(userId) {
    const operations = await prisma.operation.findMany({ where: { userId } });
    const income = operations.filter((o) => o.type === 'INCOME').reduce((a, b) => a + Number(b.amount), 0);
    const expense = operations.filter((o) => o.type === 'EXPENSE').reduce((a, b) => a + Number(b.amount), 0);

    return { income, expense, balance: income - expense };
  }

  async getCashflow(userId) {
    return [];
  }
}

export const dashboardService = new DashboardService();