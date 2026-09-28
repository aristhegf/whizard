import {
  DEFAULT_QUIZ_SETTINGS,
  QUIZ_CATEGORIES,
  QUIZ_DIFFICULTIES,
  QUIZ_QUESTION_COUNTS,
  QUIZ_TIME_LIMITS_SECONDS,
  QUIZ_VARIANTS,
} from "@whizard/game-core";
import type { QuizDefaults, SiteSettings } from "@whizard/protocol";
import { useState } from "react";
import { fetchAdminGames, updateSettings } from "../api";
import { CATALOG, isPlayable } from "../catalog";
import { formatNumber } from "../format";
import { useLoaded } from "../ui/common";
import { KpiTiles, PanelHead } from "./parts";
import { LEVEL_NAMES, topicArt, topicName } from "./questionParts";

/** `/admin/games`: which games and topics are on, and what new rooms start with. */
export function Games() {
  const { data, error, reload } = useLoaded(fetchAdminGames);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async (update: Partial<SiteSettings>, message: string) => {
    setProblem(null);
    setSaved(null);
    try {
      await updateSettings(update);
      setSaved(message);
      reload();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn’t save that.");
    }
  };

  if (error && !data) {
    return (
      <p className="error" role="alert">
        Couldn’t load the games. {error}
      </p>
    );
  }
  const settings = data?.settings;
  const played = (id: string) => data?.games.find((g) => g.id === id);
  const live = CATALOG.filter(isPlayable);
  const on = live.filter((g) => !settings?.gamesOff.includes(g.id));
  const topicsOn = QUIZ_CATEGORIES.filter((c) => !settings?.topicsOff.includes(c.id));
  const top = [...(data?.topics ?? [])].sort((a, b) => b.last30 - a.last30)[0];
  const total30 = (data?.games ?? []).reduce((sum, g) => sum + g.last30, 0);

  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <KpiTiles
        tiles={[
          {
            tone: "purple",
            icon: "games",
            label: "Games On",
            value: data ? `${on.length} of ${live.length}` : "–",
            note: `${CATALOG.length - live.length} more being made`,
          },
          {
            tone: "blue",
            icon: "checkCircle",
            label: "Games Played",
            value: data ? formatNumber(total30) : "–",
            note: "finished, last 30 days",
          },
          {
            tone: "green",
            icon: "layers",
            label: "Topics On",
            value: data ? `${topicsOn.length} of ${QUIZ_CATEGORIES.length}` : "–",
            note: "quiz topics players can pick",
          },
          {
            tone: "orange",
            icon: "trophy",
            label: "Top Topic",
            value: top && top.last30 > 0 ? topicName(top.id) : "–",
            note:
              top && top.last30 > 0 ? `${formatNumber(top.last30)} games, 30 days` : "no games yet",
          },
        ]}
      />
      {(problem || saved) && (
        <p
          className={problem ? "error span-12" : "form-saved span-12"}
          role={problem ? "alert" : "status"}
        >
          {problem ?? saved}
        </p>
      )}

      <section className="panel admin-panel span-8" aria-labelledby="games-title">
        <PanelHead
          id="games-title"
          icon="games"
          title="Games"
          subtitle="Turning a game off stops new rooms for it; rooms already playing finish."
        />
        <ul className="game-admin-list">
          {CATALOG.map((game) => {
            const stats = played(game.id);
            const playable = isPlayable(game);
            const isOn = playable && !settings?.gamesOff.includes(game.id);
            return (
              <li key={game.id} className="game-admin-row">
                <img src={game.art} alt="" loading="lazy" />
                <span className="name-text">
                  <strong>{game.name}</strong>
                  <span>{game.description}</span>
                </span>
                <span className="content-share">
                  {playable && (
                    <>
                      {formatNumber(stats?.last30 ?? 0)}
                      <span>{formatNumber(stats?.last7 ?? 0)} this week</span>
                    </>
                  )}
                </span>
                {playable ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={`${game.name} on`}
                    className={isOn ? "toggle on" : "toggle"}
                    disabled={!settings}
                    onClick={() =>
                      settings &&
                      void save(
                        {
                          gamesOff: isOn
                            ? [...settings.gamesOff, game.id]
                            : settings.gamesOff.filter((id) => id !== game.id),
                        },
                        isOn ? `${game.name} is off.` : `${game.name} is on.`,
                      )
                    }
                  >
                    <span />
                  </button>
                ) : (
                  <span className="status-pill status-retired">Being made</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {settings && (
        <Defaults
          defaults={settings.quizDefaults}
          topicsOff={settings.topicsOff}
          onSave={(quizDefaults) => void save({ quizDefaults }, "New rooms will start like this.")}
        />
      )}

      <section className="panel admin-panel span-12" aria-labelledby="topics-title">
        <PanelHead
          id="topics-title"
          icon="layers"
          title="Quiz Topics"
          subtitle="A topic that's off is hidden and can't be picked. Keep at least one on."
        />
        <ul className="topic-admin-grid">
          {(data?.topics ?? []).map((t) => {
            const isOn = !settings?.topicsOff.includes(t.id);
            return (
              <li key={t.id} className={isOn ? "topic-admin" : "topic-admin off"}>
                {topicArt(t.id) && <img src={topicArt(t.id)} alt="" loading="lazy" />}
                <span className="name-text">
                  <strong>{topicName(t.id)}</strong>
                  <span>
                    {formatNumber(t.questions)} questions · {formatNumber(t.last30)} games
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  aria-label={`${topicName(t.id)} on`}
                  className={isOn ? "toggle on" : "toggle"}
                  onClick={() =>
                    settings &&
                    void save(
                      {
                        topicsOff: isOn
                          ? [...settings.topicsOff, t.id]
                          : settings.topicsOff.filter((id) => id !== t.id),
                      },
                      isOn ? `${topicName(t.id)} is off.` : `${topicName(t.id)} is on.`,
                    )
                  }
                >
                  <span />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Defaults({
  defaults,
  topicsOff,
  onSave,
}: {
  defaults: QuizDefaults;
  topicsOff: string[];
  onSave: (defaults: QuizDefaults) => void;
}) {
  const [form, setForm] = useState({ ...DEFAULT_QUIZ_SETTINGS, ...defaults });
  const set = (key: keyof QuizDefaults, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <section className="panel admin-panel span-4" aria-labelledby="defaults-title">
      <PanelHead
        id="defaults-title"
        icon="settings"
        title="New Room Defaults"
        subtitle="What a quiz room starts with. Hosts can still change it in the lobby."
      />
      <form
        className="question-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <label className="form-field">
          <span className="form-label">Topic</span>
          <select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {QUIZ_CATEGORIES.filter((c) => !topicsOff.includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row two">
          <label className="form-field">
            <span className="form-label">Level</span>
            <select value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
              {QUIZ_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {LEVEL_NAMES[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Questions</span>
            <select value={form.count} onChange={(e) => set("count", Number(e.target.value))}>
              {QUIZ_QUESTION_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Mode</span>
            <select value={form.variant} onChange={(e) => set("variant", e.target.value)}>
              {QUIZ_VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Time (Speed)</span>
            <select
              value={form.timeLimitSeconds}
              onChange={(e) => set("timeLimitSeconds", Number(e.target.value))}
            >
              {QUIZ_TIME_LIMITS_SECONDS.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button className="btn btn-small btn-primary">Save defaults</button>
        </div>
      </form>
    </section>
  );
}
