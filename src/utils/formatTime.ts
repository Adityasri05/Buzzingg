/**
 * Millisecond Precision Timestamp Utility
 * Provides exact timestamp conversion and formatting for Buzzingg
 */

export const toMs = (val: any): number => {
  if (!val) return 0;
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val.toMillis === "function") return val.toMillis();
  if (typeof val.toDate === "function") return val.toDate().getTime();
  if (typeof val.seconds === "number") {
    const secMs = val.seconds * 1000;
    const nanoMs = typeof val.nanoseconds === "number" ? Math.round(val.nanoseconds / 1000000) : 0;
    return secMs + nanoMs;
  }
  if (val instanceof Date) return val.getTime();
  const p = new Date(val).getTime();
  return isNaN(p) ? 0 : p;
};

export const getEffectiveResponseTime = (buzz: any, startedAt: any): number => {
  const startedAtMs = toMs(startedAt);
  const buzzedAtMs = toMs(buzz?.buzzedAt || buzz?.serverTimestamp || buzz?.clientTimestamp);

  if (startedAtMs > 0 && buzzedAtMs > 0 && buzzedAtMs >= startedAtMs) {
    const delta = (buzzedAtMs - startedAtMs) / 1000;
    if (delta > 0) return delta;
  }

  if (typeof buzz?.responseTime === "number" && buzz.responseTime > 0) {
    return buzz.responseTime;
  }

  return 0.150;
};

export interface FormattedTime {
  secondsStr: string;  // e.g. "1.428s"
  msStr: string;       // e.g. "1428 ms"
  fullStr: string;     // e.g. "1.428s (1428 ms)"
  ms: number;          // e.g. 1428
  seconds: number;     // e.g. 1.428
}

export const formatResponseTimeMs = (seconds: number): FormattedTime => {
  const safeSec = Math.max(0.001, Number(seconds) || 0);
  const ms = Math.max(1, Math.round(safeSec * 1000));
  const secsFixed = (ms / 1000).toFixed(3);
  return {
    secondsStr: `${secsFixed}s`,
    msStr: `${ms} ms`,
    fullStr: `${secsFixed}s (${ms} ms)`,
    ms,
    seconds: ms / 1000
  };
};
