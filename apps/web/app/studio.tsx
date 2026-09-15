"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Example = { id: string; label: string; url: string; prompt: string; slug: string };

type Envelope = {
  ok: true;
  fetched_at: string;
  cache_ttl_s: number;
  source_url: string;
  data: unknown;
  warnings: string[];
};

type Run = {
  slug: string;
  url: string;
  prompt: string;
  published: boolean;
  cache_ttl_s: number;
  last_success_at: string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  fetched_at: string | null;
};

type StudioSource = {
  slug: string;
  url: string;
  prompt: string;
  schema: unknown;
  instructions: string;
  cache_ttl_s: number;
  published: boolean;
  last_success_at: string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  envelope: Envelope | null;
};

function asTable(data: unknown): { columns: string[]; rows: Record<string, unknown>[] } | null {
  let list: unknown = data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const values = Object.values(data as Record<string, unknown>);
    const arrays = values.filter((v) => Array.isArray(v));
    if (arrays.length === 1) list = arrays[0];
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  if (!list.every((row) => row && typeof row === "object" && !Array.isArray(row))) return null;
  const rows = list as Record<string, unknown>[];
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return { columns, rows };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } };
    return body.error?.message || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function Studio() {
  const [examples, setExamples] = useState<Example[]>([]);
  const [apiKey, setApiKey] = useState("dev-key-change-me");
  const [url, setUrl] = useState("https://news.ycombinator.com");
  const [prompt, setPrompt] = useState("top stories with rank, title, points, comment count, url");
  const [slug, setSlug] = useState("hn-top-stories");
  const [ttl, setTtl] = useState(60);
  const [schemaText, setSchemaText] = useState("");
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveSlug, setLiveSlug] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  const endpoint = liveSlug ? `${origin}/v1/e/${liveSlug}` : "";
  const openapi = liveSlug ? `${origin}/v1/e/${liveSlug}/openapi.json` : "";
  const curl = liveSlug
    ? `curl -H "Authorization: Bearer ${apiKey}" "${origin}/v1/e/${liveSlug}"`
    : "";

  const table = useMemo(() => asTable(envelope?.data), [envelope]);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/ui/sources");
    if (!res.ok) return;
    const body = (await res.json()) as { sources?: Run[] };
    setRuns(body.sources ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/ui/config");
      if (res.ok) {
        const cfg = (await res.json()) as { api_key?: string; cache_ttl_s?: number; examples?: Example[] };
        if (cfg.api_key) setApiKey(cfg.api_key);
        if (cfg.cache_ttl_s) setTtl(cfg.cache_ttl_s);
        if (cfg.examples?.length) setExamples(cfg.examples);
      }
      await loadRuns();
    })();
  }, [loadRuns]);

  function applyStudio(studio: StudioSource) {
    setLiveSlug(studio.slug);
    setUrl(studio.url);
    setPrompt(studio.prompt);
    setSlug(studio.slug);
    setTtl(studio.cache_ttl_s);
    setPublished(studio.published);
    setSchemaText(JSON.stringify(studio.schema, null, 2));
    setEnvelope(studio.envelope);
    if (studio.last_error) setError(studio.last_error);
  }

  function parseSchema(): unknown | undefined {
    const trimmed = schemaText.trim();
    if (!trimmed) return undefined;
    return JSON.parse(trimmed) as unknown;
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy("create");
    try {
      let schema: unknown;
      try {
        schema = parseSchema();
      } catch {
        throw new Error("Schema JSON is invalid.");
      }
      const res = await fetch("/api/ui/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          prompt,
          slug: slug.trim() || undefined,
          cache_ttl_s: ttl,
          schema,
        }),
      });
      const body = (await res.json()) as {
        slug?: string;
        schema?: unknown;
        instructions?: string;
        error?: { code?: string; message?: string; details?: { slug?: string } };
        fetched_at?: string;
        cache_ttl_s?: number;
        source_url?: string;
        data?: unknown;
        warnings?: string[];
      };
      if (res.status === 409 && body.error?.details?.slug) {
        const existing = await fetch(`/api/ui/sources/${body.error.details.slug}`);
        if (existing.ok) {
          applyStudio((await existing.json()) as StudioSource);
          setNotice("That slug already exists — loaded it.");
          await loadRuns();
          return;
        }
      }
      if (!res.ok) throw new Error(body.error?.message || (await readError(res)));
      applyStudio({
        slug: body.slug!,
        url: body.source_url || url,
        prompt,
        schema: body.schema,
        instructions: body.instructions ?? "",
        cache_ttl_s: body.cache_ttl_s ?? ttl,
        published: true,
        last_success_at: body.fetched_at ?? null,
        last_error: null,
        last_duration_ms: null,
        envelope: {
          ok: true,
          fetched_at: body.fetched_at!,
          cache_ttl_s: body.cache_ttl_s ?? ttl,
          source_url: body.source_url || url,
          data: body.data,
          warnings: body.warnings ?? [],
        },
      });
      setNotice(`Published /v1/e/${body.slug}`);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRefresh() {
    if (!liveSlug) return;
    setError(null);
    setNotice(null);
    setBusy("refresh");
    try {
      let schema: unknown;
      try {
        schema = parseSchema();
      } catch {
        throw new Error("Schema JSON is invalid.");
      }
      const res = await fetch(`/api/ui/sources/${liveSlug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema, cache_ttl_s: ttl, reextract: true }),
      });
      if (!res.ok) throw new Error(await readError(res));
      applyStudio((await res.json()) as StudioSource);
      setNotice("Refreshed.");
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onTogglePublish(next: boolean) {
    if (!liveSlug) {
      setPublished(next);
      return;
    }
    setPublished(next);
    const res = await fetch(`/api/ui/sources/${liveSlug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ published: next }),
    });
    if (!res.ok) setError(await readError(res));
    else await loadRuns();
  }

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setNotice(`Copied ${label}`);
  }

  async function loadRun(runSlug: string) {
    setError(null);
    const res = await fetch(`/api/ui/sources/${runSlug}`);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    applyStudio((await res.json()) as StudioSource);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 font-sans">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm tracking-widest text-[var(--muted)] uppercase">Create an endpoint</p>
          <h1 className="font-serif text-5xl font-normal tracking-tight">SiteAPI</h1>
          <p className="mt-2 max-w-xl text-[var(--muted)]">
            Paste a URL. Describe the data. Get a stable endpoint.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="rounded-full border border-[var(--line)] px-3 py-1 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--fg)]"
              onClick={() => {
                setUrl(ex.url);
                setPrompt(ex.prompt);
                setSlug(ex.slug);
                setError(null);
                setNotice(null);
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-[var(--line)] px-4 py-3 text-sm text-[var(--accent)]">{notice}</p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <form className="flex flex-col gap-4" onSubmit={onCreate}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">URL</span>
            <input
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
              placeholder="https://news.ycombinator.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">What data do you want?</span>
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Slug (optional)</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
              placeholder="hn-top-stories"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">
              Cache TTL · {ttl}s
            </span>
            <input
              type="range"
              min={5}
              max={3600}
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
              onMouseUp={() => {
                if (liveSlug) {
                  void fetch(`/api/ui/sources/${liveSlug}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ cache_ttl_s: ttl }),
                  });
                }
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Schema (JSON, optional — inferred on create)</span>
            <textarea
              rows={10}
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 font-mono text-xs outline-none focus:border-[var(--accent)]"
              placeholder='{ "type": "object", "properties": { "stories": { "type": "array" } } }'
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={Boolean(busy)}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-black disabled:opacity-50"
            >
              {busy === "create" ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              disabled={!liveSlug || Boolean(busy)}
              onClick={() => void onRefresh()}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy === "refresh" ? "Refreshing…" : "Refresh / test"}
            </button>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => void onTogglePublish(e.target.checked)}
              />
              Publish
            </label>
          </div>
        </form>

        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-[var(--line)] p-4">
            <p className="mb-2 text-sm text-[var(--muted)]">Endpoint</p>
            {liveSlug && published ? (
              <div className="flex flex-col gap-2">
                <code className="break-all font-mono text-sm">{endpoint}</code>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
                    onClick={() => void copy(endpoint, "endpoint")}
                  >
                    Copy URL
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
                    onClick={() => void copy(curl, "curl")}
                  >
                    Copy curl
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
                    onClick={() => void copy(openapi, "OpenAPI URL")}
                  >
                    Copy OpenAPI
                  </button>
                </div>
                <pre className="overflow-auto font-mono text-xs text-[var(--muted)]">{curl}</pre>
                <p className="break-all font-mono text-xs text-[var(--muted)]">{openapi}</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                {liveSlug ? "Unpublished — public GET is off." : "Create a source to copy the endpoint."}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-[var(--line)] p-4">
            <p className="mb-2 text-sm text-[var(--muted)]">Preview</p>
            {envelope ? (
              table ? (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr>
                        {table.columns.map((col) => (
                          <th key={col} className="border-b border-[var(--line)] px-2 py-1 font-normal text-[var(--muted)]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.slice(0, 30).map((row, i) => (
                        <tr key={i}>
                          {table.columns.map((col) => (
                            <td key={col} className="border-b border-[var(--line)] px-2 py-1 font-mono">
                              {String(row[col] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="max-h-80 overflow-auto font-mono text-xs">
                  {JSON.stringify(envelope.data, null, 2)}
                </pre>
              )
            ) : (
              <p className="text-sm text-[var(--muted)]">No payload yet.</p>
            )}
            {envelope?.warnings?.length ? (
              <ul className="mt-2 list-disc pl-4 text-xs text-[var(--muted)]">
                {envelope.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 font-serif text-2xl">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">None yet.</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-[var(--line)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-[var(--muted)]">
                  <th className="px-3 py-2 font-normal">Slug</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Latency</th>
                  <th className="px-3 py-2 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.slug} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-mono text-[var(--accent)] underline"
                        onClick={() => void loadRun(run.slug)}
                      >
                        {run.slug}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {run.last_error ? "error" : run.published ? "ok" : "draft"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {run.last_duration_ms != null ? `${run.last_duration_ms}ms` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[var(--muted)]">
                      {run.fetched_at ? new Date(run.fetched_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
