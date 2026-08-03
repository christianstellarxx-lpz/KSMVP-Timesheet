import { describe, it, expect } from "vitest";
import answers from "@/lib/word/answers.json";
import allowed from "@/lib/word/allowed.json";
import {
  ANSWER_SHUFFLE_SEED,
  MAX_GUESSES,
  PARTICIPATION_POINT,
  STREAK_INTERVAL,
  WORD_EPOCH_DATE,
  WORD_LENGTH,
  answerForDate,
  basePointsForSolve,
  checkPlayEligibility,
  currentStreak,
  emojiGrid,
  evaluateGuess,
  isAttemptComplete,
  isWorkday,
  keyboardStates,
  monthBounds,
  monthLabel,
  monthKeyForDate,
  previousMonthKey,
  seededShuffle,
  streakBonus,
  wordDayIndex,
  workdaysBetween,
  type Tile,
} from "@/lib/word/logic";

const ANSWERS = answers as string[];
const ALLOWED = allowed as string[];
const PLAY_ORDER = seededShuffle(ANSWERS, ANSWER_SHUFFLE_SEED);

describe("word lists", () => {
  it("answers are all lowercase 5-letter words", () => {
    const bad = ANSWERS.filter((w) => !/^[a-z]{5}$/.test(w));
    expect(bad).toEqual([]);
  });

  it("allowed guesses are all lowercase 5-letter words", () => {
    const bad = ALLOWED.filter((w) => !/^[a-z]{5}$/.test(w));
    expect(bad).toEqual([]);
  });

  it("has no duplicates", () => {
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
    expect(new Set(ALLOWED).size).toBe(ALLOWED.length);
  });

  it("every answer is a legal guess", () => {
    const allowedSet = new Set(ALLOWED);
    expect(ANSWERS.filter((w) => !allowedSet.has(w))).toEqual([]);
  });

  it("covers at least a year of workdays (~260)", () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(260);
  });
});

