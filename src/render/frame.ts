import type { PerspectiveCamera, Vector3 } from 'three';
import type { Simulation } from '../physics/simulation';
import type { V3 } from '../physics/frames';

/** Everything a layer needs to draw one frame. */
export interface Frame {
  sim: Simulation;
  camera: PerspectiveCamera;
  /** camera position, scene axes, AU (float64) */
  cam: V3;
  /** focus point, scene axes, AU */
  focus: V3;
  /** render units per AU: everything is drawn relative to the camera and scaled by s */
  s: number;
  /** log10 of the camera–focus distance in AU */
  logD: number;
  focusKey: string | null;
  selectedKey: string | null;
  /** days since J2000 (TDB) */
  days: number;
  /** real seconds since start, and since the last frame */
  time: number;
  dt: number;
  width: number;
  height: number;
  dpr: number;
  /** pixels per radian at the screen centre */
  pxPerRad: number;
  /** 0 = true scale, 1 = illustrative (animated) */
  illus: number;
  /** body positions in scene axes, AU */
  pos: Map<string, V3>;
  showOrbits: number;
  showTrails: number;
  showSmallBodies: number;
  showLabels: boolean;
  /** 0..1 how much the galactic reference frame has taken over (for UI and layers) */
  galBlend: number;
  reducedMotion: boolean;
}

export function toRender(f: Frame, p: V3, out: Vector3): Vector3 {
  return out.set((p[0] - f.cam[0]) * f.s, (p[1] - f.cam[1]) * f.s, (p[2] - f.cam[2]) * f.s);
}

export function distanceAu(f: Frame, p: V3): number {
  return Math.hypot(p[0] - f.cam[0], p[1] - f.cam[1], p[2] - f.cam[2]);
}
