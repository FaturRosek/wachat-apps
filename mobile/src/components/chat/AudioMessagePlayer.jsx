import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getMediaUrl } from '../../utils/mediaUrl';
import { formatDuration } from '../../utils/formatters';
import { COLORS } from '../../theme';

export default function AudioMessagePlayer({ audioUrl, isOutgoing, duration: propDuration }) {
  const fullUrl = getMediaUrl(audioUrl);
  const player = useAudioPlayer(fullUrl ? { uri: fullUrl } : null);
  const status = useAudioPlayerStatus(player);

  const isPlaying = !!status?.playing;
  const currentTime = status?.currentTime || 0;
  const totalDuration = status?.duration || propDuration || 0;

  const togglePlay = async () => {
    if (!player) return;
    try {
      if (isPlaying) {
        player.pause();
      } else {
        if (currentTime >= totalDuration && totalDuration > 0) {
          await player.seekTo(0);
        }
        player.play();
      }
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  };

  const progress = totalDuration > 0 ? Math.min(1, Math.max(0, currentTime / totalDuration)) : 0;
  const displayTime = isPlaying
    ? formatDuration(currentTime)
    : formatDuration(totalDuration || propDuration || 0);

  const activeColor = isOutgoing ? '#ffffff' : COLORS.primary;
  const trackBg = isOutgoing ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={togglePlay}
        style={[
          styles.playBtn,
          {
            backgroundColor: isOutgoing ? 'rgba(255, 255, 255, 0.22)' : COLORS.primarySoft,
          },
        ]}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={18}
          color={activeColor}
          style={!isPlaying ? { marginLeft: 2 } : null}
        />
      </TouchableOpacity>

      <View style={styles.trackContainer}>
        <View style={styles.waveBarContainer}>
          {[4, 12, 8, 16, 10, 14, 6, 18, 11, 7, 15, 9, 13, 5, 17, 8].map((barHeight, idx) => {
            const barProgress = idx / 16;
            const filled = barProgress <= progress;
            return (
              <View
                key={idx}
                style={[
                  styles.waveBar,
                  {
                    height: barHeight,
                    backgroundColor: filled
                      ? activeColor
                      : isOutgoing
                      ? 'rgba(255, 255, 255, 0.35)'
                      : 'rgba(0, 0, 0, 0.2)',
                  },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.timeRow}>
          <Text
            style={[
              styles.timeText,
              { color: isOutgoing ? 'rgba(255, 255, 255, 0.8)' : '#64748b' },
            ]}
          >
            {displayTime}
          </Text>
          <Ionicons
            name="mic-outline"
            size={12}
            color={isOutgoing ? 'rgba(255, 255, 255, 0.7)' : '#94a3b8'}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    minWidth: 200,
    maxWidth: 260,
    gap: 10,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  waveBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 20,
    marginBottom: 4,
  },
  waveBar: {
    flex: 1,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
