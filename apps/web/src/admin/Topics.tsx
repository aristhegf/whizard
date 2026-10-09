import { DEFAULT_TOPIC_COLORS } from "@whizard/game-core";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { createTopic, updateTopic, uploadTopicArt, type AdminTopicInfo } from "../api";
import { formatNumber } from "../format";
import { useTopics } from "../topics";
import { errorText } from "../ui/common";
import { Icon } from "../ui/Icon";
import { dominantColors, imagePixels, squareWebP } from "./artwork";
import { PanelHead } from "./parts";
import { changeSet, removeTopic, topicRows, type TopicRow } from "./topicList";

/** What the form holds: the two things an admin types, and the tile's two colours. */
interface Draft {
  name: string;
  tagline: string;
  colors: [string, string];
}

const emptyDraft = (): Draft => ({
  name: "",
  tagline: "",
  colors: [DEFAULT_TOPIC_COLORS[0], DEFAULT_TOPIC_COLORS[1]],
});

/** A topic's own values, ready to edit. */
const draftOf = (topic: AdminTopicInfo): Draft => ({
  name: topic.name,
  tagline: topic.tagline,
  colors: [topic.colors[0], topic.colors[1]],
});

/** `/admin/topics`: the catalogue itself — add a topic, rename it, dress it, take it out. */
export function Topics() {
  const { topics, error, reload } = useTopics("admin");
  const [editing, setEditing] = useState<AdminTopicInfo | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  /** Opens the form for one topic; `colors` seeds the pickers after an artwork upload. */
  const start = (topic: AdminTopicInfo, colors?: readonly [string, string], note?: string) => {
    const next = draftOf(topic);
    setEditing(topic);
    setDraft(colors ? { ...next, colors: [colors[0], colors[1]] } : next);
    setProblem(null);
    setSaved(note ?? null);
  };

  /** Back to the empty form: a create, not an edit. */
  const stop = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setProblem(null);
    setSaved(null);
  };

  /** After a delete: leave the form if it was holding that topic, then refresh the list. */
  const gone = (id: string) => {
    if (editing?.id === id) stop();
    reload();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setSaved(null);
    try {
      if (editing) {
        // Rename, re-tagline or recolour: only what moved, and never the id.
        const topic = await updateTopic(editing.id, changeSet(editing, draft));
        setEditing(topic);
        setDraft(draftOf(topic));
        setSaved("Saved.");
      } else {
        // The server made the slug, so the form lands on the new topic with its id showing.
        const topic = await createTopic(draft);
        setEditing(topic);
        setDraft(draftOf(topic));
        setSaved("Added. It’s in the question editor’s topic list already.");
      }
      reload();
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-grid">
      <section className="panel admin-panel span-4" aria-labelledby="topic-form-title">
        <PanelHead
          id="topic-form-title"
          icon={editing ? "pencil" : "plus"}
          title={editing ? "Edit Topic" : "Add A Topic"}
          subtitle={
            editing
              ? "The id stays put — everything else is yours to change."
              : "The server picks the id from the name."
          }
        />
        <form className="question-form" onSubmit={(e) => void submit(e)}>
          <Field label="Name" count={[draft.name.length, 40]}>
            <input
              value={draft.name}
              maxLength={40}
              required
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          {editing && (
            <Field label="Id" hint="Questions, matches and stats all point at this.">
              <input value={editing.id} readOnly disabled />
            </Field>
          )}
          <Field
            label="Tagline"
            hint="One short line under the name."
            count={[draft.tagline.length, 80]}
          >
            <input
              value={draft.tagline}
              maxLength={80}
              onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
            />
          </Field>
          <div className="form-row two">
            <Field label="Colour 1">
              <input
                type="color"
                value={draft.colors[0]}
                onChange={(e) => setDraft((d) => ({ ...d, colors: [e.target.value, d.colors[1]] }))}
              />
            </Field>
            <Field label="Colour 2">
              <input
                type="color"
                value={draft.colors[1]}
                onChange={(e) => setDraft((d) => ({ ...d, colors: [d.colors[0], e.target.value] }))}
              />
            </Field>
          </div>
          {problem && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
          {saved && (
            <p className="form-saved" role="status">
              {saved}
            </p>
          )}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add topic"}
            </button>
            {editing && (
              <button type="button" className="btn" onClick={stop}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel admin-panel span-8" aria-labelledby="topics-list-title">
        <PanelHead
          id="topics-list-title"
          icon="star"
          title="Quiz Topics"
          subtitle={`${formatNumber(topics.length)} topics, the ones turned off included.`}
        />
        {error && (
          <p className="error" role="alert">
            Couldn’t refresh the topic list. {error}
          </p>
        )}
        <ul className="topic-list">
          {topicRows(topics).map((row) => (
            <TopicLine
              key={row.topic.id}
              row={row}
              onEdit={start}
              onReload={reload}
              onGone={gone}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** One topic: its picture, what it is, and the three things an admin can do to it. */
function TopicLine({
  row,
  onEdit,
  onReload,
  onGone,
}: {
  row: TopicRow;
  onEdit: (topic: AdminTopicInfo, colors?: readonly [string, string], note?: string) => void;
  onReload: () => void;
  onGone: (id: string) => void;
}) {
  const topic = row.topic;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /** The picture half of §8: square WebP up, colours down, straight into the form. */
  const replaceArt = async (chosen: File | null) => {
    if (!chosen) return;
    setBusy(true);
    setProblem(null);
    try {
      const [picture, pixels] = await Promise.all([squareWebP(chosen), imagePixels(chosen)]);
      await uploadTopicArt(topic.id, picture);
      onEdit(
        topic,
        dominantColors(pixels),
        "Picture replaced. The colours below came from it — save to use them.",
      );
      onReload();
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    setProblem(null);
    const refused = await removeTopic(topic.id);
    setBusy(false);
    setConfirming(false);
    if (refused) {
      setProblem(refused);
      return;
    }
    onGone(topic.id);
  };

  return (
    <li className="topic-row">
      {topic.art && <img src={topic.art} alt="" loading="lazy" />}
      <span className="name-text">
        <strong>{topic.name}</strong>
        <span>
          <code>{topic.id}</code> · {row.countLabel}
        </span>
        {topic.tagline && <span>{topic.tagline}</span>}
      </span>
      <span className="topic-flags">
        {topic.off && <span className="status-pill status-open">Off</span>}
      </span>
      <span className="user-actions">
        <button type="button" className="btn btn-small" onClick={() => onEdit(topic)}>
          Edit
        </button>
        <input
          ref={file}
          className="sr-only"
          type="file"
          accept="image/webp,image/*"
          aria-label={`Replace ${topic.name} picture`}
          onChange={(e) => void replaceArt(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn btn-small"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          <Icon name="upload" size={18} />
          Picture
        </button>
        {row.canDelete ? (
          confirming ? (
            <>
              <button
                type="button"
                className="btn btn-small btn-danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
              <button type="button" className="btn btn-small" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          )
        ) : (
          <>
            <button
              type="button"
              className="btn btn-small btn-danger"
              disabled
              aria-disabled="true"
            >
              Delete
            </button>
            <span
              className="status-pill status-retired"
              title="Delete is only for a topic with no questions."
            >
              {row.deleteNote}
            </span>
          </>
        )}
      </span>
      {problem && (
        <p className="error small user-error" role="alert">
          {problem}
        </p>
      )}
    </li>
  );
}

function Field({
  label,
  hint,
  count,
  children,
}: {
  label: string;
  hint?: string;
  count?: [number, number];
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span className="form-label">
        {label}
        {count && (
          <span className={count[0] > count[1] * 0.9 ? "form-count near" : "form-count"}>
            {count[0]}/{count[1]}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}
