# Digital Employees Platform (MVP)

Multi-tenant SaaS wrapper platform for deterministic AI employees.

## Architecture
- `apps/api`: Fastify API with auth, tenant onboarding, Stripe checkout/webhook, dashboard endpoint.
- `apps/worker`: BullMQ worker that processes events and runs policy-checked tools.
- `apps/web`: Next.js dashboard routes for onboarding and operations.
- `packages/employee-runtime`: Employee loader, deterministic policy engine, tool registry.
- `packages/llm`: OpenAI wrapper with strict JSON schema validation + retry.
- `packages/integrations`: Structured stubs for xero/qb/email/vapi.
- `packages/shared`: Shared event schemas and deterministic eligibility rules.
- `employees/penny_credit_control`: Plugin employee package with manifest/prompts/schemas/playbooks/rules.
- `prisma/schema.prisma`: Multi-tenant schema.

## Local Development
1. Copy `.env.example` to `.env`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma client:
   ```bash
   npx prisma generate
   ```
4. Start infra and apps:
   ```bash
   docker compose up --build
   ```

## Deterministic Controls
- Runtime checks do-not-contact flags.
- Runtime enforces business hours.
- Runtime enforces plan gating for calls (BULLDOG only).
- Runtime logs all policy blocks and tool calls to audit logs.
- Idempotency keys are deterministic and written on chase attempts.

## Testing
- Unit tests in `packages/shared` and `packages/employee-runtime` cover:
  - eligibility rules
  - business-hours enforcement
  - dispute stop
  - idempotency key generation
- Worker integration placeholder test included for event flow scaffolding.


## Deployment
- Production VPS deployment guide: [`docs/DEPLOY_VPS.md`](docs/DEPLOY_VPS.md)
- Includes step-by-step instructions for:
  - cloning from GitHub
  - server setup (Docker, Nginx, SSL)
  - where to place API keys and SaaS env vars
  - Stripe webhook setup
  - ongoing deploy workflow
