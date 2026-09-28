import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { getTheme, COLORS } from '../../theme';
import apiClient from '../../api/apiClient';
import { formatDisplayPhone } from '../../utils/phoneFormatter';

export default function WhatsAppConnectionScreen() {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { onEvent } = useSocket();

  const [waStatus, setWaStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('code');
  const [phoneInput, setPhoneInput] = useState('');
  const [copied, setCopied] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState(
    'Halo! Ini pesan uji coba dari WaChat AI. Koneksi WhatsApp berhasil terhubung! 🚀'
  );
  const [sendingTest, setSendingTest] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await apiClient.get('/whatsapp/status');
      if (res.data?.success && res.data.data) {
        setWaStatus(res.data.data);
      }
    } catch (e) {
      setWaStatus({ status: 'DISCONNECTED' });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    const unsub = onEvent('wa_status', (data) => {
      if (data) setWaStatus((prev) => ({ ...(prev || {}), ...data }));
    });

    const interval = setInterval(fetchStatus, 8000);
    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [onEvent]);

  const isConnected = waStatus?.status === 'CONNECTED';
  const isPairing = waStatus?.status === 'PAIRING_CODE' && !!waStatus?.pairingCode;
  const isQr = waStatus?.status === 'SCAN_QR' && !!waStatus?.qrCode;
  const isConnecting =
    waStatus?.status === 'CONNECTING' || waStatus?.status === 'RECONNECTING';

  const handleRequestPairCode = async () => {
    if (!phoneInput.trim()) {
      Alert.alert('Perhatian', 'Masukkan nomor WhatsApp terlebih dahulu.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiClient.post('/whatsapp/pair-code', {
        phoneNumber: phoneInput.trim(),
      });
      await fetchStatus();
      if (res.data?.data?.pairingCode) {
        Alert.alert('Kode Diterima', 'Kode pairing WhatsApp berhasil dibuat!');
      }
    } catch (err) {
      Alert.alert('Gagal', err.response?.data?.message || 'Gagal meminta kode pairing WhatsApp.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartQrSession = async () => {
    setActionLoading(true);
    try {
      await apiClient.post('/whatsapp/connect', {
        forceRestart: true,
        method: 'qr',
      });
      await fetchStatus();
    } catch (err) {
      Alert.alert('Gagal', err.response?.data?.message || 'Gagal memulai QR code session.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Putuskan Sesi WhatsApp',
      'Apakah Anda yakin ingin memutuskan (disconnect) koneksi WhatsApp?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Putuskan',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await apiClient.post('/whatsapp/disconnect');
              await fetchStatus();
              Alert.alert('Terputus', 'Koneksi WhatsApp telah diputuskan.');
            } catch (err) {
              Alert.alert('Gagal', err.response?.data?.message || 'Gagal disconnect');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCopyCode = async () => {
    const rawCode = waStatus?.pairingCode?.replace(/[^a-zA-Z0-9]/g, '') || '';
    if (!rawCode) return;
    await Clipboard.setStringAsync(rawCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      Alert.alert('Perhatian', 'Masukkan nomor tujuan uji coba.');
      return;
    }

    setSendingTest(true);
    try {
      const res = await apiClient.post('/whatsapp/send-test', {
        toPhone: testPhone.trim(),
        messageText: testMsg.trim(),
      });
      Alert.alert('Sukses', res.data?.message || 'Pesan uji coba berhasil dikirim!');
    } catch (err) {
      Alert.alert('Gagal', err.response?.data?.message || 'Gagal mengirim pesan uji coba.');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Koneksi WhatsApp</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Hubungkan nomor WhatsApp untuk AI Assistant & Pengiriman Pesan.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.statusHeaderRow}>
            <View style={styles.statusBadgeWrap}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: isConnected
                      ? COLORS.emerald
                      : isConnecting
                      ? COLORS.amber
                      : COLORS.rose,
                  },
                ]}
              />
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: isConnected
                      ? COLORS.emerald
                      : isConnecting
                      ? COLORS.amber
                      : COLORS.rose,
                  },
                ]}
              >
                {isConnected
                  ? 'TERHUBUNG'
                  : isConnecting
                  ? 'MENGHUBUNGKAN...'
                  : isPairing
                  ? 'MENUNGGU KODE PAIRING'
                  : isQr
                  ? 'SIAP SCAN QR'
                  : 'TERPUTUS'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: theme.surfaceAlt }]}
              onPress={fetchStatus}
              disabled={loadingStatus}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={theme.text}
                style={loadingStatus ? { transform: [{ rotate: '45deg' }] } : null}
              />
            </TouchableOpacity>
          </View>

          {isConnected ? (
            <View style={styles.connectedInfo}>
              <View style={styles.phoneBadge}>
                <Ionicons name="logo-whatsapp" size={24} color={COLORS.emerald} />
                <View>
                  <Text style={[styles.connectedNumber, { color: theme.text }]}>
                    {formatDisplayPhone(waStatus?.phoneNumber) || 'WhatsApp Terhubung'}
                  </Text>
                  {waStatus?.pushName && (
                    <Text style={[styles.connectedName, { color: theme.textMuted }]}>
                      Profil: {waStatus.pushName}
                    </Text>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.disconnectBtn, actionLoading && { opacity: 0.7 }]}
                onPress={handleDisconnect}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="power-outline" size={16} color="#ffffff" />
                    <Text style={styles.disconnectBtnText}>Putuskan Koneksi</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.connectModes}>
              <View style={[styles.modeTabs, { backgroundColor: theme.surfaceAlt }]}>
                <TouchableOpacity
                  style={[
                    styles.modeTabBtn,
                    activeTab === 'code' && [styles.modeTabBtnActive, { backgroundColor: theme.surface }],
                  ]}
                  onPress={() => setActiveTab('code')}
                >
                  <Ionicons
                    name="keypad-outline"
                    size={16}
                    color={activeTab === 'code' ? COLORS.primary : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      { color: activeTab === 'code' ? COLORS.primary : theme.textMuted },
                    ]}
                  >
                    Kode Pairing (Mudah)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modeTabBtn,
                    activeTab === 'qr' && [styles.modeTabBtnActive, { backgroundColor: theme.surface }],
                  ]}
                  onPress={() => setActiveTab('qr')}
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={16}
                    color={activeTab === 'qr' ? COLORS.primary : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      { color: activeTab === 'qr' ? COLORS.primary : theme.textMuted },
                    ]}
                  >
                    Scan QR
                  </Text>
                </TouchableOpacity>
              </View>

              {activeTab === 'code' ? (
                <View style={styles.codeSection}>
                  {isPairing ? (
                    <View style={styles.pairingCodeBox}>
                      <Text style={[styles.pairingCodeTitle, { color: theme.textMuted }]}>
                        KODE PAIRING WHATSAPP:
                      </Text>
                      <Text style={[styles.codeDigits, { color: COLORS.primary }]}>
                        {waStatus?.pairingCode}
                      </Text>

                      <TouchableOpacity style={styles.copyBtn} onPress={handleCopyCode}>
                        <Ionicons
                          name={copied ? 'checkmark' : 'copy-outline'}
                          size={16}
                          color="#ffffff"
                        />
                        <Text style={styles.copyBtnText}>
                          {copied ? 'Tersalin ke Papan Klip!' : 'Salin 8 Digit Kode'}
                        </Text>
                      </TouchableOpacity>

                      <View
                        style={[
                          styles.instructionsCard,
                          { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                        ]}
                      >
                        <Text style={[styles.instructionStep, { color: theme.text }]}>
                          1. Buka aplikasi WhatsApp di HP Anda.
                        </Text>
                        <Text style={[styles.instructionStep, { color: theme.text }]}>
                          2. Ketuk Titik Tiga (⋮) &gt; Perangkat Tertaut.
                        </Text>
                        <Text style={[styles.instructionStep, { color: theme.text }]}>
                          3. Pilih "Tautkan Perangkat" &gt; "Tautkan dengan nomor telepon".
                        </Text>
                        <Text style={[styles.instructionStep, { color: theme.text }]}>
                          4. Masukkan kode 8 digit di atas.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.codeForm}>
                      <Text style={[styles.inputLabel, { color: theme.text }]}>
                        Masukkan Nomor WhatsApp Anda:
                      </Text>
                      <View
                        style={[
                          styles.inputWrap,
                          { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                        ]}
                      >
                        <Ionicons name="call-outline" size={18} color={theme.textFaint} />
                        <TextInput
                          style={[styles.input, { color: theme.text }]}
                          placeholder="628123456789 atau 08123456789"
                          placeholderTextColor={theme.textFaint}
                          value={phoneInput}
                          onChangeText={setPhoneInput}
                          keyboardType="phone-pad"
                        />
                      </View>

                      <TouchableOpacity
                        style={[styles.requestBtn, actionLoading && { opacity: 0.7 }]}
                        onPress={handleRequestPairCode}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <>
                            <Ionicons name="key-outline" size={18} color="#ffffff" />
                            <Text style={styles.requestBtnText}>Minta Kode Pairing</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.qrSection}>
                  {isQr ? (
                    <View style={styles.qrBox}>
                      <Image source={{ uri: waStatus.qrCode }} style={styles.qrImage} />
                      <Text style={[styles.qrHint, { color: theme.textMuted }]}>
                        Scan QR code ini melalui menu Perangkat Tertaut di aplikasi WhatsApp ponsel Anda.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.qrStartWrap}>
                      <Ionicons name="qr-code-outline" size={60} color={theme.textFaint} />
                      <Text style={[styles.qrStartDesc, { color: theme.textMuted }]}>
                        Mulai sesi scan QR Code untuk menghubungkan WhatsApp.
                      </Text>
                      <TouchableOpacity
                        style={[styles.requestBtn, actionLoading && { opacity: 0.7 }]}
                        onPress={handleStartQrSession}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.requestBtnText}>Mulai Sesi QR</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        {isConnected && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Uji Coba Pengiriman Pesan</Text>
            <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>
              Pastikan WhatsApp Bot berfungsi normal dengan mengirimkan pesan tes.
            </Text>

            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Nomor Tujuan</Text>
              <View
                style={[
                  styles.inputWrap,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                ]}
              >
                <Ionicons name="call-outline" size={18} color={theme.textFaint} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="628123456789"
                  placeholderTextColor={theme.textFaint}
                  value={testPhone}
                  onChangeText={setTestPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Isi Pesan Uji Coba</Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.borderStrong,
                    color: theme.text,
                  },
                ]}
                multiline
                numberOfLines={3}
                value={testMsg}
                onChangeText={setTestMsg}
              />
            </View>

            <TouchableOpacity
              style={[styles.testSendBtn, sendingTest && { opacity: 0.7 }]}
              onPress={handleSendTest}
              disabled={sendingTest}
            >
              {sendingTest ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#ffffff" />
                  <Text style={styles.testSendBtnText}>Kirim Pesan Uji Coba</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    padding: 18,
    borderWidth: 1,
    gap: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectedInfo: {
    gap: 16,
    paddingTop: 8,
  },
  phoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectedNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  connectedName: {
    fontSize: 12,
    marginTop: 2,
  },
  disconnectBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.rose,
    paddingVertical: 10,
    borderRadius: 10,
  },
  disconnectBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  connectModes: {
    gap: 14,
    paddingTop: 4,
  },
  modeTabs: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  modeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  modeTabBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  codeSection: {
    gap: 12,
  },
  codeForm: {
    gap: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  requestBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  requestBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  pairingCodeBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  pairingCodeTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  codeDigits: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  copyBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  instructionsCard: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    marginTop: 8,
  },
  instructionStep: {
    fontSize: 12,
    lineHeight: 18,
  },
  qrSection: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  qrBox: {
    alignItems: 'center',
    gap: 12,
  },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
  },
  qrHint: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 16,
  },
  qrStartWrap: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  qrStartDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 18,
  },
  formGroup: {
    gap: 6,
  },
  textArea: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  testSendBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.emerald,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 4,
  },
  testSendBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
