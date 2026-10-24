import { bankService } from '../services/bank.service.js';

export class BankController {
  async connect(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await bankService.connect(userId, req.body);
    res.json(result);
  }

  async sync(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await bankService.sync(userId);
    res.json(result);
  }

  async accounts(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const accounts = await bankService.listAccounts(userId);
    res.json(accounts);
  }
}

export const bankController = new BankController();