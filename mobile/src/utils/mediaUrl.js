import { getApiHost } from '../config/env';

export function getMediaUrl(url) {
  if (!url) return '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('file://') ||
    url.startsWith('data:') ||
    url.startsWith('content://')
  ) {
    return url;
  }

  const host = getApiHost();
  if (!host) return url;

  return `${host}${url.startsWith('/') ? '' : '/'}${url}`;
}
