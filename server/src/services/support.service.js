// Было:
// import { prisma } from '../server.js';

// Стало:
import { prisma } from '../config/db.js';

export class SupportService {
  async createTicket(userId, data) {
    return prisma.supportTicket.create({ data: { ...data, userId } });
  }

  async listTickets(userId) {
    return prisma.supportTicket.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}

export const supportService = new SupportService();