import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { COLORS } from '../../theme';
import { formatDuration } from '../../utils/formatters';

export default function VoiceRecorderBar({ onCancel, onSendVoice }) {
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    let isMounted = true;

    async function start() {
      try {
        const { granted } = await requestRecordingPermissionsAsync();
        if (!granted) {
          Alert.alert(
            'Izin Mikrofon Diperlukan',
            'WaChat AI memerlukan izin mikrofon untuk merekam pesan suara.'
          );
          onCancel();
          return;
        }

        if (!isMounted) return;

        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);

        timerRef.current = setInterval(() => {
          setSeconds((prev) => prev + 1);
        }, 1000);

        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.3,
              duration: 700,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 700,
              useNativeDriver: true,
            }),
          ])
        ).start();
      } catch (err) {
        console.warn('Gagal memulai perekaman:', err);
        Alert.alert('Gagal', 'Tidak dapat memulai rekaman suara.');
        onCancel();
      }
    }

    start();

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleCancel = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      if (recording) {
        await recorder.stop();
      }
    } catch (e) {}
    onCancel();
  };

  const handleSend = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        onSendVoice({
          uri,
          duration: seconds,
          name: `voice_${Date.now()}.m4a`,
          type: 'audio/m4a',
        });
      } else {
        onCancel();
      }
    } catch (err) {
      console.warn('Gagal menghentikan rekaman:', err);
      onCancel();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={handleCancel}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={22} color={COLORS.rose} />
      </TouchableOpacity>

      <View style={styles.timerWrap}>
        <Animated.View style={[styles.redDot, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={styles.timerText}>{formatDuration(seconds)}</Text>
      </View>

      <Text style={styles.recordingLabel}>Merekam pesan suara...</Text>

      <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
        <Ionicons name="send" size={18} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1f2937',
    borderRadius: 24,
    gap: 12,
    marginHorizontal: 8,
    marginBottom: 6,
  },
  cancelBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  timerText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recordingLabel: {
    flex: 1,
    color: '#9ca3af',
    fontSize: 13,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
