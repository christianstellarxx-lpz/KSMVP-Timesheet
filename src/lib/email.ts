import "server-only";
import { env } from "./env";

/**
 * Sends one plain-text email through Resend. Plain text on purpose: feedback
 * bodies are user text, so there is no HTML to inject into.
 * Never throws — a mail failure must never break the action that triggered it.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = env.resendApiKey;
  const from = env.emailFrom;
  if (!key || !from) return; // not configured: silently skip

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("Resend send failed", res.status, await res.text());
  } catch (e) {
    console.error("Resend send failed", e);
  }
}
