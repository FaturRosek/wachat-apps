import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme';
import { formatDisplayPhone } from '../../utils/phoneFormatter';

export default function IncomingCallModal({ call, onClose }) {
  if (!call) return null;

  const isVideo = !!call.isVideo;
  const callerName = call.callerName || call.caller || 'Panggilan WhatsApp';
  const callerPhone = call.callerPhone || call.phone;

  return (
    <Modal visible={!!call} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            {call.avatarUrl ? (
              <Image source={{ uri: call.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color="#ffffff" />
              </View>
            )}
          </View>

          <Text style={styles.callerTitle}>{callerName}</Text>
          {callerPhone && (
            <Text style={styles.callerSub}>{formatDisplayPhone(callerPhone)}</Text>
          )}

          <View style={styles.callTypeWrap}>
            <Ionicons
              name={isVideo ? 'videocam' : 'call'}
              size={18}
              color={COLORS.emerald}
            />
            <Text style={styles.callTypeText}>
              {isVideo ? 'Panggilan Video Masuk' : 'Panggilan Suara Masuk'}
            </Text>
          </View>

          <Text style={styles.note}>
            Panggilan WhatsApp tidak dapat diangkat langsung di browser / web API. Silakan buka aplikasi WhatsApp resmi di ponsel Anda.
          </Text>

          <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color="#ffffff" />
            <Text style={styles.dismissBtnText}>Tutup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarWrap: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  callerSub: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  callTypeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  callTypeText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  note: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 18,
    marginBottom: 20,
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  dismissBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
