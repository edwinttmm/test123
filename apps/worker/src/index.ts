import { Queue, Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { emailProvider, vapi } from "@digital/integrations";
import { ToolRegistry, executeToolWithPolicy } from "@digital/employee-runtime";

const prisma = new PrismaClient();
const connection = { url: process.env.REDIS_URL || "redis://localhost:6379" };

export const eventsQueue = new Queue("events", { connection });

const registry = new ToolRegistry();
registry.register({
  name: "send_email",
  input_schema: {},
  output_schema: {},
  handler: async (_ctx, input: any) => emailProvider.sendEmail(input)
});
registry.register({
  name: "start_outbound_call",
  input_schema: {},
  output_schema: {},
  required_plan: "BULLDOG",
  handler: async (_ctx, input: any) => vapi.startOutboundCall(input)
});

new Worker(
  "events",
  async (job) => {
    const event = job.data;
    const tenant = await prisma.tenant.findUnique({ where: { id: event.tenantId } });
    if (!tenant || !tenant.automations_enabled) return;

    const invoice = await prisma.invoice.findFirst({ where: { tenant_id: tenant.id } });
    if (!invoice) return;
    const customer = await prisma.customer.findUnique({ where: { id: invoice.customer_id } });

    const toolName = event.type === "INVOICE_OVERDUE" ? "start_outbound_call" : "send_email";
    const result = await executeToolWithPolicy({
      registry,
      toolName,
      input: toolName === "send_email" ? { to: customer?.email, subject: "Payment reminder", body: "Please settle invoice" } : { phone: customer?.phone, script: "Hello from Penny" },
      hasDispute: false,
      attemptsCount: await prisma.chaseAttempt.count({ where: { invoice_id: invoice.id } }),
      doNotCall: customer?.do_not_call,
      doNotEmail: customer?.do_not_email,
      ctx: {
        tenantId: tenant.id,
        plan: tenant.plan,
        timezone: tenant.timezone,
        actor: "system",
        audit: (entry) => prisma.auditLog.create({ data: {
          tenant_id: tenant.id,
          actor: "system",
          action_type: String(entry.action_type),
          entity_type: "invoice",
          entity_id: invoice.id,
          payload: entry
        } }).then(() => undefined)
      }
    });

    await prisma.chaseAttempt.create({
      data: {
        tenant_id: tenant.id,
        invoice_id: invoice.id,
        channel: toolName === "send_email" ? "email" : "call",
        template_id: event.type,
        idempotency_key: result.blocked ? `${invoice.id}-${event.type}-blocked` : result.idempotencyKey,
        outcome: result.blocked ? `blocked:${result.reason}` : "sent",
        raw_payload: result,
        sent_at: new Date()
      }
    });
  },
  { connection }
);
