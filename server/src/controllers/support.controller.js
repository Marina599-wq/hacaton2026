import { supportService } from '../services/support.service.js';

export class SupportController {
  async createTicket(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ticket = await supportService.createTicket(userId, req.body);
    res.status(201).json(ticket);
  }

  async listTickets(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const tickets = await supportService.listTickets(userId);
    res.json(tickets);
  }
}

export const supportController = new SupportController();