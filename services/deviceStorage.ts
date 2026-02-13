import { secureStorage } from './secureStorage';

export const getDeviceId = (): string => {
  let id = localStorage.getItem('tino_device_id'); 
  if (!id) {
    const randomPart = Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 6);
    id = `tino-${randomPart}`;
    localStorage.setItem('tino_device_id', id);
  }
  return id;
};

// Synchronous fallback (Legacy & iOS & Robust Android)
export const getDeviceName = (): string => {
  let name = secureStorage.getItem<string>('tino_device_name');
  if (!name) {
    const ua = navigator.userAgent;
    let model = "Dispositivo TiNO";

    // STRICT PRIORITY ORDER: Android must come BEFORE Linux
    if (/iPhone/.test(ua)) {
        model = "iPhone";
    } else if (/iPad/.test(ua)) {
        model = "iPad";
    } else if (/Android/.test(ua)) {
        // Hyper Heuristic: Try to extract model from UA string (usually before "Build/")
        // Format often: "Linux; Android 10; SM-G991B Build/..."
        const androidMatch = ua.match(/;\s?([^;]+?)\s+Build\//);
        if (androidMatch && androidMatch[1]) {
            model = androidMatch[1].trim(); // e.g. "SM-G991B"
        } else {
            // Secondary check for brands if Build/ pattern missing
            if (/Samsung|SM-/i.test(ua)) model = "Samsung Device";
            else if (/Pixel/i.test(ua)) model = "Pixel Device";
            else if (/Xiaomi|Redmi|POCO/i.test(ua)) model = "Xiaomi Device";
            else if (/Moto|Motorola/i.test(ua)) model = "Motorola Device";
            else model = "Android Device";
        }
    } else if (/Windows/.test(ua)) {
        model = "PC Windows";
    } else if (/Macintosh/.test(ua)) {
        model = "Mac";
    } else if (/Linux/.test(ua)) {
        // CRITICAL FIX: Only claim Linux if NOT Android (redundant due to order, but safe)
        model = "PC Linux";
    }

    const suffix = Math.floor(Math.random() * 100);
    name = `${model} #${suffix}`;
    secureStorage.setItem('tino_device_name', name);
  }
  return name;
};

export const setDeviceName = (name: string) => {
  secureStorage.setItem('tino_device_name', name);
};

// Asynchronous "Ultra Detect" (Android Modern Client Hints)
export const initializeSmartName = async (): Promise<string | null> => {
    let currentName = secureStorage.getItem<string>('tino_device_name');
    
    // Check if we support Client Hints (Modern Android Chrome)
    if ((navigator as any).userAgentData && (navigator as any).userAgentData.getHighEntropyValues) {
        try {
            // Request the specific 'model' from the browser
            const uaData = await (navigator as any).userAgentData.getHighEntropyValues(['model', 'platform']);
            
            if (uaData.model) {
                const suffix = Math.floor(Math.random() * 100);
                const realModelName = `${uaData.model} #${suffix}`;
                
                // Only overwrite if the current name looks generic
                const isGeneric = !currentName || 
                                  currentName.includes("Android Device") || 
                                  currentName.includes("Dispositivo TiNO") ||
                                  currentName.includes("PC Linux"); // Fix incorrect detections

                if (isGeneric) {
                    secureStorage.setItem('tino_device_name', realModelName);
                    return realModelName;
                }
            }
        } catch (e) {
            console.warn("Client Hints check failed", e);
        }
    }

    return null;
};
export const getPersistentNumericId = (): string => {
  let id = localStorage.getItem('tino_numeric_id');
  if (!id) {
    // Genera el código de 6 dígitos una sola vez
    id = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('tino_numeric_id', id);
  }
  return id;
};
export const getCameraPreference = (): 'user' | 'environment' => {
  return secureStorage.getItem<'user' | 'environment'>('tino_camera_pref') || 'environment';
};

export const setCameraPreference = (pref: 'user' | 'environment') => {
  secureStorage.setItem('tino_camera_pref', pref);
};