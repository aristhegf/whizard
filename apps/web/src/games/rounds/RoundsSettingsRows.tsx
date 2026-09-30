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
import { eliminationLength, LengthRow, LevelRow, ModeRow, TimeRow } from "../settingRows";

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
  players,
  editable,
  onChange,
}: {
  game: RoundsGameId;
  settings: RoundsSettings;
  /** Players in the room now, for how long an Elimination game will be. */
  players: number;
  editable: boolean;
  onChange: (settings: RoundsSettings) => void;
}) {
  const options = OPTIONS[game];
  const elimination = settings.mode === "elimination";
  const noun = game === "word-rush" ? "words" : "grids";
  return (
    <>
      <ModeRow
        modes={ROUNDS_MODES}
        value={settings.mode}
        extra={elimination ? eliminationLength(players, settings.rounds, noun) : null}
        editable={editable}
        onChange={(mode) => onChange({ ...settings, mode })}
      />
      <LevelRow
        choices={LEVEL_CHOICES.map((l) => ({ value: l, label: LEVEL_NAMES[l] }))}
        value={settings.level}
        editable={editable}
        onChange={(level) => onChange({ ...settings, level })}
      />
      {/* In Elimination the number is each round's; played straight through, it's the game's. */}
      <LengthRow
        label={elimination ? `${noun[0]!.toUpperCase()}${noun.slice(1)} per round` : "Rounds"}
        value={settings.rounds}
        counts={options.rounds}
        editable={editable}
        onChange={(rounds) => onChange({ ...settings, rounds })}
      />
      <TimeRow
        label="Time per Round"
        value={settings.timeLimitSeconds}
        choices={options.seconds}
        unit="seconds"
        editable={editable}
        onChange={(timeLimitSeconds) => onChange({ ...settings, timeLimitSeconds })}
      />
    </>
  );
}
