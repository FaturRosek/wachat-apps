import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getTheme, COLORS } from '../../theme';

export default function AiSuggestionsBar({
  suggestions,
  loading,
  onSelectSuggestion,
  onRequestSummarize,
}) {
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  if (loading) {
    return (
      <View style={[styles.loadingBar, { backgroundColor: theme.surfaceAlt }]}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>
          Memuat saran AI...
        </Text>
      </View>
    );
  }

  const hasSuggestions = suggestions && suggestions.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceAlt, borderTopColor: theme.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity
          style={[styles.summarizeBtn, { backgroundColor: COLORS.indigoSoft, borderColor: '#c7d2fe' }]}
          onPress={onRequestSummarize}
        >
          <Ionicons name="sparkles" size={14} color={COLORS.indigo} />
          <Text style={[styles.summarizeText, { color: COLORS.indigo }]}>Ringkas Chat</Text>
        </TouchableOpacity>

        {hasSuggestions &&
          suggestions.map((item, index) => {
            const text = typeof item === 'string' ? item : item.text || item.suggestion || '';
            if (!text) return null;
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.suggestionPill,
                  { backgroundColor: theme.surface, borderColor: theme.borderStrong },
                ]}
                onPress={() => onSelectSuggestion(text)}
              >
                <Text style={[styles.suggestionText, { color: theme.text }]} numberOfLines={1}>
                  {text}
                </Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 12,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  summarizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  summarizeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionPill: {
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 12,
  },
});
