import { QUIZ_CATEGORIES } from "@whizard/game-core";
import type { AdminQuestion, QuestionPlay } from "@whizard/protocol";
import { TOPIC_STYLES } from "../catalog";
import { formatNumber, formatPercent } from "../format";
import { linkTo } from "../router";
import { Bar } from "./parts";

export const LEVELS = ["easy", "medium", "hard"] as const;
export const LEVEL_NAMES: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export const topicName = (id: string) => QUIZ_CATEGORIES.find((c) => c.id === id)?.name ?? id;
export const topicArt = (id: string) => TOPIC_STYLES[id as keyof typeof TOPIC_STYLES]?.art;

export const editPath = (id: string) => `/admin/content/${encodeURIComponent(id)}`;

export const PLAY: Record<QuestionPlay, { label: string; tone: string }> = {
  in_play: { label: "In play", tone: "status-kept" },
  reported_out: { label: "Out: reported", tone: "status-out" },
  retired: { label: "Retired", tone: "status-retired" },
};

export const ORIGIN: Record<AdminQuestion["origin"], string | null> = {
  bank: null,
  edited: "Edited",
  added: "Added",
};

export function answersOf(q: AdminQuestion): number {
  return q.stats ? q.stats.answered + q.stats.timedOut : 0;
}

/** Share of players who got it right, counting time running out as wrong. */
export function rightShare(q: AdminQuestion): number | null {
  const n = answersOf(q);
  return q.stats && n > 0 ? q.stats.correct / n : null;
}

/** One question in a ranked list: its prompt, how often it's right and the wrong answer picked most. */
export function QuestionLine({ q, note }: { q: AdminQuestion; note?: string }) {
  const share = rightShare(q);
  const wrong = q.stats?.wrongPicks[0];
  return (
    <li>
      <a className="question-line" {...linkTo(editPath(q.id))}>
        <span className="rank-art">
          {topicArt(q.category) && <img src={topicArt(q.category)} alt="" loading="lazy" />}
        </span>
        <span className="question-line-text">
          <strong>{q.prompt}</strong>
          <span>
            {topicName(q.category)} · {LEVEL_NAMES[q.difficulty] ?? q.difficulty} ·{" "}
            {formatNumber(answersOf(q))} {answersOf(q) === 1 ? "answer" : "answers"}
            {note && ` · ${note}`}
          </span>
          {wrong && (
            <span className="question-line-wrong">
              Most picked wrong: “{wrong.choice}” ×{wrong.picks}
            </span>
          )}
        </span>
        <span className="question-line-share">
          <Bar share={share ?? 0} tone={share !== null && share < 0.4 ? "pink" : undefined} />
          <span>{share === null ? "–" : formatPercent(share)} right</span>
        </span>
      </a>
    </li>
  );
}
