import {
  LEVEL_CHOICES,
  LEVEL_NAMES,
  ROUNDS_MODES,
  SPOT_IT_ROUNDS,
  SPOT_IT_TIME_LIMITS_SECONDS,
  WORD_RUSH_ROUNDS,
  WORD_RUSH_TIME_LIMITS_SECONDS,
  spotItSettingsSchema,
  wordRushSettingsSchema,
  type LevelChoice,
  type RoundsMode,
} from "@whizard/game-core";
import { SettingSelect } from "../../ui/SettingSelect";
import { Icon } from "../../ui/Icon";

export type RoundsGameId = "word-rush" | "spot-it";

export interface RoundsSettings {
  mode: RoundsMode;
  level: LevelChoice;
  rounds: number;
  timeLimitSeconds: number;
}

const OPTIONS: Record<RoundsGameId, { rounds: readonly number[]; seconds: readonly number[] }> = {
  "word-rush": { rounds: WORD_RUSH_ROUNDS, seconds: WORD_RUSH_TIME_LIMITS_SECONDS },
  "spot-it": { rounds: SPOT_IT_ROUNDS, seconds: SPOT_IT_TIME_LIMITS_SECONDS },
};

/** What Auto means, under the Level row. */
export const AUTO_HINT = "Starts easy and gets harder each round, mixing easy, medium and hard.";

export const isRoundsGame = (id: string): id is RoundsGameId => id in OPTIONS;

export function parseRoundsSettings(id: RoundsGameId, settings: unknown): RoundsSettings | null {
  const schema = id === "word-rush" ? wordRushSettingsSchema : spotItSettingsSchema;
  const parsed = schema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

/** Word Rush's and Spot It's rows in the lobby's Room Settings list. */
export function RoundsSettingsRows({
  game,
  settings,
  editable,
  onChange,
}: {
  game: RoundsGameId;
  settings: RoundsSettings;
  editable: boolean;
  onChange: (settings: RoundsSettings) => void;
}) {
  const options = OPTIONS[game];
  return (
    <>
      <div className="setting-row">
        <Icon name="games" size={20} />
        <label htmlFor="game-mode">Game Mode</label>
        <SettingSelect
          id="game-mode"
          label="Game Mode"
          value={settings.mode}
          disabled={!editable}
          options={ROUNDS_MODES.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(value) => onChange({ ...settings, mode: value as RoundsMode })}
        />
      </div>
      <p className="setting-hint dim small">
        {ROUNDS_MODES.find((m) => m.id === settings.mode)?.description}
      </p>
      <div className="setting-row">
        <Icon name="trophy" size={20} />
        <label htmlFor="level">Level</label>
        <SettingSelect
          id="level"
          label="Level"
          value={settings.level}
          disabled={!editable}
          options={LEVEL_CHOICES.map((l) => ({ value: l, label: LEVEL_NAMES[l] }))}
          onChange={(value) => onChange({ ...settings, level: value as LevelChoice })}
        />
      </div>
      {settings.level === "auto" && <p className="setting-hint dim small">{AUTO_HINT}</p>}
      <div className="setting-row">
        <Icon name="copy" size={20} />
        <label htmlFor="rounds">Rounds</label>
        <SettingSelect
          id="rounds"
          label="Rounds"
          value={String(settings.rounds)}
          disabled={!editable}
          options={options.rounds.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(value) => onChange({ ...settings, rounds: Number(value) })}
        />
      </div>
      <div className="setting-row">
        <Icon name="clock" size={20} />
        <label htmlFor="time-limit">Time per round</label>
        <SettingSelect
          id="time-limit"
          label="Time per round"
          value={String(settings.timeLimitSeconds)}
          disabled={!editable}
          options={options.seconds.map((s) => ({ value: String(s), label: `${s} seconds` }))}
          onChange={(value) => onChange({ ...settings, timeLimitSeconds: Number(value) })}
        />
      </div>
    </>
  );
}
