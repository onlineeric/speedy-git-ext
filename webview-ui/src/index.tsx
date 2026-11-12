import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { rpcClient } from './rpc/rpcClient';
import './index.css';

// Listen before the first render, not in an effect after it. VS Code delivers
// the messages the extension posted while the page loaded as soon as the page's
// `load` event fires, which can be before React has committed and run effects;
// any of them arriving with no listener is gone for good (issue #221). Handlers
// only write to the Zustand store, which needs no mounted component.
rpcClient.initialize();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
