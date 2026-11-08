// Entry point for the web version (scripts/build.mjs --web → dist-web/). Same app as main.jsx,
// with the browser bridge in place of the Tauri one. Must stay first: sets up window.api.
import './web-api.js';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './store.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <AppProvider>
    <App />
  </AppProvider>
);
