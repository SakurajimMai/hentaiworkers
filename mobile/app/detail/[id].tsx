import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { animeApi } from '../../services/api';
import { Anime, Episode } from '../../services/types';
import VideoPlayer from '../../components/VideoPlayer';

const { width } = Dimensions.get('window');

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  useEffect(() => {
    loadAnimeDetail();
  }, [id]);

  const loadAnimeDetail = async () => {
    try {
      setLoading(true);
      const response = await animeApi.getAnimeDetail(Number(id));
      if (response.success && response.data) {
        setAnime(response.data);
      }
    } catch (error) {
      console.error('Failed to load anime detail:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!anime) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>无法加载动漫详情</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* 视频播放器 */}
      {selectedEpisode && selectedEpisode.videoUrl && (
        <VideoPlayer
          videoUrl={selectedEpisode.videoUrl}
          title={`${anime.title} - 第${selectedEpisode.episode}集`}
        />
      )}

      {/* Fanart 背景图 */}
      {anime.fanart && (
        <Image
          source={{ uri: anime.fanart }}
          style={styles.fanart}
          resizeMode="cover"
        />
      )}

      {/* 海报和基本信息 */}
      <View style={styles.headerSection}>
        <Image
          source={{ uri: anime.poster || 'https://via.placeholder.com/300x450' }}
          style={styles.poster}
          resizeMode="cover"
        />
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{anime.title}</Text>
          {anime.year && (
            <Text style={styles.year}>年份: {anime.year}</Text>
          )}
          {anime.rating && (
            <Text style={styles.rating}>⭐ {anime.rating.toFixed(1)}</Text>
          )}
          {anime.genre && anime.genre.length > 0 && (
            <View style={styles.genreContainer}>
              {anime.genre.map((g, index) => (
                <View key={index} style={styles.genreTag}>
                  <Text style={styles.genreText}>{g}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* 简介 */}
      {anime.plot && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>简介</Text>
          <Text style={styles.plot}>{anime.plot}</Text>
        </View>
      )}

      {/* 剧集列表 */}
      {anime.episodes && anime.episodes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>剧集列表</Text>
          <View style={styles.episodeGrid}>
            {anime.episodes.map((episode) => (
              <TouchableOpacity
                key={episode.id}
                style={[
                  styles.episodeButton,
                  selectedEpisode?.id === episode.id && styles.episodeButtonActive,
                ]}
                onPress={() => setSelectedEpisode(episode)}
              >
                <Text
                  style={[
                    styles.episodeButtonText,
                    selectedEpisode?.id === episode.id && styles.episodeButtonTextActive,
                  ]}
                >
                  第 {episode.episode} 集
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  fanart: {
    width: width,
    height: 200,
    backgroundColor: '#e0e0e0',
  },
  headerSection: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    marginTop: -50,
    marginHorizontal: 16,
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  poster: {
    width: 100,
    height: 150,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  year: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  rating: {
    fontSize: 14,
    color: '#ff9800',
    fontWeight: '600',
    marginBottom: 8,
  },
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  genreTag: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  genreText: {
    fontSize: 12,
    color: '#1976d2',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  plot: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  episodeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  episodeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  episodeButtonText: {
    fontSize: 14,
    color: '#333',
  },
  episodeButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});
