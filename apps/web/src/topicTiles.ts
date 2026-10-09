import type { TopicInfo } from "./topics";

/** How many questions a topic can start a game with right now. */
export const playableTotal = (questions: TopicInfo["questions"]): number =>
  questions.easy + questions.medium + questions.hard;

/**
 * Whether a browse tile shows `Coming soon` (and so can't be started): exactly when the topic
 * has no playable questions. The counts aren't known while the catalogue is still loading, so
 * nothing is called empty until its fetch has landed.
 */
export const isComingSoon = (row: TopicInfo, loading: boolean): boolean =>
  !loading && playableTotal(row.questions) === 0;

/**
 * Whether the quiz picker disables an option: coming soon, except the topic a lobby has already
 * chosen — its questions may be gone, but the lobby is already sitting on it.
 */
export const isPickerSoon = (row: TopicInfo, value: string, loading: boolean): boolean =>
  isComingSoon(row, loading) && row.id !== value;

/**
 * The browse grid's rows: the catalogue's own order left untouched, with names matched against
 * the search box (trimmed, case-insensitive). An empty query is every row, as served.
 */
export function browseRows(rows: TopicInfo[], query: string): TopicInfo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(needle));
}
