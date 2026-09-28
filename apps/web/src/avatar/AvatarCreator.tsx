import { isCustomAvatar, type AvatarField } from "@whizard/protocol";
import { useState } from "react";
import { updateAccount, useAccount } from "../account";
import { navigate } from "../router";
import { loadAvatar, loadMyAvatar, saveAvatar, saveMyAvatar } from "../storage";
import { SideLayout } from "../ui/Chrome";
import { useAction } from "../ui/common";
import { Icon } from "../ui/Icon";
import { decodeAvatar, DEFAULT_PARTS, encodeAvatar, randomParts, type AvatarParts } from "./code";
import type { Pose } from "./layers";
import { NONE, optionOf, PALETTES, PARTS, type PaletteName, type PartCategory } from "./parts";
import { useAvatarPicture, type View } from "./render";

// Close-ups for the option pictures, so small parts like eyes are easy to compare.
const EYES: View = { x: 262, y: 280, size: 500 };
const MOUTH: View = { x: 262, y: 420, size: 500 };
const EARS: View = { x: 162, y: 330, size: 700 };
const BODY: View = { x: 162, y: 424, size: 600 };
const FACE: View = { x: 162, y: 150, size: 700 };

type Row =
  | { kind: "options"; field: AvatarField; category: PartCategory; label?: string; view?: View }
  | {
      kind: "colours";
      field: AvatarField;
      palette: PaletteName;
      label: string;
      /** Only shown when this is true, e.g. a hat that can be recoloured. */
      when?: (parts: AvatarParts) => boolean;
    };

interface Tab {
  id: string;
  label: string;
  rows: Row[];
  note?: string;
}

const TABS: Tab[] = [
  {
    id: "face",
    label: "Face",
    rows: [
      { kind: "colours", field: "skin", palette: "skin", label: "Skin tone" },
      { kind: "options", field: "face", category: "face", label: "Face shape", view: FACE },
    ],
  },
  {
    id: "hair",
    label: "Hair",
    rows: [
      { kind: "colours", field: "hairColour", palette: "hair", label: "Hair colour" },
      { kind: "options", field: "hair", category: "hair", label: "Style" },
    ],
  },
  {
    id: "eyes",
    label: "Eyes",
    rows: [{ kind: "options", field: "eyes", category: "eyes", view: EYES }],
  },
  {
    id: "brows",
    label: "Eyebrows",
    note: "Eyebrows are the same colour as the hair.",
    rows: [{ kind: "options", field: "brows", category: "brows", view: EYES }],
  },
  {
    id: "mouth",
    label: "Expression",
    rows: [{ kind: "options", field: "mouth", category: "mouth", view: MOUTH }],
  },
  {
    id: "facial-hair",
    label: "Facial hair",
    note: "Facial hair is the same colour as the hair.",
    rows: [{ kind: "options", field: "facialHair", category: "facialHair", view: MOUTH }],
  },
  {
    id: "glasses",
    label: "Glasses",
    rows: [{ kind: "options", field: "glasses", category: "glasses", view: EYES }],
  },
  {
    id: "earrings",
    label: "Earrings",
    rows: [{ kind: "options", field: "earrings", category: "earrings", view: EARS }],
  },
  {
    id: "hats",
    label: "Hats",
    rows: [
      { kind: "options", field: "headwear", category: "headwear" },
      {
        kind: "colours",
        field: "headwearColour",
        palette: "clothes",
        label: "Colour",
        when: (parts) => optionOf("headwear", parts.headwear).recolour === true,
      },
    ],
  },
  {
    id: "top",
    label: "Top",
    rows: [
      { kind: "colours", field: "topColour", palette: "clothes", label: "Colour" },
      { kind: "options", field: "top", category: "top", label: "Style", view: BODY },
    ],
  },
  {
    id: "jacket",
    label: "Jacket",
    rows: [
      { kind: "options", field: "jacket", category: "jacket", view: BODY },
      {
        kind: "colours",
        field: "jacketColour",
        palette: "clothes",
        label: "Colour",
        when: (parts) => parts.jacket !== NONE,
      },
    ],
  },
  {
    id: "extras",
    label: "Extras",
    rows: [
      { kind: "options", field: "headAccessory", category: "headAccessory", label: "On your head" },
      {
        kind: "options",
        field: "faceAccessory",
        category: "faceAccessory",
        label: "On your face",
        view: FACE,
      },
      {
        kind: "options",
        field: "neckAccessory",
        category: "neckAccessory",
        label: "Round your neck",
        view: BODY,
      },
    ],
  },
  {
    id: "background",
    label: "Background",
    rows: [{ kind: "colours", field: "background", palette: "background", label: "Colour" }],
  },
];

/** Faces to try the avatar with: the ones it pulls during games. */
const REACTIONS: { label: string; pose: Pose }[] = [
  { label: "Right answer", pose: { eyes: "closed", mouth: "laugh", brows: "raised" } },
  { label: "Wrong answer", pose: { mouth: "wince", brows: "worried" } },
  { label: "Surprised", pose: { eyes: "wide", mouth: "surprised", brows: "raised" } },
  { label: "Wink", pose: { eyes: "wink", mouth: "smirk" } },
];

/** Where Save and Cancel go: the page that opened the creator, if it's one of ours. */
function backPath(): string {
  const back = new URLSearchParams(location.search).get("back");
  return back && back.startsWith("/") && !back.startsWith("//") ? back : "/account";
}

