import { describe, expect, it } from "vitest";
import { buildIdempotencyKey, isEligibleForAutomation } from "./index";

describe("policy", () => {
  it("blocks disputes", () => {
    expect(isEligibleForAutomation({ plan: "BULLDOG", isBusinessHours: true, hasDispute: true, attemptsCount: 0, channel: "email" }).ok).toBe(false);
  });

  it("enforces business hours", () => {
    expect(isEligibleForAutomation({ plan: "BULLDOG", isBusinessHours: false, hasDispute: false, attemptsCount: 0, channel: "email" }).reason).toBe("outside_business_hours");
  });

  it("enforces plan gating", () => {
    expect(isEligibleForAutomation({ plan: "ADMIN", isBusinessHours: true, hasDispute: false, attemptsCount: 0, channel: "call" }).reason).toBe("plan_gated");
  });

  it("builds deterministic idempotency keys", () => {
    expect(buildIdempotencyKey(["Tenant", "Invoice", "Email"])).toBe("tenant:invoice:email");
  });
});
