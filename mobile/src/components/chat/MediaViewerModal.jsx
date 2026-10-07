import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { getMediaUrl } from '../../utils/mediaUrl';
import { formatTimeShort, formatFileSize } from '../../utils/formatters';
import VideoMessagePlayer from './VideoMessagePlayer';

export default function MediaViewerModal({
  visible,
  media,
  onClose,
  onRequestMedia,
  onReply,
}) {
  if (!visible || !media) return null;

  const rawUrl = media.url || media.media_url || media.mediaUrl;
  const fullUrl = getMediaUrl(rawUrl);
  const isVideo =
    media.type === 'video' ||
    media.media_type === 'video' ||
    media.message?.media_type === 'video' ||
    (rawUrl && String(rawUrl).toLowerCase().endsWith('.mp4')) ||
    (typeof media.content === 'string' && media.content.toLowerCase().includes('video')) ||
    (typeof media.message?.content === 'string' && media.message?.content.toLowerCase().includes('video')) ||
    (typeof media.media_caption === 'string' && media.media_caption.toLowerCase().includes('video')) ||
    (typeof media.message?.media_caption === 'string' && media.message?.media_caption.toLowerCase().includes('video'));
  const mediaType = isVideo ? 'video' : (media.type || media.media_type || 'image');
  const isViewOnce = Boolean(
    media.isViewOnce ||
    media.is_view_once ||
    media.media_type === 'view_once' ||
    media.raw_data?.isViewOnce ||
    (typeof media.content === 'string' && media.content.includes('Sekali Lihat')) ||
    (typeof media.media_caption === 'string' && media.media_caption.includes('Sekali Lihat'))
  );

  const senderName = media.message?.sender_name || media.sender_name || 'Pengirim';
  const time = formatTimeShort(media.message?.sent_at || media.message?.created_at || media.sent_at || media.created_at);

  const handleDownload = async () => {
    if (!fullUrl) {
      Alert.alert('Perhatian', 'Tautan media belum tersedia.');
      return;
    }
    try {
      const downloadUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}download=1`;
      await Linking.openURL(downloadUrl);
    } catch (e) {
      Alert.alert('Gagal Membuka Media', e.message);
    }
  };

  const handleCopyLink = async () => {
    if (!fullUrl) return;
    try {
      await Clipboard.setStringAsync(fullUrl);
      Alert.alert('Tautan Tersalin', 'Tautan media berhasil disalin ke clipboard.');
    } catch (e) {
      Alert.alert('Gagal', 'Tidak dapat menyalin tautan.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.titleRow}>
              {isViewOnce && (
                <View style={styles.viewOnceTopBadge}>
                  <Ionicons name="eye-outline" size={13} color="#10b981" />
                  <Text style={styles.viewOnceTopText}>Sekali Lihat</Text>
                </View>
              )}
              <Text style={styles.headerTitle} numberOfLines={1}>
                {senderName}
              </Text>
            </View>
            <Text style={styles.headerSubtitle}>
              {time ? `${time} • ` : ''}{mediaType === 'video' ? 'Video' : 'Foto'}
            </Text>
          </View>

          <View style={styles.topRightActions}>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={handleCopyLink}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="copy-outline" size={20} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.circleBtn, styles.downloadCircleBtn]}
              onPress={handleDownload}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="download-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.contentArea}>
          {fullUrl ? (
            isVideo ? (
              <View style={styles.videoWrap}>
                <VideoMessagePlayer videoUrl={rawUrl} isModal />
              </View>
            ) : (
              <Image
                source={{ uri: fullUrl }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            )
          ) : (
            <View style={styles.missingMediaBox}>
              <Ionicons
                name={mediaType === 'sticker' ? 'happy-outline' : (isViewOnce ? 'eye-off-outline' : 'image-outline')}
                size={54}
                color="#64748b"
              />
              <Text style={styles.missingMediaTitle}>
                {mediaType === 'sticker' ? 'Stiker Belum Diunduh' : (isViewOnce ? 'Media Sekali Lihat Belum Diunduh' : 'Media Belum Diunduh')}
              </Text>
              <Text style={styles.missingMediaDesc}>
                {mediaType === 'sticker'
                  ? 'File stiker belum diunduh dari WhatsApp. Anda dapat meminta server untuk mengunduh ulang.'
                  : (isViewOnce
                    ? 'Media sekali lihat dibatasi enkripsi WhatsApp ke perangkat pendamping. Media otomatis tersimpan saat pengirim membalas/mengutip foto ini di WhatsApp.'
                    : 'File media belum tersedia di server. Anda dapat meminta unduh ulang ke WhatsApp.')}
              </Text>
              {onReply && (
                <TouchableOpacity
                  style={[styles.retryMediaBtn, { backgroundColor: '#059669', marginBottom: 10 }]}
                  onPress={() => onReply(media.message || media)}
                >
                  <Ionicons name="arrow-undo" size={18} color="#ffffff" />
                  <Text style={styles.retryMediaBtnText}>Balas Pesan Ini</Text>
                </TouchableOpacity>
              )}
              {onRequestMedia && (
                <TouchableOpacity
                  style={styles.retryMediaBtn}
                  onPress={() => onRequestMedia(media.message || media)}
                >
                  <Ionicons name="reload" size={18} color="#ffffff" />
                  <Text style={styles.retryMediaBtnText}>Minta Ulang Media</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={styles.bottomBar}>
          {isViewOnce && (
            <View style={styles.voNoticeBanner}>
              <Ionicons name="shield-checkmark" size={16} color="#10b981" />
              <Text style={styles.voNoticeText}>
                Pesan ini berstatus Sekali Lihat di WhatsApp, namun tetap tersimpan dan dapat Anda lihat serta unduh di sini.
              </Text>
            </View>
          )}

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.primaryDownloadBtn}
              onPress={handleDownload}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-download-outline" size={20} color="#ffffff" />
              <Text style={styles.primaryDownloadText}>Unduh / Simpan Media</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryCopyBtn}
              onPress={handleCopyLink}
              activeOpacity={0.85}
            >
              <Ionicons name="link-outline" size={20} color="#ffffff" />
              <Text style={styles.secondaryCopyText}>Salin Tautan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e293b',
    backgroundColor: 'rgba(10, 15, 20, 0.95)',
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadCircleBtn: {
    backgroundColor: '#059669',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewOnceTopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  viewOnceTopText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 8,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  videoWrap: {
    width: '100%',
    maxWidth: 420,
    justifyContent: 'center',
    alignItems: 'center',
  },
  missingMediaBox: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  missingMediaTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  missingMediaDesc: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryMediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  retryMediaBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(10, 15, 20, 0.95)',
    borderTopWidth: 0.5,
    borderTopColor: '#1e293b',
    gap: 12,
  },
  voNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  voNoticeText: {
    color: '#a7f3d0',
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryDownloadBtn: {
    flex: 1.4,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#059669',
    height: 46,
    borderRadius: 12,
    gap: 8,
    elevation: 3,
  },
  primaryDownloadText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryCopyBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    height: 46,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryCopyText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
