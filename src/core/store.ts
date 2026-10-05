/** A tiny observable store: no framework, explicit subscriptions. */
export type Listener<T> = (state: T, prev: T) => void;

export class Store<T extends object> {
  private listeners = new Set<Listener<T>>();
  constructor(private state: T) {}

  get(): T {
    return this.state;
  }

  set(patch: Partial<T>) {
    const prev = this.state;
    const next = { ...prev, ...patch };
    let changed = false;
    for (const k in patch) if (!Object.is(prev[k], next[k])) changed = true;
    if (!changed) return;
    this.state = next;
    this.listeners.forEach((l) => l(next, prev));
  }

  subscribe(l: Listener<T>) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Call `f` whenever the selected slice changes (and once now). */
  watch<K>(select: (s: T) => K, f: (v: K) => void) {
    let last = select(this.state);
    f(last);
    return this.subscribe((s) => {
      const v = select(s);
      if (!Object.is(v, last)) {
        last = v;
        f(v);
      }
    });
  }
}

export interface AppState {
  selected: string | null;
  focus: string | null;
  scaleMode: 'illustrative' | 'true';
  paused: boolean;
  rateIdx: number;
  direction: 1 | -1;
  orbits: boolean;
  trails: boolean;
  labels: boolean;
  smallBodies: boolean;
  sound: boolean;
  cutaway: string | null;
  altLayer: boolean;
  panel: null | 'legend' | 'colophon' | 'help' | 'menu';
  indexOpen: boolean;
  intro: 'loading' | 'ready' | 'flying' | 'done';
  seeking: number | null;
}

/** Simulated seconds per real second. */
export const RATES = [1, 60, 3600, 86_400, 604_800, 2_629_800, 31_557_600, 315_576_000] as const;
export const RATE_UNITS = ['time.live', 'time.unit.min', 'time.unit.h', 'time.unit.d', 'time.unit.wk', 'time.unit.mo', 'time.unit.yr', 'time.unit.10yr'] as const;
