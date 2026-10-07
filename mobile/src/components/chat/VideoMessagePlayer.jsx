import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getMediaUrl } from '../../utils/mediaUrl';

export default function VideoMessagePlayer({ videoUrl, isModal = false, style }) {
  const [fullscreen, setFullscreen] = useState(false);
  const fullUrl = getMediaUrl(videoUrl);

  const player = useVideoPlayer(fullUrl, (p) => {
    p.loop = true;
  });

  return (
    <View style={[styles.container, isModal && styles.modalContainer, style]}>
      <View style={styles.previewContainer}>
        <VideoView
          style={styles.inlineVideo}
          player={player}
          allowsFullscreen
          allowsPictureInPicture={false}
          nativeControls
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 260,
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    marginVertical: 4,
  },
  modalContainer: {
    maxWidth: '100%',
    width: '100%',
    borderRadius: 12,
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineVideo: {
    width: '100%',
    height: '100%',
  },
});
