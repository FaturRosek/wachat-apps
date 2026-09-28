import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getMediaUrl } from '../../utils/mediaUrl';

export default function VideoMessagePlayer({ videoUrl }) {
  const [fullscreen, setFullscreen] = useState(false);
  const fullUrl = getMediaUrl(videoUrl);

  const player = useVideoPlayer(fullUrl, (p) => {
    p.loop = false;
  });

  return (
    <View style={styles.container}>
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
