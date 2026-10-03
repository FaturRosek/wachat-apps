import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { getTheme, COLORS } from '../../theme';
import apiClient from '../../api/apiClient';

const PERSONA_PRESETS = [
  {
    id: 'cs',
    title: 'CS Ramah & Solutif (Default)',
    prompt: 'Anda adalah Customer Service yang ramah, sopan, dan solutif. Bantu jawab pertanyaan pengguna dengan jelas, hangat, dan berikan solusi terbaik.',
    tone: 'friendly',
  },
  {
    id: 'sales',
    title: 'Sales & Closing Specialist',
    prompt: 'Anda adalah spesialis sales dan penjualan yang persuasif dan antusias. Fokus menawarkan keunggulan produk dan dorong pelanggan melakukan pemesanan (closing) dengan ramah.',
    tone: 'sales',
  },
  {
    id: 'formal',
    title: 'Resmi & Profesional (B2B)',
    prompt: 'Anda adalah perwakilan bisnis profesional untuk komunikasi B2B. Gunakan bahasa formal, lugas, santun, dan terstruktur tanpa singkatan berlebihan.',
    tone: 'formal',
  },
  {
    id: 'short',
    title: 'Jawaban Cepat & To The Point',
    prompt: 'Jawab setiap pesan dengan singkat, padat, jelas, dan to the point tanpa basa-basi panjang.',
    tone: 'short',
  },
];

const STATIC_TEMPLATES = [
  {
    id: 'busy',
    title: 'Sedang di Luar / Sibuk',
    text: 'Halo! Saya sedang di luar atau sedang sibuk saat ini. Pesan Anda sudah diterima dan akan saya balas secepatnya ya.',
  },
  {
    id: 'closed',
    title: 'Toko Tutup / Jam Operasional',
    text: 'Halo! Terima kasih sudah menghubungi kami. Saat ini toko sedang tutup di luar jam operasional. Kami akan membalas pesan Anda saat jam kerja dibuka kembali.',
  },
  {
    id: 'standard',
    title: 'Pesan Diterima (Standar)',
    text: 'Halo, pesan Anda sudah kami terima. Mohon tunggu sebentar ya, kami akan segera merespons chat Anda.',
  },
  {
    id: 'break',
    title: 'Istirahat / Sholat',
    text: 'Halo! Mohon maaf saat ini sedang istirahat / sholat sejenak. Nanti segera saya balas chat Anda setelah selesai.',
  },
];

const TONE_OPTIONS = [
  { id: 'friendly', label: 'Ramah 😊' },
  { id: 'formal', label: 'Formal 👔' },
  { id: 'sales', label: 'Sales 🚀' },
  { id: 'short', label: 'Singkat ⚡' },
];

