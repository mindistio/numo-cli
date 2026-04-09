// Injected at build time by esbuild `define`. Fallback to env vars for dev mode.
declare const __FIREBASE_API_KEY__: string;
declare const __FIREBASE_PROJECT_ID__: string;
declare const __FIREBASE_APP_ID__: string;

export function getFirebaseApiKey(): string {
  return process.env.NUMO_FIREBASE_API_KEY ?? (typeof __FIREBASE_API_KEY__ !== 'undefined' ? __FIREBASE_API_KEY__ : '');
}

export function getFirebaseProjectId(): string {
  return process.env.NUMO_FIREBASE_PROJECT_ID ?? (typeof __FIREBASE_PROJECT_ID__ !== 'undefined' ? __FIREBASE_PROJECT_ID__ : '');
}

export function getFirebaseAppId(): string {
  return process.env.NUMO_FIREBASE_APP_ID ?? (typeof __FIREBASE_APP_ID__ !== 'undefined' ? __FIREBASE_APP_ID__ : '');
}
