import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { rpcClient } from './rpc/rpcClient';
import './index.css';

// Listen before the first render, never in an effect: VS Code delivers the
// messages posted while the page loaded on its `load` event, which can beat
// React's effects, and a message with no listener is gone (#221).
rpcClient.initialize();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
