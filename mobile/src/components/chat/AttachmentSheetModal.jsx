import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../context/ThemeContext';
import { getTheme, COLORS } from '../../theme';

export default function AttachmentSheetModal({ visible, onClose, onFileSelected }) {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const [viewOnce, setViewOnce] = useState(false);

  const handlePickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
        allowsEditing: false,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        onFileSelected({
          uri: asset.uri,
          name: asset.fileName || `media_${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
          type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          isViewOnce: viewOnce,
        });
        onClose();
      }
    } catch (e) {
      console.warn('Gagal memilih gambar:', e);
    }
  };

  const handleCaptureCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alert('Izin kamera diperlukan untuk mengambil foto.');
        return;
      }

      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        onFileSelected({
          uri: asset.uri,
          name: asset.fileName || `camera_${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
          type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          isViewOnce: viewOnce,
        });
        onClose();
      }
    } catch (e) {
      console.warn('Gagal membuka kamera:', e);
    }
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        onFileSelected({
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
          size: file.size,
          isViewOnce: false,
        });
        onClose();
      }
    } catch (e) {
      console.warn('Gagal memilih dokumen:', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View style={styles.indicator} />
              <Text style={[styles.title, { color: theme.text }]}>Lampiran Berkas</Text>

              <View style={styles.grid}>
                <TouchableOpacity style={styles.gridItem} onPress={handleCaptureCamera}>
                  <View style={[styles.iconCircle, { backgroundColor: '#ef4444' }]}>
                    <Ionicons name="camera" size={26} color="#ffffff" />
                  </View>
                  <Text style={[styles.itemText, { color: theme.text }]}>Kamera</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.gridItem} onPress={handlePickImage}>
                  <View style={[styles.iconCircle, { backgroundColor: '#8b5cf6' }]}>
                    <Ionicons name="images" size={26} color="#ffffff" />
                  </View>
                  <Text style={[styles.itemText, { color: theme.text }]}>Galeri</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.gridItem} onPress={handlePickDocument}>
                  <View style={[styles.iconCircle, { backgroundColor: '#3b82f6' }]}>
                    <Ionicons name="document-text" size={26} color="#ffffff" />
                  </View>
                  <Text style={[styles.itemText, { color: theme.text }]}>Dokumen</Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.viewOnceRow,
                  { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                ]}
              >
                <View style={styles.viewOnceInfo}>
                  <Ionicons name="eye-outline" size={20} color={COLORS.emerald} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.viewOnceTitle, { color: theme.text }]}>
                      Pesan Sekali Lihat
                    </Text>
                    <Text style={[styles.viewOnceDesc, { color: theme.textMuted }]}>
                      Penerima hanya dapat membuka foto/video sekali
                    </Text>
                  </View>
                </View>
                <Switch
                  value={viewOnce}
                  onValueChange={setViewOnce}
                  trackColor={{ false: '#767577', true: COLORS.emerald }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  indicator: {
    width: 38,
    height: 4,
    backgroundColor: '#9ca3af',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 18,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  gridItem: {
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  itemText: {
    fontSize: 12,
    fontWeight: '600',
  },
  viewOnceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  viewOnceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  viewOnceTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  viewOnceDesc: {
    fontSize: 11,
    marginTop: 2,
  },
});
