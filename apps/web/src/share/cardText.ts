import type { CardPlayer, ShareCard } from "./shareCard";

export const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

export interface ResultRow {
  playerId: string;
  nickname: string;
  /** What they got: points, a time, "Winner". */
  label: string;
}

/**
 * The headline, the sharer's own line and the podium for a game with others, from the final
 * order (best first). The sharer speaks for themselves: "I won!", "I came 2nd with 7,250".
 */
export function competitiveLines(
  rows: ResultRow[],
  me: string,
  avatarOf: (id: string) => string | null,
): Pick<ShareCard, "headline" | "subline" | "podium"> {
  const podium: CardPlayer[] = rows.slice(0, 3).map((r) => ({
    nickname: r.nickname,
    avatar: avatarOf(r.playerId),
    label: r.label,
  }));
  const winner = rows[0];
  const at = rows.findIndex((r) => r.playerId === me);
  const others = rows.length - 1;
  if (!winner) return { headline: "Game over", podium };
  if (winner.playerId === me) {
    return {
      headline: "I won!",
      subline: `${winner.label} against ${others} ${others === 1 ? "other player" : "other players"}`,
      podium,
    };
  }
  return {
    headline: `${winner.nickname} won!`,
    subline: at >= 0 ? `I came ${ordinal(at + 1)} with ${rows[at]!.label}` : undefined,
    podium,
  };
}
