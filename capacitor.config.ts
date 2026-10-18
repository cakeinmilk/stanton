import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.stanton.notes',
  appName: 'Stanton',
  webDir: 'dist',
  android: {
    // The web layer draws behind the system bars; MainActivity passes the insets to CSS.
    backgroundColor: '#046565',
  },
};

export default config;
