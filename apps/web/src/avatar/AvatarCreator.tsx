import { isCustomAvatar, type AvatarField } from "@whizard/protocol";
import { useState, type CSSProperties } from "react";
import { updateAccount, useAccount } from "../account";
import { navigate } from "../router";
import { loadAvatar, loadMyAvatar, saveAvatar, saveMyAvatar } from "../storage";
import { SideLayout } from "../ui/Chrome";
import { useAction } from "../ui/common";
import { Icon } from "../ui/Icon";
import { decodeAvatar, DEFAULT_PARTS, encodeAvatar, randomParts, type AvatarParts } from "./code";
import {
  EXPRESSIONS,
  EYE_GAPS,
  hasPose,
  NONE,
  optionOf,
  PALETTES,
  PARTS,
  poseOf,
  POSES,
  swatchOf,
  type PaletteName,
  type PartCategory,
} from "./parts";
import { useAvatarPicture, type View } from "./render";

// "Build your Whizard": the avatar is the hero on its stage, with the player's usual expression
// under it, and a wardrobe of parts beside it. Every choice is shown on the player's own avatar.

// Close-ups, so small parts like eyes are easy to compare.
const EYES: View = { x: 292, y: 250, size: 440 };
const MOUTH: View = { x: 309, y: 470, size: 400 };
const EARS: View = { x: 162, y: 330, size: 700 };
const BODY: View = { x: 162, y: 424, size: 600 };
const FACE: View = { x: 162, y: 150, size: 700 };
const HEAD: View = { x: 112, y: 40, size: 800 };

type Row =
  | { kind: "options"; field: AvatarField; category: PartCategory; label?: string; view?: View }
  | { kind: "poses"; label?: string }
  | { kind: "gap"; label: string }
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
  /** The close-up of the player's avatar on the tab. */
  view?: View;
  rows: Row[];
  note?: string;
}

const ALL_TABS: Tab[] = [
  {
    id: "pose",
    label: "Pose",
    rows: [{ kind: "poses" }],
  },
  {
    id: "face",
    label: "Skin",
    view: FACE,
    rows: [
      { kind: "colours", field: "skin", palette: "skin", label: "Skin tone" },
      { kind: "options", field: "face", category: "face", label: "Face shape", view: FACE },
    ],
  },
  {
    id: "hair",
    label: "Hair",
    view: HEAD,
    rows: [
      { kind: "colours", field: "hairColour", palette: "hair", label: "Hair colour" },
      { kind: "options", field: "hair", category: "hair", label: "Style" },
    ],
  },
  {
    id: "eyes",
    label: "Eyes",
    view: EYES,
    rows: [
      { kind: "colours", field: "eyeColour", palette: "eyes", label: "Eye colour" },
      { kind: "gap", label: "Space between the eyes" },
      { kind: "options", field: "eyes", category: "eyes", label: "Shape", view: EYES },
    ],
  },
  {
    id: "lashes",
    label: "Lashes",
    view: EYES,
    rows: [{ kind: "options", field: "lashes", category: "lashes", view: EYES }],
  },
  {
    id: "brows",
    label: "Brows",
    view: EYES,
    note: "Eyebrows are the same colour as the hair.",
    rows: [{ kind: "options", field: "brows", category: "brows", view: EYES }],
  },
  {
    id: "mouth",
    label: "Mouth",
    view: MOUTH,
    note: "Your mouth when your expression is Happy. The other expressions pick their own.",
    rows: [{ kind: "options", field: "mouth", category: "mouth", view: MOUTH }],
  },
  {
    id: "facial-hair",
    label: "Beard",
    view: MOUTH,
    note: "Facial hair is the same colour as the hair.",
    rows: [{ kind: "options", field: "facialHair", category: "facialHair", view: MOUTH }],
  },
  {
    id: "glasses",
    label: "Glasses",
    view: EYES,
    rows: [{ kind: "options", field: "glasses", category: "glasses", view: EYES }],
  },
  {
    id: "earrings",
    label: "Earrings",
    view: EARS,
    rows: [{ kind: "options", field: "earrings", category: "earrings", view: EARS }],
  },
  {
    id: "hats",
    label: "Hats",
    view: HEAD,
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
    view: BODY,
    rows: [
      { kind: "colours", field: "topColour", palette: "clothes", label: "Colour" },
      { kind: "options", field: "top", category: "top", label: "Style", view: BODY },
    ],
  },
  {
    id: "jacket",
    label: "Jacket",
    view: BODY,
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
    view: HEAD,
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
    label: "Colour",
    rows: [{ kind: "colours", field: "background", palette: "background", label: "Background" }],
  },
];

