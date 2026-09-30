import {
  ELIMINATION_MIN_PLAYERS,
  INSANE_PIECES,
  JIGSAW_LEVELS,
  JIGSAW_MODES,
  JIGSAW_PICTURES,
  JIGSAW_THEMES,
  jigsawGrid,
  jigsawSettingsSchema,
  jigsawTimeLimit,
  roundCount,
  type JigsawLevel,
  type JigsawLevelChoice,
  type JigsawMode,
  type JigsawSettings,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";

export function parseJigsawSettings(settings: unknown): JigsawSettings | null {
  const parsed = jigsawSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export const pictureName = (id: JigsawSettings["picture"]) =>
  id === "random"
    ? "Surprise me"
    : id === "photo"
      ? "Your photo"
      : (JIGSAW_PICTURES.find((p) => p.id === id)?.name ?? id);

const piecesOf = (level: JigsawLevel) => {
  const { cols, rows } = jigsawGrid(level);
  return cols * rows;
};

/** "Easy · 16 pieces", "Insane · about 100 pieces". */
export function levelName(level: JigsawLevelChoice): string {
  if (level === "auto") return "Auto";
  const name = JIGSAW_LEVELS.find((l) => l.id === level)?.name ?? level;
  return level === "insane"
    ? `${name} · about ${INSANE_PIECES} pieces`
    : `${name} · ${piecesOf(level)} pieces`;
}

/** "3:30" from milliseconds. */
const minutes = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export const modeName = (mode: JigsawMode) => JIGSAW_MODES.find((m) => m.id === mode)?.name ?? mode;

/** A line for guests in the lobby: "Speed · Hard · 36 pieces". */
export const levelSummary = (settings: JigsawSettings) =>
  `${modeName(settings.mode)} · ${levelName(settings.level)}`;

/** The countdown each level gets, for the hint under Level. */
function timeHint(settings: JigsawSettings): string | null {
  if (settings.mode === "classic") return "No clock: take as long as you need.";
  if (settings.level === "auto") {
    return "Each round a level harder, up to Insane for the final. The countdown grows with the pieces.";
  }
  const time = minutes(jigsawTimeLimit(settings.level, piecesOf(settings.level)));
  return settings.mode === "elimination" ? `${time} for each round.` : `${time} on the countdown.`;
}

/** The jigsaw's rows in the lobby's Room Settings list. Only the host can change them. */
export function JigsawSettingsRows({
  settings,
  players,
  editable,
  onChange,
  onPickPhoto,
}: {
  settings: JigsawSettings;
  /** Players in the room now, for how long an Elimination game will be. */
  players: number;
  editable: boolean;
  onChange: (settings: JigsawSettings) => void;
  /** Opens the photo picker, for the host's own photo. */
  onPickPhoto: () => void;
}) {
  const elimination = settings.mode === "elimination";
  const group = Math.max(players, ELIMINATION_MIN_PLAYERS);
  const rounds = roundCount(group);
  const hint = timeHint(settings);
  return (
    <>
      <SettingRow icon="games" id="jigsaw-mode" label="Game Mode">
        <SettingSelect
          id="jigsaw-mode"
          label="Game Mode"
          value={settings.mode}
          disabled={!editable}
          options={JIGSAW_MODES.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(value) => {
            const mode = value as JigsawMode;
            // Auto is Elimination's; leaving it, the level goes back to Easy.
            const level =
              mode !== "elimination" && settings.level === "auto" ? "easy" : settings.level;
            onChange({ ...settings, mode, level });
          }}
        />
      </SettingRow>
      <p className="setting-hint dim small">
        {JIGSAW_MODES.find((m) => m.id === settings.mode)?.description}
        {elimination &&
          ` With ${group} players that’s ${rounds} knock-out ${rounds === 1 ? "round" : "rounds"} and the final.`}
      </p>
      <SettingRow icon="trophy" id="level" label="Level">
        <SettingSelect
          id="level"
          label="Level"
          value={settings.level}
          disabled={!editable}
          options={[
            ...(elimination ? [{ value: "auto", label: levelName("auto") }] : []),
            ...JIGSAW_LEVELS.map((l) => ({ value: l.id, label: levelName(l.id) })),
          ]}
          onChange={(value) => onChange({ ...settings, level: value as JigsawLevelChoice })}
        />
      </SettingRow>
      {hint && <p className="setting-hint dim small">{hint}</p>}
      <SettingRow icon="star" id="picture" label="Picture">
        <SettingSelect
          id="picture"
          label="Picture"
          value={settings.picture}
          disabled={!editable}
          options={[
            { value: "random", label: "Surprise me" },
            { value: "photo", label: "Your photo" },
            ...JIGSAW_THEMES.flatMap((theme) =>
              JIGSAW_PICTURES.filter((p) => p.theme === theme.id).map((p) => ({
                value: p.id,
                label: p.name,
                group: theme.name,
              })),
            ),
          ]}
          onChange={(value) => {
            // Your photo needs a photo first; the room picks it once it's sent.
            if (value === "photo" && !settings.photo) onPickPhoto();
            else onChange({ ...settings, picture: value as JigsawSettings["picture"] });
          }}
        />
      </SettingRow>
      {elimination && (
        <p className="setting-hint dim small">
          The first round uses this picture; every round after gets a new one.
        </p>
      )}
      {editable && settings.picture === "photo" && (
        <div className="setting-row photo-row">
          <span />
          <span className="dim small">
            {settings.level === "insane"
              ? "Only people in this room see it. Insane keeps its shape."
              : "Only people in this room see it."}
          </span>
          <button className="btn btn-small" onClick={onPickPhoto}>
            Change Photo
          </button>
        </div>
      )}
    </>
  );
}
