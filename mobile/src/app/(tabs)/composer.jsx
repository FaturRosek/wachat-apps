import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../context/ThemeContext';
import { getTheme, COLORS } from '../../theme';
import apiClient from '../../api/apiClient';
import { formatPhoneNumber } from '../../utils/phoneFormatter';

const AI_TONE_OPTIONS = [
  { id: 'persuasive', label: 'Promosi / Penjualan', icon: '🎯' },
  { id: 'friendly', label: 'Ramah & Santai', icon: '✨' },
  { id: 'formal', label: 'Formal & Sopan', icon: '👔' },
  { id: 'short', label: 'Singkat & Padat', icon: '⚡' },
  { id: 'reminder', label: 'Pengingat / Tagihan', icon: '⏰' },
  { id: 'romantic', label: 'Manis & Perhatian', icon: '💖' },
  { id: 'apology', label: 'Permohonan Maaf', icon: '🙏' },
];

export default function MessageComposerScreen() {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  const [recipientType, setRecipientType] = useState('personal');
  const [phone, setPhone] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [message, setMessage] = useState('');
  const [selectedTone, setSelectedTone] = useState('persuasive');
  const [variations, setVariations] = useState([]);
  const [variationCount, setVariationCount] = useState(3);
  const [activeVarIdx, setActiveVarIdx] = useState(0);
  const [generatingAi, setGeneratingAi] = useState(false);

  const [repeatCount, setRepeatCount] = useState('1');
  const [intervalSeconds, setIntervalSeconds] = useState('5');
  const [useAiVariation, setUseAiVariation] = useState(false);

  const [sending, setSending] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  const fetchGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await apiClient.get('/whatsapp/groups');
      const list = res.data?.data?.groups || [];
      setGroups(list);
      if (list.length > 0 && !selectedGroup) {
        setSelectedGroup(list[0].id || list[0].jid);
      }
    } catch (e) {
      console.warn('Gagal memuat grup:', e.message);
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (recipientType === 'group') {
      fetchGroups();
    }
  }, [recipientType]);

  const handleGenerateAiVariations = async () => {
    if (!message.trim()) {
      Alert.alert('Perhatian', 'Ketik draf pesan awal terlebih dahulu.');
      return;
    }

    setGeneratingAi(true);
    setErrorBanner('');
    try {
      const res = await apiClient.post('/chats/ai/variations', {
        message: message.trim(),
        tone: selectedTone,
        count: variationCount,
      });

      const list = res.data?.data?.variations || [];
      if (Array.isArray(list) && list.length > 0) {
        setVariations(list);
        setActiveVarIdx(0);
      } else {
        Alert.alert('Info', 'Tidak ada variasi yang dihasilkan.');
      }
    } catch (err) {
      Alert.alert('Gagal', err.response?.data?.message || 'Gagal menghasilkan variasi pesan AI.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const currentActiveText =
    variations.length > 0 ? variations[activeVarIdx] : message;

  const handleSend = async () => {
    setSuccessBanner('');
    setErrorBanner('');

    let target = '';
    if (recipientType === 'group') {
      if (!selectedGroup) {
        setErrorBanner('Pilih grup tujuan terlebih dahulu.');
        return;
      }
      target = selectedGroup;
    } else {
      const validation = formatPhoneNumber(phone);
      if (!validation.isValid) {
        setErrorBanner(validation.error || 'Nomor WhatsApp tujuan tidak valid.');
        return;
      }
      target = validation.formattedPhone;
    }

    const payloadMessage = currentActiveText.trim();
    if (!payloadMessage) {
      setErrorBanner('Isi pesan tidak boleh kosong.');
      return;
    }

    const repeats = Math.max(1, parseInt(repeatCount, 10) || 1);
    const intervals = Math.max(1, parseInt(intervalSeconds, 10) || 5);

    setSending(true);
    try {
      const res = await apiClient.post('/messages', {
        phone: target,
        message: payloadMessage,
        messages: variations.length > 1 ? variations : undefined,
        repeatCount: repeats,
        intervalSeconds: intervals,
        useAiVariation: variations.length > 1 ? false : useAiVariation,
      });

      setSuccessBanner(res.data?.message || 'Pesan berhasil dijadwalkan / dikirim!');
    } catch (err) {
      setErrorBanner(
        err.response?.data?.message || err.message || 'Gagal mengirim pesan WhatsApp.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Pengirim Pesan</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Kirim pesan terarah, pengulangan terkontrol, dan variasi pesan cerdas dengan AI.
          </Text>
        </View>

        {successBanner ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={styles.successText}>{successBanner}</Text>
          </View>
        ) : null}

        {errorBanner ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#ef4444" />
            <Text style={styles.errorText}>{errorBanner}</Text>
          </View>
        ) : null}

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Tujuan Pengiriman</Text>
          <View style={[styles.typeSegment, { backgroundColor: theme.surfaceAlt }]}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                recipientType === 'personal' && [styles.segmentBtnActive, { backgroundColor: theme.surface }],
              ]}
              onPress={() => setRecipientType('personal')}
            >
              <Ionicons
                name="person"
                size={16}
                color={recipientType === 'personal' ? COLORS.primary : theme.textMuted}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: recipientType === 'personal' ? COLORS.primary : theme.textMuted },
                ]}
              >
                Nomor Pribadi
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentBtn,
                recipientType === 'group' && [styles.segmentBtnActive, { backgroundColor: theme.surface }],
              ]}
              onPress={() => setRecipientType('group')}
            >
              <Ionicons
                name="people"
                size={16}
                color={recipientType === 'group' ? COLORS.primary : theme.textMuted}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: recipientType === 'group' ? COLORS.primary : theme.textMuted },
                ]}
              >
                Grup WhatsApp
              </Text>
            </TouchableOpacity>
          </View>

          {recipientType === 'personal' ? (
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Nomor WhatsApp Tujuan</Text>
              <View
                style={[
                  styles.textInputContainer,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                ]}
              >
                <Ionicons name="call-outline" size={18} color={theme.textFaint} />
                <TextInput
                  style={[styles.textInput, { color: theme.text }]}
                  placeholder="08123456789 atau 628123456789"
                  placeholderTextColor={theme.textFaint}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          ) : (
            <View style={styles.inputWrap}>
              <View style={styles.rowBetween}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>Pilih Grup WhatsApp</Text>
                <TouchableOpacity onPress={fetchGroups} disabled={loadingGroups}>
                  <Text style={[styles.refreshText, { color: COLORS.primary }]}>
                    {loadingGroups ? 'Memuat...' : 'Refresh Grup'}
                  </Text>
                </TouchableOpacity>
              </View>

              {groups.length === 0 ? (
                <Text style={[styles.emptyGroupText, { color: theme.textMuted }]}>
                  {loadingGroups ? 'Memuat daftar grup...' : 'Tidak ada grup ditemukan atau WhatsApp belum terhubung.'}
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupScroll}>
                  {groups.map((g) => {
                    const id = g.id || g.jid;
                    const selected = selectedGroup === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[
                          styles.groupPill,
                          selected
                            ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                            : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                        ]}
                        onPress={() => setSelectedGroup(id)}
                      >
                        <Ionicons
                          name="people-outline"
                          size={14}
                          color={selected ? '#ffffff' : theme.textMuted}
                        />
                        <Text
                          style={[
                            styles.groupPillText,
                            { color: selected ? '#ffffff' : theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {g.name || g.subject || 'Grup'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Isi Pesan & Bantuan AI</Text>

          <Text style={[styles.inputLabel, { color: theme.text }]}>Gaya Bahasa / Nada Pesan:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toneScroll}>
            {AI_TONE_OPTIONS.map((t) => {
              const selected = selectedTone === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.tonePill,
                    selected
                      ? { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo }
                      : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                  ]}
                  onPress={() => setSelectedTone(t.id)}
                >
                  <Text style={styles.toneIcon}>{t.icon}</Text>
                  <Text
                    style={[
                      styles.toneText,
                      { color: selected ? '#ffffff' : theme.text },
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.inputWrap}>
            <View style={styles.rowBetween}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>
                {variations.length > 0
                  ? `Variasi ${activeVarIdx + 1} dari ${variations.length}`
                  : 'Draf Pesan Anda'}
              </Text>
              {variations.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setVariations([]);
                    setActiveVarIdx(0);
                  }}
                >
                  <Text style={{ fontSize: 12, color: COLORS.rose }}>Reset ke Asli</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={[
                styles.messageArea,
                {
                  backgroundColor: theme.surfaceMuted,
                  borderColor: theme.borderStrong,
                  color: theme.text,
                },
              ]}
              multiline
              numberOfLines={4}
              placeholder="Ketik draf pesan yang ingin dikirim..."
              placeholderTextColor={theme.textFaint}
              value={currentActiveText}
              onChangeText={(text) => {
                if (variations.length > 0) {
                  const updated = [...variations];
                  updated[activeVarIdx] = text;
                  setVariations(updated);
                } else {
                  setMessage(text);
                }
              }}
            />
          </View>

          <Text style={[styles.inputLabel, { color: theme.text, marginTop: 8 }]}>
            Jumlah Variasi yang Diinginkan:
          </Text>
          <View style={styles.countSelectorRow}>
            {[2, 3, 5, 8, 10].map((cnt) => {
              const selected = variationCount === cnt;
              return (
                <TouchableOpacity
                  key={cnt}
                  style={[
                    styles.countPill,
                    selected
                      ? { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo }
                      : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                  ]}
                  onPress={() => setVariationCount(cnt)}
                >
                  <Text
                    style={[
                      styles.countPillText,
                      { color: selected ? '#ffffff' : theme.text },
                    ]}
                  >
                    {cnt} Variasi
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.aiGenerateBtn, generatingAi && { opacity: 0.7 }]}
            onPress={handleGenerateAiVariations}
            disabled={generatingAi}
          >
            {generatingAi ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#ffffff" />
                <Text style={styles.aiGenerateBtnText}>
                  {`Buat ${variationCount} Variasi Pesan dengan AI`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {variations.length > 0 && (
            <View
              style={[
                styles.variationsPreviewContainer,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={styles.varHeaderBadge}>
                  <Ionicons name="sparkles" size={16} color={COLORS.indigo} />
                  <Text style={[styles.varPreviewHeading, { color: theme.text }]}>
                    {`Pratinjau Hasil Variasi AI (${variations.length} Opsi)`}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setVariations([]);
                    setActiveVarIdx(0);
                  }}
                >
                  <Text style={{ fontSize: 12, color: COLORS.rose, fontWeight: '700' }}>
                    Tutup Pratinjau
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.varPreviewSubtext, { color: theme.textMuted }]}>
                Ketuk 'Gunakan Opsi Ini' untuk menjadikannya draf pesan yang akan dikirim, atau salin teks variasi ke clipboard.
              </Text>

              <View style={styles.varCardsList}>
                {variations.map((vText, idx) => {
                  const isSelected = activeVarIdx === idx;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.varCardItem,
                        isSelected
                          ? { borderColor: COLORS.indigo, backgroundColor: isDark ? '#1e1b4b' : '#eef2ff' }
                          : { borderColor: theme.border, backgroundColor: theme.surface },
                      ]}
                    >
                      <View style={styles.varCardTop}>
                        <View
                          style={[
                            styles.varCardNumBadge,
                            { backgroundColor: isSelected ? COLORS.indigo : theme.surfaceMuted },
                          ]}
                        >
                          <Text
                            style={[
                              styles.varCardNumText,
                              { color: isSelected ? '#ffffff' : theme.text },
                            ]}
                          >
                            {`Variasi #${idx + 1}`}
                          </Text>
                        </View>

                        {isSelected && (
                          <View style={styles.selectedStatusTag}>
                            <Ionicons name="checkmark-circle" size={14} color={COLORS.indigo} />
                            <Text style={styles.selectedStatusText}>Pilihan Utama</Text>
                          </View>
                        )}
                      </View>

                      <Text style={[styles.varCardBodyText, { color: theme.text }]}>
                        {vText}
                      </Text>

                      <View style={styles.varCardBtnRow}>
                        <TouchableOpacity
                          style={[
                            styles.varSelectBtn,
                            isSelected
                              ? { backgroundColor: COLORS.indigo }
                              : { backgroundColor: theme.surfaceMuted, borderColor: theme.border, borderWidth: 1 },
                          ]}
                          onPress={() => setActiveVarIdx(idx)}
                        >
                          <Ionicons
                            name={isSelected ? 'checkmark' : 'checkmark-outline'}
                            size={14}
                            color={isSelected ? '#ffffff' : theme.text}
                          />
                          <Text
                            style={[
                              styles.varSelectBtnText,
                              { color: isSelected ? '#ffffff' : theme.text },
                            ]}
                          >
                            {isSelected ? 'Sedang Dipilih' : 'Gunakan Opsi Ini'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.varCopyBtn,
                            { backgroundColor: theme.surfaceMuted, borderColor: theme.border, borderWidth: 1 },
                          ]}
                          onPress={async () => {
                            await Clipboard.setStringAsync(vText);
                            Alert.alert('Tersalin', 'Teks variasi berhasil disalin ke clipboard.');
                          }}
                        >
                          <Ionicons name="copy-outline" size={14} color={theme.text} />
                          <Text style={[styles.varCopyBtnText, { color: theme.text }]}>
                            Salin
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Pengulangan & Jadwal</Text>

          <View style={styles.twoColumn}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Jumlah Kirim</Text>
              <View
                style={[
                  styles.numberInputWrap,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                ]}
              >
                <TextInput
                  style={[styles.numberInput, { color: theme.text }]}
                  keyboardType="numeric"
                  value={repeatCount}
                  onChangeText={setRepeatCount}
                  maxLength={3}
                />
                <Text style={[styles.unitText, { color: theme.textFaint }]}>kali</Text>
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Jeda Waktu</Text>
              <View
                style={[
                  styles.numberInputWrap,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                ]}
              >
                <TextInput
                  style={[styles.numberInput, { color: theme.text }]}
                  keyboardType="numeric"
                  value={intervalSeconds}
                  onChangeText={setIntervalSeconds}
                  maxLength={3}
                />
                <Text style={[styles.unitText, { color: theme.textFaint }]}>detik</Text>
              </View>
            </View>
          </View>

          {parseInt(repeatCount, 10) > 1 && (
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.switchTitle, { color: theme.text }]}>
                  Variasi AI Otomatis (Anti-Spam)
                </Text>
                <Text style={[styles.switchSubtitle, { color: theme.textMuted }]}>
                  Mengubah susunan kata otomatis setiap pesan dikirim agar tidak terdeteksi spam.
                </Text>
              </View>
              <Switch
                value={useAiVariation}
                onValueChange={setUseAiVariation}
                trackColor={{ false: '#767577', true: COLORS.indigo }}
                thumbColor="#ffffff"
              />
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.sendSubmitBtn, sending && { opacity: 0.7 }]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={18} color="#ffffff" />
              <Text style={styles.sendSubmitText}>
                {parseInt(repeatCount, 10) > 1
                  ? `Mulai Antrean (${repeatCount}x Kirim)`
                  : 'Kirim Pesan Sekarang'}
              </Text>
            </>
          )}
        </TouchableOpacity>
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
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  successText: {
    flex: 1,
    color: '#065f46',
    fontSize: 13,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  errorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 13,
  },
  sectionCard: {
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  typeSegment: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  segmentBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrap: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  textInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyGroupText: {
    fontSize: 12,
    paddingVertical: 8,
  },
  groupScroll: {
    flexDirection: 'row',
    marginTop: 4,
  },
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
    maxWidth: 180,
  },
  groupPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toneScroll: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  tonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  toneIcon: {
    fontSize: 14,
  },
  toneText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageArea: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  variationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  varBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  varBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  aiGenerateBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.indigo,
    paddingVertical: 10,
    borderRadius: 10,
  },
  aiGenerateBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 12,
  },
  numberInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  numberInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  unitText: {
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  switchSubtitle: {
    fontSize: 11,
    marginTop: 2,
    paddingRight: 10,
  },
  sendSubmitBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 12,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  sendSubmitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  countSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  variationsPreviewContainer: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 6,
  },
  varHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  varPreviewHeading: {
    fontSize: 14,
    fontWeight: '700',
  },
  varPreviewSubtext: {
    fontSize: 12,
    lineHeight: 16,
  },
  varCardsList: {
    gap: 10,
    marginTop: 4,
  },
  varCardItem: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  varCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  varCardNumBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  varCardNumText: {
    fontSize: 11,
    fontWeight: '700',
  },
  selectedStatusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectedStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.indigo,
  },
  varCardBodyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  varCardBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  varSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6,
  },
  varSelectBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  varCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6,
  },
  varCopyBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