function startingParts(avatar: string | null | undefined): AvatarParts {
  if (isCustomAvatar(avatar)) return decodeAvatar(avatar);
  const mine = loadMyAvatar();
  return isCustomAvatar(mine) ? decodeAvatar(mine) : DEFAULT_PARTS;
}

export function AvatarCreator() {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  return (
    <SideLayout active="profile" className="account-page avatar-page">
      {account.status === "loading" ? null : (
        <Creator start={startingParts(user?.avatar ?? loadAvatar())} signedIn={user !== null} />
      )}
    </SideLayout>
  );
}

function Creator({ start, signedIn }: { start: AvatarParts; signedIn: boolean }) {
  const [parts, setParts] = useState(start);
  const [tabId, setTabId] = useState(TABS[0]!.id);
  const [reaction, setReaction] = useState<number | null>(null);
  const saving = useAction();
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0]!;
  const code = encodeAvatar(parts);
  const set = (field: AvatarField, id: string) => setParts((p) => ({ ...p, [field]: id }));
  const back = backPath();

  const save = () =>
    saving.run(async () => {
      saveMyAvatar(code);
      saveAvatar(code);
      if (signedIn) await updateAccount({ avatar: code });
      navigate(back);
    });

  return (
    <div className="screen creator">
      <header>
        <h1 className="page-title">Your avatar</h1>
        <p className="muted">Make one that looks like you, or nothing like you.</p>
      </header>

      <div className="creator-layout">
        <section className="panel creator-preview" aria-label="Preview">
          <Picture
            code={code}
            size={240}
            pose={reaction === null ? undefined : REACTIONS[reaction]!.pose}
            className="creator-picture"
            label="Your avatar"
          />
          <div className="creator-reactions" role="group" aria-label="Try a reaction">
            {REACTIONS.map((r, i) => (
              <button
                key={r.label}
                type="button"
                className="chip"
                aria-pressed={reaction === i}
                onClick={() => setReaction(reaction === i ? null : i)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="creator-actions">
            <button type="button" className="btn" onClick={() => setParts(randomParts())}>
              <Icon name="repeat" size={20} />
              Surprise me
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving.busy}
              onClick={() => void save()}
            >
              {saving.busy ? "Saving…" : "Save avatar"}
            </button>
          </div>
          {saving.error && (
            <p className="error" role="alert">
              {saving.error}
            </p>
          )}
          <button type="button" className="creator-cancel" onClick={() => navigate(back)}>
            Cancel
          </button>
        </section>

        <section className="panel creator-parts">
          <div className="chips creator-tabs" role="tablist" aria-label="Parts">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`creator-tab-${t.id}`}
                className="chip"
                aria-selected={t.id === tab.id}
                aria-controls="creator-panel"
                onClick={() => setTabId(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            className="creator-panel"
            id="creator-panel"
            role="tabpanel"
            aria-labelledby={`creator-tab-${tab.id}`}
          >
            {tab.rows.map((row) =>
              row.kind === "colours" ? (
                (!row.when || row.when(parts)) && (
                  <Colours
                    key={row.field}
                    row={row}
                    value={parts[row.field]}
                    onPick={(id) => set(row.field, id)}
                  />
                )
              ) : (
                <Options
                  key={row.field}
                  row={row}
                  label={row.label ?? tab.label}
                  parts={parts}
                  onPick={(id) => set(row.field, id)}
                />
              ),
            )}
            {tab.note && <p className="muted small">{tab.note}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function Picture({
  code,
  size,
  pose,
  view,
  className,
  label = "",
}: {
  code: string;
  size: number;
  pose?: Pose;
  view?: View;
  className?: string;
  label?: string;
}) {
  const url = useAvatarPicture(code, size, pose, view);
  return (
    <img
      className={className}
      src={url ?? BLANK}
      alt={label}
      width={size}
      height={size}
      data-avatar={url ? code : undefined}
    />
  );
}

function Options({
  row,
  label,
  parts,
  onPick,
}: {
  row: Extract<Row, { kind: "options" }>;
  label: string;
  parts: AvatarParts;
  onPick: (id: string) => void;
}) {
  return (
    <div className="creator-row">
      {row.label && <h2 className="creator-label">{row.label}</h2>}
      <div className="creator-options" role="radiogroup" aria-label={label}>
        {PARTS[row.category].map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={parts[row.field] === option.id}
            aria-label={option.name}
            title={option.name}
            onClick={() => onPick(option.id)}
          >
            <Picture
              code={encodeAvatar({ ...parts, [row.field]: option.id })}
              size={92}
              view={row.view}
            />
            <span>{option.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Colours({
  row,
  value,
  onPick,
}: {
  row: Extract<Row, { kind: "colours" }>;
  value: string;
  onPick: (id: string) => void;
}) {
  const labelId = `creator-${row.field}`;
  return (
    <div className="creator-row">
      <h2 className="creator-label" id={labelId}>
        {row.label}
      </h2>
      <div className="creator-swatches" role="radiogroup" aria-labelledby={labelId}>
        {PALETTES[row.palette].map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            role="radio"
            aria-checked={value === swatch.id}
            aria-label={swatch.name}
            title={swatch.name}
            style={{ background: swatch.colour }}
            onClick={() => onPick(swatch.id)}
          />
        ))}
      </div>
    </div>
  );
}
