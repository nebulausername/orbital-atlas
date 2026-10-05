/**
 * The atlas camera: an orbit around a focus body with a logarithmic distance that spans
 * sixteen orders of magnitude, from a few hundred kilometres above a moon to the outskirts
 * of the Milky Way.
 *
 * - Zooming far out, the focus slides from the Sun to the Galactic centre and the
 *   reference "up" turns from the ecliptic pole to the galactic pole.
 * - Flights between targets arc out ("hop") just far enough to keep both in view.
 */
import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import { GAL_X, GAL_Z, type V3 } from '../physics/frames';
import { PC_AU, clamp, lerp, smoothstep } from '../core/units';
import { GALAXY } from '../data/galaxy';

export const LOGD_MAX = 10.75;
const KPC_AU = PC_AU * 1000;

export interface FlightTarget {
  key: string | null;
  logD: number;
  yaw?: number;
  pitch?: number;
  duration?: number;
  /** velocity profile; chained segments use in/linear/out to keep a constant pace */
  easing?: 'inout' | 'in' | 'out' | 'linear';
  /** called once the flight has landed */
  done?: () => void;
}

interface Flight {
  from: V3;
  fromLogD: number;
  fromYaw: number;
  fromPitch: number;
  to: FlightTarget;
  toYaw: number;
  toPitch: number;
  t: number;
  dur: number;
  hop: number;
}

const EASE = {
  inout: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  in: (t: number) => t * t,
  out: (t: number) => 1 - (1 - t) * (1 - t),
  linear: (t: number) => t,
};
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Galactic centre in scene axes (AU) given the Sun's position. */
export function galacticCentre(sun: V3): V3 {
  const r0 = GALAXY.r0Kpc * KPC_AU;
  const z = GALAXY.sunZKpc * KPC_AU;
  return [sun[0] + GAL_X[0] * r0 - GAL_Z[0] * z, sun[1] + GAL_X[1] * r0 - GAL_Z[1] * z, sun[2] + GAL_X[2] * r0 - GAL_Z[2] * z];
}

export class AtlasCamera {
  focusKey: string | null = 'sun';
  logD = 1.0;
  targetLogD = 1.0;
  yaw = -0.6;
  pitch = 0.42;
  yawVel = 0;
  pitchVel = 0;
  minLogD = -6;
  flight: Flight | null = null;
  /** seconds since the last user input, drives the idle drift */
  idle = 0;
  /** last computed values */
  readonly cam: V3 = [0, 0, 0];
  readonly focus: V3 = [0, 0, 0];
  galBlend = 0;

  private qEcl = new Quaternion();
  private qGal = new Quaternion();
  private q = new Quaternion();

  constructor() {
    // Ecliptic frame: forward +X, up +Y (scene). Galactic frame: forward toward the
    // Galactic centre, up = north galactic pole. Both map (fwd, up, fwd × up).
    this.qEcl.identity();
    const fwd = new Vector3(...GAL_X);
    const up = new Vector3(...GAL_Z);
    const right = new Vector3().crossVectors(fwd, up);
    this.qGal.setFromRotationMatrix(new Matrix4().makeBasis(fwd, up, right));
  }

  /** Smoothly zoom by a factor of 10^delta. */
  zoomBy(delta: number) {
    this.flight = null;
    this.targetLogD = clamp(this.targetLogD + delta, this.minLogD, LOGD_MAX);
    this.idle = 0;
  }

  rotateBy(dx: number, dy: number) {
    this.yawVel += dx;
    this.pitchVel += dy;
    this.idle = 0;
  }

