"use client";

import { useState } from "react";
import type { RollEmail } from "@/lib/rollcall";

export function RollCallActions({
  start,
  end,
  startReady,
  endReady,
}: {
  start: RollEmail;
  end: RollEmail;
  startReady: boolean;
  endReady: boolean;
}) {
  const [copied, setCopied] = useState<"start" | "end" | null>(null);

  async function copy(which: "start" | "end", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  // Highlight whichever report matches the current phase of the day.
  const startPrimary = startReady && !endReady;

  return (
    <div className="flex flex-col gap-2">
      <EmailRow
        label="Email Start-of-Day"
        gmailUrl={start.gmailUrl}
        primary={startPrimary}
        copied={copied === "start"}
        onCopy={() => copy("start", start.body)}
      />
      <EmailRow
        label="Email End-of-Day"
        gmailUrl={end.gmailUrl}
        primary={endReady}
        copied={copied === "end"}
        onCopy={() => copy("end", end.body)}
      />
    </div>
  );
}

function EmailRow({
  label,
  gmailUrl,
  primary,
  copied,
  onCopy,
}: {
  label: string;
  gmailUrl: string;
  primary: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex gap-2">
      <a
        href={gmailUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${primary ? "btn-action" : "btn-ghost"} flex-1 justify-center px-5 sm:flex-none`}
      >
        <GmailIcon />
        {label}
      </a>
      <button
        type="button"
        onClick={onCopy}
        className="btn-ghost px-3"
        title="Copy this report to the clipboard"
        aria-label={`Copy ${label} report`}
      >
        {copied ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M20 6 9 17l-5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect
              x="9"
              y="9"
              width="11"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M5 15V5a2 2 0 0 1 2-2h8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

function GmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m2 7 10 6 10-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
