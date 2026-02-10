import Ajv, { JSONSchemaType } from "ajv";
import OpenAI from "openai";

const ajv = new Ajv();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type LogFn = (event: { prompt: string; response: string; ok: boolean }) => Promise<void>;

async function withSchema<T>(prompt: string, schema: JSONSchemaType<T>, log: LogFn): Promise<T> {
  const validate = ajv.compile(schema);
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `${prompt}\nRespond only with valid JSON.` }],
      temperature: 0.2
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(content) as T;
      const ok = validate(parsed);
      await log({ prompt, response: content, ok: Boolean(ok) });
      if (ok) return parsed;
    } catch {
      await log({ prompt, response: content, ok: false });
    }
  }
  throw new Error("Invalid structured LLM response after retry");
}

export const generateEmailDraft = withSchema;
export const classifyReply = withSchema;
export const summarizeCall = withSchema;
export const generateReportNarrative = withSchema;
