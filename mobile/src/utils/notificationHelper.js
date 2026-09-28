import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { STORAGE_KEYS } from '../config/env';

const NOTIFICATION_SOUND = require('../../assets/notification.wav');

const isExpoGo =
  Constants?.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants?.appOwnership === 'expo';

let Notifications = null;

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {}
}

let cachedSoundEnabled = true;
let cachedSystemEnabled = true;

export function getSoundEnabled() {
  return cachedSoundEnabled;
}

export function getSystemNotificationEnabled() {
  return cachedSystemEnabled;
}

export async function loadNotificationSettings() {
  try {
    const sound = await AsyncStorage.getItem(STORAGE_KEYS.soundEnabled);
    if (sound !== null) cachedSoundEnabled = sound !== 'false';
    const system = await AsyncStorage.getItem(STORAGE_KEYS.desktopEnabled);
    if (system !== null) cachedSystemEnabled = system !== 'false';
  } catch (e) {}
  return {
    soundEnabled: cachedSoundEnabled,
    systemEnabled: cachedSystemEnabled,
  };
}

export async function setSoundEnabled(enabled) {
  cachedSoundEnabled = !!enabled;
  await AsyncStorage.setItem(STORAGE_KEYS.soundEnabled, String(!!enabled));
  return cachedSoundEnabled;
}

export async function setSystemNotificationEnabled(enabled) {
  cachedSystemEnabled = !!enabled;
  await AsyncStorage.setItem(STORAGE_KEYS.desktopEnabled, String(!!enabled));
  return cachedSystemEnabled;
}

export async function playNotificationSound() {
  if (!cachedSoundEnabled) return;
  try {
    const { createAudioPlayer } = await import('expo-audio');
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    }).catch(() => {});
    const player = createAudioPlayer(NOTIFICATION_SOUND);
    player.volume = 1;
    player.play();
    setTimeout(() => {
      try {
        player.release?.();
      } catch (e) {}
    }, 1200);
  } catch (e) {}
}

export async function requestNotificationPermission() {
  if (!Notifications) return 'denied';
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Pesan Masuk',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#2563eb',
      });
    } catch (e) {}
  }
  try {
    const settings = await Notifications.requestPermissionsAsync({
      android: {},
    });
    return settings.granted ? 'granted' : 'denied';
  } catch (e) {
    return 'denied';
  }
}

export async function getNotificationPermission() {
  if (!Notifications) return 'denied';
  try {
    const settings = await Notifications.getPermissionsAsync();
    return settings.granted ? 'granted' : 'denied';
  } catch (e) {
    return 'denied';
  }
}

export async function showLocalNotification({ title, body }) {
  if (!cachedSystemEnabled || !Notifications) return false;
  try {
    const perm = await getNotificationPermission();
    if (perm !== 'granted') return false;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || 'Pesan Baru WhatsApp',
        body: body || 'Anda menerima pesan baru.',
        data: { local: true },
      },
      trigger: null,
    });
    return true;
  } catch (e) {
    return false;
  }
}
