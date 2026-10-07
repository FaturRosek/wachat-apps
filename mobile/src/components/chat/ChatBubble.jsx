import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getTheme, COLORS } from '../../theme';
import { formatTimeShort, formatFileSize } from '../../utils/formatters';
import { getMediaUrl } from '../../utils/mediaUrl';
import AudioMessagePlayer from './AudioMessagePlayer';
import VideoMessagePlayer from './VideoMessagePlayer';

const SENDER_COLORS = [
  '#f97316',
  '#06b6d4',
  '#8b5cf6',
  '#10b981',
  '#ec4899',
  '#eab308',
  '#3b82f6',
  '#14b8a6',
  '#f43f5e',
  '#84cc16',
];

function getSenderColor(nameOrId) {
  if (!nameOrId) return '#f97316';
  let hash = 0;
  for (let i = 0; i < nameOrId.length; i++) {
    hash = (hash << 5) - hash + nameOrId.charCodeAt(i);
    hash |= 0;
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

export default function ChatBubble({
  message,
  isGroup: isGroupProp,
  onLongPress,
  onPressMedia,
  onPressReplyQuote,
}) {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  const isOutgoing = message.from_me || message.fromMe || message.direction === 'OUTGOING';
  const isDeleted = Boolean(
    message.is_deleted ||
    message.status === 'REVOKED' ||
    message.raw_data?.isDeletedForEveryone === true
  );
  const isEdited = !!message.is_edited;
  const mediaType = message.media_type;
  const mediaUrl = message.media_url;

  const isViewOnce = Boolean(
    mediaType !== 'text' && (
      message.is_view_once ||
      mediaType === 'view_once' ||
      message.raw_data?.isViewOnce ||
      (typeof message.raw_data === 'string' && message.raw_data.includes('"isViewOnce":true')) ||
      (typeof message.content === 'string' && message.content.includes('Sekali Lihat')) ||
      (typeof message.media_caption === 'string' && message.media_caption.includes('Sekali Lihat'))
    )
  );

  const bubbleBg = isOutgoing ? theme.outgoing : theme.incoming;
  const textColor = isOutgoing ? theme.bubbleOutText : theme.bubbleInText;
  const metaColor = isOutgoing ? 'rgba(255, 255, 255, 0.7)' : theme.textFaint;

  let quotedData = null;
  if (message.quoted_message) {
    if (typeof message.quoted_message === 'object') {
      quotedData = message.quoted_message;
    } else if (typeof message.quoted_message === 'string') {
      try {
        quotedData = JSON.parse(message.quoted_message);
      } catch (e) {
        quotedData = null;
      }
    }
  }

  const isSticker = mediaType === 'sticker';
  const isCleanSticker = isSticker && Boolean(mediaUrl) && !quotedData && !isDeleted;

  const isGroup = Boolean(
    isGroupProp ||
    message.is_group ||
    message.remote_jid?.endsWith('@g.us') ||
    message.phone?.endsWith('@g.us')
  );

  const senderName = message.sender_name || message.senderName || message.push_name;
  const senderAvatar = message.sender_avatar || message.senderAvatar || message.raw_data?.senderAvatar;
  const showSenderHeader = isGroup && !isOutgoing && Boolean(senderName && senderName !== 'Saya');

  const quotedSender = message.quoted_orig_sender_name || message.quoted_sender || quotedData?.senderName || quotedData?.senderPhone || (quotedData?.fromMe ? 'Anda' : null);
  const quotedContent = message.quoted_content || quotedData?.content || (quotedData?.mediaType ? `[${quotedData.mediaType}]` : null);
  const quotedId = message.quoted_message_id || quotedData?.messageId || quotedData?.id;

  const renderStatusIcon = () => {
    if (!isOutgoing) return null;
    const status = String(message.status || '').toUpperCase();

    if (status === 'READ') {
      return <Ionicons name="checkmark-done" size={14} color="#60a5fa" />;
    }
    if (status === 'DELIVERED') {
      return <Ionicons name="checkmark-done" size={14} color="rgba(255, 255, 255, 0.7)" />;
    }
    if (status === 'SENT') {
      return <Ionicons name="checkmark" size={14} color="rgba(255, 255, 255, 0.7)" />;
    }
    return <Ionicons name="time-outline" size={13} color="rgba(255, 255, 255, 0.7)" />;
  };

  const renderQuotedMessage = () => {
    if (!quotedContent && !quotedSender) return null;
    const qColor = isOutgoing ? '#ffffff' : getSenderColor(quotedSender);
    return (
      <TouchableOpacity
        style={[
          styles.quotedContainer,
          {
            backgroundColor: isOutgoing ? 'rgba(0, 0, 0, 0.15)' : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)'),
            borderLeftColor: isOutgoing ? '#93c5fd' : qColor,
          },
        ]}
        onPress={() => onPressReplyQuote?.(quotedId ? { whatsapp_message_id: quotedId, id: quotedId, sender_name: quotedSender, content: quotedContent } : message)}
      >
        <Text
          style={[
            styles.quotedSender,
            { color: isOutgoing ? '#ffffff' : qColor },
          ]}
          numberOfLines={1}
        >
          {quotedSender || 'Pesan'}
        </Text>
        <Text
          style={[
            styles.quotedText,
            { color: isOutgoing ? 'rgba(255, 255, 255, 0.85)' : theme.textMuted },
          ]}
          numberOfLines={2}
        >
          {quotedContent || 'Lampiran media'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderMedia = () => {
    if (mediaType === 'text') return null;
    if (!mediaUrl && !isViewOnce && mediaType !== 'sticker') return null;

    if (isViewOnce && !mediaUrl) {
      return (
        <View
          style={[
            styles.viewOnceBox,
            { backgroundColor: isOutgoing ? 'rgba(0, 0, 0, 0.15)' : 'rgba(16, 185, 129, 0.12)' },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.viewOnceContentWrap}
            onPress={() => onPressMedia?.('', 'view_once', message)}
          >
            <View style={styles.viewOnceIconCircle}>
              <Ionicons name="eye-outline" size={18} color={isOutgoing ? '#ffffff' : COLORS.emerald} />
            </View>
            <View style={styles.viewOnceTextCol}>
              <Text style={[styles.viewOnceText, { color: textColor }]} numberOfLines={1}>
                Foto Sekali Lihat
              </Text>
              <Text style={[styles.viewOnceSubtext, { color: metaColor }]} numberOfLines={1}>
                {isOutgoing ? 'Pesan sekali lihat' : 'Ketuk untuk opsi media'}
              </Text>
            </View>
          </TouchableOpacity>
          {!isOutgoing && (
            <TouchableOpacity
              style={styles.viewOnceReplyBtn}
              onPress={() => onPressReplyQuote?.(message)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-undo" size={13} color="#ffffff" />
              <Text style={styles.viewOnceReplyBtnText}>Balas</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    const isVideo =
      mediaType === 'video' ||
      (mediaUrl && String(mediaUrl).toLowerCase().endsWith('.mp4')) ||
      (typeof message.content === 'string' && message.content.toLowerCase().includes('video')) ||
      (typeof message.media_caption === 'string' && message.media_caption.toLowerCase().includes('video'));

    if (isVideo) {
      const fullUrl = getMediaUrl(mediaUrl);
      return (
        <View style={styles.videoWrapContainer}>
          <VideoMessagePlayer videoUrl={mediaUrl} />
          {isViewOnce && (
            <View style={styles.viewOnceBadgeOverlay}>
              <Ionicons name="eye" size={13} color="#ffffff" />
              <Text style={styles.viewOnceBadgeText}>Sekali Lihat</Text>
            </View>
          )}
          <View style={styles.videoTopActions}>
            <TouchableOpacity
              style={styles.videoTopBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => onPressMedia?.(fullUrl, 'video', message)}
            >
              <Ionicons name="expand" size={14} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.videoTopBtn, styles.videoDownloadTopBtn]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => {
                const downloadUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}download=1`;
                Linking.openURL(downloadUrl).catch(() => {});
              }}
            >
              <Ionicons name="download" size={14} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[
              styles.videoDownloadBar,
              { backgroundColor: isOutgoing ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.06)' },
            ]}
            activeOpacity={0.8}
            onPress={() => {
              const downloadUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}download=1`;
              Linking.openURL(downloadUrl).catch(() => {});
            }}
          >
            <Ionicons name="cloud-download-outline" size={15} color={isOutgoing ? '#ffffff' : COLORS.emerald} />
            <Text style={[styles.videoDownloadBarText, { color: isOutgoing ? '#ffffff' : textColor }]}>
              Unduh Video
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (mediaType === 'image' || (isViewOnce && (!mediaType || mediaType === 'view_once' || mediaType === 'image'))) {
      const fullUrl = getMediaUrl(mediaUrl);
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onPressMedia?.(fullUrl, 'image', message)}
          style={styles.imageContainer}
        >
          <Image source={{ uri: fullUrl }} style={styles.image} resizeMode="cover" />
          {isViewOnce && (
            <View style={styles.viewOnceBadgeOverlay}>
              <Ionicons name="eye" size={13} color="#ffffff" />
              <Text style={styles.viewOnceBadgeText}>Sekali Lihat</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.downloadBubbleBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation();
              const downloadUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}download=1`;
              Linking.openURL(downloadUrl).catch(() => {});
            }}
          >
            <Ionicons name="download" size={14} color="#ffffff" />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    if (mediaType === 'voice' || mediaType === 'audio') {
      return (
        <AudioMessagePlayer
          audioUrl={mediaUrl}
          isOutgoing={isOutgoing}
          duration={message.media_duration || message.raw_data?.duration || message.raw_data?.seconds}
        />
      );
    }

    if (mediaType === 'document' || mediaType === 'file') {
      const fullUrl = getMediaUrl(mediaUrl);
      return (
        <TouchableOpacity
          style={[
            styles.documentBox,
            { backgroundColor: isOutgoing ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.04)' },
          ]}
          onPress={() => Linking.openURL(fullUrl).catch(() => {})}
        >
          <Ionicons name="document-text" size={28} color={isOutgoing ? '#ffffff' : COLORS.primary} />
          <View style={styles.docInfo}>
            <Text style={[styles.docName, { color: textColor }]} numberOfLines={1}>
              {message.media_filename || 'Dokumen'}
            </Text>
            {message.media_size && (
              <Text style={[styles.docSize, { color: metaColor }]}>
                {formatFileSize(message.media_size)}
              </Text>
            )}
          </View>
          <Ionicons name="download-outline" size={20} color={metaColor} />
        </TouchableOpacity>
      );
    }

    if (mediaType === 'sticker') {
      const fullUrl = getMediaUrl(mediaUrl);
      return (
        <View style={styles.stickerContainer}>
          {mediaUrl ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onPressMedia?.(fullUrl, 'sticker', message)}
            >
              <Image
                source={{ uri: fullUrl }}
                style={styles.stickerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.stickerFallback,
                { backgroundColor: isOutgoing ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.05)' },
              ]}
              onPress={() => onPressMedia?.(null, 'sticker', message)}
            >
              <Ionicons name="happy-outline" size={36} color={textColor} />
              <Text style={[styles.stickerFallbackText, { color: textColor }]}>
                🎨 Stiker
              </Text>
              <Text style={[styles.stickerFallbackSubtext, { color: metaColor }]}>
                Ketuk untuk unduh
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return null;
  };

  const renderSenderName = () => {
    if (!showSenderHeader) return null;
    const senderColor = getSenderColor(senderName);
    return (
      <View style={styles.senderHeader}>
        <Text style={[styles.senderNameText, { color: senderColor }]} numberOfLines={1}>
          {senderName}
        </Text>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.rowWrap,
        isOutgoing ? styles.rowOutgoing : styles.rowIncoming,
      ]}
    >
      {isGroup && !isOutgoing && (
        <View style={styles.groupAvatarCol}>
          {senderAvatar ? (
            <Image
              source={{ uri: getMediaUrl(senderAvatar) }}
              style={styles.groupAvatar}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.groupAvatarFallback,
                { backgroundColor: getSenderColor(senderName) },
              ]}
            >
              <Text style={styles.groupAvatarInitial}>
                {senderName ? senderName.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress?.(message)}
        style={[
          styles.bubble,
          {
            backgroundColor: isCleanSticker ? 'transparent' : bubbleBg,
            borderColor: (isCleanSticker || isOutgoing) ? 'transparent' : theme.incomingBorder,
            borderWidth: isCleanSticker ? 0 : 0.5,
            shadowOpacity: isCleanSticker ? 0 : 0.1,
            elevation: isCleanSticker ? 0 : 1,
            paddingHorizontal: isCleanSticker ? 2 : 10,
            paddingTop: isCleanSticker ? 2 : 7,
            paddingBottom: isCleanSticker ? 2 : 5,
          },
          isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
          isGroup && !isOutgoing && { maxWidth: '78%' },
          isCleanSticker && { borderRadius: 0 },
        ]}
      >
        {renderSenderName()}

        {renderQuotedMessage()}

        {renderMedia()}

        {isDeleted && (
          <View
            style={[
              styles.deletedBadge,
              {
                backgroundColor: isOutgoing ? 'rgba(0, 0, 0, 0.18)' : (isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2'),
                borderColor: isOutgoing ? 'rgba(255, 255, 255, 0.25)' : (isDark ? 'rgba(239, 68, 68, 0.35)' : '#fca5a5'),
              },
            ]}
          >
            <Ionicons
              name="ban-outline"
              size={12}
              color={isOutgoing ? '#fecaca' : '#dc2626'}
            />
            <Text
              style={[
                styles.deletedBadgeText,
                { color: isOutgoing ? '#fee2e2' : (isDark ? '#f87171' : '#b91c1c') },
              ]}
            >
              Pesan ini telah dihapus oleh pengirim
            </Text>
          </View>
        )}

        {!!message.content && !(mediaType === 'sticker' && (mediaUrl || message.content.includes('Stiker'))) && (
          <Text style={[styles.messageText, { color: textColor }]}>
            {message.content}
          </Text>
        )}

        <View style={[styles.footer, isCleanSticker && styles.stickerFooterPill]}>
          {isDeleted && (
            <View style={styles.deletedFooterBadge}>
              <Ionicons
                name="ban-outline"
                size={10}
                color={isOutgoing ? 'rgba(255, 255, 255, 0.85)' : (isDark ? '#f87171' : '#dc2626')}
              />
              <Text
                style={[
                  styles.deletedFooterText,
                  { color: isOutgoing ? 'rgba(255, 255, 255, 0.85)' : (isDark ? '#f87171' : '#dc2626') },
                ]}
              >
                dihapus
              </Text>
            </View>
          )}
          {isEdited && !isDeleted && (
            <Text style={[styles.editedText, { color: isCleanSticker ? '#ffffff' : metaColor }]}>diedit</Text>
          )}
          <Text style={[styles.timeText, { color: isCleanSticker ? 'rgba(255, 255, 255, 0.95)' : metaColor }]}>
            {formatTimeShort(message.timestamp || message.created_at)}
          </Text>
          {renderStatusIcon()}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    marginVertical: 3,
    paddingHorizontal: 12,
    flexDirection: 'row',
  },
  rowOutgoing: {
    justifyContent: 'flex-end',
  },
  rowIncoming: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    minWidth: 70,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 5,
    borderWidth: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  bubbleOutgoing: {
    borderTopRightRadius: 2,
    alignSelf: 'flex-end',
  },
  bubbleIncoming: {
    borderTopLeftRadius: 2,
    alignSelf: 'flex-start',
  },
  quotedContainer: {
    padding: 8,
    borderRadius: 8,
    borderLeftWidth: 3.5,
    marginBottom: 6,
    minWidth: 130,
    maxWidth: '100%',
  },
  quotedSender: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  quotedText: {
    fontSize: 12,
  },
  imageContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    width: 240,
    height: 180,
    marginBottom: 4,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  documentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 10,
    marginVertical: 4,
    minWidth: 200,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 13,
    fontWeight: '600',
  },
  docSize: {
    fontSize: 11,
    marginTop: 2,
  },
  viewOnceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    width: 240,
    maxWidth: '100%',
  },
  viewOnceContentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexShrink: 1,
  },
  viewOnceIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewOnceTextCol: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center',
  },
  viewOnceReplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 4,
  },
  viewOnceReplyBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  viewOnceText: {
    fontSize: 13,
    fontWeight: '700',
  },
  viewOnceSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  viewOnceBadgeOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.92)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    zIndex: 10,
  },
  viewOnceBadgeText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '700',
  },
  downloadBubbleBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  videoWrapContainer: {
    position: 'relative',
    marginVertical: 4,
  },
  videoTopActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 10,
  },
  videoTopBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoDownloadTopBtn: {
    backgroundColor: '#059669',
  },
  videoDownloadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 4,
    maxWidth: 260,
  },
  videoDownloadBarText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  messageText: {
    fontSize: 14.5,
    lineHeight: 20,
    marginBottom: 2,
  },
  deletedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  deletedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deletedFooterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginRight: 2,
  },
  deletedFooterText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  editedText: {
    fontSize: 10,
    fontStyle: 'italic',
    marginRight: 2,
  },
  timeText: {
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
  },
  stickerContainer: {
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerImage: {
    width: 145,
    height: 145,
  },
  stickerFallback: {
    width: 140,
    height: 100,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  stickerFallbackText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  stickerFallbackSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  stickerFooterPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-end',
    marginTop: -22,
    marginRight: 4,
  },
  groupAvatarCol: {
    marginRight: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  groupAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  groupAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarInitial: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  senderHeader: {
    marginBottom: 3,
    paddingHorizontal: 1,
  },
  senderNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
