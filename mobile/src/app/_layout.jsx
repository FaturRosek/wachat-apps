import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { SocketProvider, useSocket } from '../context/SocketContext';
import { getTheme, COLORS } from '../theme';
import IncomingCallModal from '../components/chat/IncomingCallModal';
import { playNotificationSound, showLocalNotification, requestNotificationPermission } from '../utils/notificationHelper';

function RootNavigationGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { onEvent, incomingCall, setIncomingCall } = useSocket();

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'login';

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  useEffect(() => {
    if (!user) return;

    const unsubMsg = onEvent('message_new', (payload) => {
      const message = payload?.message;
      const contact = payload?.contact;
      const isIncoming =
        message && !message.from_me && !message.fromMe && message.direction !== 'OUTGOING';

      if (isIncoming) {
        playNotificationSound();

        const senderTitle =
          contact?.name ||
          contact?.push_name ||
          message.sender_name ||
          (message.phone ? `+${message.phone}` : 'WhatsApp');
        const snippet =
          message.content ||
          (message.media_type === 'image'
            ? '📷 Foto'
            : message.media_type === 'video'
            ? '🎥 Video'
            : message.media_type === 'voice'
            ? '🎤 Pesan Suara'
            : '📄 Dokumen');

        showLocalNotification({
          title: senderTitle,
          body: snippet,
        });
      }
    });

    return () => {
      unsubMsg();
    };
  }, [user?.id, onEvent]);

  if (loading) {
    return (
      <View style={[styles.splash, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Slot />
      <IncomingCallModal call={incomingCall} onClose={() => setIncomingCall(null)} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <SocketProvider>
            <RootNavigationGuard />
          </SocketProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
