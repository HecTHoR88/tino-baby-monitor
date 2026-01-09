import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/**
 * Registro de Service Worker optimizado para entornos restrictivos.
 * Se utiliza una ruta relativa estándar y se silencia la advertencia de entorno
 * para mejorar la experiencia del usuario en previsualizaciones de desarrollo.
 */
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw-v85.js')
      .then(registration => {
        console.log('TiNO SW activo:', registration.scope);
      })
      .catch(error => {
        // Fallo silencioso: los Service Workers no siempre están permitidos en sandboxes
        console.debug('Service Worker no registrado (esperado en este entorno):', error.message);
      });
  });
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(App));
}