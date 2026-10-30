import type { CompletionModel } from "@anvia/core";

/** A pull request's title and its description in Markdown (decision 0040). */
export type PullRequestText = { title: string; body: string };

// Past this much of a patch the model reads the start and is told the rest was cut.
const MAX_PATCH_CHARS = 60_000;
// GitHub takes titles up to 256 characters; a model that runs on past a short line has not given one.
const MAX_TITLE_CHARS = 120;

const INSTRUCTIONS = `You write the title and description of a pull request from a diff.
Reply with the title on the first line, a blank line, then the description in Markdown: what changed and why, in a few short paragraphs or bullets. The title is one imperative line, no longer than 72 characters. Say nothing else: no preamble, and no code fence around the reply.`;

function promptFor({ intent, patch }: { intent: string; patch: string }) {
  const cut = patch.length > MAX_PATCH_CHARS;
  return [
    `What the change was for: ${intent}`,
    "",
    "The diff:",
    cut ? `${patch.slice(0, MAX_PATCH_CHARS)}\n(the rest of the diff is not shown)` : patch,
  ].join("\n");
}

// The title on the first line, the description after it. A title the model dressed up (a heading
// mark, `Title:`, quotes) is stripped; nothing usable gives `fallback`.
export function parsePullRequestText(reply: string, fallback: PullRequestText): PullRequestText {
  const [first = "", ...rest] = reply.trim().split("\n");
  const title = first
    .replace(/^#+\s*/, "")
    .replace(/^title:\s*/i, "")
    .replace(/^(["'`])(.*)\1$/, "$2")
    .trim();
  if (!title || title.length > MAX_TITLE_CHARS) return fallback;
  return { title, body: rest.join("\n").trim() || fallback.body };
}

/**
 * Writes a pull request's title and description from the patch that will be shipped and what the
 * thread was for. It is one model call with no tools; the caller decides what a failure means.
 */
export async function draftPullRequest(
  model: CompletionModel,
  input: { intent: string; patch: string },
  fallback: PullRequestText,
  abortSignal?: AbortSignal,
): Promise<PullRequestText> {
  const response = await model.completion(
    {
      instructions: INSTRUCTIONS,
      chatHistory: [{ role: "user", content: [{ type: "text", text: promptFor(input) }] }],
      documents: [],
      tools: [],
    },
    { abortSignal },
  );
  const reply = response.choice.map((part) => (part.type === "text" ? part.text : "")).join("");
  return parsePullRequestText(reply, fallback);
}
