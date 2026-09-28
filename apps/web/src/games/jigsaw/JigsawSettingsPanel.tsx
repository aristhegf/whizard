import {
  JIGSAW_PICTURES,
  JIGSAW_SIZES,
  jigsawSettingsSchema,
  type JigsawSettings,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";

export function parseJigsawSettings(settings: unknown): JigsawSettings | null {
  const parsed = jigsawSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export const pictureName = (id: JigsawSettings["picture"]) =>
  id === "random" ? "Surprise me" : (JIGSAW_PICTURES.find((p) => p.id === id)?.name ?? id);

export const sizeName = (side: number) => {
  const size = JIGSAW_SIZES.find((s) => s.side === side);
  return size ? `${size.name} · ${side * side} pieces` : `${side * side} pieces`;
};

/** The jigsaw's rows in the lobby's Room Settings list. Only the host can change them. */
export function JigsawSettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: JigsawSettings;
  editable: boolean;
  onChange: (settings: JigsawSettings) => void;
}) {
  return (
    <>
      <SettingRow icon="star" id="picture" label="Picture">
        <SettingSelect
          id="picture"
          label="Picture"
          value={settings.picture}
          disabled={!editable}
          options={[
            { value: "random", label: "Surprise me" },
            ...JIGSAW_PICTURES.map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(value) =>
            onChange({ ...settings, picture: value as JigsawSettings["picture"] })
          }
        />
      </SettingRow>
      <SettingRow icon="layers" id="pieces" label="Pieces">
        <SettingSelect
          id="pieces"
          label="Pieces"
          value={String(settings.side)}
          disabled={!editable}
          options={JIGSAW_SIZES.map((s) => ({
            value: String(s.side),
            label: `${s.side * s.side} pieces`,
          }))}
          onChange={(value) =>
            onChange({ ...settings, side: Number(value) as JigsawSettings["side"] })
          }
        />
      </SettingRow>
    </>
  );
}
