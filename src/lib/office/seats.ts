// Parses public/office/seats.txt: one spot per line, "CODE [name...] x y [facing]".
// Coordinates are feet points in the 1536x1024 office art.

export type Facing = "front" | "back" | "left" | "right";
export type Seat = { x: number; y: number; facing: Facing | null };
export type Seats = Record<string, Seat>;

const FACINGS = new Set<string>(["front", "back", "left", "right"]);

export function parseSeats(text: string): Seats {
  const seats: Seats = {};
  text.split(/\r?\n/).forEach((line, i) => {
    const tokens = line.trim().split(/\s+/);
    if (!tokens[0] || tokens[0].startsWith("#")) return;
    const nums = tokens.slice(1).filter((t) => /^-?\d+$/.test(t)).map(Number);
    if (nums.length < 2) throw new Error(`seats.txt line ${i + 1}: expected x and y`);
    const last = tokens[tokens.length - 1];
    seats[tokens[0]] = { x: nums[0], y: nums[1], facing: FACINGS.has(last) ? (last as Facing) : null };
  });
  return seats;
}
