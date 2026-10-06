import React from 'react';
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import TL from '../timeline.json';
import s1 from './data/s1-zoomout.json';
import s5 from './data/s5-rewind.json';
import { TEXT, type Lang } from './texts';

const FPS = TL.fps;
const B = TL.beats;
const C = { ink: '#04070d', paper: '#ece4d4', paper2: 'rgba(236,228,212,0.72)', paper3: 'rgba(236,228,212,0.45)', hair: 'rgba(236,228,212,0.22)', red: '#ff5a36', teal: '#8ed8c5' };
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"IBM Plex Mono", monospace';
const f = (s: number) => Math.round(s * FPS);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.bezier(0.22, 0.61, 0.2, 1);

/* ------------------------------------------------------------ primitives */

/** Words rise out of a blur, one after another (like the app's frontispiece). */
const Rise: React.FC<{ text: string; at: number; size: number; italic?: boolean; color?: string; stagger?: number; out?: number; style?: React.CSSProperties }> = ({ text, at, size, italic, color = C.paper, stagger = 0.07, out, style }) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  const fadeOut = out === undefined ? 1 : interpolate(frame, [f(out) - 6, f(out)], [1, 0], clamp);
  return (
    <div style={{ fontFamily: SERIF, fontStyle: italic ? 'italic' : 'normal', fontSize: size, lineHeight: 1.02, color, letterSpacing: '-0.01em', opacity: fadeOut, ...style }}>
      {words.map((w, i) => {
        const t0 = f(at + i * stagger);
        const p = interpolate(frame, [t0, t0 + 14], [0, 1], { ...clamp, easing: ease });
        return (
          <span key={i} style={{ display: 'inline-block', marginRight: '0.24em', opacity: p, transform: `translateY(${(1 - p) * 0.35}em)`, filter: `blur(${(1 - p) * 10}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Mono caption with letter spacing, typed in. */
const Caps: React.FC<{ text: string; at: number; size?: number; color?: string; out?: number; style?: React.CSSProperties }> = ({ text, at, size = 26, color = C.paper2, out, style }) => {
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [f(at), f(at) + text.length * 0.9], [0, text.length], clamp));
  const o = out === undefined ? 1 : interpolate(frame, [f(out) - 6, f(out)], [1, 0], clamp);
  return (
    <div style={{ fontFamily: MONO, fontSize: size, letterSpacing: '0.16em', textTransform: 'uppercase', color, opacity: o, whiteSpace: 'nowrap', ...style }}>
      {text.slice(0, n)}
      <span style={{ opacity: n < text.length ? 1 : 0, color: C.red }}>▌</span>
    </div>
  );
};

/** A vermilion rule that draws itself. */
const Rule: React.FC<{ at: number; width: number; style?: React.CSSProperties }> = ({ at, width, style }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [f(at), f(at) + 16], [0, 1], { ...clamp, easing: ease });
  return <div style={{ height: 3, width: width * p, background: C.red, ...style }} />;
};

/** Concentric graticule rings expanding from the centre on a hit. */
const Burst: React.FC<{ at: number; x?: number; y?: number; color?: string }> = ({ at, x = 540, y = 960, color = C.paper }) => {
  const frame = useCurrentFrame();
  const t = (frame - f(at)) / FPS;
  if (t < 0 || t > 1.6) return null;
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      {[0, 0.12, 0.24].map((d, i) => {
        const k = Math.max(0, t - d);
        const r = 40 + k * 900;
        return <circle key={i} cx={x} cy={y} r={r} fill="none" stroke={color} strokeOpacity={Math.max(0, 0.55 - k * 0.45)} strokeWidth={1.5} strokeDasharray={i === 1 ? '4 10' : undefined} />;
      })}
    </svg>
  );
};

/* ------------------------------------------------------------ the atlas frame */

const PLATES: [number, string][] = [
  [0, 'Plate 0'],
  [B.galaxyHit, 'Plate I'],
  [B.saturnDive, 'Plate XIII'],
  [12.6, 'Plate X'],
  [B.rewindStart, 'Plate VI'],
  [B.accuracy, 'Plate VI'],
  [B.endHit, 'Plate 0'],
];

const Frame: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const plate = [...PLATES].reverse().find(([at]) => t >= at)![1];
  const plateDe = plate.replace('Plate', 'Tafel');
  const o = interpolate(frame, [0, 12], [0, 1], clamp);
  const corner = (s: React.CSSProperties) => <div style={{ position: 'absolute', width: 34, height: 34, borderColor: C.paper3, borderStyle: 'solid', borderWidth: 0, ...s }} />;
  return (
    <AbsoluteFill style={{ opacity: o, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 30, border: `1.5px solid ${C.hair}` }} />
      {corner({ left: 18, top: 18, borderLeftWidth: 2, borderTopWidth: 2 })}
      {corner({ right: 18, top: 18, borderRightWidth: 2, borderTopWidth: 2 })}
      {corner({ left: 18, bottom: 18, borderLeftWidth: 2, borderBottomWidth: 2 })}
      {corner({ right: 18, bottom: 18, borderRightWidth: 2, borderBottomWidth: 2 })}
      <div style={{ position: 'absolute', left: 80, right: 80, top: 29, height: 10, background: `repeating-linear-gradient(90deg, ${C.hair} 0 2px, transparent 2px 2.5%)` }} />
      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 29, height: 10, background: `repeating-linear-gradient(90deg, ${C.hair} 0 2px, transparent 2px 2.5%)` }} />
      <div style={{ position: 'absolute', left: 70, top: 72, display: 'flex', alignItems: 'center', gap: 16, fontFamily: MONO, fontSize: 24, letterSpacing: '0.42em', color: C.paper }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${C.paper}`, boxShadow: `inset 0 0 0 6px ${C.ink}, inset 0 0 0 9px ${C.red}` }} />
        ORBITAL ATLAS
      </div>
      <div style={{ position: 'absolute', right: 70, top: 76, fontFamily: MONO, fontSize: 22, letterSpacing: '0.2em', color: C.red, textTransform: 'uppercase' }}>{lang === 'de' ? plateDe : plate}</div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ footage */

const Shot: React.FC<{ name: string; from: number; dur: number; punch?: boolean }> = ({ name, from, dur, punch = true }) => {
  const frame = useCurrentFrame();
  const local = frame - f(from);
  const p = punch ? interpolate(local, [0, 8], [0, 1], { ...clamp, easing: ease }) : 1;
  return (
    <Sequence from={f(from)} durationInFrames={f(dur)} layout="none">
      <AbsoluteFill style={{ transform: `scale(${1.07 - 0.07 * p})`, filter: `blur(${(1 - p) * 9}px)` }}>
        <OffthreadVideo src={staticFile(`shots/${name}.mp4`)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    </Sequence>
  );
};

/* ------------------------------------------------------------ section: powers of ten */

const SCALE_STEPS = [-2.0, -1.0, 0.8, 2.0, 3.3, 5.2, 7.5];
const AU_KM = 149_597_870.7;
const LY_AU = 63_241.077;

function readable(logD: number, lang: Lang) {
  const u = TEXT[lang].units;
  const au = 10 ** logD;
  const km = au * AU_KM;
  const loc = lang === 'de' ? 'de-DE' : 'en-GB';
  const n = (x: number, d = 0) => x.toLocaleString(loc, { maximumFractionDigits: d, minimumFractionDigits: d });
  if (km < 1e6) return { value: n(Math.round(km / 100) * 100), unit: u.km };
  if (au < 0.5) return { value: n(km / 1e6, 1), unit: u.mkm };
  if (au < 40_000) return { value: n(au, au < 10 ? 1 : 0), unit: u.au };
  return { value: n(au / LY_AU, au / LY_AU < 10 ? 1 : 0), unit: u.ly };
}

const PowersOfTen: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const T = TEXT[lang];
  const i = Math.min(s1.length - 1, Math.max(0, frame));
  const logD = s1[i].logD;
  const show = interpolate(frame, [f(B.zoomStart), f(B.zoomStart) + 8, f(B.galaxyHit) - 4, f(B.galaxyHit)], [0, 1, 1, 0], clamp);
  if (show <= 0) return null;
  const { value, unit } = readable(logD, lang);
  const step = SCALE_STEPS.filter((s) => logD > s).length;
  // the ruler: decades from 10⁻⁴ to 10¹⁰ AU, marker climbing
  const y = (d: number) => 1500 - ((d + 4) / 14) * 1000;
  return (
    <AbsoluteFill style={{ opacity: show }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <line x1={980} x2={980} y1={y(-4)} y2={y(10)} stroke={C.hair} strokeWidth={2} />
        {Array.from({ length: 15 }, (_, k) => k - 4).map((d) => (
          <line key={d} x1={d % 5 === 0 ? 958 : 968} x2={980} y1={y(d)} y2={y(d)} stroke={d % 5 === 0 ? C.paper2 : C.hair} strokeWidth={2} />
        ))}
        <path d={`M 990 ${y(logD)} l 22 -13 v 26 z`} fill={C.red} />
      </svg>
      <div style={{ position: 'absolute', left: 90, right: 160, top: 1180 }}>
        <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: '0.2em', color: C.paper3, textTransform: 'uppercase' }}>{T.distance}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginTop: 6 }}>
          <span style={{ fontFamily: SERIF, fontSize: 168, lineHeight: 1, color: C.paper, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          <span style={{ fontFamily: MONO, fontSize: 34, color: C.red, letterSpacing: '0.08em' }}>{unit}</span>
        </div>
        <div style={{ marginTop: 22, fontFamily: SERIF, fontStyle: 'italic', fontSize: 64, color: C.paper2 }}>{T.scales[step]}</div>
      </div>
      <Caps text={T.zoomCaption} at={B.zoomStart + 0.3} size={22} color={C.paper3} style={{ position: 'absolute', left: 90, top: 1700 }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ section: rewind */

const DateCounter: React.FC<{ lang: Lang; from: number }> = ({ lang, from }) => {
  const frame = useCurrentFrame();
  const i = Math.min(s5.length - 1, Math.max(0, frame - f(from)));
  const jd = s5[i].jd;
  const ms = (jd - 2440587.5 - 69.184 / 86400) * 86400000;
  const d = new Date(ms);
  const loc = lang === 'de' ? 'de-DE' : 'en-GB';
  const day = d.toLocaleDateString(loc, { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '');
  const year = d.getUTCFullYear();
  const speed = i > 0 ? Math.abs(s5[i].jd - s5[i - 1].jd) : 0;
  const o = interpolate(frame, [f(from), f(from) + 6, f(B.halley) + 2, f(B.halley) + 10], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: 'absolute', left: 90, right: 90, top: 1240, opacity: o }}>
      <div style={{ fontFamily: SERIF, fontSize: 230, lineHeight: 0.9, color: C.paper, fontVariantNumeric: 'tabular-nums', filter: `blur(${Math.min(4, speed / 40)}px)` }}>{year}</div>
      <div style={{ fontFamily: MONO, fontSize: 40, color: C.red, letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 8 }}>{day}</div>
    </div>
  );
};

/* ------------------------------------------------------------ section: cutaway layers */

const LAYER_COLORS = ['#8a7a68', '#9b5b49', '#c7735a', '#e39a5c', '#f0c879'];

const Layers: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const T = TEXT[lang];
  return (
    <div style={{ position: 'absolute', left: 90, right: 90, top: 1260 }}>
      {T.layers.map((name, k) => {
        const at = B.layerTicks[k];
        const p = interpolate(frame, [f(at), f(at) + 10], [0, 1], { ...clamp, easing: ease });
        const out = interpolate(frame, [f(B.rewindStart) - 8, f(B.rewindStart)], [1, 0], clamp);
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 24, height: 66, opacity: p * out, transform: `translateX(${(1 - p) * -40}px)` }}>
            <div style={{ width: 58, height: 18, background: LAYER_COLORS[k], boxShadow: `inset 0 0 0 2px rgba(236,228,212,0.6)` }} />
            <div style={{ fontFamily: SERIF, fontSize: 54, color: C.paper }}>{name}</div>
            <div style={{ flex: 1, height: 1.5, background: C.hair }} />
            <div style={{ fontFamily: MONO, fontSize: 22, color: C.paper3 }}>{['0–24', '24–670', '670–2 891', '2 891–5 150', '5 150–6 371'][k]} km</div>
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------ end card */

const Orrery: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const t = (frame - f(at)) / FPS;
  const orbits = [0.39, 0.72, 1.0, 1.52, 5.2, 9.58, 19.2, 30.1];
  const periods = [0.24, 0.62, 1, 1.88, 11.86, 29.46, 84, 164.8];
  return (
    <svg width={760} height={760} viewBox="-110 -110 220 220" style={{ position: 'absolute', left: 160, top: 300, opacity: 0.85 }}>
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2;
        const r0 = i % 6 === 0 ? 100 : 103;
        const p = interpolate(t, [0.1 + i * 0.008, 0.3 + i * 0.008], [0, 1], clamp);
        return <line key={i} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0} x2={Math.cos(a) * 106} y2={Math.sin(a) * 106} stroke={C.paper} strokeOpacity={0.4 * p} strokeWidth={0.5} />;
      })}
      {orbits.map((a, i) => {
        const r = 12 + Math.sqrt(a / 30.1) * 84;
        const len = 2 * Math.PI * r;
        const p = interpolate(t, [0.05 + i * 0.09, 0.9 + i * 0.09], [0, 1], { ...clamp, easing: ease });
        const ang = (i * 137.5 * Math.PI) / 180 - t * (2.2 / Math.sqrt(periods[i]));
        return (
          <g key={i}>
            <circle r={r} fill="none" stroke={C.paper} strokeOpacity={0.32} strokeWidth={0.5} strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
            <circle cx={Math.cos(ang) * r} cy={Math.sin(ang) * r} r={i >= 4 ? 2.6 : 1.8} fill={C.paper} opacity={p} />
          </g>
        );
      })}
      <circle r={4.2} fill={C.red} opacity={interpolate(t, [0, 0.3], [0, 1], clamp)} />
    </svg>
  );
};

const EndCard: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const T = TEXT[lang];
  const o = interpolate(frame, [f(B.endHit), f(B.endHit) + 10], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(4,7,13,0.35), rgba(4,7,13,0.88) 70%)' }} />
      <Orrery at={B.endHit} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1130, textAlign: 'center' }}>
        <Rise text={T.title} at={B.endHit + 0.15} size={176} stagger={0.09} style={{ justifyContent: 'center' }} />
        <Rise text={T.tagline} at={B.endHit + 0.7} size={66} italic color={C.paper2} style={{ marginTop: 10 }} />
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 46 }}>
          <Rule at={B.urlBell - 0.2} width={420} />
        </div>
        <Caps text={T.url} at={B.urlBell} size={34} color={C.paper} style={{ marginTop: 34, letterSpacing: '0.06em', textTransform: 'none' }} />
        <Caps text={T.footer} at={B.urlBell + 0.5} size={20} color={C.paper3} style={{ marginTop: 26 }} />
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ texture */

