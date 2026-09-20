/**
 * Debounce with a minimum interval, kept independently per key.
 *
 * Per key, not global: a rebase in repo A writes refs dozens of times, and a
 * single shared timer would make that storm delay repo B's refresh as well.
 */
export interface DebounceByKeyOptions {
  debounceMs: number;
  minIntervalMs: number;
}

interface KeyState {
  timer: ReturnType<typeof setTimeout>;
  lastFiredAt: number;
}

export class DebouncerByKey<K> {
  private readonly states = new Map<K, KeyState>();

  constructor(
    private readonly options: DebounceByKeyOptions,
    private readonly onFire: (key: K) => void,
  ) {}

  schedule(key: K): void {
    const existing = this.states.get(key);
    if (existing) clearTimeout(existing.timer);

    const lastFiredAt = existing?.lastFiredAt ?? 0;
    const elapsed = Date.now() - lastFiredAt;
    const delay = Math.max(this.options.debounceMs, this.options.minIntervalMs - elapsed);

    const timer = setTimeout(() => {
      this.states.set(key, { timer, lastFiredAt: Date.now() });
      this.onFire(key);
    }, delay);

    this.states.set(key, { timer, lastFiredAt });
  }

  cancel(key: K): void {
    const state = this.states.get(key);
    if (!state) return;
    clearTimeout(state.timer);
    this.states.delete(key);
  }

  dispose(): void {
    for (const state of this.states.values()) {
      clearTimeout(state.timer);
    }
    this.states.clear();
  }
}
