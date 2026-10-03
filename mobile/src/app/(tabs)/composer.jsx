import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { getTheme, COLORS } from '../../theme';
import apiClient from '../../api/apiClient';
import { formatPhoneNumber } from '../../utils/phoneFormatter';

const AI_TONE_OPTIONS = [
  { id: 'romantic', label: 'Romantis & Manis', icon: '💖' },
  { id: 'casual', label: 'Santai & Gaul', icon: '😎' },
  { id: 'friendly', label: 'Ramah & Akrab', icon: '✨' },
  { id: 'persuasive', label: 'Persuasif & Promosi', icon: '🎯' },
  { id: 'formal', label: 'Formal & Profesional', icon: '👔' },
  { id: 'short', label: 'Singkat & Padat', icon: '⚡' },
  { id: 'reminder', label: 'Pengingat / Tagihan', icon: '⏰' },
  { id: 'apology', label: 'Permohonan Maaf', icon: '🙏' },
];

const REPEAT_PRESETS = ['1x', '3x', '5x', '10x', '20x'];
const INTERVAL_PRESETS = ['1s', '2s', '3s', '5s', '10s'];

export default function MessageComposerScreen() {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { onEvent } = useSocket();
  const tabsScrollRef = useRef(null);

  const [waConnected, setWaConnected] = useState(true);

  const [recipientType, setRecipientType] = useState('personal');
  const [phone, setPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('manual');
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);

  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [message, setMessage] = useState('');
  const [selectedTone, setSelectedTone] = useState('romantic');
  const [variations, setVariations] = useState([]);
  const [hasAiGenerated, setHasAiGenerated] = useState(false);
  const [activeVarIdx, setActiveVarIdx] = useState(0);
  const [generatingAi, setGeneratingAi] = useState(false);

  const [repeatCount, setRepeatCount] = useState('5');
  const [intervalSeconds, setIntervalSeconds] = useState('5');
  const [useAiVariation, setUseAiVariation] = useState(false);

  const [sending, setSending] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  const repeatsNum = useMemo(() => {
    return Math.max(1, parseInt(repeatCount, 10) || 1);
  }, [repeatCount]);

  const fetchStatus = async () => {
    try {
      const res = await apiClient.get('/whatsapp/status');
      setWaConnected(res.data?.data?.status === 'CONNECTED');
    } catch (e) {}
  };

  const fetchContacts = async (search = '') => {
    setLoadingContacts(true);
    try {
      const res = await apiClient.get('/contacts', {
        params: { type: 'personal', limit: 500, search: search.trim() || undefined },
      });
      const list = res.data?.data?.contacts || [];
      const total = res.data?.data?.total || list.length;
      setContacts(list);
      setContactsTotal(total);
    } catch (e) {
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleSyncContacts = async () => {
    setSyncingContacts(true);
    try {
      const res = await apiClient.post('/contacts/sync');
      const list = res.data?.data?.contacts || [];
      const total = res.data?.data?.total || list.length;
      setContacts(list);
      setContactsTotal(total);
      Alert.alert('Sukses', 'Kontak berhasil disinkronkan!');
    } catch (e) {
      Alert.alert('Gagal', e.response?.data?.message || 'Gagal menyinkronkan kontak.');
    } finally {
      setSyncingContacts(false);
    }
  };

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
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchContacts();

    const unsubWaStatus = onEvent('wa_status', (data) => {
      setWaConnected(data?.status === 'CONNECTED');
    });

    return () => {
      unsubWaStatus();
    };
  }, [onEvent]);

  useEffect(() => {
    if (recipientType === 'group') {
      fetchGroups();
    }
  }, [recipientType]);

  useEffect(() => {
    if (variations.length > 0) {
      if (variations.length < repeatsNum) {
        const diff = repeatsNum - variations.length;
        const additional = Array(diff).fill(message || variations[0] || '');
        setVariations((prev) => [...prev, ...additional]);
      } else if (variations.length > repeatsNum) {
        setVariations((prev) => prev.slice(0, repeatsNum));
        if (activeVarIdx >= repeatsNum) {
          setActiveVarIdx(repeatsNum - 1);
        }
      }
    }
  }, [repeatsNum]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter((c) => {
      const name = (c.name || c.saved_name || c.push_name || '').toLowerCase();
      const ph = (c.phone || '').toLowerCase();
      return name.includes(q) || ph.includes(q);
    });
  }, [contacts, contactSearch]);

  const selectedContactDisplay = useMemo(() => {
    if (selectedContactId === 'manual') return '-- Ketik manual di bawah --';
    const found = contacts.find((c) => String(c.id) === String(selectedContactId));
    if (found) {
      const name = found.name || found.saved_name || found.push_name || found.phone;
      return `${name} (${found.phone})`;
    }
    return recipientName ? `${recipientName} (${phone})` : '-- Ketik manual di bawah --';
  }, [selectedContactId, contacts, recipientName, phone]);

  const selectedGroupName = useMemo(() => {
    const found = groups.find((g) => (g.id || g.jid) === selectedGroup);
    return found ? (found.name || found.subject || 'Grup') : '';
  }, [groups, selectedGroup]);

  const currentActiveText = useMemo(() => {
    if (variations.length > 0 && variations[activeVarIdx] !== undefined) {
      return variations[activeVarIdx];
    }
    return message;
  }, [variations, activeVarIdx, message]);

  const handleActiveTextChange = (text) => {
    if (variations.length > 0) {
      const updated = [...variations];
      updated[activeVarIdx] = text;
      setVariations(updated);
    } else if (repeatsNum > 1) {
      const initList = Array(repeatsNum).fill(message);
      initList[activeVarIdx] = text;
      setVariations(initList);
    } else {
      setMessage(text);
    }
  };

  const handleGenerateAiVariations = async () => {
    if (!message.trim()) {
      Alert.alert('Perhatian', 'Ketik draf pesan awal terlebih dahulu.');
      return;
    }

    setGeneratingAi(true);
    setErrorBanner('');
    try {
      const reqCount = Math.min(Math.max(repeatsNum, 1), 20);
      const res = await apiClient.post('/chats/ai/variations', {
        message: message.trim(),
        tone: selectedTone,
        count: reqCount,
        recipientName: recipientName.trim() || undefined,
      });

      const list = res.data?.data?.variations || [];
      if (Array.isArray(list) && list.length > 0) {
        let finalList = [...list];
        if (finalList.length < repeatsNum) {
          while (finalList.length < repeatsNum) {
            finalList.push(list[finalList.length % list.length]);
          }
        } else if (finalList.length > repeatsNum) {
          finalList = finalList.slice(0, repeatsNum);
        }
        setVariations(finalList);
        setHasAiGenerated(true);
        setActiveVarIdx(0);
        tabsScrollRef.current?.scrollTo?.({ x: 0, animated: true });
      } else {
        Alert.alert('Info', 'Tidak ada variasi yang dihasilkan.');
      }
    } catch (err) {
      Alert.alert('Gagal', err.response?.data?.message || 'Gagal menghasilkan variasi pesan AI.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleResetVariations = () => {
    setVariations([]);
    setHasAiGenerated(false);
    setActiveVarIdx(0);
  };

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

    const payloadPrimary = currentActiveText.trim() || message.trim();
    if (!payloadPrimary) {
      setErrorBanner('Isi pesan tidak boleh kosong.');
      return;
    }

    let payloadMessages = undefined;
    if (variations.length > 0) {
      payloadMessages = variations.map((v) => (v && v.trim() ? v.trim() : payloadPrimary));
    }

    const repeats = Math.max(1, parseInt(repeatCount, 10) || 1);
    const intervals = Math.max(1, parseInt(intervalSeconds, 10) || 5);

    setSending(true);
    try {
      const res = await apiClient.post('/messages', {
        phone: target,
        message: payloadPrimary,
        messages: payloadMessages && payloadMessages.length > 1 ? payloadMessages : undefined,
        contactName: recipientName.trim() || undefined,
        repeatCount: repeats,
        intervalSeconds: intervals,
        useAiVariation: payloadMessages && payloadMessages.length > 1 ? false : useAiVariation,
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

  const currentTimeDisplay = useMemo(() => {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}.${m}`;
  }, []);

  const totalPreviewCount = variations.length > 0 ? variations.length : repeatsNum;
  const progressRatio = totalPreviewCount > 0 ? (activeVarIdx + 1) / totalPreviewCount : 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Kirim Pesan & Variasi AI</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Ketik pesan langsung, variasikan kalimat dengan AI agar lebih memikat, edit di preview simulasi WhatsApp, lalu kirim ke tujuan.
          </Text>

          <View style={styles.statusBadgeWrap}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: waConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  borderColor: waConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: waConnected ? COLORS.emerald : COLORS.rose },
                ]}
              />
              <Text
                style={[
                  styles.statusPillText,
                  { color: waConnected ? COLORS.emerald : COLORS.rose },
                ]}
              >
                {waConnected ? 'WhatsApp Terhubung' : 'WhatsApp Terputus'}
              </Text>
            </View>
          </View>
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
          <View style={[styles.typeSegment, { backgroundColor: theme.surfaceAlt }]}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                recipientType === 'personal' && [styles.segmentBtnActive, { backgroundColor: theme.surface }],
              ]}
              onPress={() => setRecipientType('personal')}
            >
              <Ionicons
                name="person-outline"
                size={16}
                color={recipientType === 'personal' ? COLORS.primary : theme.textMuted}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: recipientType === 'personal' ? COLORS.primary : theme.textMuted },
                ]}
              >
                {`Kontak Personal (${contactsTotal || contacts.length || 0})`}
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
                name="people-outline"
                size={16}
                color={recipientType === 'group' ? COLORS.primary : theme.textMuted}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: recipientType === 'group' ? COLORS.primary : theme.textMuted },
                ]}
              >
                {`Grup WhatsApp (${groups.length || 0})`}
              </Text>
            </TouchableOpacity>
          </View>

          {recipientType === 'personal' ? (
            <>
              <View style={styles.rowBetween}>
                <Text style={[styles.fieldHeaderLabel, { color: theme.text }]}>
                  {`PILIH DARI KONTAK TERSIMPAN (${contactsTotal || contacts.length || 0})`}
                </Text>
                <TouchableOpacity
                  style={styles.syncBtnRow}
                  onPress={handleSyncContacts}
                  disabled={syncingContacts}
                >
                  <Ionicons
                    name="sync-outline"
                    size={14}
                    color={COLORS.primary}
                    style={syncingContacts ? styles.spinning : undefined}
                  />
                  <Text style={[styles.syncBtnText, { color: COLORS.primary }]}>
                    {syncingContacts ? 'Menyinkronkan...' : 'Sinkronkan Kontak'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.searchContainer,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                ]}
              >
                <Ionicons name="search-outline" size={17} color={theme.textFaint} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Cari nama atau nomor kontak..."
                  placeholderTextColor={theme.textFaint}
                  value={contactSearch}
                  onChangeText={(txt) => {
                    setContactSearch(txt);
                    fetchContacts(txt);
                  }}
                />
                {!!contactSearch && (
                  <TouchableOpacity onPress={() => { setContactSearch(''); fetchContacts(''); }}>
                    <Ionicons name="close-circle" size={16} color={theme.textFaint} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.dropdownTrigger,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                ]}
                onPress={() => setContactModalVisible(true)}
              >
                <Text
                  style={[
                    styles.dropdownTriggerText,
                    { color: selectedContactId === 'manual' ? theme.textMuted : theme.text },
                  ]}
                  numberOfLines={1}
                >
                  {selectedContactDisplay}
                </Text>
                <Ionicons name="chevron-down" size={18} color={theme.textFaint} />
              </TouchableOpacity>

              <View style={styles.inputWrap}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>NOMOR WHATSAPP TUJUAN *</Text>
                <View
                  style={[
                    styles.textInputContainer,
                    { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                  ]}
                >
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="08123456789 atau 628123456789"
                    placeholderTextColor={theme.textFaint}
                    value={phone}
                    onChangeText={(t) => {
                      setPhone(t);
                      setSelectedContactId('manual');
                    }}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.inputWrap}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>NAMA PENERIMA (OPSIONAL)</Text>
                <View
                  style={[
                    styles.textInputContainer,
                    { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
                  ]}
                >
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="Nama Kontak"
                    placeholderTextColor={theme.textFaint}
                    value={recipientName}
                    onChangeText={setRecipientName}
                  />
                </View>
              </View>
            </>
          ) : (
            <View style={styles.inputWrap}>
              <View style={styles.rowBetween}>
                <Text style={[styles.fieldHeaderLabel, { color: theme.text }]}>PILIH GRUP WHATSAPP</Text>
                <TouchableOpacity onPress={fetchGroups} disabled={loadingGroups}>
                  <Text style={[styles.syncBtnText, { color: COLORS.primary }]}>
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

          <View style={styles.inputWrap}>
            <View style={styles.rowBetween}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>ISI PESAN WHATSAPP *</Text>
              <Text style={[styles.charCountText, { color: theme.textFaint }]}>
                {`${message.length} karakter`}
              </Text>
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
              placeholder="Ketik isi pesan WhatsApp di sini..."
              placeholderTextColor={theme.textFaint}
              value={message}
              onChangeText={(txt) => {
                setMessage(txt);
                if (variations.length === 0) {
                  setActiveVarIdx(0);
                }
              }}
            />
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <View style={styles.aiTitleRow}>
              <Ionicons name="sparkles" size={17} color={COLORS.primary} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Variasikan & Poles dengan AI:</Text>
            </View>
            <Text style={[styles.aiSubtitleTag, { color: COLORS.primary }]}>Pilih Gaya & Klik Tombol</Text>
          </View>

          <View style={styles.toneListColumn}>
            {AI_TONE_OPTIONS.map((t) => {
              const selected = selectedTone === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.toneItemButton,
                    selected
                      ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                      : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                  ]}
                  onPress={() => setSelectedTone(t.id)}
                >
                  <Text style={styles.toneIconEmoji}>{t.icon}</Text>
                  <Text
                    style={[
                      styles.toneItemText,
                      { color: selected ? '#ffffff' : theme.text },
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.aiPolishBtn, generatingAi && { opacity: 0.7 }]}
            onPress={handleGenerateAiVariations}
            disabled={generatingAi}
          >
            {generatingAi ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={17} color="#ffffff" />
                <Text style={styles.aiPolishBtnText}>
                  {hasAiGenerated ? 'Perbarui Variasi Pesan AI ✨' : 'Variasikan dengan AI Sekarang ✨'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <View style={styles.repeatHeaderRow}>
              <Ionicons name="repeat" size={18} color={COLORS.primary} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                PENGATURAN PENGIRIMAN BERULANG
              </Text>
            </View>
            <View style={styles.repeatBadge}>
              <Text style={styles.repeatBadgeText}>{`${repeatsNum}x Pengiriman`}</Text>
            </View>
          </View>

          <View style={styles.inputWrap}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Jumlah Kirim (Repeat Count)</Text>
            <View style={styles.presetPillsRow}>
              {REPEAT_PRESETS.map((val) => {
                const numericVal = val.replace('x', '');
                const isSel = repeatCount === numericVal;
                return (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.presetPill,
                      isSel
                        ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                        : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                    ]}
                    onPress={() => setRepeatCount(numericVal)}
                  >
                    <Text style={[styles.presetPillText, { color: isSel ? '#ffffff' : theme.text }]}>
                      {val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              style={[
                styles.numberInputContainer,
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
            </View>
          </View>

          <View style={styles.inputWrap}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Jeda Antar Pesan (Detik)</Text>
            <View style={styles.presetPillsRow}>
              {INTERVAL_PRESETS.map((val) => {
                const numericVal = val.replace('s', '');
                const isSel = intervalSeconds === numericVal;
                return (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.presetPill,
                      isSel
                        ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                        : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                    ]}
                    onPress={() => setIntervalSeconds(numericVal)}
                  >
                    <Text style={[styles.presetPillText, { color: isSel ? '#ffffff' : theme.text }]}>
                      {val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              style={[
                styles.numberInputContainer,
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
            </View>
          </View>

          {repeatsNum > 1 && (
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
                trackColor={{ false: '#767577', true: COLORS.primary }}
                thumbColor="#ffffff"
              />
            </View>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.previewHeading, { color: theme.text }]}>Live WhatsApp Preview</Text>
            <View style={styles.previewActionIconsRow}>
              {hasAiGenerated && (
                <View style={styles.aiTagBadge}>
                  <Text style={styles.aiTagBadgeText}>✨ Hasil AI (Bisa Diedit)</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={handleGenerateAiVariations}
                disabled={generatingAi}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="refresh-outline" size={19} color={theme.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (currentActiveText) {
                    await Clipboard.setStringAsync(currentActiveText);
                    Alert.alert('Tersalin', 'Isi pesan disalin ke clipboard.');
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="copy-outline" size={19} color={theme.textMuted} />
              </TouchableOpacity>
              {hasAiGenerated && (
                <TouchableOpacity
                  onPress={handleResetVariations}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="reload-outline" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={[styles.previewSubtitle, { color: theme.textMuted }]}>
            Klik teks di dalam bubble chat hijau untuk mengedit sebelum dikirim
          </Text>

          {totalPreviewCount > 1 && (
            <View style={styles.tabsSectionWrap}>
              <ScrollView
                ref={tabsScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabsScrollContent}
                style={styles.tabsScrollView}
              >
                {Array.from({ length: totalPreviewCount }).map((_, idx) => {
                  const isSel = activeVarIdx === idx;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.messageTabBtn,
                        isSel
                          ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                          : { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                      ]}
                      onPress={() => setActiveVarIdx(idx)}
                    >
                      <Text style={[styles.messageTabBtnText, { color: isSel ? '#ffffff' : theme.text }]}>
                        {`Pesan #${idx + 1}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={[styles.progressBarTrack, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, Math.max(5, progressRatio * 100))}%`,
                      backgroundColor: COLORS.primary,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          <View style={[styles.simulatedScreen, { backgroundColor: isDark ? '#0b141a' : '#efeae2' }]}>
            <View style={[styles.simulatedHeader, { backgroundColor: isDark ? '#202c33' : '#f0f2f5' }]}>
              <View style={styles.simAvatarCircle}>
                <Ionicons name="person" size={18} color="#ffffff" />
              </View>
              <View style={styles.simHeaderInfo}>
                <Text style={[styles.simHeaderName, { color: isDark ? '#e9edef' : '#111b21' }]} numberOfLines={1}>
                  {recipientType === 'group'
                    ? (selectedGroupName || 'Grup WhatsApp')
                    : (recipientName || phone || 'Penerima WhatsApp')}
                </Text>
                <Text style={styles.simHeaderStatus}>Online</Text>
              </View>
              <View style={styles.simBadgePreview}>
                <Text style={styles.simBadgePreviewText}>
                  {totalPreviewCount > 1
                    ? `Pesan ${activeVarIdx + 1} dari ${totalPreviewCount}`
                    : 'Preview'}
                </Text>
              </View>
            </View>

            <View style={styles.simDateRow}>
              <View style={[styles.simDatePill, { backgroundColor: isDark ? '#182229' : 'rgba(255, 255, 255, 0.85)' }]}>
                <Text style={[styles.simDateText, { color: isDark ? '#8696a0' : '#54656f' }]}>HARI INI</Text>
              </View>
            </View>

            <View style={[styles.simBubble, { backgroundColor: isDark ? '#005c4b' : '#d9fdd3' }]}>
              <View style={styles.simBubbleTopRow}>
                <View style={styles.simBubbleEditHint}>
                  <Ionicons name="pencil-outline" size={13} color={isDark ? '#34d399' : '#047857'} />
                  <Text style={[styles.simBubbleEditHintText, { color: isDark ? '#34d399' : '#047857' }]}>
                    {hasAiGenerated
                      ? `Hasil AI Variasi #${activeVarIdx + 1} (Klik teks untuk mengedit)`
                      : totalPreviewCount > 1
                      ? `Pesan #${activeVarIdx + 1} (Klik teks untuk mengedit)`
                      : 'Pesan (Klik teks untuk mengedit)'}
                  </Text>
                </View>
                <Text style={[styles.simBubbleCharText, { color: isDark ? '#34d399' : '#047857' }]}>
                  {`${currentActiveText.length} karakter`}
                </Text>
              </View>

              <TextInput
                multiline
                style={[styles.simBubbleInput, { color: isDark ? '#e9edef' : '#111b21' }]}
                value={currentActiveText}
                onChangeText={handleActiveTextChange}
                placeholder="Ketik pesan WhatsApp di panel kiri atau klik 'Variasikan dengan AI' untuk melihat hasil variasi yang dapat diedit di sini..."
                placeholderTextColor={isDark ? 'rgba(233, 237, 239, 0.5)' : 'rgba(17, 27, 33, 0.5)'}
              />

              <View style={styles.simBubbleFooter}>
                <Text style={[styles.simBubbleTime, { color: isDark ? 'rgba(233, 237, 239, 0.7)' : 'rgba(17, 27, 33, 0.6)' }]}>
                  {currentTimeDisplay}
                </Text>
                <Ionicons name="checkmark-done" size={15} color="#34b7f1" />
              </View>
            </View>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.text }]}>📋 Ringkasan Pengiriman:</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>
                {`${totalPreviewCount} Pesan`}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Penerima:</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>
                {recipientType === 'group'
                  ? (selectedGroupName || 'Grup WhatsApp')
                  : (recipientName ? `${recipientName} (${phone || 'Nomor Personal'})` : (phone || 'Nomor Personal'))}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Jeda Antar Pesan:</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>
                {`${intervalSeconds} detik`}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.bigSendButton, sending && { opacity: 0.7 }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#ffffff" />
                <Text style={styles.bigSendButtonText}>Kirim Pesan dari Preview 🚀</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={contactModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setContactModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Pilih Kontak Tersimpan</Text>
              <TouchableOpacity onPress={() => setContactModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.searchContainer,
                { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong, marginBottom: 10 },
              ]}
            >
              <Ionicons name="search-outline" size={17} color={theme.textFaint} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Cari nama atau nomor..."
                placeholderTextColor={theme.textFaint}
                value={contactSearch}
                onChangeText={(txt) => {
                  setContactSearch(txt);
                  fetchContacts(txt);
                }}
              />
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              <TouchableOpacity
                style={[
                  styles.contactItem,
                  selectedContactId === 'manual' && { backgroundColor: theme.surfaceAlt },
                ]}
                onPress={() => {
                  setSelectedContactId('manual');
                  setContactModalVisible(false);
                }}
              >
                <View style={[styles.contactAvatar, { backgroundColor: COLORS.primarySoft }]}>
                  <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contactName, { color: theme.text }]}>-- Ketik manual di bawah --</Text>
                  <Text style={[styles.contactPhone, { color: theme.textMuted }]}>
                    Masukkan nomor & nama secara mandiri
                  </Text>
                </View>
              </TouchableOpacity>

              {filteredContacts.map((c) => {
                const name = c.name || c.saved_name || c.push_name || c.phone;
                const isSelected = String(selectedContactId) === String(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.contactItem,
                      isSelected && { backgroundColor: theme.surfaceAlt },
                    ]}
                    onPress={() => {
                      setSelectedContactId(c.id);
                      setPhone(c.phone || '');
                      setRecipientName(c.name || c.saved_name || c.push_name || '');
                      setContactModalVisible(false);
                    }}
                  >
                    <View style={[styles.contactAvatar, { backgroundColor: COLORS.emeraldSoft }]}>
                      <Ionicons name="person" size={16} color={COLORS.emerald} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[styles.contactPhone, { color: theme.textMuted }]}>
                        {c.phone}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },
  statusBadgeWrap: {
    flexDirection: 'row',
    marginTop: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
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
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
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
    paddingVertical: 9,
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
    fontSize: 12.5,
    fontWeight: '700',
  },
  fieldHeaderLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  syncBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  syncBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  spinning: {
    transform: [{ rotate: '45deg' }],
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    height: '100%',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  dropdownTriggerText: {
    fontSize: 13.5,
    flex: 1,
  },
  inputWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  charCountText: {
    fontSize: 11.5,
  },
  textInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  messageArea: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  aiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiSubtitleTag: {
    fontSize: 12,
    fontWeight: '600',
  },
  toneListColumn: {
    gap: 8,
    marginTop: 4,
  },
  toneItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  toneIconEmoji: {
    fontSize: 16,
  },
  toneItemText: {
    fontSize: 13,
    fontWeight: '700',
  },
  aiPolishBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  aiPolishBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  repeatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  repeatBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  repeatBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3b82f6',
  },
  presetPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  presetPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetPillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  numberInputContainer: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  numberInput: {
    fontSize: 14.5,
    fontWeight: '700',
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
  previewHeading: {
    fontSize: 16,
    fontWeight: '700',
  },
  previewActionIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiTagBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 2,
  },
  aiTagBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
  },
  previewSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: -4,
  },
  tabsSectionWrap: {
    width: '100%',
    marginTop: 4,
    marginBottom: 4,
  },
  tabsScrollView: {
    width: '100%',
  },
  tabsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  messageTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageTabBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 3,
    borderRadius: 2,
    width: '100%',
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  simulatedScreen: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    paddingBottom: 14,
    width: '100%',
  },
  simulatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  simAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  simHeaderInfo: {
    flex: 1,
  },
  simHeaderName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  simHeaderStatus: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  simBadgePreview: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  simBadgePreviewText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
  },
  simDateRow: {
    alignItems: 'center',
    marginVertical: 10,
  },
  simDatePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simDateText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  simBubble: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    marginRight: 12,
    borderRadius: 10,
    borderTopRightRadius: 2,
    padding: 10,
  },
  simBubbleTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  simBubbleEditHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    flexShrink: 1,
  },
  simBubbleEditHintText: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  simBubbleCharText: {
    fontSize: 11,
    fontWeight: '600',
  },
  simBubbleInput: {
    fontSize: 13.5,
    lineHeight: 19,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  simBubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  simBubbleTime: {
    fontSize: 10.5,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  bigSendButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#059669',
    height: 48,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    width: '100%',
  },
  bigSendButtonText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 12,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactName: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  contactPhone: {
    fontSize: 12,
    marginTop: 2,
  },
});
