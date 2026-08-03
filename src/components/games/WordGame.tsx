"use client";

import { useCallback, useEffect, useState } from "react";
import type { WordGameState, WordLeaderRow } from "@/lib/word/game";
import {
  MAX_GUESSES,
  WORD_LENGTH,
  checkPlayEligibility,
  keyboardStates,
  type Tile,
} from "@/lib/word/logic";

/**
 * Daily Word Guess — the play surface.
 *
 * Deliberately thin: it never knows the answer. It posts a guess to
 * /api/word/guess and renders whatever colour pattern the server returns, so
 * the word is never in page source. The board is fully server-restored on
 * reload — refreshing mid-attempt neither loses nor gains a guess.
 */

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;

export function WordGame({
  initialState,
  meId,
}: {
  initialState: WordGameState;
  meId: string;
}) {
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [shake, setShake] = useState(false);
  const [revealRow, setRevealRow] = useState<number | null>(null);

  // Same gate function the server runs, so the keyboard is never live for a
  // guess the server would reject. The server remains the authority.
  const gate = checkPlayEligibility({
    clockedInToday: state.clockedInToday,
    solved: state.solved,
    completed: state.finished,
    guessesUsed: state.guesses.length,
  });
  const locked = gate.block === "NOT_CLOCKED_IN";
  const playable = gate.canPlay && !busy;

  const submit = useCallback(async () => {
    if (draft.length !== WORD_LENGTH) {
      setMessage(`Words are ${WORD_LENGTH} letters.`);
      setShake(true);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/word/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: draft }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body?.error ?? "That guess didn’t go through.");
        setShake(true);
        return;
      }
      const next = body as WordGameState;
      setState(next);
      setRevealRow(next.guesses.length - 1);
      setDraft("");
    } catch {
      setMessage("Couldn’t reach the server — check your connection.");
      setShake(true);
    } finally {
      setBusy(false);
    }
  }, [draft]);

  const press = useCallback(
    (key: string) => {
      if (!playable) return;
      setMessage("");
      if (key === "ENTER") {
        void submit();
      } else if (key === "BACK") {
        setDraft((d) => d.slice(0, -1));
      } else if (/^[a-z]$/.test(key)) {
        setDraft((d) => (d.length < WORD_LENGTH ? d + key : d));
      }
    },
    [playable, submit],
  );

  // Physical keyboard. Never hijacks typing inside a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Enter") {
        e.preventDefault();
        press("ENTER");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        press("BACK");
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        press(e.key.toLowerCase());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  // Clear the shake class once the animation has played.
  useEffect(() => {
    if (!shake) return;
    const id = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(id);
  }, [shake]);

  const keyStates = keyboardStates(state.guesses, state.patterns);

  return (
    <section className="card overflow-hidden" aria-label="Daily Word Guess">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--border)] bg-brand-blue-50/50 px-4 py-3 sm:px-6">
        <div>
          <h2 className="font-heading text-base font-bold text-brand-blue-700">
            🔤 Daily Word Guess
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            One shared word a day · {MAX_GUESSES} guesses · unlocks at Time In
          </p>
        </div>
        {state.streak > 0 && (
          <span className="chip bg-brand-orange-100 text-brand-orange-800">
            🔥 {state.streak}-day streak
          </span>
        )}
      </header>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-8">
        <div className="mx-auto w-full max-w-[20rem]">
          {locked ? (
            <LockedPanel />
          ) : (
            <>
              <Board
                guesses={state.guesses}
                patterns={state.patterns}
                draft={draft}
                revealRow={revealRow}
                shake={shake}
                solved={state.solved}
              />

              {/* Status line — also the live region for screen readers. */}
              <p
                aria-live="polite"
                className={`mt-3 min-h-[1.25rem] text-center text-sm ${
                  message
                    ? "font-heading font-semibold text-brand-orange-700"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {message ||
                  (state.finished
                    ? ""
                    : `${state.guessesLeft} guess${state.guessesLeft === 1 ? "" : "es"} left`)}
              </p>

              {state.finished ? (
                <ResultPanel state={state} />
              ) : (
                <Keyboard
                  keyStates={keyStates}
                  onPress={press}
                  disabled={!playable}
                />
              )}
            </>
          )}
        </div>

        <Leaderboard
          rows={state.leaderboard}
          meId={meId}
          monthLabel={state.monthLabel}
          monthPoints={state.monthPoints}
          scoringSummary={state.scoringSummary}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const TILE_CLASS: Record<Tile, string> = {
  green: "bg-emerald-600 text-white border-emerald-600",
  yellow: "bg-brand-yellow-400 text-brand-yellow-900 border-brand-yellow-400",
  grey: "bg-brand-blue-300 text-white border-brand-blue-300",
};

const TILE_LABEL: Record<Tile, string> = {
  green: "correct",
  yellow: "wrong spot",
  grey: "not in word",
};

function Board({
  guesses,
  patterns,
  draft,
  revealRow,
  shake,
  solved,
}: {
  guesses: string[];
  patterns: Tile[][];
  draft: string;
  revealRow: number | null;
  shake: boolean;
  solved: boolean;
}) {
  const rows = Array.from({ length: MAX_GUESSES }, (_, row) => row);
  const draftRow = guesses.length;

  return (
    <div className="grid grid-cols-1 gap-1.5" role="group" aria-label="Guess grid">
      {rows.map((row) => {
        const guess = guesses[row];
        const pattern = patterns[row];
        const isDraft = row === draftRow;
        const revealing = row === revealRow;
        const winning = solved && row === guesses.length - 1;

        return (
          <div
            key={row}
            className={`grid grid-cols-5 gap-1.5 ${
              isDraft && shake ? "animate-tile-shake" : ""
            }`}
          >
            {Array.from({ length: WORD_LENGTH }, (_, col) => {
              const letter = guess?.[col] ?? (isDraft ? draft[col] : undefined);
              const tile = pattern?.[col];

              return (
                <div
                  key={col}
                  className={`grid aspect-square place-items-center rounded-lg border-2 font-heading text-xl font-bold uppercase transition-colors sm:text-2xl ${
                    tile
                      ? TILE_CLASS[tile]
                      : letter
                        ? "border-brand-blue-300 bg-white text-[var(--text)] animate-tile-pop"
                        : "border-[var(--border)] bg-white text-transparent"
                  } ${revealing ? "animate-tile-reveal" : ""} ${
                    winning ? "animate-tile-bounce" : ""
                  }`}
                  style={
                    revealing || winning
                      ? { animationDelay: `${col * 90}ms` }
                      : undefined
                  }
                  aria-label={
                    letter && tile
                      ? `${letter.toUpperCase()}, ${TILE_LABEL[tile]}`
                      : letter
                        ? letter.toUpperCase()
                        : "empty"
                  }
                >
                  {letter ?? ""}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// On-screen keyboard
// ---------------------------------------------------------------------------

const KEY_CLASS: Record<Tile, string> = {
  green: "bg-emerald-600 text-white",
  yellow: "bg-brand-yellow-400 text-brand-yellow-900",
  grey: "bg-brand-blue-300 text-white",
};

function Keyboard({
  keyStates,
  onPress,
  disabled,
}: {
  keyStates: Record<string, Tile>;
  onPress: (key: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 select-none space-y-1.5" aria-label="Keyboard">
      {KEY_ROWS.map((row, i) => (
        <div key={row} className="flex justify-center gap-1">
          {i === 2 && (
            <KeyButton
              label="Enter"
              wide
              disabled={disabled}
              onPress={() => onPress("ENTER")}
            />
          )}
          {[...row].map((letter) => (
            <KeyButton
              key={letter}
              label={letter}
              tile={keyStates[letter]}
              disabled={disabled}
              onPress={() => onPress(letter)}
            />
          ))}
          {i === 2 && (
            <KeyButton
              label="⌫"
              ariaLabel="Backspace"
              wide
              disabled={disabled}
              onPress={() => onPress("BACK")}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function KeyButton({
  label,
  ariaLabel,
  tile,
  wide = false,
  disabled,
  onPress,
}: {
  label: string;
  ariaLabel?: string;
  tile?: Tile;
  wide?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      onClick={onPress}
      className={`flex min-h-[44px] flex-1 items-center justify-center rounded-md font-heading text-sm font-semibold uppercase transition-colors disabled:opacity-50 ${
        wide ? "min-w-[3.25rem] px-1 text-[11px]" : "min-w-0 px-0"
      } ${tile ? KEY_CLASS[tile] : "bg-brand-blue-50 text-brand-blue-800 hover:bg-brand-blue-100"}`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// End states
// ---------------------------------------------------------------------------

function LockedPanel() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-12 text-center">
      <span className="text-4xl" aria-hidden>
        🔒
      </span>
      <p className="mt-3 font-heading text-lg font-bold text-brand-blue-700">
        Clock in to play
      </p>
      <p className="mt-1 max-w-[16rem] text-sm text-[var(--text-muted)]">
        Today’s word unlocks once you’ve clocked in. Come back after Time In!
      </p>
    </div>
  );
}

/** Milestone 5 — the spoiler-free brag grid. */
function ResultPanel({ state }: { state: WordGameState }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!state.shareText) return;
    try {
      await navigator.clipboard.writeText(state.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/60 p-4 text-center">
      {state.solved ? (
        <>
          <p className="font-heading text-lg font-bold text-emerald-700">
            🎉 Solved in {state.guesses.length}/{MAX_GUESSES}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Nice one. Come back tomorrow to keep the streak alive.
          </p>
        </>
      ) : (
        <>
          <p className="font-heading text-lg font-bold text-brand-blue-700">
            Today’s word was{" "}
            <span className="uppercase tracking-wide text-brand-orange-600">
              {state.answer}
            </span>
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Not this time — you still earned a point for showing up. New word
            tomorrow.
          </p>
        </>
      )}

      {state.shareText && (
        <>
          <pre className="mx-auto mt-3 w-fit whitespace-pre text-center text-base leading-tight">
            {state.shareText.split("\n").slice(1).join("\n")}
          </pre>
          <button
            type="button"
            onClick={copy}
            className="btn-primary mt-3 w-full text-sm"
          >
            {copied ? "Copied!" : "Copy result"}
          </button>
          <p className="field-hint">
            Safe to paste in team chat — it shows how you solved it, not the
            word.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly leaderboard (rendered from the swappable resolver's rows)
// ---------------------------------------------------------------------------

function Leaderboard({
  rows,
  meId,
  monthLabel,
  monthPoints,
  scoringSummary,
}: {
  rows: WordLeaderRow[];
  meId: string;
  monthLabel: string;
  monthPoints: number;
  scoringSummary: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="field-label mb-0">🏆 Leaderboard — {monthLabel}</p>
        <span className="chip bg-brand-blue-50 text-brand-blue-800">
          You: {monthPoints} pt{monthPoints === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-[var(--surface-muted)] px-3 py-4 text-center text-sm text-[var(--text-muted)]">
          No one has played this month yet. Be the first!
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
          {rows.map((r) => {
            const isMe = r.userId === meId;
            return (
              <li
                key={r.userId}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                  isMe ? "bg-brand-blue-50" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-center">{medal(r.rank)}</span>
                  <span className="min-w-0">
                    <span
                      className={`block truncate ${
                        isMe
                          ? "font-heading font-bold text-brand-blue-700"
                          : "text-[var(--text)]"
                      }`}
                    >
                      {r.name}
                      {isMe && " (you)"}
                      {r.streak >= 2 && (
                        <span
                          className="ml-1.5 text-xs text-brand-orange-600"
                          title={`${r.streak}-day streak`}
                        >
                          🔥{r.streak}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {r.detail}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 font-heading font-bold tabular-nums text-[var(--text)]">
                  {r.points}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="field-hint">{scoringSummary}</p>
    </div>
  );
}

function medal(rank: number): string {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank);
}
