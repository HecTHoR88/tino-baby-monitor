import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hecthor.tino',
  appName: 'tino-baby-monitor',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      style: 'light',
    },
  },
};

export default config;