export default function AiChatSettingsScreen() {
  const router = useRouter();
  const { jid } = useLocalSearchParams();
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [disableAfterOneReply, setDisableAfterOneReply] = useState(false);
  const [replyMode, setReplyMode] = useState('ai');
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTone, setSelectedTone] = useState('friendly');
  const [staticReplyText, setStaticReplyText] = useState('');

  const decodedJid = jid ? decodeURIComponent(jid) : '';

  useEffect(() => {
    async function loadAiSetting() {
      if (!decodedJid) return;
      try {
        const res = await apiClient.get(`/chats/${encodeURIComponent(decodedJid)}/ai-setting`);
        if (res.data?.success && res.data.data) {
          const setting = res.data.data;
          setAutoReplyEnabled(!!setting.auto_reply_enabled);
          setDisableAfterOneReply(Boolean(setting.disable_after_one_reply || setting.disableAfterOneReply));
          setReplyMode(setting.reply_mode === 'static' ? 'static' : 'ai');
          setCustomPrompt(setting.custom_prompt || '');
          setSelectedTone(setting.tone || 'friendly');
          setStaticReplyText(setting.static_reply_text || '');
        }
      } catch (e) {
      } finally {
        setLoading(false);
      }
    }

    loadAiSetting();
  }, [decodedJid]);

  const handleToggleAutoReply = async (val) => {
    setAutoReplyEnabled(val);
    try {
      await apiClient.patch(`/chats/${encodeURIComponent(decodedJid)}/toggle-auto-reply`, {
        enabled: val,
      });
    } catch (err) {
      setAutoReplyEnabled(!val);
      Alert.alert('Gagal', 'Tidak dapat mengubah status auto-reply.');
    }
  };

  const handleSummarizeChat = async () => {
    setSummarizing(true);
    try {
      const res = await apiClient.post('/chats/ai/summarize', {
        jid: decodedJid,
      });
      const summary = res.data?.data?.summary || 'Belum ada ringkasan obrolan yang tersedia.';
      Alert.alert('Rangkuman Obrolan', summary);
    } catch (err) {
      Alert.alert('Info', 'Belum dapat merangkum obrolan saat ini.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleSave = async () => {
    if (replyMode === 'static' && !staticReplyText.trim()) {
      Alert.alert('Perhatian', 'Isi teks pesan balasan tetap terlebih dahulu.');
      return;
    }

    setSaving(true);
    try {
      await apiClient.put(`/chats/${encodeURIComponent(decodedJid)}/ai-setting`, {
        auto_reply_enabled: autoReplyEnabled,
        autoReplyEnabled: autoReplyEnabled,
        disable_after_one_reply: disableAfterOneReply,
        disableAfterOneReply: disableAfterOneReply,
        reply_mode: replyMode,
        replyMode: replyMode,
        static_reply_text: staticReplyText.trim(),
        staticReplyText: staticReplyText.trim(),
        custom_prompt: customPrompt.trim(),
        customPrompt: customPrompt.trim(),
        tone: selectedTone,
      });

      Alert.alert('Tersimpan', 'Pengaturan balasan otomatis berhasil disimpan!');
      router.back();
    } catch (err) {
      Alert.alert('Gagal Menyimpan', err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.headerLeftWrap}>
          <View style={[styles.headerIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)' }]}>
            <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primary} />
          </View>
          <View style={styles.headerTitleCol}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Info Kontak & Otomasi Chat</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
              Pengaturan balasan otomatis & catatan
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={24} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View
          style={[
            styles.mainCard,
            {
              backgroundColor: isDark ? '#111c2e' : '#f0f6ff',
              borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe',
            },
          ]}
        >
          <View style={styles.autoReplyTopRow}>
            <View style={styles.autoReplyLeft}>
              <View style={styles.flashIconCircle}>
                <Ionicons name="flash" size={18} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.autoReplyHeading, { color: theme.text }]}>Auto-Reply Otomatis</Text>
                <Text style={[styles.autoReplySubtext, { color: theme.textMuted }]}>
                  Balas chat kontak ini secara otomatis
                </Text>
              </View>
            </View>

            <Switch
              value={autoReplyEnabled}
              onValueChange={handleToggleAutoReply}
              trackColor={{ false: '#64748b', true: '#3b82f6' }}
              thumbColor="#ffffff"
            />
          </View>

          {autoReplyEnabled && (
            <View style={styles.statusIndicatorRow}>
              <Ionicons name="sparkles" size={14} color="#3b82f6" />
              <Text style={styles.statusIndicatorText}>
                {replyMode === 'static'
                  ? 'Pesan tetap membalas pesan masuk kontak ini.'
                  : 'AI aktif menjawab pesan masuk kontak ini.'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.oneReplyCard,
              {
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.65)' : '#ffffff',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
              },
            ]}
            onPress={() => setDisableAfterOneReply(!disableAfterOneReply)}
          >
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.oneReplyTitle, { color: theme.text }]}>
                Auto-Nonaktif Setelah 1x Balas
              </Text>
              <Text style={[styles.oneReplyDesc, { color: theme.textMuted }]}>
                Setelah bot membalas pesan pertama dari kontak ini, status AI akan otomatis mati agar Anda bisa melanjutkan obrolan manual tanpa terganggu bot.
              </Text>
            </View>

            <View
              style={[
                styles.checkboxBox,
                {
                  borderColor: disableAfterOneReply ? COLORS.primary : theme.textMuted,
                  backgroundColor: disableAfterOneReply ? COLORS.primary : 'transparent',
                },
              ]}
            >
              {disableAfterOneReply && <Ionicons name="checkmark" size={14} color="#ffffff" />}
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeading, { color: theme.text }]}>
            PILIH JENIS BALASAN OTOMATIS:
          </Text>

          <View style={styles.modeTabsRow}>
            <TouchableOpacity
              style={[
                styles.modeTabBtn,
                replyMode === 'ai'
                  ? [styles.modeTabBtnActive, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: COLORS.primary }]
                  : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              ]}
              onPress={() => setReplyMode('ai')}
            >
              <Ionicons
                name="hardware-chip-outline"
                size={17}
                color={replyMode === 'ai' ? COLORS.primary : theme.textMuted}
              />
              <Text
                style={[
                  styles.modeTabText,
                  { color: replyMode === 'ai' ? (isDark ? '#ffffff' : COLORS.primary) : theme.textMuted },
                ]}
              >
                Balasan AI Pintar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeTabBtn,
                replyMode === 'static'
                  ? [styles.modeTabBtnActive, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: COLORS.primary }]
                  : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              ]}
              onPress={() => setReplyMode('static')}
            >
              <Ionicons
                name="chatbox-outline"
                size={17}
                color={replyMode === 'static' ? COLORS.primary : theme.textMuted}
              />
              <Text
                style={[
                  styles.modeTabText,
                  { color: replyMode === 'static' ? (isDark ? '#ffffff' : COLORS.primary) : theme.textMuted },
                ]}
              >
                Pesan Balasan Tetap
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {replyMode === 'ai' ? (
          <>
            <View style={styles.sectionWrap}>
              <View style={styles.rowTitleIcon}>
                <Ionicons name="options-outline" size={17} color={COLORS.primary} />
                <Text style={[styles.sectionHeading, { color: theme.text }]}>
                  INSTRUKSI AI (PERSONA PROMPT)
                </Text>
              </View>

              <View style={styles.presetGrid}>
                {PERSONA_PRESETS.map((p) => {
                  const isMatch = customPrompt === p.prompt;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.gridBtn,
                        isMatch
                          ? { backgroundColor: isDark ? '#1e3a8a' : '#dbeafe', borderColor: COLORS.primary }
                          : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                      ]}
                      onPress={() => {
                        setCustomPrompt(p.prompt);
                        setSelectedTone(p.tone);
                      }}
                    >
                      <Text
                        style={[
                          styles.gridBtnText,
                          { color: isMatch ? COLORS.primary : theme.text },
                        ]}
                        numberOfLines={2}
                      >
                        {p.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

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
                numberOfLines={4}
                placeholder="Contoh: Jawab ramah dan jelaskan bahwa toko buka jam 09:00 - 21:00..."
                placeholderTextColor={theme.textFaint}
                value={customPrompt}
                onChangeText={setCustomPrompt}
              />
            </View>

            <View style={styles.sectionWrap}>
              <Text style={[styles.toneSectionTitle, { color: theme.text }]}>Gaya Bahasa (Tone):</Text>
              <View style={styles.tonePillsRow}>
                {TONE_OPTIONS.map((t) => {
                  const isSel = selectedTone === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.tonePillBtn,
                        isSel
                          ? { backgroundColor: '#2563eb', borderColor: '#2563eb' }
                          : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                      ]}
                      onPress={() => setSelectedTone(t.id)}
                    >
                      <Text
                        style={[
                          styles.tonePillText,
                          { color: isSel ? '#ffffff' : theme.text },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.sectionWrap}>
            <Text style={[styles.toneSectionTitle, { color: theme.text }]}>Template Pesan Balasan Cepat:</Text>
            <View style={styles.presetGrid}>
              {STATIC_TEMPLATES.map((tmpl) => {
                const isMatch = staticReplyText === tmpl.text;
                return (
                  <TouchableOpacity
                    key={tmpl.id}
                    style={[
                      styles.gridBtn,
                      isMatch
                        ? { backgroundColor: isDark ? '#1e3a8a' : '#dbeafe', borderColor: COLORS.primary }
                        : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                    ]}
                    onPress={() => setStaticReplyText(tmpl.text)}
                  >
                    <Text
                      style={[
                        styles.gridBtnText,
                        { color: isMatch ? COLORS.primary : theme.text },
                      ]}
                      numberOfLines={2}
                    >
                      {tmpl.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.rowTitleIcon}>
              <Ionicons name="paper-plane-outline" size={16} color={COLORS.primary} />
              <Text style={[styles.sectionHeading, { color: theme.text }]}>
                TEKS PESAN BALASAN TETAP *
              </Text>
            </View>

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
              numberOfLines={4}
              placeholder="Contoh: Bentar yaa sayang, ini bot yang bales aku lagi diluar..."
              placeholderTextColor={theme.textFaint}
              value={staticReplyText}
              onChangeText={setStaticReplyText}
            />

            <Text style={[styles.staticHintText, { color: theme.textMuted }]}>
              Saat ada chat masuk dari kontak ini, sistem akan langsung membalas dengan pesan tetap di atas tanpa proses AI.
            </Text>
          </View>
        )}

        <View
          style={[
            styles.summaryCard,
            { backgroundColor: isDark ? '#16202c' : theme.surfaceAlt, borderColor: theme.border },
          ]}
        >
          <View style={styles.summaryLeftRow}>
            <Ionicons name="sparkles" size={17} color="#3b82f6" />
            <Text style={[styles.summaryTitle, { color: theme.text }]}>Rangkuman Obrolan</Text>
          </View>

          <TouchableOpacity
            style={styles.summaryBtn}
            onPress={handleSummarizeChat}
            disabled={summarizing}
          >
            {summarizing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.summaryBtnText}>Rangkum Chat</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveSubmitBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveSubmitBtnText}>Simpan Pengaturan</Text>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  mainCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  autoReplyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  autoReplyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  flashIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoReplyHeading: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  autoReplySubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -2,
  },
  statusIndicatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
  },
  oneReplyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  oneReplyTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  oneReplyDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionWrap: {
    gap: 10,
  },
  sectionHeading: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  rowTitleIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  modeTabBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridBtn: {
    width: '48.5%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  gridBtnText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13.5,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  toneSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  tonePillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tonePillBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  tonePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  staticHintText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: -2,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  summaryLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  summaryBtn: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  summaryBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  saveSubmitBtn: {
    backgroundColor: '#2563eb',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    marginTop: 6,
  },
  saveSubmitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
