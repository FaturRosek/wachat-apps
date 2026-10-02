import Constants from 'expo-constants';

function detectDefaultHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:5000`;
    }
  }
  return 'http://10.0.2.2:5000';
}

export const DEFAULT_API_HOST = detectDefaultHost();

export const STORAGE_KEYS = {
  apiHost: 'wachat_api_host',
  token: 'token',
  user: 'user',
  theme: 'app_theme',
  soundEnabled: 'wa_notif_sound_enabled',
  desktopEnabled: 'wa_notif_desktop_enabled',
};

let apiHost = DEFAULT_API_HOST;

export function normalizeHost(host) {
  if (!host) return DEFAULT_API_HOST;
  return String(host).trim().replace(/\/+$/, '');
}

export function setApiHost(host) {
  apiHost = normalizeHost(host);
  return apiHost;
}

export function getApiHost() {
  return apiHost;
}

export function getApiBaseUrl() {
  return `${apiHost}/api`;
}

export function getSocketUrl() {
  return normalizeHost(apiHost);
}
