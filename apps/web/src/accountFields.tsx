import { normalizeNickname } from "@whizard/game-core";
import { USERNAME_MIN_LENGTH, normalizeUsername, usernameProblem } from "@whizard/protocol";
import { useEffect, useState } from "react";
import { checkUsername } from "./account";

// The username and display name checks, shared by sign-up and the settings page.

export const USERNAME_HINTS = {
  length: "3 to 20 characters.",
  characters: "Lowercase letters, numbers and _ only, starting with a letter.",
  reserved: "That username isn’t available.",
} as const;

export const USERNAME_ABOUT =
  "Unique, and how friends find you. You can change it once every 7 days.";
export const DISPLAY_NAME_ABOUT =
  "What everyone sees in games and on leaderboards. Emojis welcome.";

/**
 * Checks a username as it's typed: the rules at once, and whether it's free after a short
 * pause. `current` is the account's own username, which needs no check.
 */
export function useUsernameCheck(input: string, current?: string) {
  const username = normalizeUsername(input);
  const problem = username ? usernameProblem(username) : null;
  const [result, setResult] = useState<{ username: string; available: boolean; reason?: string }>();

  useEffect(() => {
    if (!username || problem || username === current) return;
    const timer = setTimeout(() => {
      checkUsername(username).then(
        (check) => setResult({ username, ...check }),
        () => {},
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [username, problem, current]);

  const checked = result?.username === username ? result : undefined;
  // Too short is only "not yet" while it's being typed, so it's a hint rather than an error.
  const tooShort = problem === "length" && username.length < USERNAME_MIN_LENGTH;
  const error =
    problem && !tooShort
      ? USERNAME_HINTS[problem]
      : checked && !checked.available
        ? (checked.reason ?? "That username isn’t available.")
        : null;
  return {
    username,
    /** Why it can't be used, if we know: breaks a rule, or taken. */
    problem: error,
    /** Can't be used as it is, error or not. */
    blocked: !!problem || !!error,
    tooShort,
    available: checked?.available === true,
  };
}

/**
 * The line under a username field: what's wrong, that it's free, or (with `about`) what it's
 * for. Empty otherwise, but kept, so what it says next is read out.
 */
export function UsernameHint({
  id,
  check,
  about,
  className = "",
}: {
  id: string;
  check: ReturnType<typeof useUsernameCheck>;
  about?: string;
  className?: string;
}) {
  return (
    <p
      id={id}
      className={`${className} small ${check.problem ? "error" : check.available ? "ok-text" : "muted"}`}
      aria-live="polite"
    >
      {check.problem ??
        (check.available
          ? `@${check.username} is available.`
          : check.tooShort
            ? USERNAME_HINTS.length
            : about)}
    </p>
  );
}

/** What's wrong with a display name as typed, if anything. Empty is only "not yet". */
export function displayNameProblem(name: string): string | null {
  return name.trim() !== "" && normalizeNickname(name) === null
    ? "Up to 20 characters. An emoji counts as one."
    : null;
}

/** Under a display name field: what's wrong, or (with `about`) what it's for. */
export function DisplayNameHint({
  id,
  error,
  about,
  className = "",
}: {
  id: string;
  error: string | null;
  about?: string;
  className?: string;
}) {
  return (
    <p id={id} className={`${className} small ${error ? "error" : "muted"}`}>
      {error ?? about}
    </p>
  );
}
