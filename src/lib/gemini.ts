import "server-only";
import { env } from "./env";

/**
 * Gemini rewrites a VA's Start of Day into a past-tense End-of-Day DRAFT.
 *
 * It is only ever a draft: the VA reviews and edits it before submitting,
 * because "planned" is not "done". Callers fall back to the original text when
 * this returns null, so Gemini being down, slow, over quota or unconfigured
 * never blocks an End of Day.
 *
 * Only the task text is sent — no names, emails or ids. On the free tier Google
 * may use and human-review what is sent (see the Gemini API terms).
 */

const TIMEOUT_MS = 8000;

const INSTRUCTION = [
  "You turn a virtual assistant's start-of-day task list into their end-of-day report.",
  "Rewrite every task in the past tense, as work that was done today.",
  "Keep every task, in the same order, with the same list formatting (bullets, numbering, line breaks).",
  "Do not add tasks, details, results or commentary, and do not drop any task.",
  "Keep names, numbers and links exactly as written.",
  "Reply with only the rewritten text: no preamble, no quotes, no headings.",
].join(" ");

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}

/** True when a Gemini key is configured, i.e. drafts are AI-written. */
export function geminiEnabled(): boolean {
  return env.geminiApiKey != null;
}

/** The past-tense draft, or null when Gemini is unavailable for any reason. */
export async function draftEndOfDay(startOfDayTasks: string): Promise<string | null> {
  const apiKey = env.geminiApiKey;
  if (!apiKey || !startOfDayTasks.trim()) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    env.geminiModel,
  )}:generateContent`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: startOfDayTasks }] }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Status only — never log the VA's task text.
      console.error(`Gemini draft failed: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as GenerateContentResponse;
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    console.error(`Gemini draft failed: ${e instanceof Error ? e.name : "error"}`);
    return null;
  }
}
