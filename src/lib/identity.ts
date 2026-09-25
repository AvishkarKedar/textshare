/**
 * Identity helpers — the smallest possible "who is who" layer.
 *
 * Rooms have no accounts, so identity is just a locally-persisted label
 * (name + color) broadcast over the encrypted awareness channel. Two jobs:
 *
 *   1. sanitizeName — keep user-typed names short, single-spaced, safe.
 *   2. guestHandle  — a stable, friendly fallback ("amber-otter-42") so
 *      peers can tell anonymous users apart without anyone typing a name.
 *      "you" (the old default) was useless for attribution: everyone was
 *      "you", chat and typing indicators couldn't say who did what.
 */

const ADJECTIVES = [
  "amber", "brave", "calm", "clever", "dawn", "ember", "fern", "frost",
  "ginger", "harbor", "hazel", "indigo", "jasper", "keen", "lunar", "maple",
  "north", "onyx", "polar", "quill", "raven", "sage", "tidal", "umber",
  "vivid", "wren", "zen", "zephyr",
];

const ANIMALS = [
  "otter", "falcon", "heron", "ibex", "lynx", "marten", "newt", "osprey",
  "puffin", "ray", "stoat", "tapir", "vole", "walrus", "yak", "zorse",
];

/** Max rendered length — avatars, chat lines and the ticker stay tidy. */
export const NAME_MAX = 24;

/**
 * Trim, collapse internal whitespace, hard-cap the length. Never throws;
 * anything that sanitizes to empty means "no name given" (→ guestHandle).
 */
export function sanitizeName(raw: string): string {
  const cleaned = (raw || "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return cleaned;
}

/**
 * Deterministic-ish guest handle: adjective-animal-number. ~450 combinations
 * before the 2-digit suffix; collisions inside one room are cosmetic at worst
 * (color still differs). Generated once, then persisted as the display name,
 * so the same browser keeps a stable identity across rooms.
 */
export function guestHandle(): string {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const n = 10 + Math.floor(Math.random() * 90); // 10–99, no leading zero
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${n}`;
}

/** True when the stored name is a real, human-meaningful label. */
export function isNamed(name: string | undefined | null): boolean {
  return !!name && name !== "you" && name.trim().length > 0;
}
