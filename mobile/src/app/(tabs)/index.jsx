import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { getTheme, COLORS } from '../../theme';
import apiClient from '../../api/apiClient';
import { formatChatTime } from '../../utils/formatters';
import { getMediaUrl } from '../../utils/mediaUrl';
import { formatDisplayPhone } from '../../utils/phoneFormatter';

export default function ChatsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { onEvent } = useSocket();

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all');
  const [waStatus, setWaStatus] = useState(null);

  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/whatsapp/status');
      if (res.data?.success && res.data.data) {
        setWaStatus(res.data.data);
      }
    } catch (e) {
      setWaStatus({ status: 'DISCONNECTED' });
    }
  }, []);

  const fetchChats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await apiClient.get('/chats');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setChats(res.data.data);
      }
    } catch (e) {
      console.warn('Gagal memuat daftar chat:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSyncChats = async () => {
    setSyncing(true);
    try {
      await apiClient.post('/chats/sync');
      await fetchChats();
      Alert.alert('Sinkronisasi Selesai', 'Daftar obrolan berhasil disinkronkan.');
    } catch (err) {
      Alert.alert('Gagal Sinkronisasi', err.response?.data?.message || err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchWaStatus();
    fetchChats();

    const unsubWa = onEvent('wa_status', (data) => {
      if (data) setWaStatus((prev) => ({ ...(prev || {}), ...data }));
    });

    const unsubChats = onEvent('chats_updated', () => {
      fetchChats();
    });

    const unsubMsg = onEvent('message_new', (payload) => {
      fetchChats();
    });

    return () => {
      unsubWa();
      unsubChats();
      unsubMsg();
    };
  }, [fetchWaStatus, fetchChats, onEvent]);

  const handleTogglePin = async (chat) => {
    try {
      const nextPin = !chat.is_pinned;
      await apiClient.post('/chats/pin', {
        jid: chat.jid,
        isPinned: nextPin,
      });
      setChats((prev) =>
        prev.map((c) => (c.jid === chat.jid ? { ...c, is_pinned: nextPin } : c))
      );
    } catch (e) {
      Alert.alert('Gagal', 'Tidak dapat mengubah status pin');
    }
  };

  const handleToggleArchive = async (chat) => {
    try {
      const nextArchive = !chat.is_archived;
      await apiClient.post('/chats/archive', {
        jid: chat.jid,
        isArchived: nextArchive,
      });
      setChats((prev) =>
        prev.map((c) => (c.jid === chat.jid ? { ...c, is_archived: nextArchive } : c))
      );
    } catch (e) {
      Alert.alert('Gagal', 'Tidak dapat mengarsipkan chat');
    }
  };

  const handleChatLongPress = (chat) => {
    Alert.alert(
      chat.name || formatDisplayPhone(chat.phone) || 'Pilihan Chat',
      'Pilih tindakan:',
      [
        {
          text: chat.is_pinned ? 'Lepas Pin' : 'Sematkan (Pin)',
          onPress: () => handleTogglePin(chat),
        },
        {
          text: chat.is_archived ? 'Buka Arsip' : 'Arsipkan',
          onPress: () => handleToggleArchive(chat),
        },
        { text: 'Batal', style: 'cancel' },
      ]
    );
  };

  const filteredChats = useMemo(() => {
    return chats.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const phoneMatch = (c.phone || '').includes(q);
        const lastMsgText = c.last_message || c.last_message_text || '';
        const snippetMatch = lastMsgText.toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !snippetMatch) return false;
      }

      if (filterTab === 'unread') {
        return (c.unread_count || 0) > 0;
      }
      if (filterTab === 'groups') {
        return !!c.is_group || String(c.jid).includes('@g.us');
      }
      return true;
    });
  }, [chats, searchQuery, filterTab]);

  const isConnected = waStatus?.status === 'CONNECTED';

  const renderChatItem = ({ item }) => {
    const isGroup = item.is_group || String(item.jid).includes('@g.us');
    const title = item.name || formatDisplayPhone(item.phone) || 'Pengguna WhatsApp';
    const avatar = item.avatar_url ? getMediaUrl(item.avatar_url) : null;
    const unread = item.unread_count || 0;
    const isAiActive = !!(item.ai_auto_reply_enabled || item.auto_reply_enabled);
    const rawSnippet = item.last_message || item.last_message_text || '';
    const isLastFromMe = !!(item.last_message_from_me || rawSnippet.startsWith('✓'));
    const displaySnippet = rawSnippet.replace(/^✓\s*/, '') || 'Belum ada pesan';

    return (
      <TouchableOpacity
        style={[styles.chatRow, { borderBottomColor: theme.border }]}
        onPress={() => router.push(`/chat/${encodeURIComponent(item.jid)}`)}
        onLongPress={() => handleChatLongPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                { backgroundColor: isGroup ? '#6366f1' : COLORS.primary },
              ]}
            >
              <Ionicons name={isGroup ? 'people' : 'person'} size={22} color="#ffffff" />
            </View>
          )}
          {item.is_pinned && (
            <View style={styles.pinBadge}>
              <Ionicons name="pin" size={10} color="#ffffff" />
            </View>
          )}
          {isAiActive && (
            <View style={[styles.aiAvatarBadge, item.is_pinned && { top: -2, bottom: 'auto' }]}>
              <Ionicons name="flash" size={9} color="#ffffff" />
            </View>
          )}
        </View>

        <View style={styles.chatContent}>
          <View style={styles.chatHeaderRow}>
            <Text style={[styles.chatTitle, { color: theme.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text
              style={[
                styles.chatTime,
                { color: unread > 0 ? COLORS.emerald : theme.textFaint },
              ]}
            >
              {formatChatTime(item.last_message_time || item.updated_at)}
            </Text>
          </View>

          <View style={styles.chatSnippetRow}>
            <View style={styles.snippetWrap}>
              {isLastFromMe && (
                <Ionicons
                  name="checkmark-done"
                  size={14}
                  color={item.last_message_status === 'READ' ? '#60a5fa' : theme.textFaint}
                  style={{ marginRight: 2 }}
                />
              )}
              <Text
                style={[
                  styles.snippetText,
                  { color: unread > 0 ? theme.text : theme.textMuted },
                  unread > 0 && styles.snippetUnread,
                ]}
                numberOfLines={1}
              >
                {displaySnippet}
              </Text>
            </View>

            <View style={styles.badgeRow}>
              {isAiActive && (
                <View style={[styles.aiPill, { backgroundColor: COLORS.indigoSoft }]}>
                  <Ionicons name="sparkles" size={11} color={COLORS.indigo} />
                  <Text style={[styles.aiPillText, { color: COLORS.indigo }]}>
                    {item.disable_after_one_reply ? 'AI 1x' : 'AI'}
                  </Text>
                </View>
              )}
              {unread > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>WaChat AI</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? COLORS.emerald : COLORS.rose },
              ]}
            />
            <Text style={[styles.statusText, { color: theme.textMuted }]}>
              {isConnected ? 'WhatsApp Terhubung' : 'WhatsApp Terputus'}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: theme.surfaceAlt }]}
            onPress={handleSyncChats}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="sync-outline" size={20} color={theme.text} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: COLORS.primary }]}
            onPress={() => router.push('/new-chat')}
          >
            <Ionicons name="add" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {!isConnected && (
        <TouchableOpacity
          style={styles.disconnectBanner}
          onPress={() => router.push('/(tabs)/whatsapp')}
        >
          <Ionicons name="warning-outline" size={18} color="#991b1b" />
          <Text style={styles.disconnectBannerText}>
            WhatsApp belum terhubung. Ketuk untuk hubungkan nomor Anda.
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#991b1b" />
        </TouchableOpacity>
      )}

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
            placeholder="Cari chat atau nomor..."
            placeholderTextColor={theme.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterPill,
            filterTab === 'all'
              ? { backgroundColor: COLORS.primary }
              : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
          ]}
          onPress={() => setFilterTab('all')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filterTab === 'all' ? '#ffffff' : theme.textMuted },
            ]}
          >
            Semua
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterPill,
            filterTab === 'unread'
              ? { backgroundColor: COLORS.primary }
              : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
          ]}
          onPress={() => setFilterTab('unread')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filterTab === 'unread' ? '#ffffff' : theme.textMuted },
            ]}
          >
            Belum Dibaca
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterPill,
            filterTab === 'groups'
              ? { backgroundColor: COLORS.primary }
              : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
          ]}
          onPress={() => setFilterTab('groups')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filterTab === 'groups' ? '#ffffff' : theme.textMuted },
            ]}
          >
            Grup
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.jid || String(item.id)}
          renderItem={renderChatItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchChats(true)}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.textFaint} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Belum ada obrolan</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                {searchQuery
                  ? 'Tidak ada obrolan yang cocok dengan pencarian Anda.'
                  : 'Sinkronkan chat atau mulai kirim pesan baru.'}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  disconnectBannerText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '600',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chatRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    alignItems: 'center',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.amber,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiAvatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.indigo,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  chatContent: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  chatSnippetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  snippetWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  snippetText: {
    fontSize: 13,
    flex: 1,
  },
  snippetUnread: {
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  aiPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  unreadBadge: {
    backgroundColor: COLORS.emerald,
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
