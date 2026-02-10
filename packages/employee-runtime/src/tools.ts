import { ToolRegistry } from "./index";
import { emailProvider, vapi, xero } from "@digital/integrations";

export function registerDefaultTools(registry: ToolRegistry) {
  registry.register({ name: "send_email", input_schema: {}, output_schema: {}, handler: async (_, input: any) => emailProvider.sendEmail(input) });
  registry.register({ name: "get_open_invoices", input_schema: {}, output_schema: {}, handler: async () => ({ invoices: [] }) });
  registry.register({ name: "mark_invoice_paid", input_schema: {}, output_schema: {}, handler: async (_, input: any) => ({ marked: true, invoiceId: input.invoiceId }) });
  registry.register({ name: "fetch_transactions", input_schema: {}, output_schema: {}, handler: async () => xero.fetchTransactions() });
  registry.register({ name: "start_outbound_call", input_schema: {}, output_schema: {}, required_plan: "BULLDOG", handler: async (_, input: any) => vapi.startOutboundCall(input) });
  registry.register({ name: "create_owner_task", input_schema: {}, output_schema: {}, handler: async (_, input: any) => ({ created: true, task: input }) });
  registry.register({ name: "generate_report_file", input_schema: {}, output_schema: {}, handler: async (_, input: any) => ({ fileUrl: `reports/${input.tenantId || 'tenant'}/red-list.csv` }) });
}
