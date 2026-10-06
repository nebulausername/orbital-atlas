import { Store, RATES, type AppState } from './core/store';
import { Simulation } from './physics/simulation';
import { Engine } from './render/engine';
import { onPending } from './render/textures';
import { BODY } from './data/bodies';
import { RINGS } from './data/rings';
import { clamp, jdFromUnixMs, kmToAu } from './core/units';
import { t, tk, setLang, getLang, onLang, type Lang } from './i18n/i18n';
import { h } from './ui/dom';
import { TopBar, Altimeter, TimeConsole, Readout, LayerToggles, BodyIndex, Toast, type Actions } from './ui/panels';
import { PlateCard } from './ui/card';
import { Sheets } from './ui/sheets';
import { Labels } from './ui/labels';
import { CutawayLabels } from './ui/cutaway';
import { Intro } from './ui/intro';
import { badge, currentPlate, plateNumber, plateTitle } from './ui/plates';
import { dateParts } from './ui/format';
import { Sound } from './audio/sound';

const DIGIT_KEYS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/** Camera distance (log10 AU) that frames a body nicely. */
function viewLogD(key: string): number {
  const b = BODY[key];
  if (b.kind === 'spacecraft') return -3.3;
  const r = kmToAu(b.eqKm ?? b.radiusKm);
  const k = b.kind === 'star' ? 7 : key === 'saturn' ? 8 : RINGS[key] ? 5 : b.kind === 'moon' ? 4.4 : b.kind === 'comet' ? 4000 : 4.3;
  return Math.log10(r * k);
}

function systemLogD(key: string): number {
  let a = 0;
  for (const b of Object.values(BODY)) if (b.parent === key && b.facts?.aKm) a = Math.max(a, kmToAu(b.facts.aKm));
  const r = kmToAu(BODY[key].radiusKm);
  return Math.log10(Math.max(a * 2.8, r * 14));
}

