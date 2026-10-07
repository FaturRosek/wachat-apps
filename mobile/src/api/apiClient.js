import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getApiHost, setApiHost, STORAGE_KEYS } from '../config/env';
import { discoverWorkingHost } from '../utils/hostDiscovery';

let authToken = null;
let isDiscoveringHost = false;

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
    if (config.headers && typeof config.headers.set === 'function') {
      config.headers.set('Content-Type', 'multipart/form-data');
    } else if (config.headers) {
      config.headers['Content-Type'] = 'multipart/form-data';
    }
  }

  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isNetworkErr =
      !error.response &&
      (error.code === 'ERR_NETWORK' ||
        error.message === 'Network Error' ||
        error.code === 'ECONNABORTED' ||
        error.message?.includes('Network request failed'));

    if (isNetworkErr && error.config && !error.config._retryHostDiscovery && !isDiscoveringHost) {
      isDiscoveringHost = true;
      try {
        const workingHost = await discoverWorkingHost();
        if (workingHost && workingHost !== getApiHost()) {
          setApiHost(workingHost);
          await AsyncStorage.setItem(STORAGE_KEYS.apiHost, workingHost);
          error.config._retryHostDiscovery = true;
          error.config.baseURL = getApiBaseUrl();
          isDiscoveringHost = false;
          return apiClient(error.config);
        }
      } catch (discErr) {
      } finally {
        isDiscoveringHost = false;
      }
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(err, fallback = 'Terjadi kesalahan') {
  return (
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}

export default apiClient;
