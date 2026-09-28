import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { getTheme, COLORS } from '../theme';
import apiClient from '../api/apiClient';
import { formatPhoneNumber, formatDisplayPhone } from '../utils/phoneFormatter';
import { getMediaUrl } from '../utils/mediaUrl';

export default function NewChatScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  const [phoneInput, setPhoneInput] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchContact, setSearchContact] = useState('');

  const fetchContacts = async () => {
    try {
      const res = await apiClient.get('/contacts?limit=300');
      const list = res.data?.data?.contacts || res.data?.data || [];
      const personalOnly = list.filter(
        (c) =>
          !c.is_group &&
          !String(c.phone || '').includes('@g.us') &&
          !String(c.jid || '').includes('@g.us')
      );
      setContacts(personalOnly);
    } catch (e) {
      console.warn('Gagal memuat kontak:', e.message);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleSyncContacts = async () => {
    setSyncing(true);
    try {
      const res = await apiClient.post('/contacts/sync?type=personal&limit=500');
      const list = res.data?.data?.contacts || [];
      if (list.length > 0) setContacts(list);
      else await fetchContacts();
      Alert.alert('Sukses', 'Kontak berhasil diperbarui.');
    } catch (e) {
      await fetchContacts();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleStartChatWithPhone = () => {
    const formatted = formatPhoneNumber(phoneInput);
    if (!formatted.isValid) {
      Alert.alert('Perhatian', formatted.error || 'Nomor WhatsApp tidak valid');
      return;
    }
    const targetJid = `${formatted.formattedPhone}@s.whatsapp.net`;
    router.replace(`/chat/${encodeURIComponent(targetJid)}`);
  };

  const handleSelectContact = (contact) => {
    const jid = contact.jid || `${contact.phone}@s.whatsapp.net`;
    router.replace(`/chat/${encodeURIComponent(jid)}`);
  };

  const filteredContacts = contacts.filter((c) => {
    if (!searchContact.trim()) return true;
    const q = searchContact.toLowerCase();
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const pushMatch = (c.push_name || '').toLowerCase().includes(q);
    const phoneMatch = (c.phone || '').includes(q);
    return nameMatch || pushMatch || phoneMatch;
  });

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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Obrolan Baru</Text>

        <TouchableOpacity
          style={[styles.syncBtn, { backgroundColor: theme.surfaceAlt }]}
          onPress={handleSyncContacts}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={theme.text} />
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.directInputCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Ketik Nomor Langsung</Text>
        <View
          style={[
            styles.phoneInputWrap,
            { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
          ]}
        >
          <Ionicons name="call-outline" size={18} color={theme.textFaint} />
          <TextInput
            style={[styles.phoneInput, { color: theme.text }]}
            placeholder="08123456789 atau 628123456789"
            placeholderTextColor={theme.textFaint}
            value={phoneInput}
            onChangeText={setPhoneInput}
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity
          style={[styles.startBtn, !phoneInput.trim() && { opacity: 0.6 }]}
          onPress={handleStartChatWithPhone}
          disabled={!phoneInput.trim()}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#ffffff" />
          <Text style={styles.startBtnText}>Buka Obrolan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <View
          style={[
            styles.searchWrap,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={theme.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Cari kontak tersimpan..."
            placeholderTextColor={theme.textFaint}
            value={searchContact}
            onChangeText={setSearchContact}
          />
        </View>
      </View>

      {loadingContacts ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>
            Memuat buku kontak...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={(item) => item.jid || item.phone || String(item.id)}
          renderItem={({ item }) => {
            const avatar = item.avatar_url ? getMediaUrl(item.avatar_url) : null;
            const name = item.name || item.push_name || formatDisplayPhone(item.phone);

            return (
              <TouchableOpacity
                style={[styles.contactRow, { borderBottomColor: theme.border }]}
                onPress={() => handleSelectContact(item)}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons name="person" size={20} color="#ffffff" />
                  </View>
                )}

                <View style={styles.contactInfo}>
                  <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.contactPhone, { color: theme.textMuted }]}>
                    {formatDisplayPhone(item.phone)}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Ionicons name="people-outline" size={48} color={theme.textFaint} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {searchContact ? 'Tidak ada kontak yang cocok' : 'Belum ada kontak tersimpan'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                Ketik nomor di atas atau tekan tombol sinkronkan kontak.
              </Text>
            </View>
          }
        />
      )}
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
  syncBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directInputCard: {
    margin: 16,
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
    fontSize: 14,
    fontWeight: '700',
  },
  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  startBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    height: 44,
    borderRadius: 10,
  },
  startBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: '100%',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
  },
  contactPhone: {
    fontSize: 12,
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 40,
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
});
