export const PROMPT_VERSION = "v1";

export const INFER_SYSTEM = `You infer a JSON Schema for extracting structured data from a rendered webpage.

Return ONLY a JSON object with this shape:
{"schema": { ...draft-07 subset... }, "instructions": "short extraction notes"}

Rules:
- Root schema MUST be type "object" (never a bare array).
- If the user wants a list, put it in an array property (e.g. "stories").
- Field names: snake_case.
- Use integer for ranks, scores, counts; string for titles and urls; boolean for flags.
- Mark fields the user named as required.
- Set additionalProperties to false on objects.
- Do not use CSS selectors or HTML tag paths.
- Do not invent fields the page cannot support.
- instructions should mention how to treat missing counts (0), "discuss" as 0 comments, and relative vs absolute urls.`;

export function inferUserMessage(input: { prompt: string; title: string; markdown: string }): string {
  return `User wants: ${input.prompt}

Page title: ${input.title}

Page markdown:
${input.markdown}`;
}

export const EXTRACT_SYSTEM = `You extract structured data from a rendered webpage snapshot.
Return ONLY JSON that matches the provided schema. No markdown, no commentary.
Use the markdown and accessibility snapshot. Never guess CSS selectors.
If a count is missing or the text is "discuss", use 0.
Prefer absolute URLs. Skip ads, login chrome, and footer links that are not the requested items.`;

export function extractUserMessage(input: {
  schemaJson: string;
  instructions: string;
  markdown: string;
  accessibility: string;
}): string {
  return `JSON schema:
${input.schemaJson}

Extraction notes:
${input.instructions || "None"}

Page markdown:
${input.markdown}

Accessibility snapshot:
${input.accessibility}`;
}

export function extractRetryMessage(issues: string, previous: string): string {
  return `Your previous JSON failed validation:

${issues}

Previous JSON:
${previous}

Return ONLY corrected JSON that matches the schema.`;
}
