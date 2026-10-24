import { prisma } from '../server.js';

export class RisksService {
  async list(userId) {
    return prisma.risk.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async detect(userId) {
    return [];
  }

  async resolve(id) {
    return prisma.risk.update({ where: { id }, data: { status: 'RESOLVED' } });
  }
}

export const risksService = new RisksService();