/** There's something to pick in a row: more than one option (None counts) in the pose. */
function rowShows(row: Row, parts: AvatarParts): boolean {
  if (row.kind === "poses") return POSES.length > 1;
  if (row.kind === "gap") return PARTS.eyes.length > 1;
  if (row.kind === "colours") return !row.when || row.when(parts);
  const pose = poseOf(parts.pose);
  return PARTS[row.category].filter((o) => hasPose(o, pose)).length > 1;
}

/**
 * The tabs with something to pick. Art arrives one part at a time, so a part with nothing drawn
 * yet isn't offered; colours count on their own only for the skin and the background.
 */
function tabsFor(parts: AvatarParts): Tab[] {
  return ALL_TABS.filter((tab) =>
    tab.rows.some((row) =>
      row.kind === "colours"
        ? (row.field === "skin" || row.field === "background") && rowShows(row, parts)
        : rowShows(row, parts),
    ),
  );
}

/** Expressions only change anything once there are mouths to change. */
const EXPRESSIONS_SHOW = PARTS.mouth.length > 1;

/** A wink needs eyes drawn closed; until then it isn't offered. */
function expressionsFor(parts: AvatarParts) {
  const winks = optionOf("eyes", parts.eyes).files.includes("closed");
  return EXPRESSIONS.filter((e) => e.eyes !== "wink" || winks);
}

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

/** Moving to a pose keeps each part the pose has art for, and swaps out any it hasn't. */
function inPose(parts: AvatarParts, poseId: string): AvatarParts {
  const pose = poseOf(poseId);
  const next = { ...parts, pose: poseId };
  for (const [field, category] of Object.entries(FIELD_CATEGORIES) as [
    AvatarField,
    PartCategory,
  ][]) {
    if (!hasPose(optionOf(category, next[field]), pose)) {
      next[field] = PARTS[category].find((o) => hasPose(o, pose))?.id ?? NONE;
    }
  }
  return next;
}

const FIELD_CATEGORIES: Partial<Record<AvatarField, PartCategory>> = {
  face: "face",
  hair: "hair",
  eyes: "eyes",
  brows: "brows",
  mouth: "mouth",
  facialHair: "facialHair",
  glasses: "glasses",
  earrings: "earrings",
  headwear: "headwear",
  top: "top",
  jacket: "jacket",
  headAccessory: "headAccessory",
  faceAccessory: "faceAccessory",
  neckAccessory: "neckAccessory",
};

export function AvatarCreator() {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  return (
    <SideLayout active="profile" className="account-page avatar-page">
      {account.status === "loading" ? null : (
        <Builder start={startingParts(user?.avatar ?? loadAvatar())} signedIn={user !== null} />
      )}
    </SideLayout>
  );
}

