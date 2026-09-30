import { NICKNAME_INPUT_MAX_LENGTH, normalizeNickname } from "@whizard/game-core";
import {
  USERNAME_MAX_LENGTH,
  isAvatarValue,
  nextUsernameChange,
  type AccountPasskey,
  type AccountUser,
} from "@whizard/protocol";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  addPasskey,
  changeUsername,
  deleteAccount,
  fetchPasskeys,
  removePasskey,
  updateAccount,
  useAccount,
} from "./account";
import {
  DisplayNameHint,
  UsernameHint,
  displayNameProblem,
  useUsernameCheck,
} from "./accountFields";
import { setReduceMotion, useReduceMotionSetting } from "./display";
import { disablePings, enablePings, localTimeZone, pingSupport, pingsOnThisDevice } from "./pings";
import { linkTo, navigate } from "./router";
import { setMuted, useMuted } from "./sounds";
import { Avatar } from "./ui/Avatar";
import { AvatarPicker } from "./ui/AvatarPicker";
import { TopLayout } from "./ui/Chrome";
import { useLoaded, useMediaQuery } from "./ui/common";
import { useConfirm } from "./ui/ConfirmDialog";
import { useShakeOnError } from "./ui/errorShake";
import { Icon } from "./ui/Icon";
import { Loading } from "./ui/Loading";
import {
  AFTER_ANSWER_CHOICES,
  EXPLANATION_CHOICES,
  Segmented,
  Switch,
  useAccountSetting,
} from "./ui/SettingControls";
import { useToast, useToastAction } from "./ui/toast";

/** The account's settings, reached from the gear on the profile. */
export function SettingsScreen() {
  const account = useAccount();
  return (
    <TopLayout active="profile" className="account-page settings-page" column>
      {account.status === "loading" ? (
        <Loading />
      ) : account.user ? (
        <Settings user={account.user} />
      ) : (
        <div className="screen">
          <h1 className="page-title">Settings</h1>
          <a
            className="btn btn-primary btn-block"
            {...linkTo(`/account?next=${encodeURIComponent("/account/settings")}`)}
          >
            Sign in or create an account
          </a>
        </div>
      )}
    </TopLayout>
  );
}

function Settings({ user }: { user: AccountUser }) {
  // "Edit profile" links to a section; the page arrives after the link has looked for it.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div className="prefs-page">
      <header className="sub-head">
        <a className="icon-btn" aria-label="Back" title="Back" {...linkTo("/account")}>
          <Icon name="chevronLeft" size={26} stroke={2.2} />
        </a>
        <h1>Settings</h1>
      </header>
      <ProfileSettings user={user} />
      <PlayingSettings user={user} />
      <PingSettings user={user} />
      <Group id="privacy" title="Privacy">
        <PrivacySettings user={user} />
      </Group>
      <Group id="sign-in" title="Sign-in">
        <Passkeys />
      </Group>
      <Group id="data" title="Your data">
        <Data />
      </Group>
    </div>
  );
}

/** A titled group of settings rows. */
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="prefs" id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}

/** One row: its name on the left, its control on the right, anything more underneath. */
function Row({
  name,
  nameId,
  htmlFor,
  detail,
  control,
  below,
  stacked = false,
}: {
  name: string;
  nameId?: string;
  htmlFor?: string;
  detail?: ReactNode;
  control?: ReactNode;
  below?: ReactNode;
  /** The control under the name, the full width of the row, as for a choice of two. */
  stacked?: boolean;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={stacked ? "pref stacked" : "pref"}>
      <Label className="pref-name" id={nameId} htmlFor={htmlFor}>
        {name}
        {detail && <small>{detail}</small>}
      </Label>
      {control}
      {below && <div className="pref-below">{below}</div>}
    </div>
  );
}

// Profile ---------------------------------------------------------------------------------------

function ProfileSettings({ user }: { user: AccountUser }) {
  return (
    <Group id="profile" title="Profile">
      <DisplayNameSetting user={user} />
      <UsernameSetting user={user} />
      <AvatarSetting user={user} />
    </Group>
  );
}

function DisplayNameSetting({ user }: { user: AccountUser }) {
  const [name, setName] = useState(user.displayName);
  const saving = useToastAction();
  const changed = normalizeNickname(name) !== null && name.trim() !== user.displayName;
  const error = displayNameProblem(name);
  const { ref, isError, shake } = useShakeOnError<HTMLInputElement>(error);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    void saving.run(async () => {
      try {
        await updateAccount({ displayName: name });
      } catch (error) {
        // Turned down by the server, e.g. a blocked word: shake, then say why.
        shake();
        throw error;
      }
    });
  };

  return (
    <form className="pref" onSubmit={handleSubmit}>
      <label className="pref-name" htmlFor="profile-name">
        Display name
      </label>
      <span className="pref-field">
        <input
          ref={ref}
          className={`t-input${isError ? " is-error" : ""}`}
          id="profile-name"
          name="display-name"
          aria-invalid={isError}
          value={name}
          maxLength={NICKNAME_INPUT_MAX_LENGTH}
          autoComplete="nickname"
          aria-describedby="profile-name-hint"
          onChange={(event) => setName(event.target.value)}
        />
        <button className="pref-btn" type="submit" disabled={!changed || saving.busy}>
          Save
        </button>
      </span>
      <DisplayNameHint id="profile-name-hint" error={error} className="pref-below" />
    </form>
  );
}

const changeDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" });

function UsernameSetting({ user }: { user: AccountUser }) {
  const ask = useConfirm();
  const [value, setValue] = useState(user.username);
  const check = useUsernameCheck(value, user.username);
  const { ref, isError, shake } = useShakeOnError<HTMLSpanElement>(check.problem);
  const saving = useToastAction();
  const toast = useToast();
  const [openedAt] = useState(Date.now);
  const lockedUntil = nextUsernameChange(user.usernameChangedAt, openedAt);
  const changed = !!check.username && check.username !== user.username;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const username = check.username;
    if (!changed || check.blocked || lockedUntil !== null) return;
    const change = () =>
      void saving.run(async () => {
        try {
          await changeUsername(username);
        } catch (error) {
          // Turned down by the server (a blocked word, or taken a moment ago): shake, then say why.
          shake();
          throw error;
        }
        toast.show({
          title: "Username changed",
          description: `Friends can find you as @${username} now.`,
          status: "success",
        });
      });
    ask({
      title: `Change your username to @${username}?`,
      text: "You can’t change it again for 7 days.",
      yes: "Change",
      run: change,
    });
  };

  return (
    <form className="pref" onSubmit={handleSubmit}>
      <label className="pref-name" htmlFor="profile-username">
        Username
      </label>
      <span className="pref-field">
        <span ref={ref} className={`handle-input t-input${isError ? " is-error" : ""}`}>
          <span aria-hidden="true">@</span>
          <input
            id="profile-username"
            name="username"
            value={value}
            maxLength={USERNAME_MAX_LENGTH + 1}
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            disabled={lockedUntil !== null}
            aria-invalid={isError}
            aria-describedby="profile-username-hint"
            onChange={(event) => setValue(event.target.value)}
          />
        </span>
        <button
          className="pref-btn"
          type="submit"
          disabled={!changed || check.blocked || lockedUntil !== null || saving.busy}
        >
          Change
        </button>
      </span>
      {lockedUntil !== null ? (
        <p id="profile-username-hint" className="pref-below muted small">
          You can change it again on {changeDay.format(lockedUntil)}.
        </p>
      ) : (
        <UsernameHint id="profile-username-hint" check={check} className="pref-below" />
      )}
    </form>
  );
}

function AvatarSetting({ user }: { user: AccountUser }) {
  const [open, setOpen] = useState(false);
  const saving = useToastAction();
  return (
    <Row
      name="Avatar"
      nameId="avatar-setting"
      control={
        <span className="pref-field">
          <Avatar id={user.avatar} name={user.username} size={40} />
          <button
            className="pref-btn"
            type="button"
            aria-label="Change avatar"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Done" : "Change"}
          </button>
        </span>
      }
      below={
        open && (
          <AvatarPicker
            value={user.avatar ?? null}
            onPick={(avatar) => {
              if (isAvatarValue(avatar)) void saving.run(() => updateAccount({ avatar }));
            }}
            labelledBy="avatar-setting"
            size={44}
            disabled={saving.busy}
          />
        )
      }
    />
  );
}

// Playing ---------------------------------------------------------------------------------------

/** The same settings as the Settings dialog, which guests and games use. */
function PlayingSettings({ user }: { user: AccountUser }) {
  const muted = useMuted();
  const reduceMotion = useReduceMotionSetting();
  const { busy, save } = useAccountSetting();
  return (
    <Group id="playing" title="Playing">
      <Row
        name="Sound"
        nameId="pref-sound"
        control={
          <Switch checked={!muted} onChange={(on) => setMuted(!on)} labelledBy="pref-sound" />
        }
      />
      <Row
        name="Reduce animations"
        nameId="pref-motion"
        control={
          <Switch checked={reduceMotion} onChange={setReduceMotion} labelledBy="pref-motion" />
        }
      />
      <Row
        name="Quiz explanations"
        nameId="pref-explanations"
        stacked
        control={
          <Segmented
            labelledBy="pref-explanations"
            options={EXPLANATION_CHOICES}
            value={user.showExplanations}
            disabled={busy}
            onPick={(value) => save({ showExplanations: value })}
          />
        }
      />
      <Row
        name="After you answer"
        nameId="pref-pause"
        stacked
        control={
          <Segmented
            labelledBy="pref-pause"
            options={AFTER_ANSWER_CHOICES}
            value={user.pauseAfterAnswer}
            disabled={busy}
            onPick={(value) => save({ pauseAfterAnswer: value })}
          />
        }
      />
    </Group>
  );
}

// Pings -----------------------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, h) => h * 60);
const DEFAULT_QUIET = { start: 22 * 60, end: 8 * 60 };
const hourLabel = (minutes: number) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(
    new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60),
  );

