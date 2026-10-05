// Self-hosted fonts (no third-party requests), Latin subsets only.
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-sans/latin-300.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import './styles/atlas.css';
import { start } from './app';

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

if (hasWebGL2()) {
  void start();
} else {
  const de = navigator.language?.startsWith('de');
  document.body.insertAdjacentHTML('beforeend', `<div class="nowebgl">${de ? 'Orbital Atlas braucht WebGL 2. Bitte einen aktuellen Browser verwenden.' : 'Orbital Atlas needs WebGL 2. Please try a current browser.'}</div>`);
}
