import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Platform } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// বাংলাদেশ, ইন্ডিয়া, পাকিস্তানের বিভিন্ন লাইভ চ্যানেলের জন্য ক্যাটাগরি
const LIVE_QUERIES = [
  "bangladesh live tv channel 24/7",
  "india live tv channel hindi news",
  "pakistan live tv channel news",
  "live sports channel 24/7",
  "live movie tv channel",
  "live entertainment tv channel"
];

export default function LiveScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [activeQuery, setActiveQuery] = useState(LIVE_QUERIES[0]);

  // Immersive Mode: স্ট্যাটাস বার এবং নেভিগেশন বার লুকানো
  useEffect(() => {
    if (isFocused) {
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync("hidden");
      }
    }
  }, [isFocused]);

  useEffect(() => {
    const randomQuery = LIVE_QUERIES[Math.floor(Math.random() * LIVE_QUERIES.length)];
    setActiveQuery(randomQuery);
    fetchLiveVideos(randomQuery, true);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    const randomQuery = LIVE_QUERIES[Math.floor(Math.random() * LIVE_QUERIES.length)];
    setActiveQuery(randomQuery);
    fetchLiveVideos(randomQuery, true);
  };

  const loadMoreVideos = () => {
    if (isFetchingMore || loading) return; 
    setIsFetchingMore(true);
    fetchLiveVideos(activeQuery, false);
  };

  const getHighQualityThumbnail = (thumbnailObj, videoId) => {
    if (!thumbnailObj || !thumbnailObj.thumbnails || thumbnailObj.thumbnails.length === 0) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    let bestImgUrl = thumbnailObj.thumbnails[thumbnailObj.thumbnails.length - 1].url;
    return bestImgUrl.startsWith('//') ? 'https:' + bestImgUrl : bestImgUrl;
  };

  const fetchLiveVideos = async (query, isNewSearch = false) => {
    if (isNewSearch) setLoading(true); 
    try {
      // &sp=EgJAAQ%253D%253D যুক্ত করা হয়েছে যাতে শুধুমাত্র "Live" ভিডিওগুলোই আসে
      const liveFilter = '&sp=EgJAAQ%253D%253D';
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${liveFilter}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const extractedVideos = [];

        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) {
                extractedVideos.push(node.videoRenderer);
            } else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);

        const formattedVideos = extractedVideos.map(vid => ({
            id: vid.videoId, 
            title: vid.title?.runs?.[0]?.text || 'No Title', 
            channel: vid.ownerText?.runs?.[0]?.text || 'Channel',
            views: vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || 'Live Now', 
            // কতক্ষণ আগে লাইভ শুরু হয়েছে তা বের করা
            timeText: vid.publishedTimeText?.simpleText || vid.dateText?.simpleText || 'Started recently',
            thumbnail: getHighQualityThumbnail(vid.thumbnail, vid.videoId), 
            avatar: getHighQualityThumbnail(vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail, null)
        }));

        setVideos(isNewSearch ? formattedVideos : [...videos, ...formattedVideos]);
      }
    } catch (e) {
      console.error("Live fetch error:", e);
    } finally { 
      setLoading(false); 
      setRefreshing(false); 
      setIsFetchingMore(false);
    }
  };

  const renderVideoItem = ({ item }) => (
    // TouchableOpacity এখন সম্পূর্ণ কার্ডের বাইরে দেওয়া হয়েছে (সমস্যা ১ সমাধান)
    <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
      <View style={styles.videoCard}>
        <View style={styles.thumbnailContainer}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
          <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>
        </View>

        <View style={styles.videoInfo}>
          <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            {/* ভিউজ এবং কতক্ষণ আগে শুরু হয়েছে তা একসাথে দেখানো হচ্ছে (সমস্যা ৪ সমাধান) */}
            <Text style={styles.meta}>{item.channel} • {item.views} • {item.timeText}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* স্ট্যাটাস বার হাইড করা হয়েছে (সমস্যা ৫ সমাধান) */}
      <StatusBar hidden={true} />
      
      {/* হোম স্ক্রিনের মতো হেডার (সমস্যা ৩ সমাধান) */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
            <Ionicons name="logo-youtube" size={28} color="#FF0000" />
            <Text style={styles.logoText}>MyTube</Text>
        </View>
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
          <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>সার্চ লাইভ...</Text>
          <Ionicons name="search" size={18} color="#AAA" />
        </TouchableOpacity>
      </View>

      {loading && videos.length === 0 ? (
        <ActivityIndicator size="large" color="#FF0000" style={{ flex: 1, justifyContent: 'center', backgroundColor: '#0F0F0F' }} />
      ) : (
        <FlatList 
          data={videos} 
          renderItem={renderVideoItem} 
          keyExtractor={(item, index) => item.id + index.toString()} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" />} 
          onEndReached={loadMoreVideos}
          onEndReachedThreshold={0.5} 
          ListFooterComponent={isFetchingMore ? <ActivityIndicator size="small" color="#FF0000" style={{ marginVertical: 20 }} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', width: '100%', backgroundColor: '#0F0F0F' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', width: 105 },
  logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, alignItems: 'center', height: 38 },
  videoCard: { marginBottom: 15 },
  thumbnailContainer: { position: 'relative' },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  liveBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: '#FF0000', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  liveBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  videoInfo: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#333' },
  textContainer: { flex: 1, paddingRight: 10 },
  title: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  meta: { color: '#AAA', fontSize: 12, marginTop: 4 }
});