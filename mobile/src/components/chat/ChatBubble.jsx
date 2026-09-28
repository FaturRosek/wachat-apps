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

export default function ChatBubble({
  message,
  onLongPress,
  onPressMedia,
  onPressReplyQuote,
}) {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  const isOutgoing = message.from_me || message.fromMe || message.direction === 'OUTGOING';
  const isDeleted = !!message.is_deleted;
  const isEdited = !!message.is_edited;
  const isViewOnce = !!message.is_view_once;
  const mediaType = message.media_type;
  const mediaUrl = message.media_url;

  const bubbleBg = isOutgoing ? theme.outgoing : theme.incoming;
  const textColor = isOutgoing ? theme.bubbleOutText : theme.bubbleInText;
  const metaColor = isOutgoing ? 'rgba(255, 255, 255, 0.7)' : theme.textFaint;

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
    if (!message.quoted_content && !message.quoted_sender) return null;
    return (
      <TouchableOpacity
        style={[
          styles.quotedContainer,
          {
            backgroundColor: isOutgoing ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.05)',
            borderLeftColor: isOutgoing ? '#93c5fd' : COLORS.primary,
          },
        ]}
        onPress={() => onPressReplyQuote?.(message.quoted_message_id)}
      >
        <Text
          style={[
            styles.quotedSender,
            { color: isOutgoing ? '#ffffff' : COLORS.primary },
          ]}
          numberOfLines={1}
        >
          {message.quoted_sender || 'Pesan'}
        </Text>
        <Text
          style={[
            styles.quotedText,
            { color: isOutgoing ? 'rgba(255, 255, 255, 0.85)' : theme.textMuted },
          ]}
          numberOfLines={2}
        >
          {message.quoted_content || 'Lampiran media'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderMedia = () => {
    if (!mediaUrl && !isViewOnce) return null;

    if (isViewOnce) {
      return (
        <View style={styles.viewOnceBox}>
          <Ionicons name="eye-off-outline" size={20} color={isOutgoing ? '#ffffff' : COLORS.emerald} />
          <Text style={[styles.viewOnceText, { color: textColor }]}>
            Foto/Video Sekali Lihat
          </Text>
        </View>
      );
    }

    if (mediaType === 'image') {
      const fullUrl = getMediaUrl(mediaUrl);
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onPressMedia?.(fullUrl, 'image')}
          style={styles.imageContainer}
        >
          <Image source={{ uri: fullUrl }} style={styles.image} resizeMode="cover" />
        </TouchableOpacity>
      );
    }

    if (mediaType === 'video') {
      return <VideoMessagePlayer videoUrl={mediaUrl} />;
    }

    if (mediaType === 'voice' || mediaType === 'audio') {
      return (
        <AudioMessagePlayer
          audioUrl={mediaUrl}
          isOutgoing={isOutgoing}
          duration={message.media_duration}
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

    return null;
  };

  return (
    <View
      style={[
        styles.rowWrap,
        isOutgoing ? styles.rowOutgoing : styles.rowIncoming,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress?.(message)}
        style={[
          styles.bubble,
          {
            backgroundColor: bubbleBg,
            borderColor: isOutgoing ? 'transparent' : theme.incomingBorder,
          },
          isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
        ]}
      >
        {renderQuotedMessage()}

        {renderMedia()}

        {isDeleted ? (
          <View style={styles.deletedWrap}>
            <Ionicons name="ban-outline" size={14} color={metaColor} />
            <Text style={[styles.deletedText, { color: metaColor }]}>
              Pesan ini telah dihapus
            </Text>
          </View>
        ) : (
          !!message.content && (
            <Text style={[styles.messageText, { color: textColor }]}>
              {message.content}
            </Text>
          )
        )}

        <View style={styles.footer}>
          {isEdited && !isDeleted && (
            <Text style={[styles.editedText, { color: metaColor }]}>diedit</Text>
          )}
          <Text style={[styles.timeText, { color: metaColor }]}>
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
  },
  bubbleIncoming: {
    borderTopLeftRadius: 2,
  },
  quotedContainer: {
    padding: 8,
    borderRadius: 8,
    borderLeftWidth: 3.5,
    marginBottom: 6,
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
    padding: 8,
    borderRadius: 8,
    marginVertical: 2,
  },
  viewOnceText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  messageText: {
    fontSize: 14.5,
    lineHeight: 20,
    marginBottom: 2,
  },
  deletedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  deletedText: {
    fontSize: 13,
    fontStyle: 'italic',
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
});
