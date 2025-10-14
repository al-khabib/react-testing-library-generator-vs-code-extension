import React from 'react';
import ReactDOM from 'react-dom/client';
import PanelApp from './PanelApp';
import '../index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to locate root element for test panel.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PanelApp />
  </React.StrictMode>
);
