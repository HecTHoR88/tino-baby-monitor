import { BRAND_LOGO_DATA } from './logoData';

/**
 * TiNO Official Brand Logic - v1.4.0
 * Este archivo gestiona el favicon y el manifest. 
 * Ahora soporta tanto rutas de archivos locales como strings Base64.
 */

export const BRAND_LOGO = BRAND_LOGO_DATA;

export const applyGlobalBranding = () => {
  // Validación de seguridad: Permitimos rutas de archivos (mínimo 3 caracteres) o Base64.
  if (!BRAND_LOGO || BRAND_LOGO.length < 3) return;

  // A. Actualizar Favicon
  let favicon: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.href = BRAND_LOGO;

  // B. Actualizar Apple Touch Icon
  let appleIcon: HTMLLinkElement | null = document.querySelector("link[rel='apple-touch-icon']");
  if (!appleIcon) {
    appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    document.head.appendChild(appleIcon);
  }
  appleIcon.href = BRAND_LOGO;

  // C. Generar Manifiesto Dinámico
  const manifest = {
    "id": "tino-baby-monitor-v140",
    "short_name": "TiNO",
    "name": "TiNO Baby Monitor",
    "start_url": "./index.html",
    "display": "standalone",
    "background_color": "#f8fafc",
    "theme_color": "#4f46e5",
    "orientation": "portrait",
    "icons": [
      {
        "src": BRAND_LOGO,
        "sizes": "192x192 512x512",
        "type": "image/png"
      }
    ]
  };

  const stringManifest = JSON.stringify(manifest);
  const blob = new Blob([stringManifest], {type: 'application/json'});
  const manifestURL = URL.createObjectURL(blob);
  
  let manifestLink: HTMLLinkElement | null = document.querySelector("link[rel='manifest']");
  if (manifestLink) {
    manifestLink.setAttribute('href', manifestURL);
  }
};