export async function start() {
  const base = import.meta.env.BASE_URL;
  const params = new URLSearchParams(location.search);
  const mobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ?record=1: frames are rendered on demand with a fixed time step (trailer recorder)
  const recording = params.get('record') === '1';
  document.documentElement.lang = getLang();
  document.title = `${t('app.title')} — ${t('app.tagline')}`;

  const canvas = document.getElementById('atlas') as HTMLCanvasElement;
  const sim = new Simulation();
  let engine: Engine;
  try {
    engine = new Engine(canvas, sim, mobile, base);
  } catch {
    document.body.append(h('div', { class: 'nowebgl' }, t('misc.webgl')));
    return;
  }
  const sound = new Sound();

  const deepBody = params.get('body');
  const store = new Store<AppState>({
    selected: null,
    focus: 'sun',
    scaleMode: params.get('scale') === 'true' ? 'true' : 'illustrative',
    paused: false,
    rateIdx: 3,
    direction: 1,
    orbits: true,
    trails: true,
    labels: true,
    smallBodies: true,
    sound: false,
    cutaway: null,
    altLayer: false,
    panel: null,
    indexOpen: !mobile,
    intro: 'loading',
    seeking: null,
  });

  let urlTimer = 0;
  let dateInUrl = !!params.get('date');

  // --- UI -------------------------------------------------------------------
  const frame = h('div', { class: 'plate-frame', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {}), h('i', {}), h('span', { class: 'ticks top' }), h('span', { class: 'ticks bottom' }));
  document.body.append(frame);
  const toast = new Toast();
  const labels = new Labels(engine.bodies);
  const cutLabels = new CutawayLabels(engine.bodies);
  const sheets = new Sheets(() => store.set({ panel: null }), () => engine.space.smallCount);
  document.body.append(toast.el, sheets.backdrop, sheets.sheet);

  /** Yaw/pitch that put the camera on the sunlit side, a little off the Sun line. */
  const litAngles = (key: string) => {
    const pos = engine.scenePos(key)!;
    const sun = engine.scenePos('sun')!;
    if (key === 'sun') return { yaw: engine.atlasCam.yaw, pitch: 0.3 };
    let dx = sun[0] - pos[0], dz = sun[2] - pos[2];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const a = 0.75; // ~43° off the Sun line: mostly day side, terminator in view
    const x = dx * Math.cos(a) - dz * Math.sin(a);
    const z = dx * Math.sin(a) + dz * Math.cos(a);
    return { yaw: Math.atan2(z, x), pitch: 0.22 };
  };

  const flyToBody = (key: string) => {
    const pos = engine.scenePos(key);
    if (!pos) return;
    engine.atlasCam.flyTo({ key, logD: viewLogD(key), ...litAngles(key) }, [...engine.atlasCam.focus] as [number, number, number], pos);
    sound.whoosh(engine.atlasCam.flight?.dur ?? 2);
  };

  const act: Actions = {
    select(key, fly = true) {
      const s = store.get();
      if (s.cutaway && s.cutaway !== key) store.set({ cutaway: null });
      store.set({ selected: key, altLayer: false });
      if (key) {
        sound.bell();
        if (fly) flyToBody(key);
        if (mobile) store.set({ indexOpen: false });
      }
    },
    zoomTo(logD, key = null) {
      const k = key ?? engine.atlasCam.focusKey ?? 'sun';
      const pos = engine.scenePos(k) ?? engine.scenePos('sun')!;
      engine.atlasCam.flyTo({ key: k, logD }, [...engine.atlasCam.focus] as [number, number, number], pos);
      sound.whoosh(engine.atlasCam.flight?.dur ?? 2);
    },
    toggleScale() {
      store.set({ scaleMode: store.get().scaleMode === 'true' ? 'illustrative' : 'true' });
      sound.tick();
    },
    setLang(l: Lang) {
      setLang(l);
    },
    async toggleSound() {
      const on = !store.get().sound;
      store.set({ sound: on });
      await sound.setEnabled(on);
    },
    openPanel(p) {
      store.set({ panel: store.get().panel === p ? null : p });
      sound.tick();
    },
    seekTo(iso) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!m) return;
      const y = Number(m[1]);
      if (y < 1800 || y > 2199) {
        toast.show(t('time.range'), 4000);
        return;
      }
      void seek(jdFromUnixMs(Date.UTC(y, Number(m[2]) - 1, Number(m[3]), 12)));
    },
    now() {
      store.set({ rateIdx: 0, direction: 1, paused: false });
      void seek(jdFromUnixMs(Date.now()));
    },
    setRate(idx) {
      store.set({ rateIdx: clamp(idx, 0, RATES.length - 1), paused: false });
      sound.tick();
    },
    togglePause() {
      store.set({ paused: !store.get().paused });
      sound.tick();
    },
    toggleReverse() {
      store.set({ direction: store.get().direction === 1 ? -1 : 1, paused: false });
      sound.tick();
    },
    toggle(k) {
      store.set({ [k]: !store.get()[k] } as Partial<AppState>);
      sound.tick();
    },
    async share() {
      try {
        await navigator.clipboard.writeText(location.href);
        toast.show(t('misc.copied'), 1800);
      } catch {
        toast.show(location.href, 4000);
      }
    },
  };

  async function seek(jd: number) {
    store.set({ seeking: jd });
    const label = dateParts(jd).date;
    await sim.seek(jd, (f) => toast.show(t('time.seeking', { date: label }), 0, f));
    engine.lines.resetTrails();
    toast.hide();
    store.set({ seeking: null });
    syncUrl(true);
  }

  // components are rebuilt on language change
  let top: TopBar, alt: Altimeter, time: TimeConsole, readout: Readout, toggles: LayerToggles, index: BodyIndex, card: PlateCard;
  let bodiesBtn: HTMLButtonElement;
  const mountUi = () => {
    [top, alt, time, readout, toggles, index].forEach((c) => c?.el.remove());
    card?.el.remove();
    bodiesBtn?.remove();
    top = new TopBar(store, act);
    alt = new Altimeter(act, () => {
      const key = store.get().selected ?? (engine.atlasCam.focusKey && engine.atlasCam.focusKey !== 'sun' ? engine.atlasCam.focusKey : 'earth');
      return { key, logD: systemLogD(key), surface: viewLogD(key) };
    });
    time = new TimeConsole(store, act);
    readout = new Readout();
    toggles = new LayerToggles(store, act);
    index = new BodyIndex(store, act);
    card = new PlateCard(store, sim, {
      close: () => act.select(null),
      fly: (k) => flyToBody(k),
      cut: (k) => {
        const open = store.get().cutaway === k ? null : k;
        if (open && engine.atlasCam.focusKey !== k) flyToBody(k);
        store.set({ cutaway: open });
        if (open) sound.thunk();
      },
      altLayer: () => store.set({ altLayer: !store.get().altLayer }),
    });
    bodiesBtn = h('button', { class: 'hair-btn mobile-only bodies-btn', type: 'button', onclick: () => store.set({ indexOpen: !store.get().indexOpen, selected: null }) }, t('index.open'));
    const ui = [top.el, alt.el, time.el, readout.el, toggles.el, index.el, card.el, bodiesBtn];
    document.body.append(...ui);
    const intro = store.get().intro;
    ui.forEach((e) => (e.style.opacity = intro === 'done' ? '' : '0'));
    card.show(store.get().selected);
    index.el.classList.toggle('hidden', !store.get().indexOpen || !!store.get().selected);
  };
  mountUi();
  onLang(() => {
    document.title = `${t('app.title')} — ${t('app.tagline')}`;
    mountUi();
    labels.relabel();
    cutLabels.relabel();
    sheets.rerender();
    syncUrl();
  });

  // --- state reactions --------------------------------------------------------
  store.watch((s) => s.selected, (key) => {
    card.show(key);
    index.el.classList.toggle('hidden', !store.get().indexOpen || !!key);
    syncUrl();
  });
  store.watch((s) => s.indexOpen, (open) => index.el.classList.toggle('hidden', !open || !!store.get().selected));
  store.watch((s) => s.cutaway, (key) => {
    engine.bodies.setCutaway(key);
    card.updateButtons();
    // the section's own column replaces the plate card while it is open
    card.el.classList.toggle('hidden', !!key || !store.get().selected);
  });
  cutLabels.onClose = () => store.set({ cutaway: null });
  sheets.menuContent = () => {
    const st = store.get();
    const row = (label: string, pressed: boolean, on: () => void) => {
      const b = h('button', { class: 'hair-btn', type: 'button', 'aria-pressed': String(pressed), style: 'width:100%;justify-content:space-between;min-height:44px' }, h('span', {}, label), h('span', {}, pressed ? '●' : '○'));
      b.addEventListener('click', () => {
        on();
        store.set({ panel: null });
      });
      return b;
    };
    const lang = getLang();
    return [
      h(
        'div',
        { style: 'display:grid;gap:8px' },
        row(t('toggle.orbits'), st.orbits, () => act.toggle('orbits')),
        row(t('toggle.trails'), st.trails, () => act.toggle('trails')),
        row(t('toggle.labels'), st.labels, () => act.toggle('labels')),
        row(t('toggle.smallbodies'), st.smallBodies, () => act.toggle('smallBodies')),
        row(t('toggle.sound'), st.sound, () => void act.toggleSound()),
        row(t('toggle.lang'), false, () => act.setLang(lang === 'de' ? 'en' : 'de')),
        row(`${t('scale.true')} / ${t('scale.illustrative')}`, st.scaleMode === 'true', () => act.toggleScale()),
      ),
      h(
        'div',
        { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px' },
        h('button', { class: 'hair-btn', type: 'button', style: 'min-height:44px', onclick: () => store.set({ panel: 'legend' }) }, t('legend.title')),
        h('button', { class: 'hair-btn', type: 'button', style: 'min-height:44px', onclick: () => store.set({ panel: 'colophon' }) }, t('colophon.sources')),
        h('button', { class: 'hair-btn', type: 'button', style: 'min-height:44px', onclick: () => store.set({ panel: 'help' }) }, t('help.title')),
        h('button', { class: 'hair-btn', type: 'button', style: 'min-height:44px', onclick: () => void act.share() }, t('misc.share')),
      ),
    ];
  };
  store.watch((s) => s.altLayer, (on) => {
    const sel = store.get().selected;
    for (const k of Object.keys(BODY)) engine.bodies.setAltLayer(k, on && k === sel);
    card.updateButtons();
  });
  store.watch((s) => s.panel, (p) => sheets.show(p));
  store.watch((s) => s.sound, () => top.renderSound());
  store.watch((s) => `${s.orbits}${s.trails}${s.labels}${s.smallBodies}`, () => toggles.update());
  store.watch((s) => s.scaleMode, () => syncUrl());

  function syncUrl(withDate = false) {
    if (withDate) dateInUrl = true;
    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      const s = store.get();
      const q = new URLSearchParams();
      if (s.selected) q.set('body', s.selected);
      if (s.scaleMode === 'true') q.set('scale', 'true');
      if (dateInUrl) q.set('date', dateParts(sim.jd).iso);
      q.set('lang', getLang());
      history.replaceState(null, '', `${location.pathname}?${q}`);
    }, 300);
  }

  // --- input ------------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number; t: number } | null = null;
  let moved = 0;
  let pinch = 0;
  const flyingLock = () => engine.atlasCam.flying;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      moved = 0;
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    if (store.get().intro === 'flying') finishIntro();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') {
        const hit = engine.pick(e.clientX, e.clientY);
        canvas.classList.toggle('hovering', !!hit);
      }
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && !flyingLock()) engine.atlasCam.zoomBy(-Math.log10(d / pinch) * 1.6);
      pinch = d;
      moved += 10;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 4 && !flyingLock()) {
      canvas.classList.add('dragging');
      engine.atlasCam.rotateBy(-dx * 0.0042, dy * 0.0042);
    }
  });
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (pointers.size < 2) pinch = 0;
    if (downAt && pointers.size === 0 && moved <= 4 && performance.now() - downAt.t < 600) {
      const hit = engine.pick(e.clientX, e.clientY, e.pointerType !== 'mouse');
      if (hit) act.select(hit, true);
    }
    if (pointers.size === 0) downAt = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (store.get().intro === 'flying') finishIntro();
      if (flyingLock()) return;
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 600 : 1;
      engine.atlasCam.zoomBy(clamp(e.deltaY * unit, -240, 240) * 0.0016);
    },
    { passive: false },
  );
  labels.onPick = (key) => act.select(key, true);

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (store.get().intro !== 'done') {
      if (e.key === 'Escape' || e.key === ' ') {
        if (store.get().intro === 'ready') beginIntro();
        else if (store.get().intro === 'flying') finishIntro();
      }
      return;
    }
    const s = store.get();
    const k = e.key.toLowerCase();
    if (e.key === ' ') {
      e.preventDefault();
      act.togglePause();
    } else if (e.key === 'ArrowRight') act.setRate(s.rateIdx + 1);
    else if (e.key === 'ArrowLeft') act.setRate(s.rateIdx - 1);
    else if (e.key === 'ArrowUp') engine.atlasCam.zoomBy(-0.25);
    else if (e.key === 'ArrowDown') engine.atlasCam.zoomBy(0.25);
    else if (k === '+' || k === '=') engine.atlasCam.zoomBy(-0.25);
    else if (k === '-') engine.atlasCam.zoomBy(0.25);
    else if (k === 'r') act.toggleReverse();
    else if (k === 'n') act.now();
    else if (k === 's') act.toggleScale();
    else if (k === 'o') act.toggle('orbits');
    else if (k === 't') act.toggle('trails');
    else if (k === 'l') act.toggle('labels');
    else if (k === 'a') act.toggle('smallBodies');
    else if (k === 'i' && s.selected && engine.bodies.hasInterior(s.selected)) store.set({ cutaway: s.cutaway ? null : s.selected });
    else if (k === '?') act.openPanel('help');
    else if (/^[0-9]$/.test(k)) act.select(DIGIT_KEYS[Number(k)], true);
    else if (e.key === 'Escape') {
      if (s.panel) store.set({ panel: null });
      else if (s.cutaway) store.set({ cutaway: null });
      else if (s.selected) act.select(null);
      else act.zoomTo(Math.min(engine.atlasCam.logD + 1.5, 10.15));
    } else return;
  });

  const resize = () => {
    engine.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  // --- intro ------------------------------------------------------------------
  const intro = new Intro(
    () => beginIntro(),
    () => finishIntro(true),
  );
  const startJd = (() => {
    const d = params.get('date');
    const m = d && /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (m && Number(m[1]) >= 1800 && Number(m[1]) <= 2199) return jdFromUnixMs(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    return jdFromUnixMs(Date.now());
  })();

  // starting pose: the whole Milky Way, seen at an angle
  const cam = engine.atlasCam;
  cam.focusKey = 'sun';
  cam.logD = cam.targetLogD = 10.25;
  cam.yaw = -2.3;
  cam.pitch = 0.95;

  let loadDone = 0;
  let texPending = 0;
  onPending((n) => (texPending = n));
  const loadProgress = () => intro.progress(0.15 + 0.85 * loadDone);
  void (async () => {
    await sim.seek(startJd, (f) => {
      loadDone = f * 0.6;
      loadProgress();
    });
    // warm up the textures of the inner planets while the frontispiece is up
    engine.bodies.view('earth')?.ensureTextures(!mobile);
    for (const k of ['mercury', 'venus', 'moon', 'mars', 'jupiter', 'saturn']) engine.bodies.view(k)?.ensureTextures(false);
    const t0 = performance.now();
    while (texPending > 0 && performance.now() - t0 < 12000) {
      await new Promise((r) => setTimeout(r, 120));
      loadDone = 0.6 + 0.4 * (1 - Math.min(1, texPending / 14));
      loadProgress();
    }
    store.set({ intro: 'ready' });
    intro.ready();
    if (deepBody && BODY[deepBody]) finishIntro(true);
  })();

  const FLIGHT: { at: number; plate: 'galaxy' | 'neighbourhood' | 'heliosphere' | 'inner'; sub: string }[] = [
    { at: 9.0, plate: 'galaxy', sub: '≈ 100 000 ly' },
    { at: 5.6, plate: 'neighbourhood', sub: '≈ 20 ly' },
    { at: 2.4, plate: 'heliosphere', sub: '≈ 120 AU' },
    { at: 0.9, plate: 'inner', sub: '≈ 3 AU' },
  ];
  function beginIntro() {
    if (store.get().intro !== 'ready') return;
    store.set({ intro: 'flying' });
    intro.flying();
    sound.whoosh(6);
    const sun = engine.scenePos('sun')!;
    const segs = [
      { logD: 6.0, dur: 4.8, easing: 'in' as const, yaw: -1.3, pitch: 0.62 },
      { logD: 2.4, dur: 2.0, easing: 'linear' as const, yaw: -0.85, pitch: 0.5 },
      { logD: 0.5, dur: 2.2, easing: 'out' as const, yaw: -0.6, pitch: 0.42 },
    ];
    const run = (i: number) => {
      if (store.get().intro !== 'flying') return;
      if (i >= segs.length) return finishIntro();
      const s = segs[i];
      cam.flyTo({ key: 'sun', logD: s.logD, duration: reducedMotion ? 0.5 : s.dur, easing: s.easing, yaw: s.yaw, pitch: s.pitch, done: () => run(i + 1) }, [...cam.focus] as [number, number, number], sun);
    };
    run(0);
  }

  function finishIntro(skipped = false) {
    const st = store.get().intro;
    if (st === 'done') return;
    if (st === 'loading') return;
    store.set({ intro: 'done' });
    intro.done();
    if (skipped || cam.flying) {
      cam.flight = null;
      cam.focusKey = 'sun';
      cam.logD = cam.targetLogD = 0.5;
      cam.yaw = -0.6;
      cam.pitch = 0.42;
    }
    [top.el, alt.el, time.el, readout.el, toggles.el, index.el, card.el, bodiesBtn].forEach((e, i) => {
      e.style.transition = 'opacity .9s cubic-bezier(.22,.61,.2,1)';
      e.style.transitionDelay = `${i * 70}ms`;
      e.style.opacity = '';
    });
    if (deepBody && BODY[deepBody]) act.select(deepBody, true);
    else setTimeout(() => toast.show(t('intro.hint'), 6500), 900);
  }

  // --- frame loop -----------------------------------------------------------------
  // a tiny hook for automated probes and the trailer recorder
  const frameTimes: number[] = [];
  (window as unknown as { __atlas: unknown }).__atlas = {
    fps: () => (frameTimes.length < 2 ? 0 : (1000 * (frameTimes.length - 1)) / (frameTimes[frameTimes.length - 1] - frameTimes[0])),
    store,
    engine,
    sim,
    /** place the camera without a flight (probes, trailer) */
    jump(key: string, logD?: number, yaw?: number, pitch?: number) {
      const c = engine.atlasCam;
      c.flight = null;
      c.idle = 0;
      c.focusKey = key;
      c.logD = c.targetLogD = logD ?? viewLogD(key);
      const lit = litAngles(key);
      c.yaw = yaw ?? lit.yaw;
      c.pitch = pitch ?? lit.pitch;
    },
    select: (key: string | null) => act.select(key, false),
    seek: (iso: string) => act.seekTo(iso),
    /** move the simulation clock directly (recorder) */
    advanceDays: (d: number) => sim.advance(d),
    seekJd: (jd: number) => seek(jd),
    camState: () => ({ key: engine.atlasCam.focusKey, logD: engine.atlasCam.logD, yaw: engine.atlasCam.yaw, pitch: engine.atlasCam.pitch }),
    finishIntro: () => finishIntro(true),
  };
  let last = performance.now();
  let uiClock = 0;
  let recShift = { x: 0, y: 0 };
  // adaptive quality: if the device cannot keep up, lower the resolution, then drop bloom
  let perfWindow = 0;
  let perfFrames = 0;
  let slowWindows = 0;
  const adapt = (dt: number) => {
    if (engine.fixedDpr !== null || store.get().intro === 'loading') return;
    perfWindow += dt;
    perfFrames++;
    if (perfWindow < 2) return;
    const fps = perfFrames / perfWindow;
    perfWindow = 0;
    perfFrames = 0;
    slowWindows = fps < 26 ? slowWindows + 1 : 0;
    if (slowWindows >= 2 && engine.quality < 2) {
      engine.setQuality(engine.quality + 1);
      slowWindows = 0;
    }
  };
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tick(now, dt);
    requestAnimationFrame(loop);
  };
  const tick = (now: number, dt: number) => {
    frameTimes.push(now);
    if (frameTimes.length > 30) frameTimes.shift();
    if (!(window as unknown as { __atlasProbe?: boolean }).__atlasProbe) adapt(dt);
    const s = store.get();
    if (!s.paused && s.seeking === null && s.intro === 'done') sim.advance((s.direction * RATES[s.rateIdx] * dt) / 86_400);
    engine.render(dt, {
      illus: s.scaleMode === 'illustrative',
      orbits: s.orbits,
      trails: s.trails,
      labels: s.labels,
      smallBodies: s.smallBodies,
      selected: s.selected,
      reducedMotion,
    });
    const f = engine.frame;
    const sun = f.pos.get('sun')!;
    const sunDistLog = Math.log10(Math.hypot(sun[0] - f.cam[0], sun[1] - f.cam[1], sun[2] - f.cam[2]));
    labels.update({ cutaway: s.cutaway, show: s.labels && s.intro === 'done', selected: s.selected, focus: f.focusKey, illus: s.scaleMode === 'illustrative', annotations: s.intro === 'done' ? engine.space.annotations : [], camera: engine.camera, width: f.width, height: f.height, logD: f.logD });
    cutLabels.update(engine.camera, f.width, f.height, 0);
    alt.update(f.logD);
    sound.setZoom(f.logD);

    if (s.intro === 'flying') {
      const p = [...FLIGHT].reverse().find((x) => f.logD >= x.at - 0.4) ?? FLIGHT[0];
      intro.showFlight({ no: `${t('plate')} ${plateNumber(p.plate)}`, title: plateTitle(p.plate), sub: p.sub });
    }

    // keep the subject clear of the side panels
    const desk = f.width > 760;
    if (recording) engine.shiftTarget = recShift;
    else if (s.cutaway && desk) engine.shiftTarget = { x: Math.min(170, f.width * 0.12), y: 0 };
    else if (s.cutaway && !desk) engine.shiftTarget = { x: 0, y: Math.min(f.height * 0.24, 220) };
    else if (s.selected && desk) engine.shiftTarget = { x: 190, y: 0 };
    else if (s.selected && !desk) engine.shiftTarget = { x: 0, y: Math.min(f.height * 0.22, 200) };
    else engine.shiftTarget = { x: 0, y: 0 };
    // the index belongs to the solar system; at stellar and galactic scales it steps aside
    index.el.classList.toggle('far', f.logD > 4.4 && !s.selected);

    uiClock += dt;
    if (uiClock > 0.1) {
      uiClock = 0;
      const panels = [top.el.querySelector('.wordmark'), top.el.querySelector('.tools'), top.el.querySelector('.scale-badge .frame'), alt.el, time.el, toggles.el, readout.el, index.el, card.el, bodiesBtn];
      labels.blocked = panels
        .filter((e): e is HTMLElement => !!e && getComputedStyle(e).opacity !== '0' && !e.classList.contains('hidden') && !e.classList.contains('far'))
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.left - 6, y: r.top - 4, w: r.width + 12, h: r.height + 8 };
        })
        .filter((r) => r.w > 12 && r.h > 12);
      const plate = currentPlate(f, sunDistLog);
      top.update(plate, badge(plate, s.scaleMode === 'illustrative', engine.bodies, f.focusKey));
      time.update(sim.jd, sim.throttled);
      readout.update(f.logD, f.focusKey, sim.nbody.energyDrift());
      card.updateLive();
      index.update((key) => (BODY[key].kind === 'spacecraft' || BODY[key].kind === 'comet' || BODY[key].kind === 'planet' || BODY[key].kind === 'dwarf' ? sim.sunDistance(key) : undefined));
      store.set({ focus: f.focusKey });
    }
  };
  if (!recording) requestAnimationFrame(loop);
  else {
    engine.fixedDpr = 1;
    resize();
    let clock = 0;
    Object.assign((window as unknown as { __atlas: object }).__atlas, {
      /** vertical field of view in degrees (portrait footage wants a wider lens) */
      fov(deg: number) {
        engine.camera.fov = deg;
        resize();
      },
      /** move the image centre by (x, y) CSS px */
      shift(x: number, y: number) {
        recShift = { x, y };
      },
      /** render exactly one frame, advancing everything by dt seconds */
      step(dt: number) {
        clock += dt * 1000;
        tick(clock, dt);
      },
      /** what the recorder may show: 'clean' (no interface), 'labels', 'cut', 'full' */
      ui(mode: 'clean' | 'labels' | 'cut' | 'full') {
        document.body.dataset.rec = mode;
      },
    });
  }

  // a console note for the curious
  console.log(`%cOrbital Atlas%c  ${tk('app.tagline')}\nSource: https://github.com/nebulausername/orbital-atlas`, 'font: 20px Georgia, serif; color: #ff5a36', 'color: #9a9284');
}
