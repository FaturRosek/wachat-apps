import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getTheme, COLORS } from '../theme';
import ServerConfigModal from '../components/common/ServerConfigModal';
import { getErrorMessage } from '../api/apiClient';

export default function LoginScreen() {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { login, register, apiHost } = useAuth();

  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [serverModalVisible, setServerModalVisible] = useState(false);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Email dan password wajib diisi.');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      setErrorMsg('Nama lengkap wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password);
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err, 'Gagal masuk. Periksa email, password, dan koneksi server.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <TouchableOpacity
              style={[styles.serverPill, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              onPress={() => setServerModalVisible(true)}
            >
              <Ionicons name="server" size={14} color={COLORS.primary} />
              <Text style={[styles.serverPillText, { color: theme.textMuted }]} numberOfLines={1}>
                {apiHost.replace('http://', '').replace('https://', '')}
              </Text>
              <Ionicons name="pencil" size={12} color={theme.textFaint} />
            </TouchableOpacity>
          </View>

          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Ionicons name="chatbubbles" size={38} color="#ffffff" />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>WaChat AI</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              Personal WhatsApp AI Assistant & Smart Messaging
            </Text>
          </View>

          <View style={[styles.tabBar, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.tab,
                mode === 'login' && [styles.activeTab, { backgroundColor: theme.surface }],
              ]}
              onPress={() => {
                setMode('login');
                setErrorMsg('');
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: mode === 'login' ? COLORS.primary : theme.textMuted },
                  mode === 'login' && styles.activeTabText,
                ]}
              >
                Masuk
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tab,
                mode === 'register' && [styles.activeTab, { backgroundColor: theme.surface }],
              ]}
              onPress={() => {
                setMode('register');
                setErrorMsg('');
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: mode === 'register' ? COLORS.primary : theme.textMuted },
                  mode === 'register' && styles.activeTabText,
                ]}
              >
                Daftar
              </Text>
            </TouchableOpacity>
          </View>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color="#ef4444" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {mode === 'register' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Nama Lengkap</Text>
                <View
                  style={[
                    styles.inputWrap,
                    { backgroundColor: theme.surface, borderColor: theme.borderStrong },
                  ]}
                >
                  <Ionicons name="person-outline" size={18} color={theme.textFaint} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Contoh: Budi Santoso"
                    placeholderTextColor={theme.textFaint}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Alamat Email</Text>
              <View
                style={[
                  styles.inputWrap,
                  { backgroundColor: theme.surface, borderColor: theme.borderStrong },
                ]}
              >
                <Ionicons name="mail-outline" size={18} color={theme.textFaint} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="admin@wachat.ai"
                  placeholderTextColor={theme.textFaint}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Kata Sandi</Text>
              <View
                style={[
                  styles.inputWrap,
                  { backgroundColor: theme.surface, borderColor: theme.borderStrong },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={18} color={theme.textFaint} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textFaint}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {mode === 'login' ? 'Masuk ke Akun' : 'Daftar Sekarang'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  topBar: {
    alignItems: 'flex-end',
    marginBottom: 20,
    marginTop: 8,
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 220,
  },
  serverPillText: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 13,
    lineHeight: 18,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
