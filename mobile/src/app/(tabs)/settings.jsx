import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getTheme, COLORS } from '../../theme';
import ServerConfigModal from '../../components/common/ServerConfigModal';
import {
  getSoundEnabled,
  getSystemNotificationEnabled,
  setSoundEnabled,
  setSystemNotificationEnabled,
  loadNotificationSettings,
} from '../../utils/notificationHelper';

export default function SettingsScreen() {
  const { user, logout, apiHost } = useAuth();
  const { isDark, toggleTheme, theme: currentThemeSetting, setTheme } = useTheme();
  const theme = getTheme(isDark);

  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [systemNotifOn, setSystemNotifOn] = useState(true);

  useEffect(() => {
    loadNotificationSettings().then(({ soundEnabled, systemEnabled }) => {
      setSoundOn(soundEnabled);
      setSystemNotifOn(systemEnabled);
    });
  }, []);

  const handleToggleSound = async (val) => {
    setSoundOn(val);
    await setSoundEnabled(val);
  };

  const handleToggleSystemNotif = async (val) => {
    setSystemNotifOn(val);
    await setSystemNotificationEnabled(val);
  };

  const handleLogout = () => {
    Alert.alert(
      'Keluar dari Akun',
      'Apakah Anda yakin ingin keluar dari aplikasi WaChat AI?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluar',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Pengaturan</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Kelola preferensi aplikasi, server backend, dan akun Anda.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, { color: theme.text }]}>
                {user?.name || 'Pengguna WaChat'}
              </Text>
              <Text style={[styles.profileEmail, { color: theme.textMuted }]}>
                {user?.email || 'admin@wachat.ai'}
              </Text>
              <View style={styles.badgeWrap}>
                <Text style={styles.badgeText}>ADMIN / PEMILIK</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardHeader, { color: theme.textMuted }]}>SERVER BACKEND</Text>

          <View style={styles.serverRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.serverTitle, { color: theme.text }]}>Alamat URL API</Text>
              <Text style={[styles.serverSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
                {apiHost}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.changeServerBtn}
              onPress={() => setServerModalVisible(true)}
            >
              <Ionicons name="pencil" size={14} color={COLORS.primary} />
              <Text style={styles.changeServerText}>Ubah</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardHeader, { color: theme.textMuted }]}>TAMPILAN & TEMA</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons
                name={isDark ? 'moon' : 'sunny'}
                size={20}
                color={isDark ? '#818cf8' : '#f59e0b'}
              />
              <View>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Mode Gelap</Text>
                <Text style={[styles.settingDesc, { color: theme.textMuted }]}>
                  {isDark ? 'Tema gelap aktif' : 'Tema terang aktif'}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#767577', true: COLORS.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardHeader, { color: theme.textMuted }]}>NOTIFIKASI & AUDIO</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="volume-high-outline" size={20} color={COLORS.primary} />
              <View>
                <Text style={[styles.settingTitle, { color: theme.text }]}>
                  Suara Pesan Masuk
                </Text>
                <Text style={[styles.settingDesc, { color: theme.textMuted }]}>
                  Mainkan bunyi denting saat ada pesan baru
                </Text>
              </View>
            </View>
            <Switch
              value={soundOn}
              onValueChange={handleToggleSound}
              trackColor={{ false: '#767577', true: COLORS.primary }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={20} color={COLORS.emerald} />
              <View>
                <Text style={[styles.settingTitle, { color: theme.text }]}>
                  Notifikasi Sistem
                </Text>
                <Text style={[styles.settingDesc, { color: theme.textMuted }]}>
                  Tampilkan notifikasi di status bar ketika aplikasi di latar belakang
                </Text>
              </View>
            </View>
            <Switch
              value={systemNotifOn}
              onValueChange={handleToggleSystemNotif}
              trackColor={{ false: '#767577', true: COLORS.emerald }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.rose} />
          <Text style={styles.logoutText}>Keluar dari Akun</Text>
        </TouchableOpacity>
      </ScrollView>

      <ServerConfigModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  serverTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  serverSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  changeServerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  changeServerText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  logoutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    marginTop: 8,
  },
  logoutText: {
    color: COLORS.rose,
    fontSize: 14,
    fontWeight: '700',
  },
});
