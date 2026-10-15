'use client';

import { useSyncExternalStore } from 'react';

// The current time for the public website's countdowns, without hydration mismatches: the
// server and the browser's first render both see `null` (no time yet), then the browser shows
// the real time and keeps it current while the page is open.

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  /** Stable for each interval: a new function each render would resubscribe every render. */
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  const existing = clocks.get(intervalMs);
  if (existing) return existing;
  const clock: Clock = {
    now: Date.now(),
    listeners: new Set(),
    timer: null,
    subscribe: (listener) => {
      clock.listeners.add(listener);
      if (!clock.timer) {
        // The clock may have been idle; React re-reads it once after subscribing (no loop,
        // since this function never changes).
        clock.now = Date.now();
        clock.timer = setInterval(() => {
          clock.now = Date.now();
          clock.listeners.forEach((l) => l());
        }, intervalMs);
      }
      return () => {
        clock.listeners.delete(listener);
        if (clock.listeners.size === 0 && clock.timer) {
          clearInterval(clock.timer);
          clock.timer = null;
        }
      };
    },
    // Only the timer moves the time, so React sees the same value until it ticks.
    getSnapshot: () => clock.now,
  };
  clocks.set(intervalMs, clock);
  return clock;
}

const serverSnapshot = () => null;

/** Milliseconds since the epoch, updated every `intervalMs`; `null` until mounted. */
export function useNow(intervalMs: number): number | null {
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, serverSnapshot);
}