const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity: 0.16 }}>
      <svg width={1080} height={1920}>
        <filter id="g">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 30} />
        </filter>
        <rect width="100%" height="100%" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
};

const Flash: React.FC<{ at: number; strength?: number }> = ({ at, strength = 0.85 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [f(at) - 1, f(at), f(at) + 9], [0, strength, 0], clamp);
  return <AbsoluteFill style={{ background: C.paper, opacity: o, mixBlendMode: 'screen' }} />;
};

/* ------------------------------------------------------------ the edit */

export const Trailer: React.FC<{ lang: Lang }> = ({ lang }) => {
  const T = TEXT[lang];
  const shots = TL.shots;
  const s = Object.fromEntries(shots.map((x) => [x.name, x]));
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {shots.map((x, i) => (
        <Shot key={x.name} name={x.name} from={x.from} dur={x.dur} punch={i !== 1} />
      ))}
      {/* readability: soft ink at the top and bottom of the picture */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(4,7,13,0.75) 0%, rgba(4,7,13,0) 16%, rgba(4,7,13,0) 55%, rgba(4,7,13,0.82) 100%)' }} />
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 220px rgba(0,0,0,0.65)' }} />

      {/* hook */}
      <Sequence from={0} durationInFrames={f(B.zoomStart + 0.1)} layout="none">
        <div style={{ position: 'absolute', left: 90, right: 90, top: 1260 }}>
          <Rise text={T.hook1} at={B.hook1} size={104} out={B.zoomStart} />
          <Rise text={T.hook2} at={B.hook2} size={104} italic color={C.red} out={B.zoomStart} style={{ marginTop: 12 }} />
        </div>
      </Sequence>
      <Burst at={B.hook2} color={C.red} />

      <PowersOfTen lang={lang} />

      {/* galaxy */}
      <Flash at={B.galaxyHit} />
      <Burst at={B.galaxyHit} />
      <Sequence from={f(B.galaxyHit)} durationInFrames={f(s['s2-galaxy'].dur)} layout="none">
        <div style={{ position: 'absolute', left: 90, right: 90, top: 1330 }}>
          <Caps text={T.plateGalaxy} at={B.galaxyHit + 0.15} color={C.red} size={24} />
          <Rise text={T.here} at={B.galaxyHit + 0.25} size={150} out={B.saturnDive} style={{ marginTop: 18 }} />
        </div>
      </Sequence>

      {/* Saturn */}
      <Sequence from={f(B.saturnDive)} durationInFrames={f(s['s3-saturn'].dur)} layout="none">
        <div style={{ position: 'absolute', left: 90, right: 90, top: 1280 }}>
          <Rise text={T.newton1} at={B.saturnDive + 0.4} size={92} color={C.paper2} out={12.5} />
          <Rise text={T.newton2} at={B.saturnDive + 0.75} size={124} italic color={C.paper} out={12.5} />
          <Rule at={B.saturnDive + 1.3} width={360} style={{ marginTop: 18 }} />
          <Caps text={T.newton3} at={B.saturnDive + 1.8} size={26} color={C.paper} out={12.5} style={{ marginTop: 26 }} />
        </div>
      </Sequence>

      {/* cutaway */}
      <Burst at={B.cutOpen} color={C.red} y={700} />
      <Sequence from={f(12.6)} durationInFrames={f(s['s4-cut'].dur)} layout="none">
        <div style={{ position: 'absolute', left: 90, right: 90, top: 1120 }}>
          <Rise text={T.cut} at={12.7} size={92} out={B.rewindStart} />
        </div>
        <Layers lang={lang} />
        <Caps text={T.cutCaption} at={14.4} size={20} color={C.paper3} out={B.rewindStart} style={{ position: 'absolute', left: 90, top: 1610 }} />
      </Sequence>

      {/* rewind */}
      <Sequence from={f(B.rewindStart)} durationInFrames={f(s['s5-rewind'].dur)} layout="none">
        <div style={{ position: 'absolute', left: 90, right: 90, top: 1110 }}>
          <Rise text={T.rewind} at={B.rewindStart + 0.1} size={84} out={B.halley} />
        </div>
        <DateCounter lang={lang} from={B.rewindStart} />
        <div style={{ position: 'absolute', left: 90, right: 90, top: 1300 }}>
          <Rise text={T.halley} at={B.halley + 0.1} size={130} out={B.accuracy} />
          <Caps text={T.halleyWhen} at={B.halley + 0.4} size={30} color={C.red} out={B.accuracy} style={{ marginTop: 14 }} />
        </div>
      </Sequence>
      <Flash at={B.halley} strength={0.35} />

      {/* accuracy */}
      <Sequence from={f(B.accuracy)} durationInFrames={f(s['s6-orrery'].dur)} layout="none">
        <div style={{ position: 'absolute', left: 90, right: 90, top: 1230 }}>
          <Rise text={T.accuracyBig} at={B.accuracy + 0.15} size={240} out={B.endHit} />
          <Caps text={T.accuracy} at={B.accuracy + 0.5} size={24} color={C.paper} out={B.endHit} style={{ marginTop: 8, whiteSpace: 'normal', lineHeight: 1.5 }} />
        </div>
      </Sequence>

      {/* end */}
      <Flash at={B.endHit} strength={0.6} />
      <Sequence from={f(B.endHit)} layout="none">
        <EndCard lang={lang} />
      </Sequence>

      <Frame lang={lang} />
      <Grain />
      <Audio src={staticFile('score.wav')} />
    </AbsoluteFill>
  );
};
