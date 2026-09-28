const DEFAULT_API_HOST = 'http://10.0.2.2:5000';

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
