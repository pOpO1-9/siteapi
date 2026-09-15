import { z, type ZodTypeAny } from "zod";
import { SiteApiError } from "./errors";
import type { JsonSchema } from "./json-schema";

function typesOf(schema: JsonSchema): string[] {
  if (Array.isArray(schema.type)) return schema.type;
  if (schema.type) return [schema.type];
  if (schema.properties) return ["object"];
  if (schema.items) return ["array"];
  if (schema.enum) return ["string"];
  return ["object"];
}

function baseType(primary: string, schema: JsonSchema, depth: number): ZodTypeAny {
  switch (primary) {
    case "string":
      if (schema.enum?.length) {
        const literals = schema.enum.filter((v) => v !== null).map((v) => z.literal(v as string | number | boolean));
        if (literals.length === 1) return literals[0];
        if (literals.length > 1) return z.union(literals as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
      }
      return z.string();
    case "integer":
      return z.coerce.number().int();
    case "number":
      return z.coerce.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schema.items ? build(schema.items, depth + 1) : z.unknown());
    case "object":
      return objectZod(schema, depth);
    default:
      return z.unknown();
  }
}

function objectZod(schema: JsonSchema, depth: number): ZodTypeAny {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, child] of Object.entries(properties)) {
    const childZod = build(child, depth + 1);
    shape[key] = required.has(key) ? childZod : childZod.optional();
  }
  const obj = z.object(shape);
  return obj;
}

function build(schema: JsonSchema, depth: number): ZodTypeAny {
  if (depth > 12) return z.unknown();
  const types = typesOf(schema);
  const nullable = types.includes("null");
  const primary = types.find((t) => t !== "null") ?? "object";
  let zod = baseType(primary, schema, depth);
  if (nullable) zod = zod.nullable();
  return zod;
}

export function zodFromJsonSchema(schema: JsonSchema): ZodTypeAny {
  try {
    return build(schema, 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SiteApiError("schema_mismatch", "Could not compile JSON Schema to Zod.", { cause: message });
  }
}

export function formatZodIssues(err: z.ZodError): string {
  return err.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
}
