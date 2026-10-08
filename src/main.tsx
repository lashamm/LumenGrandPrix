import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { App } from './App';
import { SolanaProvider } from './solana/SolanaProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { loadTheme } from './state/theme';
import { applyTheme } from './theme/theme';
import './styles.css';

/**
 * Paint the stored theme before React renders.
 *
 * `styles.css` has already been evaluated at this point (imports run in order),
 * so without this call the first frame would show the default identity and then
 * snap to the saved one as soon as the provider mounts. The custom properties
 * are written as inline styles on <html>, which outrank `:root`.
 */
applyTheme(loadTheme());

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

/**
 * StrictMode is deliberately not enabled.
 *
 * Its dev-only double mount would create and immediately destroy a whole Phaser
 * game (canvas, WebGL context, RAF loop, window listeners) every time the Race
 * screen mounts. That is exactly the kind of imperative engine lifecycle
 * StrictMode's simulated remount is designed to catch bugs in, and there is
 * nothing useful for it to find here.
 *
 * `Analytics` and `SpeedInsights` are mounted here, in the entry module, exactly
 * once. This module is evaluated a single time, so it is the safest possible place
 * to guarantee a single mount. Both components render `null`, so they add no
 * DOM and cannot interfere with Phaser.
 *
 * Neither component reads a `VITE_*` env var. Each injects its script tag
 * client-side on mount, pointing at a same-origin path that only Vercel serves:
 *   - production: /_vercel/insights/script.js, /_vercel/speed-insights/script.js
 *   - `npm run dev`: https://va.vercel-scripts.com/v1/script.debug.js
 * That is why nothing appears in the built `index.html` — the tag is added at
 * runtime, not baked into the HTML.
 */
createRoot(container).render(
  <ThemeProvider>
    <SolanaProvider>
      <App />
      <Analytics />
      <SpeedInsights />
    </SolanaProvider>
  </ThemeProvider>,
);