import axios from 'axios';
import Constants from 'expo-constants';
import { normalizeHost, getApiHost } from '../config/env';

export function getExpoInjectedHost() {
  const extraHost =
    Constants.expoConfig?.extra?.backendHost ||
    Constants.manifest2?.extra?.expoClient?.extra?.backendHost ||
    Constants.manifest?.extra?.backendHost;

  if (extraHost) {
    return normalizeHost(extraHost);
  }

  const detectedIp =
    Constants.expoConfig?.extra?.detectedIp ||
    Constants.manifest2?.extra?.expoClient?.extra?.detectedIp;

  if (detectedIp) {
    return `http://${detectedIp}:5000`;
  }

  const rawHost =
    Constants.expoConfig?.hostUri?.split(':')[0] ||
    Constants.manifest2?.extra?.expoClient?.hostUri?.split(':')[0] ||
    Constants.manifest?.debuggerHost?.split(':')[0];

  const isIPv4 = rawHost && /^(\d{1,3}\.){3}\d{1,3}$/.test(rawHost);
  if (isIPv4 && rawHost !== 'localhost' && rawHost !== '127.0.0.1') {
    return `http://${rawHost}:5000`;
  }

  return null;
}

export async function testHostHealth(hostUrl, timeoutMs = 1500) {
  if (!hostUrl) return false;
  const clean = normalizeHost(hostUrl);
  try {
    const res = await axios.get(`${clean}/api/health`, { timeout: timeoutMs });
    return res.status === 200 && (res.data?.success || res.data?.status === 'ok' || res.data?.message);
  } catch (err) {
    return false;
  }
}

export function generateCandidateHosts(baseHost) {
  const candidates = new Set();

  const injected = getExpoInjectedHost();
  if (injected) candidates.add(injected);

  if (baseHost) candidates.add(normalizeHost(baseHost));

  const current = getApiHost();
  if (current) candidates.add(normalizeHost(current));

  const ref = injected || baseHost || current || '';
  const match = ref.match(/http:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.)/);
  if (match) {
    const subnetPrefix = match[1];
    const octets = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 30, 50, 100];
    for (const oct of octets) {
      candidates.add(`http://${subnetPrefix}${oct}:5000`);
    }
  }

  return Array.from(candidates);
}

export async function discoverWorkingHost(preferredHost = null) {
  const injected = getExpoInjectedHost();
  const primaryCandidates = [
    preferredHost ? normalizeHost(preferredHost) : null,
    injected,
    getApiHost(),
  ].filter(Boolean);

  for (const candidate of primaryCandidates) {
    const ok = await testHostHealth(candidate, 1200);
    if (ok) {
      return candidate;
    }
  }

  const allCandidates = generateCandidateHosts(preferredHost || injected);
  const remaining = allCandidates.filter((h) => !primaryCandidates.includes(h));

  const chunkSize = 6;
  for (let i = 0; i < remaining.length; i += chunkSize) {
    const batch = remaining.slice(i, i + chunkSize);
    try {
      const winner = await Promise.any(
        batch.map(async (host) => {
          const ok = await testHostHealth(host, 1200);
          if (ok) return host;
          throw new Error('Unreachable');
        })
      );
      if (winner) return winner;
    } catch (e) {}
  }

  return injected || getApiHost() || 'http://localhost:5000';
}