function PingSettings({ user }: { user: AccountUser }) {
  const support = pingSupport();
  const device = useLoaded(pingsOnThisDevice);
  const action = useToastAction();
  const phone = useMediaQuery("(pointer: coarse)");
  const quiet = user.quietHours;

  const setQuiet = (next: { start: number; end: number } | null) =>
    void action.run(() => updateAccount({ quietHours: next, timeZone: localTimeZone() }));

  const hourSelect = (id: string, label: string, value: number, key: "start" | "end") => (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        disabled={action.busy}
        onChange={(event) => quiet && setQuiet({ ...quiet, [key]: Number(event.target.value) })}
      >
        {HOURS.map((m) => (
          <option key={m} value={m}>
            {hourLabel(m)}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <Group id="pings" title="Pings">
      <Row
        name="Get pings"
        nameId="pref-pings"
        control={
          <Switch
            checked={user.pings}
            disabled={action.busy}
            onChange={(on) => void action.run(() => updateAccount({ pings: on }))}
            labelledBy="pref-pings"
          />
        }
      />
      {user.pings && (
        <>
          <Row
            name={phone ? "On this phone" : "On this device"}
            stacked={support !== "ready"}
            control={
              support !== "ready" ? (
                <span className="muted small">
                  {support === "needs-install"
                    ? "Add Whizard to your Home Screen (Share, then Add to Home Screen) and open it from there to turn pings on."
                    : "This browser can’t get notifications."}
                </span>
              ) : device.data === null ? (
                <span />
              ) : (
                <button
                  className="pref-btn"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await (device.data ? disablePings() : enablePings());
                      device.reload();
                    })
                  }
                >
                  {device.data ? "Turn off" : "Turn on"}
                </button>
              )
            }
          />
          <Row
            name="Quiet hours"
            nameId="pref-quiet"
            control={
              <Switch
                checked={quiet !== null}
                disabled={action.busy}
                onChange={(on) => setQuiet(on ? (quiet ?? DEFAULT_QUIET) : null)}
                labelledBy="pref-quiet"
              />
            }
            below={
              quiet && (
                <span className="quiet-range">
                  {hourSelect("quiet-start", "Quiet from", quiet.start, "start")}
                  <span className="muted">to</span>
                  {hourSelect("quiet-end", "Quiet until", quiet.end, "end")}
                </span>
              )
            }
          />
        </>
      )}
    </Group>
  );
}

// Privacy, sign-in and data -----------------------------------------------------------------------

function PrivacySettings({ user }: { user: AccountUser }) {
  const { busy, save } = useAccountSetting();
  return (
    <>
      <Row
        name="Show me on the leaderboard"
        nameId="pref-leaderboard"
        control={
          <Switch
            checked={user.publicLeaderboard}
            disabled={busy}
            onChange={(on) => save({ publicLeaderboard: on })}
            labelledBy="pref-leaderboard"
          />
        }
      />
      <a className="pref pref-link" {...linkTo("/privacy")}>
        <span className="pref-name">Privacy policy</span>
        <Icon name="chevronRight" size={18} stroke={2.4} />
      </a>
    </>
  );
}

const addedDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function Passkeys() {
  const ask = useConfirm();
  const [passkeys, setPasskeys] = useState<AccountPasskey[] | null>(null);
  const action = useToastAction();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    fetchPasskeys().then(
      ({ passkeys }) => live && setPasskeys(passkeys),
      () => live && setPasskeys([]),
    );
    return () => {
      live = false;
    };
  }, [version]);

  const reload = () => setVersion((v) => v + 1);

  return (
    <>
      {passkeys?.map((p, i) => (
        <Row
          key={p.id}
          name={p.name ?? `Passkey ${i + 1}`}
          detail={`${p.name ? "Passkey · added" : "Added"} ${addedDay.format(p.createdAt)}`}
          control={
            passkeys.length > 1 ? (
              <button
                className="pref-btn"
                disabled={action.busy}
                onClick={() =>
                  ask({
                    title: "Remove this passkey?",
                    text: "It won’t sign you in any more.",
                    yes: "Remove",
                    run: () =>
                      void action.run(async () => {
                        await removePasskey(p.id);
                        reload();
                      }),
                  })
                }
              >
                Remove
              </button>
            ) : undefined
          }
        />
      ))}
      <Row
        name="Add a passkey"
        nameId="pref-add-passkey"
        control={
          <button
            className="pref-btn"
            aria-describedby="pref-add-passkey"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await addPasskey();
                reload();
              })
            }
          >
            Add
          </button>
        }
      />
    </>
  );
}

function Data() {
  const ask = useConfirm();
  const action = useToastAction();
  return (
    <>
      <Row
        name="Download my data"
        control={
          <a className="pref-btn" href="/api/me/export" download>
            Download
          </a>
        }
      />
      <button
        className="pref-danger"
        disabled={action.busy}
        onClick={() =>
          ask({
            title: "Delete your account?",
            text: "Your stats, history and friends are removed for good.",
            yes: "Delete",
            run: () =>
              void action.run(async () => {
                await deleteAccount();
                navigate("/");
              }),
          })
        }
      >
        Delete account
      </button>
    </>
  );
}
