"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import StretchGoal from "./StretchGoal";
import type { LeaderRow, RunResult } from "@/lib/stretch/core";
import type { DailyTally } from "./StretchGoal";

/**
 * Host wrapper for the Stretch Goal cabinet.
 *
 * The game component takes function props (`onRunComplete`, `onTimeIn`), so
 * something client-side has to own them — the games page itself is a Server
 * Component. This is that seam, and it is the only place the mini-game API is
 * called from the browser.
 *
 * It posts `{ seed, holds }` and then refetches, rather than trusting its own
 * in-memory result: the score shown on the leaderboard is always the number the
 * server computed, even if it disagrees with what the local simulation drew.
 */

export interface StretchGoalPanelProps {
  unlocked: boolean;
  runUsed: boolean;
  runState: "available" | "started" | "submitted";
  seed: number | null;
  seasonLabel: string;
  season: string;
  leaderboard: LeaderRow[];
  dailyTally: DailyTally;
  myRank: number | null;
}

interface SessionResponse {
  unlocked: boolean;
  runUsed: boolean;
  runState: "available" | "started" | "submitted";
  seed: number | null;
  season: string;
}

interface LeaderboardResponse {
  myRank: number | null;
  rows: LeaderRow[];
  today: DailyTally;
}

export function StretchGoalPanel({
  unlocked: initialUnlocked,
  runUsed: initialRunUsed,
  runState: initialRunState,
  seed: initialSeed,
  seasonLabel,
  season,
  leaderboard: initialLeaderboard,
  dailyTally: initialTally,
  myRank: initialRank,
}: StretchGoalPanelProps) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [runUsed, setRunUsed] = useState(initialRunUsed);
  const [runState, setRunState] = useState(initialRunState);
  const [seed, setSeed] = useState(initialSeed);
  const [rows, setRows] = useState(initialLeaderboard);
  const [tally, setTally] = useState(initialTally);
  const [rank, setRank] = useState(initialRank);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    const [sessionRes, boardRes] = await Promise.all([
      fetch("/api/minigame/session", { cache: "no-store" }),
      fetch(`/api/minigame/leaderboard?season=${encodeURIComponent(season)}`, {
        cache: "no-store",
      }),
    ]);
    if (sessionRes.ok) {
      const next = (await sessionRes.json()) as SessionResponse;
      setUnlocked(next.unlocked);
      setRunUsed(next.runUsed);
      setRunState(next.runState);
      setSeed(next.seed);
    }
    if (boardRes.ok) {
      const next = (await boardRes.json()) as LeaderboardResponse;
      setRows(next.rows);
      setRank(next.myRank);
      setTally(next.today);
    }
  }, [season]);

  /**
   * Claim today's attempt before the run begins. Returning false stops the game
   * starting at all, so a spent day cannot be replayed.
   */
  const onRunStart = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/minigame/start", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "That run couldn’t be started.");
        await refetch().catch(() => {});
        return false;
      }
      // Reflect the spend straight away, so a second tab cannot start too.
      setRunUsed(true);
      setRunState("started");
      return true;
    } catch {
      setError("Couldn’t reach the server — your run wasn’t started.");
      return false;
    }
  }, [refetch]);

  const onRunComplete = useCallback(
    async (result: RunResult) => {
      setError("");
      try {
        const res = await fetch("/api/minigame/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Only the seed and the input log. There is deliberately no score
          // field here — the server computes it by replaying these holds.
          body: JSON.stringify({ seed: result.seed, holds: result.holds }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "That run couldn’t be recorded.");
        }
      } catch {
        setError("Couldn’t reach the server — your run wasn’t recorded.");
      } finally {
        await refetch().catch(() => {
          /* the cabinet already shows the local result; leave it be */
        });
      }
    },
    [refetch],
  );

  return (
    <div className="space-y-3">
      <StretchGoal
        unlocked={unlocked}
        runUsed={runUsed}
        seed={seed ?? undefined}
        abandoned={runState === "started"}
        seasonLabel={seasonLabel}
        leaderboard={rows}
        dailyTally={tally}
        rankLabel={rank ? `#${rank}` : undefined}
        onTimeIn={() => router.push("/va")}
        onRunStart={onRunStart}
        onRunComplete={onRunComplete}
      />

      {error && (
        <p
          role="status"
          className="rounded-lg border border-brand-orange-200 bg-brand-orange-50 px-3 py-2 text-sm text-brand-orange-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
