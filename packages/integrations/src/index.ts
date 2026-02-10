export const xero = {
  async fetchTransactions() {
    return [{ id: "txn_1", amount: 10000, currency: "GBP" }];
  }
};

export const quickBooks = {
  async fetchTransactions() {
    return [{ id: "qb_txn_1", amount: 10000, currency: "GBP" }];
  }
};

export const emailProvider = {
  async sendEmail(input: { to: string; subject: string; body: string }) {
    return { providerId: "email_stub", status: "queued", input };
  }
};

export const vapi = {
  async startOutboundCall(input: { phone: string; script: string }) {
    return { callId: "call_stub", status: "initiated", input };
  }
};