function Builder({ start, signedIn }: { start: AvatarParts; signedIn: boolean }) {
  const [parts, setParts] = useState(start);
  const tabs = tabsFor(parts);
  const [tabId, setTabId] = useState(tabs[0]!.id);
  const saving = useAction();
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]!;
  const code = encodeAvatar(parts);
  const set = (field: AvatarField, id: string) => setParts((p) => ({ ...p, [field]: id }));
  const back = backPath();
  const stage = { "--stage": swatchOf("background", parts.background).colour } as CSSProperties;

  const save = () =>
    saving.run(async () => {
      saveMyAvatar(code);
      saveAvatar(code);
      if (signedIn) await updateAccount({ avatar: code });
      navigate(back);
    });

  return (
    <div className="builder">
      <section className="builder-stage" style={stage} aria-labelledby="builder-title">
        <h1 className="builder-title" id="builder-title">
          Build your <span>Whizard</span>
        </h1>
        <div className="builder-hero">
          <Picture code={code} size={300} className="builder-picture" label="Your avatar" />
        </div>
        {EXPRESSIONS_SHOW && (
          <div className="builder-faces" role="radiogroup" aria-label="Expression">
            {expressionsFor(parts).map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={parts.expression === e.id}
                title={e.name}
                onClick={() => set("expression", e.id)}
              >
                <Picture
                  code={encodeAvatar({ ...parts, expression: e.id })}
                  size={52}
                  view={FACE}
                />
                <span>{e.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="builder-actions">
          <button
            type="button"
            className="btn builder-dice"
            onClick={() => setParts(randomParts())}
          >
            <Icon name="repeat" size={20} />
            Surprise me
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving.busy}
            onClick={() => void save()}
          >
            {saving.busy ? "Saving…" : "Save my Whizard"}
          </button>
        </div>
        {saving.error && (
          <p className="error" role="alert">
            {saving.error}
          </p>
        )}
        <button type="button" className="builder-cancel" onClick={() => navigate(back)}>
          Cancel
        </button>
      </section>

      <section className="builder-wardrobe" aria-label="Wardrobe">
        <div className="wardrobe-rail" role="tablist" aria-label="Parts">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`builder-tab-${t.id}`}
              aria-selected={t.id === tab.id}
              aria-controls="builder-panel"
              onClick={() => setTabId(t.id)}
            >
              {t.view ? (
                <Picture code={code} size={48} view={t.view} />
              ) : t.id === "pose" ? (
                <Picture code={code} size={48} />
              ) : (
                <i
                  className="rail-swatch"
                  style={{ background: swatchOf("background", parts.background).colour }}
                />
              )}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div
          className="wardrobe-panel"
          id="builder-panel"
          role="tabpanel"
          aria-labelledby={`builder-tab-${tab.id}`}
        >
          {tab.rows
            .filter((row) => rowShows(row, parts))
            .map((row) =>
              row.kind === "colours" ? (
                <Colours
                  key={row.field}
                  row={row}
                  value={parts[row.field]}
                  onPick={(id) => set(row.field, id)}
                />
              ) : row.kind === "gap" ? (
                <EyeGap
                  key="gap"
                  label={row.label}
                  value={parts.eyeGap}
                  onPick={(id) => set("eyeGap", id)}
                />
              ) : row.kind === "poses" ? (
                <Poses key="poses" parts={parts} onPick={(id) => setParts(inPose(parts, id))} />
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
  );
}

const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function Picture({
  code,
  size,
  view,
  className,
  label = "",
}: {
  code: string;
  size: number;
  view?: View;
  className?: string;
  label?: string;
}) {
  const url = useAvatarPicture(code, size, undefined, view);
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
  const pose = poseOf(parts.pose);
  return (
    <div className="wardrobe-row">
      {row.label && <h2 className="wardrobe-label">{row.label}</h2>}
      <div className="wardrobe-options" role="radiogroup" aria-label={label}>
        {PARTS[row.category]
          .filter((option) => hasPose(option, pose))
          .map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={parts[row.field] === option.id}
              aria-label={option.name}
              onClick={() => onPick(option.id)}
            >
              <Picture
                code={encodeAvatar({ ...parts, [row.field]: option.id })}
                size={88}
                view={row.view}
              />
              <span>{option.name}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

function EyeGap({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (id: string) => void;
}) {
  const at = Math.max(
    0,
    EYE_GAPS.findIndex((g) => g.id === value),
  );
  const step = (by: number) => {
    const next = EYE_GAPS[at + by];
    if (next) onPick(next.id);
  };
  return (
    <div className="wardrobe-row">
      <h2 className="wardrobe-label" id="builder-gap">
        {label}
      </h2>
      <div className="eye-gap" role="group" aria-labelledby="builder-gap">
        <button
          type="button"
          aria-label="Eyes closer together"
          disabled={at === 0}
          onClick={() => step(-1)}
        >
          <Chevron flip />
        </button>
        <span className="eye-gap-meter" aria-live="polite">
          {EYE_GAPS.map((g, i) => (
            <i key={g.id} className={i === at ? "on" : undefined} />
          ))}
          <span className="sr-only">{EYE_GAPS[at]!.name}</span>
        </span>
        <button
          type="button"
          aria-label="Eyes further apart"
          disabled={at === EYE_GAPS.length - 1}
          onClick={() => step(1)}
        >
          <Chevron />
        </button>
      </div>
    </div>
  );
}

function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={flip ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Poses({ parts, onPick }: { parts: AvatarParts; onPick: (id: string) => void }) {
  return (
    <div className="wardrobe-row">
      <div className="wardrobe-options" role="radiogroup" aria-label="Pose">
        {POSES.map((pose) => (
          <button
            key={pose.id}
            type="button"
            role="radio"
            aria-checked={parts.pose === pose.id}
            aria-label={pose.name}
            onClick={() => onPick(pose.id)}
          >
            <Picture code={encodeAvatar(inPose(parts, pose.id))} size={88} />
            <span>{pose.name}</span>
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
  const labelId = `builder-${row.field}`;
  return (
    <div className="wardrobe-row">
      <h2 className="wardrobe-label" id={labelId}>
        {row.label}
      </h2>
      <div className="wardrobe-swatches" role="radiogroup" aria-labelledby={labelId}>
        {PALETTES[row.palette].map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            role="radio"
            aria-checked={value === swatch.id}
            aria-label={swatch.name}
            title={swatch.name}
            style={{ "--swatch": swatch.colour } as CSSProperties}
            onClick={() => onPick(swatch.id)}
          />
        ))}
      </div>
    </div>
  );
}
