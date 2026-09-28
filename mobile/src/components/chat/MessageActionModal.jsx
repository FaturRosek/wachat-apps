import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../context/ThemeContext';
import { getTheme, COLORS } from '../../theme';

export default function MessageActionModal({
  visible,
  message,
  onClose,
  onReply,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
}) {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  if (!message) return null;

  const isOutgoing = message.from_me || message.fromMe || message.direction === 'OUTGOING';
  const hasText = !!message.content;

  const handleCopy = async () => {
    if (message.content) {
      await Clipboard.setStringAsync(message.content);
      Alert.alert('Tersalin', 'Teks pesan berhasil disalin ke papan klip.');
    }
    onClose();
  };

  const handleReply = () => {
    onReply(message);
    onClose();
  };

  const handleEdit = () => {
    onEdit(message);
    onClose();
  };

  const handleDeleteForMe = () => {
    onClose();
    Alert.alert(
      'Hapus Pesan',
      'Hapus pesan ini dari tampilan Anda?',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: () => onDeleteForMe(message) },
      ]
    );
  };

  const handleDeleteForEveryone = () => {
    onClose();
    Alert.alert(
      'Hapus untuk Semua Orang',
      'Pesan ini akan dihapus dari obrolan semua penerima.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus Semua', style: 'destructive', onPress: () => onDeleteForEveryone(message) },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.card,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.title, { color: theme.textMuted }]}>Tindakan Pesan</Text>

              <TouchableOpacity style={styles.actionRow} onPress={handleReply}>
                <Ionicons name="arrow-undo-outline" size={20} color={COLORS.primary} />
                <Text style={[styles.actionText, { color: theme.text }]}>Balas</Text>
              </TouchableOpacity>

              {hasText && (
                <TouchableOpacity style={styles.actionRow} onPress={handleCopy}>
                  <Ionicons name="copy-outline" size={20} color={COLORS.primary} />
                  <Text style={[styles.actionText, { color: theme.text }]}>Salin Teks</Text>
                </TouchableOpacity>
              )}

              {isOutgoing && hasText && (
                <TouchableOpacity style={styles.actionRow} onPress={handleEdit}>
                  <Ionicons name="pencil-outline" size={20} color={COLORS.amber} />
                  <Text style={[styles.actionText, { color: theme.text }]}>Edit Pesan</Text>
                </TouchableOpacity>
              )}

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <TouchableOpacity style={styles.actionRow} onPress={handleDeleteForMe}>
                <Ionicons name="trash-outline" size={20} color={COLORS.rose} />
                <Text style={[styles.actionText, { color: COLORS.rose }]}>Hapus untuk Saya</Text>
              </TouchableOpacity>

              {isOutgoing && (
                <TouchableOpacity style={styles.actionRow} onPress={handleDeleteForEveryone}>
                  <Ionicons name="trash-bin-outline" size={20} color={COLORS.rose} />
                  <Text style={[styles.actionText, { color: COLORS.rose }]}>
                    Hapus untuk Semua Orang
                  </Text>
                </TouchableOpacity>
              )}
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
});
