// Are we running inside the Android app? Capacitor's bridge injects `window.Capacitor` there; on the
// web it is absent, so every app-only path in the game is a no-op. Plugins are reached through the
// bridge too, so the game keeps loading its ES modules directly, with no bundler.
export function isApp() {
  return !!globalThis.Capacitor?.isNativePlatform?.();
}

// A native plugin by name (e.g. 'App'), or null outside the app or when it is not installed.
export function appPlugin(name) {
  return (isApp() && globalThis.Capacitor.Plugins?.[name]) || null;
}
