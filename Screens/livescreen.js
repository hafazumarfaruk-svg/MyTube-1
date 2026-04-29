import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Platform } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ক্যাটাগরি অনুযায়ী মিক্সড সার্চ কুয়েরি (নিচের ভিডিও ফিডের জন্য)
const LIVE_QUERIES = [
  "bangladesh live tv channel 24/7",
  "india live tv channel hindi news",
  "pakistan live tv channel news",
  "live sports channel 24/7",
  "live movie tv channel",
  "live entertainment tv channel"
];

// উপরে দেখানোর জন্য সিরিয়াল অনুযায়ী টপ চ্যানেলের লিস্ট
const TOP_CHANNELS = [
  // বাংলাদেশ (প্রাধান্য)
  { id: 'bd1', name: 'Somoy TV', query: 'somoy tv live' },
  { id: 'bd2', name: 'Channel 24', query: 'channel 24 live bangladesh' },
  { id: 'bd3', name: 'Jamuna TV', query: 'jamuna tv live' },
  { id: 'bd4', name: 'Independent', query: 'independent tv live' },
  { id: 'bd5', name: 'ATN News', query: 'atn news live' },
  // পাকিস্তান ও ভারত
  { id: 'pk1', name: 'Geo News', query: 'geo news live pakistan' },
  { id: 'pk2', name: 'ARY News', query: 'ary news live' },
  { id: 'in1', name: 'Aaj Tak', query: 'aaj tak live' },
  { id: 'in2', name: 'ABP News', query: 'abp news live' },
  // বিশ্ব (অন্যান্য)
  { id: 'int1', name: 'Al Jazeera', query: 'al jazeera english live' },
  { id: 'int2', name: 'BBC News', query: 'bbc news live' },
].map(ch => ({
  ...ch,
  // অটোমেটিক লোগো জেনারেট করার জন্য নির্ভরযোগ্য একটি API ব্যবহার করা হয়েছে
  logo: `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.name)}&background=random&color=fff&rounded=true&bold=true&size=128`
}));

export default function LiveScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTopChannel, setLoadingTopChannel] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [activeQuery, setActiveQuery] = useState(LIVE_QUERIES[0]);

  // Immersive Mode
  useEffect(() => {
    if (isFocused && Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync("hidden");
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

  // উপরের লোগোতে ক্লিক করলে সরাসরি লাইভ ভিডিও প্লে করার ফাংশন
  const playTopChannelLive = async (channel) => {
    setLoadingTopChannel(true);
    try {
      const liveFilter = '&sp=EgJAAQ%253D%253D';
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channel.query)}${liveFilter}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        let firstVideo = null;

        const extractFirst = (node) => {
          if (firstVideo) return;
          if (Array.isArray(node)) node.forEach(extractFirst);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer && node.videoRenderer.videoId) {
              firstVideo = node.videoRenderer;
            } else Object.values(node).forEach(extractFirst);
          }
        };
        extractFirst(jsonData);

        if (firstVideo) {
          const videoData = {
            id: firstVideo.videoId,
            title: firstVideo.title?.runs?.[0]?.text || channel.name,
            channel: firstVideo.ownerText?.runs?.[0]?.text || channel.name,
            views: 'Live Now',
          };
          navigation.navigate('Player', { videoId: firstVideo.videoId, videoData });
        } else {
          alert(`বর্তমানে ${channel.name} এর লাইভ ভিডিও পাওয়া যায়নি।`);
        }
      }
    } catch (e) {
      alert('ভিডিও লোড করতে সমস্যা হচ্ছে।');
    } finally {
      setLoadingTopChannel(false);
    }
  };

  const fetchLiveVideos = async (query, isNewSearch = false) => {
    if (isNewSearch) setLoading(true); 
    try {
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
            // চ্যানেলের আইডেন্টিফায়ার বের করা হচ্ছে ChannelScreen এ দেওয়ার জন্য
            channelId: vid.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
            views: vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || 'Live Now', 
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

  // উপরের হরাইজন্টাল চ্যানেল লিস্ট রেন্ডার
  const renderTopChannel = ({ item }) => (
    <TouchableOpacity style={styles.topChannelItem} onPress={() => playTopChannelLive(item)}>
      <Image source={{ uri: item.logo }} style={styles.topChannelLogo} />
      <Text style={styles.topChannelName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  );

  const ListHeader = () => (
    <View style={styles.topChannelsContainer}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={TOP_CHANNELS}
        keyExtractor={(item) => item.id}
        renderItem={renderTopChannel}
        contentContainerStyle={{ paddingHorizontal: 8 }}
      />
    </View>
  );

  const renderVideoItem = ({ item }) => (
    <View style={styles.videoCard}>
      {/* থাম্বনেইলে ক্লিক করলে Player ওপেন হবে */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
        <View style={styles.thumbnailContainer}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
          <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>
        </View>
      </TouchableOpacity>

      <View style={styles.videoInfo}>
        {/* লোগোতে ক্লিক করলে ChannelScreen ওপেন হবে */}
        <TouchableOpacity onPress={() => navigation.navigate('ChannelScreen', { channelId: item.channelId, channelName: item.channel, avatar: item.avatar })}>
          <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
        </TouchableOpacity>
        
        <View style={styles.textContainer}>
          {/* টাইটেলে ক্লিক করলে Player ওপেন হবে */}
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          </TouchableOpacity>
          
          {/* চ্যানেলের নামে ক্লিক করলে ChannelScreen ওপেন হবে */}
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('ChannelScreen', { channelId: item.channelId, channelName: item.channel, avatar: item.avatar })}>
            <Text style={styles.meta}>{item.channel} • {item.views} • {item.timeText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      {/* হেডার */}
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

      {/* টপ চ্যানেল লোডিং ইন্ডিকেটর (লোগোতে চাপ দিলে দেখাবে) */}
      {loadingTopChannel && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={{ color: '#FFF', marginTop: 10 }}>চ্যানেল চালু হচ্ছে...</Text>
        </View>
      )}

      {/* মেইন ভিডিও লিস্ট */}
      {loading && videos.length === 0 ? (
        <ActivityIndicator size="large" color="#FF0000" style={{ flex: 1, justifyContent: 'center', backgroundColor: '#0F0F0F' }} />
      ) : (
        <FlatList 
          data={videos} 
          renderItem={renderVideoItem} 
          keyExtractor={(item, index) => item.id + index.toString()} 
          ListHeaderComponent={ListHeader} // এখানে উপরের চ্যানেল লিস্ট দেওয়া হয়েছে
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
  
  // Top Channels Styles
  topChannelsContainer: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#222', marginBottom: 10 },
  topChannelItem: { alignItems: 'center', marginHorizontal: 8, width: 65 },
  topChannelLogo: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#333', borderWidth: 1, borderColor: '#444' },
  topChannelName: { color: '#FFF', fontSize: 11, marginTop: 6, textAlign: 'center' },
  
  // Video Card Styles
  videoCard: { marginBottom: 15 },
  thumbnailContainer: { position: 'relative' },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  liveBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: '#FF0000', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  liveBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  videoInfo: { flexDirection: 'row', padding: 12, alignItems: 'flex-start' },
  channelAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 12, backgroundColor: '#333' },
  textContainer: { flex: 1, paddingRight: 10 },
  title: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  meta: { color: '#AAA', fontSize: 12 },

  // Overlay Loading
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 10 }
});