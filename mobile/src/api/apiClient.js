import axios from 'axios';
import { getApiBaseUrl } from '../config/env';

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

export function getAuthToken() {
  return authToken;
}

const apiClient = axios.create({
  timeout: 30000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();

  if (config.data instanceof FormData) {
    if (config.headers && typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type');
    } else if (config.headers) {
      delete config.headers['Content-Type'];
    }
  }

  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }

  return config;
});

export function getErrorMessage(err, fallback = 'Terjadi kesalahan') {
  return (
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}

export default apiClient;
