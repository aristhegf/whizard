import { deleteTopic, type AdminTopicInfo, type TopicChanges } from "../api";
import { formatNumber } from "../format";
import { errorText } from "../ui/common";

/** One topic as the list shows it: its count in words, and what an admin may do to it. */
export interface TopicRow {
  topic: AdminTopicInfo;
  /** The question count as the row spells it out: "No questions", "1 question", "4,200 questions". */
  countLabel: string;
  /** Only a topic with no questions in the bank or in `custom_questions` can be deleted. */
  canDelete: boolean;
  /** What the row says beside a delete it won't offer. */
  deleteNote: string | null;
}

/** The rows the list renders, in the catalogue's own order. */
export function topicRows(topics: readonly AdminTopicInfo[]): TopicRow[] {
  return topics.map((topic) => ({
    topic,
    countLabel:
      topic.questionCount === 0
        ? "No questions"
        : `${formatNumber(topic.questionCount)} ${topic.questionCount === 1 ? "question" : "questions"}`,
    canDelete: topic.questionCount === 0,
    deleteNote: topic.questionCount === 0 ? null : "Has questions",
  }));
}

/** Deletes a topic: `null` when it went, the words to show inline when the server refused. */
export async function removeTopic(id: string): Promise<string | null> {
  try {
    await deleteTopic(id);
    return null;
  } catch (error) {
    return errorText(error);
  }
}

/** What an edit actually changed: only the fields that moved — an id is never part of it. */
export function changeSet(
  before: AdminTopicInfo,
  after: { name: string; tagline: string; colors: readonly [string, string] },
): TopicChanges {
  const changes: TopicChanges = {};
  if (after.name.trim() !== before.name) changes.name = after.name.trim();
  if (after.tagline.trim() !== before.tagline) changes.tagline = after.tagline.trim();
  if (after.colors[0] !== before.colors[0] || after.colors[1] !== before.colors[1]) {
    changes.colors = [after.colors[0], after.colors[1]];
  }
  return changes;
}
