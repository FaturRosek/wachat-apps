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

const PERSONA_OPTIONS = [
  { id: 'cs', label: 'Customer Service Ramah', icon: '🎧' },
  { id: 'sales', label: 'Sales & Penjualan Persuasif', icon: '💼' },
  { id: 'assistant', label: 'Asisten Pribadi Profesional', icon: '🤖' },
  { id: 'casual', label: 'Teman Akrab & Santai', icon: '😎' },
  { id: 'custom', label: 'Kustom / Instruksi Bebas', icon: '✏️' },
];

export default function AiChatSettingsScreen() {
  const router = useRouter();
  const { jid } = useLocalSearchParams();
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState('cs');
  const [customPrompt, setCustomPrompt] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('3');

  const decodedJid = jid ? decodeURIComponent(jid) : '';

  useEffect(() => {
    async function loadAiSetting() {
      if (!decodedJid) return;
      try {
        const res = await apiClient.get(`/chats/${encodeURIComponent(decodedJid)}/ai-setting`);
        if (res.data?.success && res.data.data) {
          const setting = res.data.data;
          setAutoReplyEnabled(!!setting.auto_reply_enabled);
          setSelectedPersona(setting.persona || 'cs');
          setCustomPrompt(setting.custom_prompt || '');
          setDelaySeconds(String(setting.reply_delay || 3));
        }
      } catch (e) {
        console.warn('Gagal memuat setting AI:', e.message);
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
      Alert.alert('Gagal', 'Tidak dapat mengubah status auto-reply AI.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/chats/${encodeURIComponent(decodedJid)}/ai-setting`, {
        auto_reply_enabled: autoReplyEnabled,
        persona: selectedPersona,
        custom_prompt: customPrompt.trim(),
        reply_delay: Math.max(0, parseInt(delaySeconds, 10) || 3),
      });

      Alert.alert('Tersimpan', 'Pengaturan AI untuk obrolan ini berhasil diperbarui!');
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
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Pengaturan AI Obrolan</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={styles.badgeRow}>
                <Ionicons name="sparkles" size={18} color={COLORS.indigo} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  AI Auto-Reply Otomatis
                </Text>
              </View>
              <Text style={[styles.cardDesc, { color: theme.textMuted }]}>
                Balas pesan masuk di obrolan ini secara otomatis menggunakan model AI.
              </Text>
            </View>

            <Switch
              value={autoReplyEnabled}
              onValueChange={handleToggleAutoReply}
              trackColor={{ false: '#767577', true: COLORS.indigo }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Pilih Karakter / Persona AI</Text>
          <Text style={[styles.cardDesc, { color: theme.textMuted }]}>
            Gaya kepribadian dan cara bot menjawab lawan bicara.
          </Text>

          <View style={styles.personaList}>
            {PERSONA_OPTIONS.map((p) => {
              const selected = selectedPersona === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.personaItem,
                    selected
                      ? { backgroundColor: 'rgba(79, 70, 229, 0.1)', borderColor: COLORS.indigo }
                      : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                  ]}
                  onPress={() => setSelectedPersona(p.id)}
                >
                  <Text style={styles.personaIcon}>{p.icon}</Text>
                  <Text
                    style={[
                      styles.personaLabel,
                      { color: selected ? COLORS.indigo : theme.text },
                    ]}
                  >
                    {p.label}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.indigo} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Instruksi Khusus (System Prompt)
          </Text>
          <Text style={[styles.cardDesc, { color: theme.textMuted }]}>
            Beri konteks bisnis Anda, daftar harga produk, jam buka, atau instruksi cara menjawab.
          </Text>

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
            numberOfLines={5}
            placeholder="Contoh: Nama toko ini adalah Toko Kopi Sejahtera. Jam operasional 08.00-22.00. Kopi susu seharga Rp 18.000. Jawab dengan ramah dan sertakan emoji senyum."
            placeholderTextColor={theme.textFaint}
            value={customPrompt}
            onChangeText={setCustomPrompt}
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Jeda Waktu Membalas (Detik)</Text>
          <Text style={[styles.cardDesc, { color: theme.textMuted }]}>
            Beri jeda beberapa detik sebelum AI mengirim balasan agar terlihat alami seperti mengetik.
          </Text>

          <View
            style={[
              styles.delayInputWrap,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
            ]}
          >
            <Ionicons name="time-outline" size={18} color={theme.textFaint} />
            <TextInput
              style={[styles.delayInput, { color: theme.text }]}
              keyboardType="numeric"
              value={delaySeconds}
              onChangeText={setDelaySeconds}
              maxLength={2}
            />
            <Text style={[styles.delayUnit, { color: theme.textFaint }]}>detik</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#ffffff" />
              <Text style={styles.saveBtnText}>Simpan Pengaturan AI</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    marginRight: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  personaList: {
    gap: 8,
    marginTop: 4,
  },
  personaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  personaIcon: {
    fontSize: 18,
  },
  personaLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  delayInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    maxWidth: 160,
    gap: 8,
  },
  delayInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  delayUnit: {
    fontSize: 12,
  },
  saveBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.indigo,
    height: 48,
    borderRadius: 12,
    elevation: 3,
    shadowColor: COLORS.indigo,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
