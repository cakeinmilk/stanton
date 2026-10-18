/** Android-only behaviour: back button, system bar colours, touch styling. */
import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';

export function initMobileShell(opts: { back: () => boolean }) {
  document.documentElement.classList.add('is-mobile', 'is-touch');
  // Back: close a drawer/menu/dialog or go back in Stanton; at the start, leave the app.
  void App.addListener('backButton', () => {
    if (!opts.back()) void App.minimizeApp();
  });
}

/** The title bar is always dark, so status bar icons are light; the gesture bar follows the theme. */
export function setSystemBars(dark: boolean) {
  void SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }).catch(() => undefined);
  void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light, bar: SystemBarType.NavigationBar }).catch(() => undefined);
}
