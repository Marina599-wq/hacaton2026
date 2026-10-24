import { prisma } from '../server.js';
import { parseFile } from '../utils/parser.js';

export class OperationsService {
  async list(userId) {
    return prisma.operation.findMany({ where: { userId }, orderBy: { date: 'desc' } });
  }

  async create(userId, data) {
    return prisma.operation.create({ data: { ...data, userId } });
  }

  async importFile(userId, file) {
    const parsed = await parseFile(file.buffer, file.originalname);
    const operations = await prisma.operation.createMany({
      data: parsed.map((item) => ({ ...item, userId })),
    });
    return { imported: operations.count };
  }
}

export const operationsService = new OperationsService();