describe("seededShuffle", () => {
  it("is deterministic for a given seed", () => {
    expect(seededShuffle(ANSWERS, ANSWER_SHUFFLE_SEED)).toEqual(
      seededShuffle(ANSWERS, ANSWER_SHUFFLE_SEED),
    );
  });

  it("keeps every word exactly once and reorders them", () => {
    expect([...PLAY_ORDER].sort()).toEqual([...ANSWERS].sort());
    expect(PLAY_ORDER).not.toEqual(ANSWERS);
  });

  it("does not mutate its input", () => {
    const input = ["a", "b", "c", "d", "e"];
    seededShuffle(input, 42);
    expect(input).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("date-seeded selection", () => {
  it("counts whole ET days from the epoch", () => {
    expect(wordDayIndex(WORD_EPOCH_DATE)).toBe(0);
    expect(wordDayIndex("2026-08-04")).toBe(1);
    expect(wordDayIndex("2026-09-03")).toBe(31);
    expect(wordDayIndex("2026-08-02")).toBe(-1);
  });

  it("is stable across a DST transition", () => {
    // US DST ends Nov 1 2026 — the day count must not skip or repeat.
    expect(wordDayIndex("2026-11-02") - wordDayIndex("2026-10-31")).toBe(2);
    expect(wordDayIndex("2026-03-09") - wordDayIndex("2026-03-07")).toBe(2);
  });

  it("gives the same word to everyone for a given day", () => {
    expect(answerForDate("2026-08-10", PLAY_ORDER)).toBe(
      answerForDate("2026-08-10", PLAY_ORDER),
    );
  });

  it("gives different words on consecutive days", () => {
    const a = answerForDate("2026-08-03", PLAY_ORDER);
    const b = answerForDate("2026-08-04", PLAY_ORDER);
    expect(a).not.toBe(b);
  });

  it("wraps past the end of the list instead of running out", () => {
    const first = answerForDate(WORD_EPOCH_DATE, PLAY_ORDER);
    const wrapped = wordDayIndex(WORD_EPOCH_DATE) + PLAY_ORDER.length;
    // Day `length` after the epoch returns to the first word.
    expect(PLAY_ORDER[wrapped % PLAY_ORDER.length]).toBe(first);
  });

  it("handles pre-epoch dates without going negative", () => {
    expect(ANSWERS).toContain(answerForDate("2026-01-01", PLAY_ORDER));
  });

  it("never picks a word that isn't in the curated list", () => {
    for (let i = 0; i < 400; i++) {
      const d = new Date(Date.UTC(2026, 7, 3 + i));
      const iso = d.toISOString().slice(0, 10);
      expect(ANSWERS).toContain(answerForDate(iso, PLAY_ORDER));
    }
  });
});

describe("evaluateGuess", () => {
  it("marks exact matches green", () => {
    expect(evaluateGuess("crane", "crane")).toEqual([
      "green",
      "green",
      "green",
      "green",
      "green",
    ]);
  });

  it("marks absent letters grey", () => {
    expect(evaluateGuess("mount", "piece")).toEqual([
      "grey",
      "grey",
      "grey",
      "grey",
      "grey",
    ]);
  });

  it("marks present-but-misplaced letters yellow", () => {
    // "table" vs "bleat": every letter is present, none in the right spot.
    expect(evaluateGuess("table", "bleat")).toEqual([
      "yellow",
      "yellow",
      "yellow",
      "yellow",
      "yellow",
    ]);
  });

  it("respects letter frequency: extra copies stay grey", () => {
    // "media" has exactly one E. "sheep" offers two — the first gets the
    // yellow, the second has nothing left to match against.
    expect(evaluateGuess("sheep", "media")).toEqual([
      "grey",
      "grey",
      "yellow",
      "grey",
      "grey",
    ]);
  });

  it("greens consume their letter before yellows are assigned", () => {
    // Answer "abbey" has two B's; guess "babes" — b(1) yellow, a yellow,
    // b(3) green, e green, s grey.
    expect(evaluateGuess("babes", "abbey")).toEqual([
      "yellow",
      "yellow",
      "green",
      "green",
      "grey",
    ]);
  });

  it("stops handing out yellows once the answer's copies are used up", () => {
    // "sheet" has two E's; "geese" offers three. One is green (position 3),
    // one takes the remaining yellow, and the third has nothing left to claim.
    expect(evaluateGuess("geese", "sheet")).toEqual([
      "grey",
      "yellow",
      "green",
      "yellow",
      "grey",
    ]);
  });

  it("is case-insensitive", () => {
    expect(evaluateGuess("CRANE", "crane")).toEqual(
      evaluateGuess("crane", "crane"),
    );
  });
});

describe("checkPlayEligibility — the two hard rules", () => {
  const open = {
    clockedInToday: true,
    solved: false,
    completed: false,
    guessesUsed: 0,
  };

  it("lets a clocked-in VA with an unfinished attempt play", () => {
    expect(checkPlayEligibility(open)).toEqual({
      canPlay: true,
      block: null,
      message: null,
    });
    expect(checkPlayEligibility({ ...open, guessesUsed: 5 }).canPlay).toBe(true);
  });

  describe("must be clocked in", () => {
    it("blocks a VA who has not clocked in today", () => {
      const gate = checkPlayEligibility({ ...open, clockedInToday: false });
      expect(gate.canPlay).toBe(false);
      expect(gate.block).toBe("NOT_CLOCKED_IN");
    });

    it("takes priority over every other reason", () => {
      // Not clocked in AND finished: they're told to clock in first.
      expect(
        checkPlayEligibility({
          clockedInToday: false,
          solved: true,
          completed: true,
          guessesUsed: MAX_GUESSES,
        }).block,
      ).toBe("NOT_CLOCKED_IN");
    });
  });

  describe("one game per day", () => {
    it("blocks a solved attempt", () => {
      const gate = checkPlayEligibility({ ...open, solved: true, guessesUsed: 3 });
      expect(gate.canPlay).toBe(false);
      expect(gate.block).toBe("ALREADY_FINISHED");
    });

    it("blocks a finalized attempt even if it wasn't solved", () => {
      // A failed attempt stores guessCount 0 — `completed` is what matters.
      const gate = checkPlayEligibility({
        ...open,
        completed: true,
        guessesUsed: MAX_GUESSES,
      });
      expect(gate.canPlay).toBe(false);
      expect(gate.block).toBe("ALREADY_FINISHED");
    });

    it("blocks a 7th guess even if the attempt was never finalized", () => {
      const gate = checkPlayEligibility({ ...open, guessesUsed: MAX_GUESSES });
      expect(gate.canPlay).toBe(false);
      expect(gate.block).toBe("OUT_OF_GUESSES");
    });

    it("allows resuming a part-played attempt — that's still one game", () => {
      expect(
        checkPlayEligibility({ ...open, guessesUsed: MAX_GUESSES - 1 }).canPlay,
      ).toBe(true);
    });
  });

  it("always explains itself to the player when it blocks", () => {
    const blocked = [
      { ...open, clockedInToday: false },
      { ...open, solved: true },
      { ...open, guessesUsed: MAX_GUESSES },
    ];
    for (const input of blocked) {
      const gate = checkPlayEligibility(input);
      expect(gate.canPlay).toBe(false);
      expect(gate.message).toBeTruthy();
    }
  });
});

describe("isAttemptComplete — when a player's path may be shown to the team", () => {
  it("reveals a solved run", () => {
    expect(
      isAttemptComplete({ solved: true, completed: true, guessesUsed: 3 }),
    ).toBe(true);
  });

  it("reveals a run that used all six tries without solving", () => {
    expect(
      isAttemptComplete({
        solved: false,
        completed: true,
        guessesUsed: MAX_GUESSES,
      }),
    ).toBe(true);
  });

  it("hides a run still in progress at every guess count 1–5", () => {
    for (let used = 1; used < MAX_GUESSES; used++) {
      expect(
        isAttemptComplete({ solved: false, completed: false, guessesUsed: used }),
      ).toBe(false);
    }
  });

  it("hides a run that has not started", () => {
    expect(
      isAttemptComplete({ solved: false, completed: false, guessesUsed: 0 }),
    ).toBe(false);
  });

  it("still reveals six spent tries if finalization was missed", () => {
    // Defence in depth: a row that never got completedAt set must not be
    // treated as live once the tries are gone.
    expect(
      isAttemptComplete({
        solved: false,
        completed: false,
        guessesUsed: MAX_GUESSES,
      }),
    ).toBe(true);
  });

  it("never reveals a partial run just because it was abandoned", () => {
    expect(
      isAttemptComplete({ solved: false, completed: false, guessesUsed: 4 }),
    ).toBe(false);
  });
});

describe("keyboardStates", () => {
  it("keeps the best-known state per letter (green beats yellow beats grey)", () => {
    const guesses = ["crane", "cider"];
    const patterns: Tile[][] = [
      ["grey", "yellow", "grey", "grey", "grey"],
      ["grey", "grey", "grey", "grey", "green"],
    ];
    const states = keyboardStates(guesses, patterns);
    expect(states.r).toBe("green"); // yellow in "crane", green in "cider"
    expect(states.c).toBe("grey");
    expect(states.z).toBeUndefined();
  });
});

describe("emojiGrid", () => {
  it("renders a spoiler-free grid with the score line", () => {
    const patterns: Tile[][] = [
      ["grey", "yellow", "grey", "grey", "green"],
      ["green", "green", "green", "green", "green"],
    ];
    const text = emojiGrid(patterns, true, "Aug 3");
    expect(text).toBe("KSMVP Word • Aug 3 • 2/6\n⬜🟨⬜⬜🟩\n🟩🟩🟩🟩🟩");
    // Spoiler-free: the grid itself carries no letters, only tiles.
    const grid = text.split("\n").slice(1).join("");
    expect(grid).not.toMatch(/[a-z]/i);
  });

  it("uses X/6 when the word wasn't solved", () => {
    const patterns: Tile[][] = Array.from({ length: MAX_GUESSES }, () =>
      Array<Tile>(WORD_LENGTH).fill("grey"),
    );
    expect(emojiGrid(patterns, false).split("\n")[0]).toBe("KSMVP Word • X/6");
  });
});

describe("scoring", () => {
  it("awards base points per the agreed table", () => {
    expect([1, 2, 3, 4, 5, 6].map(basePointsForSolve)).toEqual([
      10, 6, 5, 4, 3, 2,
    ]);
  });

  it("gives nothing for an out-of-range guess count (a fail)", () => {
    expect(basePointsForSolve(0)).toBe(0);
    expect(basePointsForSolve(7)).toBe(0);
  });

  it("still rewards showing up", () => {
    expect(PARTICIPATION_POINT).toBe(1);
  });
});

describe("workdays", () => {
  it("counts Mon–Fri only", () => {
    expect(isWorkday("2026-08-03")).toBe(true); // Monday
    expect(isWorkday("2026-08-07")).toBe(true); // Friday
    expect(isWorkday("2026-08-08")).toBe(false); // Saturday
    expect(isWorkday("2026-08-09")).toBe(false); // Sunday
  });

  it("lists workdays in a range, skipping the weekend", () => {
    expect(workdaysBetween("2026-08-06", "2026-08-11")).toEqual([
      "2026-08-06",
      "2026-08-07",
      "2026-08-10",
      "2026-08-11",
    ]);
  });

  it("returns nothing for an inverted range", () => {
    expect(workdaysBetween("2026-08-10", "2026-08-03")).toEqual([]);
  });
});

describe("streakBonus", () => {
  const week1 = workdaysBetween("2026-08-03", "2026-08-07"); // Mon–Fri

  it(`awards +1 for every ${STREAK_INTERVAL} consecutive solved workdays`, () => {
    expect(streakBonus(week1, new Set(week1))).toBe(1);
  });

  it("awards nothing for four in a row", () => {
    expect(streakBonus(week1, new Set(week1.slice(0, 4)))).toBe(0);
  });

  it("resets on a failed day", () => {
    const twoWeeks = workdaysBetween("2026-08-03", "2026-08-14"); // 10 workdays
    const allButOne = new Set(twoWeeks.filter((d) => d !== "2026-08-05"));
    // The miss on day 3 breaks the run; the remaining 7 in a row give one bonus.
    expect(streakBonus(twoWeeks, allButOne)).toBe(1);
  });

  it("a skipped workday resets it just like a fail", () => {
    const twoWeeks = workdaysBetween("2026-08-03", "2026-08-14");
    expect(streakBonus(twoWeeks, new Set(twoWeeks))).toBe(2); // 10 solved = 2 bonuses
  });

  it("ignores weekends entirely — Fri + Mon are consecutive", () => {
    const span = workdaysBetween("2026-08-05", "2026-08-11"); // Wed..Tue, 5 workdays
    expect(span).toHaveLength(5);
    expect(streakBonus(span, new Set(span))).toBe(1);
  });
});

describe("currentStreak", () => {
  it("counts back over solved workdays", () => {
    const solved = new Set([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
    expect(currentStreak("2026-08-13", solved, solved)).toBe(4);
  });

  it("treats an unplayed today as neutral, not as a break", () => {
    const solved = new Set(["2026-08-11", "2026-08-12"]);
    // Thursday the 13th hasn't been played yet — the streak still reads 2.
    expect(currentStreak("2026-08-13", solved, solved)).toBe(2);
  });

  it("breaks when today was played but not solved", () => {
    const solved = new Set(["2026-08-11", "2026-08-12"]);
    const played = new Set([...solved, "2026-08-13"]);
    expect(currentStreak("2026-08-13", solved, played)).toBe(0);
  });

  it("breaks on an earlier skipped workday", () => {
    const solved = new Set(["2026-08-10", "2026-08-12", "2026-08-13"]);
    // The 11th was skipped, so only the 12th–13th count.
    expect(currentStreak("2026-08-13", solved, solved)).toBe(2);
  });

  it("bridges a weekend", () => {
    const solved = new Set(["2026-08-07", "2026-08-10"]); // Fri, Mon
    expect(currentStreak("2026-08-10", solved, solved)).toBe(2);
  });

  it("never looks back before the game launched", () => {
    expect(currentStreak(WORD_EPOCH_DATE, new Set(), new Set())).toBe(0);
  });
});

describe("month helpers", () => {
  it("derives the month key from a date", () => {
    expect(monthKeyForDate("2026-08-14")).toBe("2026-08");
  });

  it("steps back a month, including across a year boundary", () => {
    expect(previousMonthKey("2026-08")).toBe("2026-07");
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });

  it("bounds a month correctly", () => {
    expect(monthBounds("2026-08")).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
    expect(monthBounds("2028-02").end).toBe("2028-02-29"); // leap year
  });

  it("labels a month the way the champion box shows it", () => {
    expect(monthLabel("2026-07")).toBe("July 2026");
  });
});
