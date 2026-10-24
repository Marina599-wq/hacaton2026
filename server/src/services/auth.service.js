import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { prisma } from '../server.js';

export class AuthService {
  async register({ email, password, name }) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error('User already exists');

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, password: hash, name } });
    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }

  async login({ email, password }) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new Error('Invalid credentials');

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }

  async getMe(userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  }
}

export const authService = new AuthService();