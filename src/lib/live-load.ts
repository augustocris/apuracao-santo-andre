/** Sunday live-load guards: slower polls, one Realtime channel, no refetch storms. */

export const TELAO_POLL_MS = 12_000;
export const CHEFE_POLL_MS = 15_000;
export const ADMIN_POLL_MS = 15_000;
export const BUS_RECEBIDAS_POLL_MS = 20_000;
export const PENDENTES_POLL_MS = 20_000;
export const LIVE_NOTIFY_DEBOUNCE_MS = 400;
export const REALTIME_RECONNECT_BASE_MS = 2_000;
export const REALTIME_RECONNECT_MAX_MS = 30_000;
export const CONFIG_TTL_MS = 20_000;
export const FEATURED_TTL_MS = 30_000;
export const CATALOG_TTL_MS = 20_000;
export const LOCAIS_TTL_MS = 60_000;
export const FETCH_BURST_MS = 1_500;
export const LIVE_FETCH_TIMEOUT_MS = 8_000;
export const LIVE_FETCH_RETRY_MS = 4_000;
export const UNLOCK_TIMEOUT_MS = 5_000;
export const CONFIG_FETCH_TIMEOUT_MS = 5_000;
export const CATALOG_PAGE_SIZE = 400;
export const CATALOG_MAX_ROWS = 3_200;
export const FEATURED_FETCH_LIMIT = 80;

export class LiveFetchTimeoutError extends Error {
  constructor(ms = LIVE_FETCH_TIMEOUT_MS, label?: string) {
    const where = label ? ` ao carregar ${label}` : "";
    super(
      `Tempo esgotado${where} (${Math.round(ms / 1000)}s). Tentando de novo.`
    );
    this.name = "LiveFetchTimeoutError";
  }
}

export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label?: string
): Promise<T> {
  const budget = Math.max(250, Math.floor(ms));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LiveFetchTimeoutError(budget, label));
    }, budget);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function realtimeReconnectDelay(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(
    REALTIME_RECONNECT_MAX_MS,
    REALTIME_RECONNECT_BASE_MS * 2 ** n
  );
}

/**
 * Poll when Realtime is down, or until the first successful fetch.
 * Never wait on Realtime before painting.
 */
export function shouldRunLivePoll(
  realtimeConnected: boolean,
  pageHidden: boolean,
  fetchOk = true
): boolean {
  if (pageHidden) return false;
  if (realtimeConnected && fetchOk) return false;
  return true;
}

export function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

export function createTtlCache<T>(): {
  get: (ttlMs: number) => T | undefined;
  peek: () => T | undefined;
  set: (value: T) => void;
  clear: () => void;
} {
  let value: T | undefined;
  let at = 0;
  return {
    get(ttlMs: number) {
      if (value === undefined) return undefined;
      if (Date.now() - at > ttlMs) return undefined;
      return value;
    },
    peek() {
      return value;
    },
    set(next: T) {
      value = next;
      at = Date.now();
    },
    clear() {
      value = undefined;
      at = 0;
    },
  };
}

export function createSingleFlight(): <T>(
  key: string,
  fn: () => Promise<T>
) => Promise<T> {
  const inflight = new Map<string, Promise<unknown>>();
  return function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    const pending = fn().finally(() => {
      if (inflight.get(key) === pending) inflight.delete(key);
    });
    inflight.set(key, pending);
    return pending;
  };
}

export const liveSingleFlight = createSingleFlight();

type LiveListener = {
  onChange: () => void;
  pollMs: number;
  timer: ReturnType<typeof setInterval> | null;
};

const listeners = new Set<LiveListener>();
let channel: { unsubscribe?: () => void } | null = null;
let removeChannel: (() => void) | null = null;
let realtimeOk = false;
let liveFetchOk = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;

function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    syncPolls();
    if (!document.hidden) notifyListeners();
  });
}

function clearListenerTimer(listener: LiveListener) {
  if (listener.timer != null) {
    clearInterval(listener.timer);
    listener.timer = null;
  }
}

function syncPolls() {
  const hidden = isPageHidden();
  for (const listener of listeners) {
    clearListenerTimer(listener);
    if (!shouldRunLivePoll(realtimeOk, hidden, liveFetchOk)) continue;
    const interval = liveFetchOk
      ? listener.pollMs
      : Math.min(listener.pollMs, LIVE_FETCH_RETRY_MS);
    listener.timer = setInterval(() => {
      if (!shouldRunLivePoll(realtimeOk, isPageHidden(), liveFetchOk)) return;
      listener.onChange();
    }, interval);
  }
}

export function markLiveFetchOk() {
  if (liveFetchOk) return;
  liveFetchOk = true;
  syncPolls();
}

export function markLiveFetchPending() {
  if (!liveFetchOk) return;
  liveFetchOk = false;
  syncPolls();
}

function notifyListeners() {
  if (isPageHidden()) return;
  if (notifyTimer != null) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    if (isPageHidden()) return;
    for (const listener of listeners) listener.onChange();
  }, LIVE_NOTIFY_DEBOUNCE_MS);
}

function stopRealtime() {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const drop = removeChannel;
  removeChannel = null;
  channel = null;
  realtimeOk = false;
  drop?.();
}

function scheduleReconnect(start: () => void) {
  if (reconnectTimer != null || listeners.size === 0) return;
  const delay = realtimeReconnectDelay(reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    start();
  }, delay);
}

export type LiveRealtimeClient = {
  channel: (name: string) => {
    on: (
      event: string,
      filter: { event: string; schema: string; table: string },
      callback: () => void
    ) => {
      subscribe: (
        cb?: (status: string) => void
      ) => { unsubscribe?: () => void };
    };
  };
  removeChannel: (ch: unknown) => void;
};

function attachRealtime(client: LiveRealtimeClient) {
  if (listeners.size === 0) return;
  stopRealtime();

  const raw = client
    .channel("boletins_urna_live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "boletins_urna" },
      () => notifyListeners()
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        realtimeOk = true;
        reconnectAttempt = 0;
        syncPolls();
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        realtimeOk = false;
        syncPolls();
        scheduleReconnect(() => attachRealtime(client));
      }
    });

  channel = raw;
  removeChannel = () => {
    try {
      raw.unsubscribe?.();
    } catch {
      /* ignore */
    }
    try {
      client.removeChannel(raw);
    } catch {
      /* ignore */
    }
  };
}

export function subscribeLive(
  onChange: () => void,
  opts: {
    pollMs?: number;
    realtime?: LiveRealtimeClient | null;
    mockUnsub?: () => void;
  } = {}
): () => void {
  bindVisibility();
  const listener: LiveListener = {
    onChange,
    pollMs: Math.max(4_000, opts.pollMs ?? TELAO_POLL_MS),
    timer: null,
  };
  listeners.add(listener);
  syncPolls();

  if (opts.realtime && listeners.size === 1) {
    attachRealtime(opts.realtime);
  }

  return () => {
    listeners.delete(listener);
    clearListenerTimer(listener);
    opts.mockUnsub?.();
    if (listeners.size === 0) {
      stopRealtime();
      if (notifyTimer != null) {
        clearTimeout(notifyTimer);
        notifyTimer = null;
      }
    }
  };
}

/** Test helper — reset module timers between cases. */
export function resetLiveLoadForTests() {
  for (const listener of listeners) clearListenerTimer(listener);
  listeners.clear();
  stopRealtime();
  if (notifyTimer != null) {
    clearTimeout(notifyTimer);
    notifyTimer = null;
  }
  realtimeOk = false;
  liveFetchOk = false;
  reconnectAttempt = 0;
}
