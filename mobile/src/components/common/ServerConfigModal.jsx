import React, { useState, useEffect } from 'react';
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
import { getExpoInjectedHost, discoverWorkingHost } from '../../utils/hostDiscovery';

export default function ServerConfigModal({ visible, onClose }) {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { apiHost, updateHost } = useAuth();

  const detectedUrl = getExpoInjectedHost();
  const detectedIp = detectedUrl ? detectedUrl.replace('http://', '').split(':')[0] : null;

  const [inputHost, setInputHost] = useState(apiHost || detectedUrl || 'http://localhost:5000');
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (visible) {
      if (apiHost) {
        setInputHost(apiHost);
      } else {
        setInputHost(detectedUrl);
      }
      setTestStatus(null);
      setTestMessage('');
    }
  }, [visible, apiHost, detectedUrl]);

  const handleTestConnection = async (targetHost = null) => {
    const trimmed = (targetHost || inputHost).trim().replace(/\/+$/, '');
    if (!trimmed) {
      Alert.alert('Perhatian', 'Masukkan URL server backend terlebih dahulu.');
      return;
    }

    setTesting(true);
    setTestStatus(null);
    setTestMessage('');

    try {
      const res = await axios.get(`${trimmed}/api/health`, { timeout: 4000 });
      if (res.data?.success || res.data?.status === 'ok' || res.status === 200) {
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
          ? 'Koneksi timeout. Pastikan HP & laptop berada dalam 1 jaringan Wi-Fi.'
          : err.message || 'Gagal terhubung ke server backend.'
      );
    } finally {
      setTesting(false);
    }
  };

  const handleAutoScan = async () => {
    setScanning(true);
    setTestStatus(null);
    setTestMessage('Sedang mencari server backend di jaringan Wi-Fi...');

    try {
      const found = await discoverWorkingHost(inputHost);
      if (found) {
        setInputHost(found);
        setTestStatus('success');
        setTestMessage(`Ditemukan server backend aktif di:\n${found}`);
      } else {
        setTestStatus('error');
        setTestMessage('Tidak menemukan server aktif. Pastikan backend "npm run dev" sedang berjalan di laptop.');
      }
    } catch (e) {
      setTestStatus('error');
      setTestMessage('Pemindaian gagal. Periksa koneksi Wi-Fi Anda.');
    } finally {
      setScanning(false);
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
            Sistem otomatis mendeteksi IP laptop di jaringan Wi-Fi lokal.
          </Text>

          <Text style={[styles.presetLabel, { color: theme.textFaint }]}>PRESET CEPAT:</Text>
          <View style={styles.presetRow}>
            {detectedUrl ? (
              <TouchableOpacity
                style={[styles.presetBtn, { backgroundColor: theme.surfaceAlt, borderColor: COLORS.primary }]}
                onPress={() => setPreset(detectedUrl)}
              >
                <Text style={[styles.presetBtnText, { color: COLORS.primary, fontWeight: '700' }]}>Wi-Fi PC / HP</Text>
                <Text style={[styles.presetBtnSub, { color: theme.textMuted }]}>{detectedIp}:5000</Text>
              </TouchableOpacity>
            ) : null}

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
            <View style={styles.inputLabelRow}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Alamat URL Backend</Text>
              <TouchableOpacity
                style={styles.autoScanBadge}
                onPress={handleAutoScan}
                disabled={scanning}
              >
                {scanning ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ transform: [{ scale: 0.75 }] }} />
                ) : (
                  <>
                    <Ionicons name="scan-outline" size={13} color={COLORS.primary} />
                    <Text style={styles.autoScanBadgeText}>Auto-Scan IP</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
              placeholder="http://192.168.1.x:5000"
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
              onPress={() => handleTestConnection()}
              disabled={testing || scanning}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 11.5,
    marginBottom: 2,
  },
  presetBtnSub: {
    fontSize: 10,
  },
  inputContainer: {
    marginBottom: 14,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  autoScanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  autoScanBadgeText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  testBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  testBannerText: {
    fontSize: 12.5,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  testBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  testBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
