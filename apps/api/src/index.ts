import Fastify from "fastify";
import jwt from "fastify-jwt";
import Stripe from "stripe";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";
import { loadEmployees } from "@digital/employee-runtime";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-09-30.acacia" });

const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(process.env.SECRETS_ENCRYPTION_KEY || "change-me-in-env")
  .digest();

type AuthUser = {
  userId: string;
  tenantId: string;
  role: UserRole;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

app.register(jwt, { secret: process.env.JWT_SECRET || "secret" });

app.setErrorHandler((err, _req, reply) => {
  const statusCode = (err as any).statusCode || 500;
  reply.status(statusCode).send({ error: err.message });
});

app.addHook("preHandler", async (req) => {
  if (req.url.startsWith("/auth") || req.url === "/health" || req.url.startsWith("/billing/webhook")) {
    return;
  }

  try {
    await req.jwtVerify();
    const payload = req.user as AuthUser;
    req.authUser = payload;
  } catch {
    // noop here; route-level guards handle this consistently.
  }
});

function fail(statusCode: number, message: string): never {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = statusCode;
  throw err;
}

function requireAuth(req: any) {
  if (!req.authUser) fail(401, "Authentication required");
  return req.authUser as AuthUser;
}

function requireRole(req: any, allowed: UserRole[]) {
  const authUser = requireAuth(req);
  if (!allowed.includes(authUser.role)) {
    fail(403, "Insufficient permissions");
  }
  return authUser;
}

function encryptSecret(raw: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`;
}

function decryptSecret(encoded: string) {
  const [ivHex, tagHex, dataHex] = encoded.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

app.get("/health", async () => ({ ok: true, employees: loadEmployees().map((e) => e.key) }));

app.post("/auth/signup", async (req) => {
  const body = req.body as { email: string; password: string; tenantName: string };
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) fail(409, "Email already exists");

  const password_hash = await bcrypt.hash(body.password, 12);
  const tenant = await prisma.tenant.create({ data: { name: body.tenantName, timezone: "UTC" } });
  const user = await prisma.user.create({ data: { tenant_id: tenant.id, email: body.email, password_hash, role: "owner" } });

  const token = app.jwt.sign({ userId: user.id, tenantId: tenant.id, role: user.role });
  return { token, user: { id: user.id, email: user.email, role: user.role }, tenantId: tenant.id };
});

app.post("/auth/login", async (req) => {
  const body = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    fail(401, "Invalid credentials");
  }

  const token = app.jwt.sign({ userId: user.id, tenantId: user.tenant_id, role: user.role });
  return { token, user: { id: user.id, email: user.email, role: user.role }, tenantId: user.tenant_id };
});

app.get("/auth/me", async (req) => {
  const authUser = requireAuth(req);
  const user = await prisma.user.findUnique({ where: { id: authUser.userId }, select: { id: true, email: true, role: true, tenant_id: true } });
  return { user };
});

app.post("/users", async (req) => {
  const authUser = requireRole(req, ["owner", "admin"]);
  const body = req.body as { email: string; password: string; role: UserRole };
  if (body.role === "owner" && authUser.role !== "owner") {
    fail(403, "Only owner can create another owner");
  }
  const password_hash = await bcrypt.hash(body.password, 12);
  const created = await prisma.user.create({
    data: {
      tenant_id: authUser.tenantId,
      email: body.email,
      password_hash,
      role: body.role
    }
  });
  return { id: created.id, email: created.email, role: created.role };
});

app.post("/tenant/integrations/keys", async (req) => {
  const authUser = requireRole(req, ["owner", "admin"]);
  const body = req.body as { provider: string; apiKey: string };
  const encrypted = encryptSecret(body.apiKey);

  await prisma.integrationSecret.upsert({
    where: {
      tenant_id_provider: {
        tenant_id: authUser.tenantId,
        provider: body.provider
      }
    },
    update: { encrypted_secret: encrypted, updated_by_user_id: authUser.userId },
    create: {
      tenant_id: authUser.tenantId,
      provider: body.provider,
      encrypted_secret: encrypted,
      updated_by_user_id: authUser.userId
    }
  });

  await prisma.auditLog.create({
    data: {
      tenant_id: authUser.tenantId,
      actor: "user",
      action_type: "integration_key_updated",
      entity_type: "integration_secret",
      entity_id: body.provider,
      payload: { provider: body.provider, updatedBy: authUser.userId }
    }
  });

  return { ok: true };
});

app.get("/tenant/integrations/keys", async (req) => {
  const authUser = requireRole(req, ["owner", "admin"]);
  const keys = await prisma.integrationSecret.findMany({ where: { tenant_id: authUser.tenantId }, select: { provider: true, updated_at: true, id: true } });
  return { keys };
});

app.get("/tenant/integrations/keys/:provider/reveal", async (req) => {
  const authUser = requireRole(req, ["owner"]);
  const { provider } = req.params as { provider: string };
  const record = await prisma.integrationSecret.findUnique({
    where: {
      tenant_id_provider: { tenant_id: authUser.tenantId, provider }
    }
  });
  if (!record) fail(404, "Key not found");
  return { provider, apiKey: decryptSecret(record.encrypted_secret) };
});

app.post("/billing/checkout", async (req) => {
  requireRole(req, ["owner", "admin"]);
  const body = req.body as { priceId: string; successUrl: string; cancelUrl: string };
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

app.get("/dashboard", async (req) => {
  const authUser = requireAuth(req);
  const invoices = await prisma.invoice.findMany({ where: { tenant_id: authUser.tenantId } });
  const overdue = invoices.filter((i) => i.status !== "PAID").length;
  return { kpis: { invoices: invoices.length, overdue }, nextActions: ["Run Penny at 09:00", "Review red list"] };
});

app.listen({ port: 4000, host: "0.0.0.0" });
