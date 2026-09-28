import {
  SPOT_IT_ROUNDS,
  SPOT_IT_TIME_LIMITS_SECONDS,
  WORD_RUSH_ROUNDS,
  WORD_RUSH_TIME_LIMITS_SECONDS,
  spotItSettingsSchema,
  wordRushSettingsSchema,
} from "@whizard/game-core";
import { SettingSelect } from "../../ui/SettingSelect";
import { Icon } from "../../ui/Icon";

export type RoundsGameId = "word-rush" | "spot-it";

export interface RoundsSettings {
  rounds: number;
  timeLimitSeconds: number;
}

const OPTIONS: Record<RoundsGameId, { rounds: readonly number[]; seconds: readonly number[] }> = {
  "word-rush": { rounds: WORD_RUSH_ROUNDS, seconds: WORD_RUSH_TIME_LIMITS_SECONDS },
  "spot-it": { rounds: SPOT_IT_ROUNDS, seconds: SPOT_IT_TIME_LIMITS_SECONDS },
};

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
