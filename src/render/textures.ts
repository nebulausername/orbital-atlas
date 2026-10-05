/** Lazy texture loading: 2k maps when a body first becomes visible, 4k when it is focused. */
import { LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture, type WebGLRenderer } from 'three';

const loader = new TextureLoader();
const cache = new Map<string, Promise<Texture>>();
let base = './textures/';
let maxAniso = 4;
let pending = 0;
const listeners = new Set<(n: number) => void>();

export function configureTextures(renderer: WebGLRenderer, baseUrl: string) {
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  base = baseUrl;
}

export function onPending(f: (n: number) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** colour = sRGB albedo map; data = masks (ocean, clouds) */
export function loadTexture(file: string, kind: 'colour' | 'data' = 'colour'): Promise<Texture> {
  const key = `${file}|${kind}`;
  let p = cache.get(key);
  if (!p) {
    pending++;
    listeners.forEach((f) => f(pending));
    p = loader.loadAsync(base + file).then((t) => {
      t.colorSpace = kind === 'colour' ? SRGBColorSpace : NoColorSpace;
      t.wrapS = RepeatWrapping;
      t.anisotropy = maxAniso;
      t.minFilter = LinearMipmapLinearFilter;
      t.needsUpdate = true;
      return t;
    });
    p.finally(() => {
      pending--;
      listeners.forEach((f) => f(pending));
    });
    cache.set(key, p);
  }
  return p;
}

export function pendingTextures() {
  return pending;
}
