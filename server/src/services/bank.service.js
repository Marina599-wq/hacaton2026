import { bankAdapter } from '../bank-stub/bank-stub.adapter.js';

export class BankService {
  async connect(userId, data) {
    return bankAdapter.connect(data);
  }

  async sync(userId) {
    return bankAdapter.sync();
  }

  async listAccounts(userId) {
    return bankAdapter.accounts();
  }
}

export const bankService = new BankService();