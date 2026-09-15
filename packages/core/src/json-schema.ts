import { SiteApiError } from "./errors";

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  enum?: Array<string | number | boolean | null>;
};

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]`;
}

export function parseJsonFromLlm(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.search(/[{[]/);
    const endObj = raw.lastIndexOf("}");
    const endArr = raw.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new SiteApiError("schema_mismatch", "LLM did not return JSON.", {
      preview: raw.slice(0, 240),
    });
  }
}

export function asJsonSchema(value: unknown): JsonSchema {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SiteApiError("schema_mismatch", "Inferred schema must be a JSON object.");
  }
  return value as JsonSchema;
}
