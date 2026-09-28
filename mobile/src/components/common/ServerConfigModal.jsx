import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getTheme, COLORS } from '../../theme';
import axios from 'axios';

export default function ServerConfigModal({ visible, onClose }) {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { apiHost, updateHost } = useAuth();

  const [inputHost, setInputHost] = useState(apiHost || 'http://10.0.2.2:5000');
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [testMessage, setTestMessage] = useState('');

  const handleTestConnection = async () => {
    const trimmed = inputHost.trim().replace(/\/+$/, '');
    if (!trimmed) {
      Alert.alert('Perhatian', 'Masukkan URL server backend terlebih dahulu.');
      return;
    }

    setTesting(true);
    setTestStatus(null);
    setTestMessage('');

    try {
      const res = await axios.get(`${trimmed}/api/health`, { timeout: 6000 });
      if (res.data?.status === 'ok' || res.status === 200) {
        setTestStatus('success');
        setTestMessage('Terhubung ke backend server!');
      } else {
        setTestStatus('error');
        setTestMessage('Server merespons tetapi status tidak sesuai.');
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage(
        err.code === 'ECONNABORTED'
          ? 'Koneksi timeout. Pastikan HP & PC berada dalam 1 jaringan Wi-Fi.'
          : err.message || 'Gagal terhubung ke server backend.'
      );
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const trimmed = inputHost.trim().replace(/\/+$/, '');
    if (!trimmed) {
      Alert.alert('Perhatian', 'URL server tidak boleh kosong.');
      return;
    }
    await updateHost(trimmed);
    Alert.alert('Tersimpan', `Alamat server berhasil diubah ke:\n${trimmed}`);
    onClose();
  };

  const setPreset = (presetUrl) => {
    setInputHost(presetUrl);
    setTestStatus(null);
    setTestMessage('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Ionicons name="server-outline" size={22} color={COLORS.primary} />
              <Text style={[styles.title, { color: theme.text }]}>Pengaturan Server API</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.description, { color: theme.textMuted }]}>
            Tentukan alamat backend server yang menjalankan WaChat AI.
          </Text>

          <Text style={[styles.presetLabel, { color: theme.textFaint }]}>PRESET CEPAT:</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[styles.presetBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              onPress={() => setPreset('http://10.0.2.2:5000')}
            >
              <Text style={[styles.presetBtnText, { color: theme.text }]}>Android Emulator</Text>
              <Text style={[styles.presetBtnSub, { color: theme.textFaint }]}>10.0.2.2:5000</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              onPress={() => setPreset('http://localhost:5000')}
            >
              <Text style={[styles.presetBtnText, { color: theme.text }]}>Localhost</Text>
              <Text style={[styles.presetBtnSub, { color: theme.textFaint }]}>localhost:5000</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>Alamat URL Backend</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surfaceMuted,
                  borderColor: theme.borderStrong,
                  color: theme.text,
                },
              ]}
              value={inputHost}
              onChangeText={(text) => {
                setInputHost(text);
                setTestStatus(null);
              }}
              placeholder="http://192.168.1.100:5000"
              placeholderTextColor={theme.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          {testStatus && (
            <View
              style={[
                styles.testBanner,
                {
                  backgroundColor: testStatus === 'success' ? '#ecfdf5' : '#fff1f2',
                  borderColor: testStatus === 'success' ? '#a7f3d0' : '#fecdd3',
                },
              ]}
            >
              <Ionicons
                name={testStatus === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={testStatus === 'success' ? COLORS.emerald : COLORS.rose}
              />
              <Text
                style={[
                  styles.testBannerText,
                  { color: testStatus === 'success' ? '#065f46' : '#9f1239' },
                ]}
              >
                {testMessage}
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.testBtn, { borderColor: theme.borderStrong }]}
              onPress={handleTestConnection}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="pulse-outline" size={16} color={COLORS.primary} />
                  <Text style={[styles.testBtnText, { color: COLORS.primary }]}>Tes Koneksi</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Simpan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  presetLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  presetBtnSub: {
    fontSize: 10,
    marginTop: 2,
  },
  inputContainer: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  testBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
    gap: 8,
  },
  testBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
