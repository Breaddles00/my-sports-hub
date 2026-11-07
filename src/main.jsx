// Must stay first: sets up window.api (Tauri bridge) before any app code runs.
import './tauri-api.js';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './store.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <AppProvider>
    <App />
  </AppProvider>
);
