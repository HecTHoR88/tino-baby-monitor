import { BRAND_LOGO_DATA } from './logoData';

/**
 * TiNO Official Brand Logic - v1.3.7
 * Gestiona el favicon y el manifest dinámico inyectando el logo de logoData.ts
 */

export const BRAND_LOGO = BRAND_LOGO_DATA;

export const applyGlobalBranding = () => {
  if (!BRAND_LOGO || BRAND_LOGO.length < 100 || BRAND_LOGO === "TU_CODIGO_BASE64_AQUI") return;

  // 1. Actualizar Iconos de Navegador
  const updateIcon = (rel: string) => {
    let link: HTMLLinkElement | null = document.querySelector(`link[rel~='${rel}']`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = BRAND_LOGO;
  };

  updateIcon('icon');
  updateIcon('apple-touch-icon');

  // 2. Generar Manifiesto PWA Dinámico
  const manifest = {
    "id": "tino-baby-monitor-v137",
    "short_name": "TiNO",
    "name": "TiNO Baby Monitor",
    "start_url": "./index.html",
    "display": "standalone",
    "background_color": "#f8fafc",
    "theme_color": "#4f46e5",
    "orientation": "portrait",
    "icons": [{ "src": BRAND_LOGO, "sizes": "192x192 512x512", "type": "image/png" }]
  };

  const blob = new Blob([JSON.stringify(manifest)], {type: 'application/json'});
  const manifestURL = URL.createObjectURL(blob);
  document.querySelector("link[rel='manifest']")?.setAttribute('href', manifestURL);
};