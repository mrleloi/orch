/**
 * main.tsx — Orch Web UI entry point.
 *
 * I-7: dev server binds 127.0.0.1:4142 (see vite.config.ts).
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.js';

const rootEl = document.getElementById('root');
if (rootEl == null) {
  throw new Error('[orch/web] #root element not found in DOM');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
