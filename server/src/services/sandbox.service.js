export class SandboxService {
  async simulate(userId, data) {
    return { result: 'simulation-stub' };
  }

  async reset(userId) {
    return { reset: true };
  }
}

export const sandboxService = new SandboxService();