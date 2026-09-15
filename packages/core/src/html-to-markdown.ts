import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.remove(["script", "style", "noscript", "iframe", "svg", "canvas", "form"]);

export function htmlToMarkdown(html: string): string {
  const md = turndown.turndown(html);
  return md.replace(/\n{3,}/g, "\n\n").trim();
}
