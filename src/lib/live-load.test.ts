import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  createSingleFlight,
  createTtlCache,
  LiveFetchTimeoutError,
  realtimeReconnectDelay,
  resetLiveLoadForTests,
  REALTIME_RECONNECT_BASE_MS,
  REALTIME_RECONNECT_MAX_MS,
  shouldRunLivePoll,
  subscribeLive,
  withTimeout,
} from "./live-load";

afterEach(() => {
  resetLiveLoadForTests();
});

describe("live-load", () => {
  it("pauses poll when Realtime is connected or the tab is hidden", () => {
    assert.equal(shouldRunLivePoll(false, false), true);
    assert.equal(shouldRunLivePoll(true, false), false);
    assert.equal(shouldRunLivePoll(false, true), false);
    assert.equal(shouldRunLivePoll(true, true), false);
    assert.equal(shouldRunLivePoll(true, false, false), true);
  });

  it("times out a hung fetch so retries are free", async () => {
    const hung = new Promise<string>(() => undefined);
    await assert.rejects(
      () => withTimeout(hung, 30, "telão"),
      LiveFetchTimeoutError
    );
    const single = createSingleFlight();
    let runs = 0;
    const work = () => {
      runs += 1;
      return withTimeout(new Promise<number>(() => undefined), 20);
    };
    await assert.rejects(() => single("dash", work), LiveFetchTimeoutError);
    await assert.rejects(() => single("dash", work), LiveFetchTimeoutError);
    assert.equal(runs, 2);
  });

  it("backs off Realtime reconnects instead of thrashing", () => {
    assert.equal(realtimeReconnectDelay(0), REALTIME_RECONNECT_BASE_MS);
    assert.equal(realtimeReconnectDelay(1), REALTIME_RECONNECT_BASE_MS * 2);
    assert.equal(realtimeReconnectDelay(2), REALTIME_RECONNECT_BASE_MS * 4);
    assert.equal(realtimeReconnectDelay(8), REALTIME_RECONNECT_MAX_MS);
  });

  it("TTL cache expires and can be cleared", async () => {
    const cache = createTtlCache<string>();
    cache.set("ok");
    assert.equal(cache.get(50), "ok");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(cache.get(5), undefined);
    cache.set("again");
    cache.clear();
    assert.equal(cache.get(1_000), undefined);
  });

  it("single-flight shares one in-flight promise", async () => {
    const single = createSingleFlight();
    let runs = 0;
    const work = () =>
      new Promise<number>((resolve) => {
        runs += 1;
        setTimeout(() => resolve(runs), 15);
      });
    const [a, b] = await Promise.all([
      single("dash", work),
      single("dash", work),
    ]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(runs, 1);
    const c = await single("dash", work);
    assert.equal(c, 2);
  });

  it("one Realtime channel for many subscribers; poll stops after SUBSCRIBED", async () => {
    let channels = 0;
    let polls = 0;
    const client = {
      channel() {
        channels += 1;
        return {
          on() {
            return this;
          },
          subscribe(cb?: (status: string) => void) {
            queueMicrotask(() => cb?.("SUBSCRIBED"));
            return {};
          },
        };
      },
      removeChannel() {},
    };

    const stopA = subscribeLive(() => {
      polls += 1;
    }, { pollMs: 4_000, realtime: client });
    const stopB = subscribeLive(() => {
      polls += 1;
    }, { pollMs: 4_000, realtime: client });

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(channels, 1);
    const before = polls;
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(polls, before);
    stopA();
    stopB();
  });
});
