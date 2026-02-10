import Fastify from "fastify";
import jwt from "fastify-jwt";
import Stripe from "stripe";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { loadEmployees } from "@digital/employee-runtime";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-09-30.acacia" });

app.register(jwt, { secret: process.env.JWT_SECRET || "secret" });

app.get("/health", async () => ({ ok: true, employees: loadEmployees().map((e) => e.key) }));

app.post("/auth/signup", async (req) => {
  const body = req.body as any;
  const password_hash = await bcrypt.hash(body.password, 10);
  const tenant = await prisma.tenant.create({ data: { name: body.tenantName, timezone: "UTC" } });
  const user = await prisma.user.create({ data: { tenant_id: tenant.id, email: body.email, password_hash, role: "owner" } });
  return { userId: user.id, tenantId: tenant.id };
});

app.post("/billing/checkout", async (req) => {
  const body = req.body as any;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: body.priceId, quantity: 1 }],
    success_url: body.successUrl,
    cancel_url: body.cancelUrl
  });
  return { url: session.url };
});

app.post("/billing/webhook", async (req, reply) => {
  const event = req.body as any;
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    await prisma.tenant.updateMany({
      where: { stripe_subscription_id: sub.id },
      data: {
        plan_status: sub.status,
        plan: sub.items.data[0]?.price?.nickname === "BULLDOG" ? "BULLDOG" : "ADMIN"
      }
    });
  }
  reply.send({ received: true });
});

app.get("/dashboard/:tenantId", async (req) => {
  const { tenantId } = req.params as { tenantId: string };
  const invoices = await prisma.invoice.findMany({ where: { tenant_id: tenantId } });
  const overdue = invoices.filter((i) => i.status !== "PAID").length;
  return { kpis: { invoices: invoices.length, overdue }, nextActions: ["Run Penny at 09:00", "Review red list"] };
});

app.listen({ port: 4000, host: "0.0.0.0" });
