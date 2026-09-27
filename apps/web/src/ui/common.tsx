import { useEffect, useState } from "react";

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/** Runs an async action, tracking whether it's busy and what went wrong. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** Loads data on mount, and again whenever `reload` is called. Keeps showing old data meanwhile. */
export function useLoaded<T>(load: () => Promise<T>): {
  data: T | null;
  error: string | null;
  reload: () => void;
} {
  const [result, setResult] = useState<{ data: T | null; error: string | null }>({
    data: null,
    error: null,
  });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setResult({ data, error: null }),
      (error: unknown) => live && setResult({ data: null, error: errorText(error) }),
    );
    return () => {
      live = false;
    };
  }, [load, version]);
  return { ...result, reload: () => setVersion((v) => v + 1) };
}
