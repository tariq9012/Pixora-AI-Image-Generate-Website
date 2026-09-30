import { useCallback, useEffect, useRef, useState } from "react";

export type GenStatus = "ready" | "queued" | "processing" | "completed" | "failed";

export function useMockGeneration() {
  const [status, setStatus] = useState<GenStatus>("ready");
  const [progress, setProgress] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => clear, []);

  const start = useCallback((opts?: { fail?: boolean }) => {
    clear();
    setProgress(0);
    setStatus("queued");
    timers.current.push(setTimeout(() => setStatus("processing"), 700));
    [10, 26, 44, 63, 81, 94].forEach((p, i) => {
      timers.current.push(setTimeout(() => setProgress(p), 900 + i * 320));
    });
    timers.current.push(
      setTimeout(() => {
        setProgress(100);
        setStatus(opts?.fail ? "failed" : "completed");
      }, 3000),
    );
  }, []);

  const reset = useCallback(() => {
    clear();
    setProgress(0);
    setStatus("ready");
  }, []);

  const busy = status === "queued" || status === "processing";

  return { status, progress, busy, start, reset };
}

export const STATUS_LABEL: Record<GenStatus, string> = {
  ready: "Ready",
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};