  flyTo(target: FlightTarget, currentFocus: V3, targetFocus: V3) {
    const sep = Math.hypot(targetFocus[0] - currentFocus[0], targetFocus[1] - currentFocus[1], targetFocus[2] - currentFocus[2]);
    const hi = Math.max(this.logD, target.logD);
    const hop = sep > 0 ? Math.max(0, Math.log10(sep) + 0.35 - hi) : 0;
    const span = Math.abs(target.logD - this.logD) + hop * 2;
    this.flight = {
      from: [...currentFocus] as V3,
      fromLogD: this.logD,
      fromYaw: this.yaw,
      fromPitch: this.pitch,
      to: target,
      toYaw: target.yaw ?? this.yaw,
      toPitch: target.pitch ?? this.pitch,
      t: 0,
      dur: target.duration ?? clamp(1.4 + 0.32 * span, 1.6, 6.5),
      hop,
    };
    this.yawVel = this.pitchVel = 0;
    this.idle = 0;
  }

  get flying() {
    return this.flight !== null;
  }

  /**
   * Advance one frame. `bodyPos(key)` returns live scene positions; `sun` is the Sun's.
   * Writes this.cam / this.focus and orients the three.js camera (which stays at the origin).
   */
  update(dt: number, camera: PerspectiveCamera, bodyPos: (k: string) => V3 | undefined, sun: V3, reducedMotion: boolean) {
    this.idle += dt;
    const gc = galacticCentre(sun);
    let base: V3;

    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / (reducedMotion ? Math.min(f.dur, 0.6) : f.dur));
      const e = EASE[f.to.easing ?? 'inout'](f.t);
      const live = (f.to.key && bodyPos(f.to.key)) || sun;
      const ef = smoothstep(0.12, 0.88, f.t);
      base = [lerp(f.from[0], live[0], ef), lerp(f.from[1], live[1], ef), lerp(f.from[2], live[2], ef)];
      this.logD = lerp(f.fromLogD, f.to.logD, e) + f.hop * Math.sin(Math.PI * e);
      this.targetLogD = this.logD;
      this.yaw = f.fromYaw + wrapAngle(f.toYaw - f.fromYaw) * e;
      this.pitch = lerp(f.fromPitch, f.toPitch, e);
      if (f.t >= 1) {
        this.focusKey = f.to.key;
        this.logD = this.targetLogD = f.to.logD;
        this.flight = null;
        f.to.done?.();
      }
    } else {
      base = (this.focusKey && bodyPos(this.focusKey)) || sun;
      // damped zoom toward the target
      const k = 1 - Math.exp(-dt * 7);
      this.logD += (this.targetLogD - this.logD) * k;
      // inertial rotation
      this.yaw += this.yawVel;
      this.pitch = clamp(this.pitch + this.pitchVel, -1.45, 1.45);
      const damp = Math.exp(-dt * 6);
      this.yawVel *= damp;
      this.pitchVel *= damp;
      // a slow drift when nobody is touching anything
      if (this.idle > 10 && !reducedMotion) this.yaw += dt * 0.012 * smoothstep(10, 14, this.idle);
    }

    // far out, the focus slides to the Galactic centre and "up" becomes the galactic pole
    const toGal = smoothstep(7.9, 9.7, this.logD);
    this.galBlend = smoothstep(6.6, 8.6, this.logD);
    this.focus[0] = lerp(base[0], gc[0], toGal);
    this.focus[1] = lerp(base[1], gc[1], toGal);
    this.focus[2] = lerp(base[2], gc[2], toGal);

    this.q.slerpQuaternions(this.qEcl, this.qGal, this.galBlend);
    const fwd = new Vector3(1, 0, 0).applyQuaternion(this.q);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.q);
    const right = new Vector3().crossVectors(fwd, up);
    const cp = Math.cos(this.pitch);
    const dir = new Vector3()
      .addScaledVector(fwd, cp * Math.cos(this.yaw))
      .addScaledVector(right, cp * Math.sin(this.yaw))
      .addScaledVector(up, Math.sin(this.pitch));
    const d = 10 ** this.logD;
    this.cam[0] = this.focus[0] + dir.x * d;
    this.cam[1] = this.focus[1] + dir.y * d;
    this.cam[2] = this.focus[2] + dir.z * d;

    camera.position.set(0, 0, 0);
    camera.up.copy(up);
    camera.lookAt(-dir.x, -dir.y, -dir.z);
  }
}

