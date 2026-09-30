import {
  INSANE_PIECES,
  JIGSAW_LEVELS,
  JIGSAW_MODES,
  JIGSAW_PICTURES,
  JIGSAW_THEMES,
  jigsawGrid,
  jigsawSettingsSchema,
  jigsawTimeLimit,
  type JigsawLevel,
  type JigsawLevelChoice,
  type JigsawMode,
  type JigsawSettings,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";
import { eliminationLength, FixedTimeRow, LevelRow, ModeRow } from "../settingRows";

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

/** The countdown each level gets, shown where Time would be. */
function timeValue(settings: JigsawSettings): string {
  if (settings.mode === "classic") return "No clock";
  if (settings.level === "auto") return "Grows each round";
  return minutes(jigsawTimeLimit(settings.level, piecesOf(settings.level)));
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
  return (
    <>
      <ModeRow
        modes={JIGSAW_MODES}
        value={settings.mode}
        extra={
          elimination
            ? `${eliminationLength(players, null, "")} The first round uses the picture chosen here.`
            : null
        }
        editable={editable}
        onChange={(mode) => {
          // Auto is Elimination's; leaving it, the level goes back to Easy.
          const level =
            mode !== "elimination" && settings.level === "auto" ? "easy" : settings.level;
          onChange({ ...settings, mode, level });
        }}
      />
      <LevelRow
        choices={[
          ...(elimination ? [{ value: "auto" as const, label: levelName("auto") }] : []),
          ...JIGSAW_LEVELS.map((l) => ({ value: l.id, label: levelName(l.id) })),
        ]}
        value={settings.level}
        editable={editable}
        onChange={(level) => onChange({ ...settings, level })}
      />
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
      <FixedTimeRow label="Time" value={timeValue(settings)} />
    </>
  );
}
