import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { getTheme, COLORS } from '../../theme';
import apiClient from '../../api/apiClient';

export default function TabsLayout() {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { onEvent } = useSocket();

  const [unreadCount, setUnreadCount] = useState(0);
  const [waConnected, setWaConnected] = useState(false);

  const fetchStatusAndUnread = async () => {
    try {
      const statusRes = await apiClient.get('/whatsapp/status');
      const isConn = statusRes.data?.data?.status === 'CONNECTED';
      setWaConnected(isConn);

      if (isConn) {
        const chatsRes = await apiClient.get('/chats?filter=unread');
        if (chatsRes.data?.success && Array.isArray(chatsRes.data.data)) {
          const sum = chatsRes.data.data.reduce((acc, c) => acc + (c.unread_count || 1), 0);
          setUnreadCount(sum);
        }
      } else {
        setUnreadCount(0);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchStatusAndUnread();

    const unsubWaStatus = onEvent('wa_status', (data) => {
      if (data?.status === 'CONNECTED') {
        setWaConnected(true);
        fetchStatusAndUnread();
      } else if (data?.status === 'DISCONNECTED') {
        setWaConnected(false);
        setUnreadCount(0);
      }
    });

    const unsubChats = onEvent('chats_updated', () => {
      fetchStatusAndUnread();
    });

    const unsubMsg = onEvent('message_new', () => {
      fetchStatusAndUnread();
    });

    const interval = setInterval(fetchStatusAndUnread, 25000);

    return () => {
      clearInterval(interval);
      unsubWaStatus();
      unsubChats();
      unsubMsg();
    };
  }, [onEvent]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: COLORS.emerald,
            color: '#ffffff',
            fontSize: 10,
            fontWeight: '700',
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="composer"
        options={{
          title: 'Broadcast',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'paper-plane' : 'paper-plane-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="whatsapp"
        options={{
          title: 'Perangkat',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons
                name={focused ? 'logo-whatsapp' : 'logo-whatsapp'}
                size={23}
                color={waConnected ? COLORS.emerald : color}
              />
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: waConnected ? COLORS.emerald : COLORS.rose },
                ]}
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Akun',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  statusDot: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
});
