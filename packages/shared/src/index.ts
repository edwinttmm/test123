import { z } from "zod";

export type Plan = "ADMIN" | "BULLDOG";

export const EventSchema = z.object({
  tenantId: z.string(),
  type: z.enum([
    "INVOICE_DUE_SOON",
    "INVOICE_OVERDUE",
    "PAYMENT_RECEIVED",
    "CALL_TRANSCRIPT_RECEIVED",
    "WEEKLY_REPORT_DUE"
  ]),
  payload: z.record(z.any())
});

export type PlatformEvent = z.infer<typeof EventSchema>;

export type PolicyInput = {
  plan: Plan;
  doNotEmail?: boolean;
  doNotCall?: boolean;
  isBusinessHours: boolean;
  hasDispute: boolean;
  attemptsCount: number;
  channel: "email" | "call";
};

export function isEligibleForAutomation(input: PolicyInput): { ok: boolean; reason?: string } {
  if (input.hasDispute) return { ok: false, reason: "dispute_flag" };
  if (!input.isBusinessHours) return { ok: false, reason: "outside_business_hours" };
  if (input.attemptsCount >= 3) return { ok: false, reason: "max_attempts" };
  if (input.channel === "email" && input.doNotEmail) return { ok: false, reason: "do_not_email" };
  if (input.channel === "call" && input.doNotCall) return { ok: false, reason: "do_not_call" };
  if (input.channel === "call" && input.plan !== "BULLDOG") return { ok: false, reason: "plan_gated" };
  return { ok: true };
}

export function buildIdempotencyKey(parts: string[]): string {
  return parts.join(":").toLowerCase();
}
