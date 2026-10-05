import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SolanaProvider } from './solana/SolanaProvider';
import './styles.css';

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
 */
createRoot(container).render(
  <SolanaProvider>
    <App />
  </SolanaProvider>,
);