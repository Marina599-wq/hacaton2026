import { sandboxService } from '../services/sandbox.service.js';

export class SandboxController {
  async simulate(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await sandboxService.simulate(userId, req.body);
    res.json(result);
  }

  async reset(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await sandboxService.reset(userId);
    res.json({ message: 'Sandbox reset successfully' });
  }
}

export const sandboxController = new SandboxController();