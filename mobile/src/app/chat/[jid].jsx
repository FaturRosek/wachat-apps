import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { getTheme, COLORS } from '../../theme';
import apiClient from '../../api/apiClient';
import { getMediaUrl } from '../../utils/mediaUrl';
import { formatDisplayPhone } from '../../utils/phoneFormatter';

import ChatBubble from '../../components/chat/ChatBubble';
import MessageActionModal from '../../components/chat/MessageActionModal';
import AttachmentSheetModal from '../../components/chat/AttachmentSheetModal';
import VoiceRecorderBar from '../../components/chat/VoiceRecorderBar';
import AiSuggestionsBar from '../../components/chat/AiSuggestionsBar';
import MediaViewerModal from '../../components/chat/MediaViewerModal';

export default function ChatConversationScreen() {
  const router = useRouter();
  const { jid } = useLocalSearchParams();
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const { socket, onEvent, emitEvent } = useSocket();

  const decodedJid = jid ? decodeURIComponent(jid) : '';

  const [chatInfo, setChatInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [aiAutoReply, setAiAutoReply] = useState(false);
  const [rewriting, setRewriting] = useState(false);

  const [selectedMessageForAction, setSelectedMessageForAction] = useState(null);
  const [replyingMessage, setReplyingMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  const flatListRef = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    if (!decodedJid) return;

    emitEvent('join_chat', { jid: decodedJid });

    async function loadData() {
      try {
        const [msgRes, chatListRes] = await Promise.all([
          apiClient.get(`/chats/${encodeURIComponent(decodedJid)}/messages`),
          apiClient.get('/chats'),
        ]);

        const rawMsgData = msgRes.data?.data;
        const msgList = Array.isArray(rawMsgData)
          ? rawMsgData
          : (Array.isArray(rawMsgData?.messages)
            ? rawMsgData.messages
            : (Array.isArray(msgRes.data?.messages) ? msgRes.data.messages : []));

        setMessages(msgList);

        if (rawMsgData?.contact) {
          setChatInfo(rawMsgData.contact);
        }
        if (rawMsgData?.aiSetting) {
          setAiAutoReply(!!rawMsgData.aiSetting.auto_reply_enabled);
        }

        if (chatListRes.data?.success && Array.isArray(chatListRes.data.data)) {
          const found = chatListRes.data.data.find(
            (c) => c.jid === decodedJid || (decodedJid.includes('@') && c.jid?.includes(decodedJid.split('@')[0]))
          );
          if (found) {
            setChatInfo((prev) => ({ ...found, ...(prev || {}) }));
            setAiAutoReply(!!found.ai_auto_reply_enabled);
          }
        }
      } catch (e) {
        console.warn('Gagal memuat pesan:', e.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    return () => {
      emitEvent('leave_chat', { jid: decodedJid });
    };
  }, [decodedJid]);

  const fetchSmartSuggestions = useCallback(async () => {
    if (!decodedJid) return;
    setLoadingSuggestions(true);
    try {
      const res = await apiClient.post('/chats/ai/smart-suggestions', {
        jid: decodedJid,
      });
      const list = res.data?.data?.suggestions || res.data?.data || [];
      if (Array.isArray(list)) setAiSuggestions(list);
    } catch (e) {
    } finally {
      setLoadingSuggestions(false);
    }
  }, [decodedJid]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      fetchSmartSuggestions();
    }
  }, [loading, messages.length]);

  useEffect(() => {
    if (!decodedJid) return;

    const unsubMsgNew = onEvent('message_new', (payload) => {
      const msg = payload?.message;
      const remoteJid = payload?.remoteJid || msg?.remote_jid;
      const isMatch = remoteJid === decodedJid || (decodedJid.includes('@') && remoteJid?.includes(decodedJid.split('@')[0]));
      if (isMatch && msg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id || (m.message_id && m.message_id === msg.message_id) || (m.whatsapp_message_id && m.whatsapp_message_id === msg.whatsapp_message_id))) {
            return prev;
          }
          return [...prev, msg];
        });
      }
    });

    const unsubMsgEdited = onEvent('message_edited', (payload) => {
      const msg = payload?.message;
      if (msg) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id || m.whatsapp_message_id === msg.whatsapp_message_id ? { ...m, ...msg } : m))
        );
      }
    });

    const unsubMsgRevoked = onEvent('message_revoked', (payload) => {
      const id = payload?.messageId || payload?.id;
      if (id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id || m.whatsapp_message_id === id
              ? { ...m, is_deleted: true, content: 'Pesan ini telah dihapus' }
              : m
          )
        );
      }
    });

    const unsubMsgDeletedForMe = onEvent('message_deleted_for_me', (payload) => {
      const id = payload?.messageId || payload?.id;
      if (id) {
        setMessages((prev) => prev.filter((m) => m.id !== id && m.whatsapp_message_id !== id));
      }
    });

    const unsubPresence = onEvent('presence_update', (payload) => {
      if (payload?.jid === decodedJid) {
        setIsTyping(!!payload?.isTyping);
        if (payload?.isTyping) {
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setIsTyping(false), 5000);
        }
      }
    });

    return () => {
      unsubMsgNew();
      unsubMsgEdited();
      unsubMsgRevoked();
      unsubMsgDeletedForMe();
      unsubPresence();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [decodedJid, onEvent]);

  const handleSendMessage = async () => {
    const textToSend = inputText.trim();
    if (!textToSend && !editingMessage) return;

    setSending(true);

    if (editingMessage) {
      try {
        await apiClient.post('/chats/messages/edit', {
          messageId: editingMessage.id,
          newText: textToSend,
          jid: decodedJid,
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === editingMessage.id ? { ...m, content: textToSend, is_edited: true } : m))
        );

        setEditingMessage(null);
        setInputText('');
      } catch (err) {
        Alert.alert('Gagal Mengedit', err.response?.data?.message || 'Tidak dapat mengedit pesan.');
      } finally {
        setSending(false);
      }
      return;
    }

    try {
      const payload = {
        jid: decodedJid,
        message: textToSend,
        quotedMessageId: replyingMessage?.whatsapp_message_id || replyingMessage?.id,
      };

      const res = await apiClient.post('/chats/send', payload);
      const newMsg = res.data?.data?.message;

      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
      }

      setInputText('');
      setReplyingMessage(null);
    } catch (err) {
      Alert.alert('Gagal Mengirim', err.response?.data?.message || 'Tidak dapat mengirim pesan.');
    } finally {
      setSending(false);
    }
  };

  const handleSendMedia = async ({ uri, name, type, isViewOnce }) => {
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('jid', decodedJid);
      formData.append('file', {
        uri,
        name: name || 'upload.jpg',
        type: type || 'image/jpeg',
      });
      if (isViewOnce) {
        formData.append('isViewOnce', 'true');
      }
      if (replyingMessage) {
        formData.append(
          'quotedMessageId',
          replyingMessage.whatsapp_message_id || replyingMessage.id
        );
      }

      const res = await apiClient.post('/chats/send-media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newMsg = res.data?.data?.message;
      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
      }
      setReplyingMessage(null);
    } catch (err) {
      Alert.alert('Gagal Mengunggah', err.response?.data?.message || 'Gagal mengirim file media.');
    } finally {
      setSending(false);
    }
  };

  const handleSendVoiceNote = async ({ uri, duration, name, type }) => {
    setSending(true);
    setIsRecordingVoice(false);
    try {
      const formData = new FormData();
      formData.append('jid', decodedJid);
      formData.append('audio', {
        uri,
        name: name || 'voice.m4a',
        type: type || 'audio/m4a',
      });
      if (duration) formData.append('duration', String(duration));

      const res = await apiClient.post('/chats/send-voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newMsg = res.data?.data?.message;
      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
      }
    } catch (err) {
      Alert.alert('Gagal Mengirim', err.response?.data?.message || 'Gagal mengirim pesan suara.');
    } finally {
      setSending(false);
    }
  };

  const handleAiRewrite = async () => {
    if (!inputText.trim()) {
      Alert.alert('Perhatian', 'Ketik draf pesan terlebih dahulu untuk di-rewrite AI.');
      return;
    }

    setRewriting(true);
    try {
      const res = await apiClient.post('/chats/ai/rewrite', {
        text: inputText.trim(),
        tone: 'polite',
      });
      const rewritten = res.data?.data?.rewritten;
      if (rewritten) {
        setInputText(rewritten);
      }
    } catch (err) {
      Alert.alert('Gagal', 'AI rewrite gagal diproses.');
    } finally {
      setRewriting(false);
    }
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    setSummaryModalVisible(true);
    setSummaryText('');
    try {
      const res = await apiClient.post('/chats/ai/summarize', {
        jid: decodedJid,
      });
      const summary = res.data?.data?.summary || 'Tidak ada ringkasan obrolan.';
      setSummaryText(summary);
    } catch (err) {
      setSummaryText('Gagal membuat ringkasan obrolan.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleReplyMessage = (msg) => {
    setReplyingMessage(msg);
    setEditingMessage(null);
  };

  const handleEditMessage = (msg) => {
    setEditingMessage(msg);
    setInputText(msg.content || '');
    setReplyingMessage(null);
  };

  const handleDeleteForMe = async (msg) => {
    try {
      await apiClient.post('/chats/messages/delete-for-me', {
        messageId: msg.id,
      });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (err) {
      Alert.alert('Gagal', 'Tidak dapat menghapus pesan.');
    }
  };

  const handleDeleteForEveryone = async (msg) => {
    try {
      await apiClient.post('/chats/messages/delete-for-everyone', {
        messageId: msg.id,
        jid: decodedJid,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, is_deleted: true, content: 'Pesan ini telah dihapus' }
            : m
        )
      );
    } catch (err) {
      Alert.alert('Gagal', err.response?.data?.message || 'Tidak dapat menghapus untuk semua orang.');
    }
  };

  const handleRequestMissingMedia = async (msg) => {
    const targetMsgId = msg?.message_id || msg?.whatsapp_message_id;
    if (!targetMsgId) return;
    try {
      await apiClient.post(`/chats/request-media/${encodeURIComponent(targetMsgId)}`, {
        remoteJid: decodedJid,
      });
      Alert.alert('Permintaan Terkirim', 'Sedang meminta server mengunduh ulang media dari WhatsApp.');
    } catch (e) {
      Alert.alert('Info', 'Permintaan telah dikirim ke antrean sinkronisasi.');
    }
  };

  const isGroup = decodedJid.includes('@g.us');
  const title = chatInfo?.name || formatDisplayPhone(chatInfo?.phone) || 'Obrolan WhatsApp';
  const avatar = chatInfo?.avatar_url ? getMediaUrl(chatInfo.avatar_url) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.chatBackground }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.headerAvatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                { backgroundColor: isGroup ? '#6366f1' : COLORS.primary },
              ]}
            >
              <Ionicons name={isGroup ? 'people' : 'person'} size={20} color="#ffffff" />
            </View>
          )}
        </View>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text
            style={[
              styles.headerSubtitle,
              { color: isTyping ? COLORS.emerald : theme.textMuted },
            ]}
            numberOfLines={1}
          >
            {isTyping ? 'sedang mengetik...' : isGroup ? 'Grup WhatsApp' : 'online'}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={[
              styles.aiIndicatorBtn,
              { backgroundColor: aiAutoReply ? COLORS.indigoSoft : theme.surfaceAlt },
            ]}
            onPress={() => router.push(`/chat/ai-settings?jid=${encodeURIComponent(decodedJid)}`)}
          >
            <Ionicons
              name="sparkles"
              size={16}
              color={aiAutoReply ? COLORS.indigo : theme.textMuted}
            />
            {aiAutoReply && <View style={styles.aiActiveDot} />}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        style={{ flex: 1 }}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => String(item.id || item.whatsapp_message_id || Math.random())}
            renderItem={({ item }) => (
              <ChatBubble
                message={item}
                onLongPress={(msg) => setSelectedMessageForAction(msg)}
                onPressMedia={(url, type, msg) => {
                  const targetMsg = msg || item;
                  setSelectedMedia({
                    url: url || targetMsg.media_url,
                    type: type || targetMsg.media_type,
                    message: targetMsg,
                    isViewOnce: Boolean(
                      targetMsg.is_view_once ||
                      targetMsg.media_type === 'view_once' ||
                      targetMsg.raw_data?.isViewOnce ||
                      (typeof targetMsg.content === 'string' && targetMsg.content.includes('Sekali Lihat')) ||
                      (typeof targetMsg.media_caption === 'string' && targetMsg.media_caption.includes('Sekali Lihat'))
                    ),
                  });
                }}
              />
            )}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <AiSuggestionsBar
          suggestions={aiSuggestions}
          loading={loadingSuggestions}
          onSelectSuggestion={(sug) => setInputText(sug)}
          onRequestSummarize={handleSummarize}
        />

        {replyingMessage && (
          <View style={[styles.replyBanner, { backgroundColor: theme.surfaceAlt, borderTopColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replySender, { color: COLORS.primary }]}>
                Membalas {replyingMessage.sender_name || 'Pesan'}
              </Text>
              <Text style={[styles.replyContent, { color: theme.textMuted }]} numberOfLines={1}>
                {replyingMessage.content || 'Lampiran media'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingMessage(null)}>
              <Ionicons name="close-circle" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {editingMessage && (
          <View style={[styles.replyBanner, { backgroundColor: '#fef3c7', borderTopColor: '#fde68a' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.amber }}>
                Mengedit pesan
              </Text>
              <Text style={{ fontSize: 12, color: '#78350f' }} numberOfLines={1}>
                {editingMessage.content}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setEditingMessage(null);
                setInputText('');
              }}
            >
              <Ionicons name="close-circle" size={20} color="#78350f" />
            </TouchableOpacity>
          </View>
        )}

        {isRecordingVoice ? (
          <VoiceRecorderBar
            onCancel={() => setIsRecordingVoice(false)}
            onSendVoice={handleSendVoiceNote}
          />
        ) : (
          <View
            style={[
              styles.inputBar,
              { backgroundColor: theme.surface, borderTopColor: theme.border },
            ]}
          >
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setAttachmentSheetOpen(true)}
            >
              <Ionicons name="add" size={24} color={COLORS.primary} />
            </TouchableOpacity>

            <View
              style={[
                styles.textInputWrap,
                { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong },
              ]}
            >
              <TextInput
                style={[styles.inputField, { color: theme.text }]}
                placeholder="Ketik pesan..."
                placeholderTextColor={theme.textFaint}
                multiline
                value={inputText}
                onChangeText={setInputText}
              />

              {inputText.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.rewriteBtn}
                  onPress={handleAiRewrite}
                  disabled={rewriting}
                >
                  {rewriting ? (
                    <ActivityIndicator size="small" color={COLORS.indigo} />
                  ) : (
                    <Ionicons name="sparkles" size={17} color={COLORS.indigo} />
                  )}
                </TouchableOpacity>
              )}
            </View>

            {inputText.trim().length > 0 || editingMessage ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
                onPress={handleSendMessage}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="send" size={17} color="#ffffff" />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.emerald }]}
                onPress={() => setIsRecordingVoice(true)}
              >
                <Ionicons name="mic" size={19} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      <MessageActionModal
        visible={!!selectedMessageForAction}
        message={selectedMessageForAction}
        onClose={() => setSelectedMessageForAction(null)}
        onReply={handleReplyMessage}
        onEdit={handleEditMessage}
        onDeleteForMe={handleDeleteForMe}
        onDeleteForEveryone={handleDeleteForEveryone}
      />

      <MediaViewerModal
        visible={!!selectedMedia}
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
        onRequestMedia={handleRequestMissingMedia}
      />

      <AttachmentSheetModal
        visible={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
        onFileSelected={handleSendMedia}
      />

      <Modal visible={summaryModalVisible} transparent animationType="fade">
        <View style={[styles.summaryBackdrop, { backgroundColor: theme.overlay }]}>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.summaryHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={20} color={COLORS.indigo} />
                <Text style={[styles.summaryTitle, { color: theme.text }]}>Ringkasan Obrolan</Text>
              </View>
              <TouchableOpacity onPress={() => setSummaryModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {summarizing ? (
              <View style={styles.summaryLoading}>
                <ActivityIndicator size="large" color={COLORS.indigo} />
                <Text style={[styles.summaryLoadingText, { color: theme.textMuted }]}>
                  AI sedang menganalisis obrolan...
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.summaryScroll}>
                <Text style={[styles.summaryBody, { color: theme.text }]}>{summaryText}</Text>
              </ScrollView>
            )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backBtn: {
    padding: 4,
    marginRight: 6,
  },
  headerAvatarWrap: {
    marginRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiIndicatorBtn: {
    position: 'relative',
    padding: 8,
    borderRadius: 20,
  },
  aiActiveDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.emerald,
  },
  messagesContent: {
    paddingVertical: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 10,
  },
  replySender: {
    fontSize: 11,
    fontWeight: '700',
  },
  replyContent: {
    fontSize: 12,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  textInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 40,
    maxHeight: 110,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    paddingTop: 8,
    paddingBottom: 8,
  },
  rewriteBtn: {
    padding: 6,
  },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    marginBottom: 1,
  },
  summaryBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  summaryCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  summaryLoading: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  summaryLoadingText: {
    fontSize: 13,
  },
  summaryScroll: {
    maxHeight: 320,
  },
  summaryBody: {
    fontSize: 14,
    lineHeight: 22,
  },
});
