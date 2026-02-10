import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { buildIdempotencyKey, isEligibleForAutomation, Plan } from "@digital/shared";

export type RuntimeContext = {
  tenantId: string;
  plan: Plan;
  timezone: string;
  actor: "system" | "user";
  audit: (entry: Record<string, unknown>) => Promise<void>;
};

export type ToolDef<I = any, O = any> = {
  name: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  required_plan?: Plan;
  handler: (ctx: RuntimeContext, input: I) => Promise<O>;
};

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef) {
    this.tools.set(tool.name, tool);
  }

  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool ${name}`);
    return tool;
  }
}

export function loadEmployees(baseDir = path.resolve(process.cwd(), "employees")) {
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir).flatMap((employeeDir) => {
    const manifestPath = path.join(baseDir, employeeDir, "employee.yaml");
    if (!fs.existsSync(manifestPath)) return [];
    return [{ key: employeeDir, manifest: yaml.load(fs.readFileSync(manifestPath, "utf8")) }];
  });
}

export function inBusinessHours(now: Date) {
  const hour = now.getHours();
  return hour >= 8 && hour < 18;
}

export async function executeToolWithPolicy(opts: {
  registry: ToolRegistry;
  toolName: string;
  input: any;
  ctx: RuntimeContext;
  doNotEmail?: boolean;
  doNotCall?: boolean;
  hasDispute?: boolean;
  attemptsCount: number;
}) {
  const tool = opts.registry.get(opts.toolName);
  const channel = opts.toolName === "start_outbound_call" ? "call" : "email";
  const policy = isEligibleForAutomation({
    plan: opts.ctx.plan,
    isBusinessHours: inBusinessHours(new Date()),
    hasDispute: Boolean(opts.hasDispute),
    attemptsCount: opts.attemptsCount,
    channel,
    doNotEmail: opts.doNotEmail,
    doNotCall: opts.doNotCall
  });

  if (!policy.ok) {
    await opts.ctx.audit({ action_type: "policy_block", reason: policy.reason, tool: opts.toolName, tenant_id: opts.ctx.tenantId });
    return { blocked: true, reason: policy.reason };
  }

  const idempotencyKey = buildIdempotencyKey([opts.ctx.tenantId, opts.toolName, JSON.stringify(opts.input)]);
  const output = await tool.handler(opts.ctx, opts.input);
  await opts.ctx.audit({ action_type: "tool_call", tool: opts.toolName, input: opts.input, output, idempotencyKey, actor: opts.ctx.actor });
  return { blocked: false, output, idempotencyKey };
}

export * from "./tools";
