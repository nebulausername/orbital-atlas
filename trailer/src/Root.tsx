import { Composition, continueRender, delayRender, staticFile } from 'remotion';
import { Trailer } from './Trailer';
import TL from '../timeline.json';

// Self-hosted fonts, loaded before the first frame renders.
const FONTS: [string, string, string][] = [
  ['Instrument Serif', 'fonts/instrument-serif-latin-400-normal.woff2', 'normal'],
  ['Instrument Serif', 'fonts/instrument-serif-latin-400-italic.woff2', 'italic'],
  ['IBM Plex Mono', 'fonts/ibm-plex-mono-latin-400-normal.woff2', 'normal'],
  ['IBM Plex Sans', 'fonts/ibm-plex-sans-latin-400-normal.woff2', 'normal'],
];
if (typeof document !== 'undefined') {
  const handle = delayRender('fonts');
  Promise.all(
    FONTS.map(([family, file, style]) => {
      const f = new FontFace(family, `url(${staticFile(file)})`, { style });
      return f.load().then((loaded) => (document.fonts as unknown as { add: (f: FontFace) => void }).add(loaded));
    }),
  ).then(() => continueRender(handle));
}

export const Root = () => (
  <>
    <Composition id="Trailer-EN" component={Trailer} durationInFrames={Math.round(TL.duration * TL.fps)} fps={TL.fps} width={TL.width} height={TL.height} defaultProps={{ lang: 'en' as const }} />
    <Composition id="Trailer-DE" component={Trailer} durationInFrames={Math.round(TL.duration * TL.fps)} fps={TL.fps} width={TL.width} height={TL.height} defaultProps={{ lang: 'de' as const }} />
  </>
);
