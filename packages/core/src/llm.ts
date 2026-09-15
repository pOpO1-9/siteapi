import { LLM_MISSING_MESSAGE } from "./constants";
import { fetchExternal } from "./http";
import { SiteApiError } from "./errors";
import { parseJsonFromLlm } from "./json-schema";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

export function llmConfig() {
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/$/, "");
  const local = /11434/.test(baseUrl) || /127\.0\.0\.1|localhost/i.test(baseUrl);
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() || (local ? "ollama" : ""),
    baseUrl,
    model: process.env.OPENAI_MODEL?.trim() || (local ? "llama3.2" : "gpt-4.1-mini"),
    ollama: /11434/.test(baseUrl),
  };
}

function contentFromPayload(body: string, ollama: boolean): string {
  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    throw new SiteApiError("llm_failed", "LLM returned non-JSON.", { preview: body.slice(0, 240) });
  }
  if (ollama) {
    const native = payload as { message?: { content?: string } };
    if (native.message?.content?.trim()) return native.message.content;
  }
  const openai = payload as { choices?: Array<{ message?: { content?: string } }> };
  const content = openai.choices?.[0]?.message?.content;
  if (content?.trim()) return content;
  throw new SiteApiError("llm_failed", "LLM returned an empty response.");
}

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const { apiKey, baseUrl, model, ollama } = llmConfig();
  if (!apiKey) {
    throw new SiteApiError("missing_api_key", LLM_MISSING_MESSAGE);
  }

  const useJsonObject = /openai\.com/i.test(baseUrl);
  const url = ollama ? `${baseUrl.replace(/\/v1$/, "")}/api/chat` : `${baseUrl}/chat/completions`;
  const body = ollama
    ? {
        model,
        messages,
        stream: false,
        format: "json",
        options: { temperature: 0, num_ctx: 8192 },
      }
    : {
        model,
        temperature: 0,
        messages,
        ...(useJsonObject ? { response_format: { type: "json_object" } } : {}),
      };

  const res = await fetchExternal(url, {
    method: "POST",
    timeoutMs: 180_000,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401 || res.status === 403) {
    throw new SiteApiError("missing_api_key", "LLM provider rejected the API key.", { status: res.status });
  }
  if (res.status >= 400) {
    throw new SiteApiError("llm_failed", `LLM request failed (${res.status}).`, {
      preview: res.body.slice(0, 400),
    });
  }

  return contentFromPayload(res.body, ollama);
}

export function mustJsonObject(text: string): Record<string, unknown> {
  const parsed = parseJsonFromLlm(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SiteApiError("schema_mismatch", "LLM JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
}
