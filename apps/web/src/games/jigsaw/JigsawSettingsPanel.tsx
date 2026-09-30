import {
  JIGSAW_PICTURES,
  JIGSAW_SIZES,
  JIGSAW_THEMES,
  jigsawSettingsSchema,
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

export const sizeName = (side: number) => {
  const size = JIGSAW_SIZES.find((s) => s.side === side);
  return size ? `${size.name} · ${side * side} pieces` : `${side * side} pieces`;
};

/** The jigsaw's rows in the lobby's Room Settings list. Only the host can change them. */
export function JigsawSettingsRows({
  settings,
  editable,
  onChange,
  onPickPhoto,
}: {
  settings: JigsawSettings;
  editable: boolean;
  onChange: (settings: JigsawSettings) => void;
  /** Opens the photo picker, for the host's own photo. */
  onPickPhoto: () => void;
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
          <span className="dim small">Only people in this room see it.</span>
          <button className="btn btn-small" onClick={onPickPhoto}>
            Change Photo
          </button>
        </div>
      )}
      <SettingRow icon="layers" id="pieces" label="Pieces">
        <SettingSelect
          id="pieces"
          label="Pieces"
          value={String(settings.side)}
          disabled={!editable}
          options={JIGSAW_SIZES.map((s) => ({
            value: String(s.side),
            label: sizeName(s.side),
          }))}
          onChange={(value) =>
            onChange({ ...settings, side: Number(value) as JigsawSettings["side"] })
          }
        />
      </SettingRow>
    </>
  );
}
