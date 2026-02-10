import { describe, expect, it, vi } from "vitest";
import { ToolRegistry, executeToolWithPolicy } from "./index";

describe("runtime", () => {
  it("blocks disputed invoices", async () => {
    const registry = new ToolRegistry();
    registry.register({ name: "send_email", input_schema: {}, output_schema: {}, handler: async () => ({ ok: true }) });
    const audit = vi.fn().mockResolvedValue(undefined);
    const res = await executeToolWithPolicy({
      registry,
      toolName: "send_email",
      input: { to: "a@b.com" },
      attemptsCount: 0,
      hasDispute: true,
      ctx: { tenantId: "t1", plan: "BULLDOG", timezone: "UTC", actor: "system", audit }
    });
    expect(res.blocked).toBe(true);
  });
});
