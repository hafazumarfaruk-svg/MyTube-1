import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, StatusBar, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; 

const { width } = Dimensions.get('window');
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();

  const { channelData = {}, channelName: paramChannelName, channelAvatar: paramAvatar, channelUrl: paramChannelUrl } = route.params || {};

  const channelName = channelData?.channel || paramChannelName || 'YouTube Channel';
  const channelAvatar = channelData?.avatar || paramAvatar || 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';

  const [activeTab, setActiveTab] = useState('Videos');
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false); 
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLiveChannel, setIsLiveChannel] = useState(false); 
  const [liveVideoData, setLiveVideoData] = useState(null);
  const [thumbQuality, setThumbQuality] = useState('High');
  const [channelBanner, setChannelBanner] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop');
  const [subscriberCount, setSubscriberCount] = useState('N/A');

  const [tabData, setTabData] = useState({ Videos: [], Shorts: [] });
  const [videoToken, setVideoToken] = useState(null);
  const [shortToken, setShortToken] = useState(null);
  const [apiKey, setApiKey] = useState(null);

  useEffect(() => {
    fetchChannelData();
  }, [channelName]);

  useEffect(() => {
    const loadGlobals = async () => {
      try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        if (subs) {
          const parsedSubs = JSON.parse(subs);
          setIsSubscribed(parsedSubs.some(sub => sub.name === channelName));
        }
        const quality = await AsyncStorage.getItem('thumbnailQuality');
        if (quality) setThumbQuality(quality);
      } catch (e) {}
    };
    if (isFocused) loadGlobals();
  }, [channelName, isFocused]);

  const extractDataIteratively = (rootNode, categorizedData, tabType) => {
    const stack = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (node[i] && typeof node[i] === 'object') stack.push(node[i]);
        }
      } else if (node && typeof node === 'object') {
        if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
          categorizedData[`${tabType}Token`] = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        }

        if (node.videoRenderer || node.gridVideoRenderer) {
          const target = node.videoRenderer || node.gridVideoRenderer;
          const videoId = target.videoId;
          if(!videoId) continue;

          const duration = target.lengthText?.simpleText || '';
          const publishedTime = target.publishedTimeText?.simpleText || ''; 
          const title = target.title?.runs?.[0]?.text || target.title?.simpleText || 'No Title';
          const views = target.shortViewCountText?.simpleText || target.viewCountText?.simpleText || '';
          const isLive = JSON.stringify(target).includes('"BADGE_STYLE_TYPE_LIVE_NOW"');

          const thumbnailUrl = thumbQuality === 'Data Saver' 
              ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` 
              : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          categorizedData.Videos.push({
            id: String(videoId), title: String(title), views: String(views),
            publishedTime: String(publishedTime), duration: String(duration),
            thumbnail: thumbnailUrl, channel: channelName, avatar: channelAvatar, isLive: isLive
          });
        } else if (node.reelItemRenderer) {
          const videoId = node.reelItemRenderer.videoId;
          if(!videoId) continue;

          const title = node.reelItemRenderer.headline?.simpleText || 'Short Video';
          const views = node.reelItemRenderer.viewCountText?.simpleText || 'N/A';
          const shortThumbnailUrl = thumbQuality === 'Data Saver' 
              ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` 
              : `https://i.ytimg.com/vi/${videoId}/oardefault.jpg`;

          categorizedData.Shorts.push({
            id: String(videoId), title: String(title), views: String(views),
            thumbnail: shortThumbnailUrl, channel: channelName, avatar: channelAvatar, duration: 'Short'
          });
        } else {
          Object.values(node).forEach(val => {
            if (val && typeof val === 'object') stack.push(val);
          });
        }
      }
    }
  };

  const fetchChannelData = async () => {
    setLoading(true);
    try {
      let extractedUrl = paramChannelUrl || channelData?.channelUrl;

      // যদি URL না থাকে তবে আরও নিখুঁতভাবে সার্চ করার লজিক
      if (!extractedUrl) {
        const searchRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}&sp=EgIQAg%253D%253D`, { headers: { 'User-Agent': DESKTOP_AGENT } });
        const html = await searchRes.text();
        const match = html.match(/ytInitialData\s*=\s*({.+?});/);
        if (match) {
          const data = JSON.parse(match[1]);
          // চ্যানেলের সঠিক URL খোঁজার উন্নত লজিক
          const findUrl = (obj) => {
            if (extractedUrl) return;
            if (obj?.channelRenderer?.navigationEndpoint?.browseEndpoint?.browseId) {
                extractedUrl = `/channel/${obj.channelRenderer.navigationEndpoint.browseEndpoint.browseId}`;
                return;
            }
            if (obj && typeof obj === 'object') {
                Object.values(obj).forEach(v => findUrl(v));
            }
          };
          findUrl(data);
        }
      }

      if (!extractedUrl) {
          // যদি তাও না পাওয়া যায় তবে হ্যান্ডেল ফরমেট ট্রাই করা
          extractedUrl = `/@${channelName.replace(/\s+/g, '')}`;
      }

      const cleanUrl = extractedUrl.startsWith('/') ? extractedUrl : `/${extractedUrl}`;
      
      const [vRes, sRes] = await Promise.all([
        fetch(`https://www.youtube.com${cleanUrl}/videos`, { headers: { 'User-Agent': DESKTOP_AGENT } }),
        fetch(`https://www.youtube.com${cleanUrl}/shorts`, { headers: { 'User-Agent': DESKTOP_AGENT } })
      ]);

      const vHtml = await vRes.text();
      const sHtml = await sRes.text();

      const apiKeyMatch = vHtml.match(/"INNERTUBE_API_KEY":"(.*?)"/);
      if (apiKeyMatch) setApiKey(apiKeyMatch[1]);

      const categorizedData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };
      
      const parseAndExtract = (html, type) => {
        const match = html.match(/ytInitialData\s*=\s*({.+?});/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          extractDataIteratively(parsed, categorizedData, type);
          return parsed;
        }
        return null;
      };

      const vData = parseAndExtract(vHtml, 'Videos');
      parseAndExtract(sHtml, 'Shorts');

      // UI Update
      setTabData({
        Videos: categorizedData.Videos.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i),
        Shorts: categorizedData.Shorts.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
      });
      setVideoToken(categorizedData.VideosToken);
      setShortToken(categorizedData.ShortsToken);

      if (vData) {
        const header = vData.header?.c4TabbedHeaderRenderer || vData.header?.pageHeaderRenderer;
        const banner = vData.header?.c4TabbedHeaderRenderer?.banner?.thumbnails;
        if (banner) setChannelBanner(banner[banner.length - 1].url);
        
        const subs = vData.header?.c4TabbedHeaderRenderer?.subscriberCountText?.simpleText;
        if (subs) setSubscriberCount(subs);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ... বাকি ফাংশনগুলো (fetchMoreData, handleVideoPress, renderItem, ইত্যাদি) আপনার আগের কোডের মতোই থাকবে।
  // কোড ছোট রাখার জন্য নিচে শুধু return অংশটি দেওয়া হলো।

  const fetchMoreData = async () => {
    const currentToken = activeTab === 'Videos' ? videoToken : shortToken;
    if (!currentToken || isLoadingMore || !apiKey) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': DESKTOP_AGENT },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20240320.01.00' } },
          continuation: currentToken
        })
      });
      const data = await response.json();
      const newData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };
      extractDataIteratively(data, newData, activeTab);

      setTabData(prev => ({
        ...prev,
        [activeTab]: [...prev[activeTab], ...newData[activeTab]]
      }));
      if (activeTab === 'Videos') setVideoToken(newData.VideosToken);
      else setShortToken(newData.ShortsToken);
    } catch (error) {} finally { setIsLoadingMore(false); }
  };

  const handleSubscriptionToggle = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      let parsedSubs = subs ? JSON.parse(subs) : [];
      if (isSubscribed) {
        parsedSubs = parsedSubs.filter(sub => sub.name !== channelName);
        setIsSubscribed(false);
      } else {
        parsedSubs.push({ id: Date.now().toString(), name: channelName, avatar: channelAvatar });
        setIsSubscribed(true);
      }
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(parsedSubs));
    } catch(e) {}
  };

  const handleVideoPress = (item) => {
    DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item });
    navigation.navigate('Player', { videoId: item.id, videoData: item });
  };

  const renderItem = ({ item }) => {
    if (activeTab === 'Shorts') {
      return (
        <TouchableOpacity style={styles.shortGridItem} activeOpacity={0.8} onPress={() => navigation.navigate('ShortsScreen', { videoId: item.id, videoData: item })}>
          <Image source={{ uri: item.thumbnail }} style={styles.shortGridImage} />
          <View style={styles.shortViewsOverlay}>
            <Ionicons name="play-outline" size={14} color="#FFF" />
            <Text style={styles.shortViewsText}>{item.views}</Text>
          </View>
          <View style={{ padding: 8 }}>
            <Text style={styles.shortTitle} numberOfLines={2}>{item.title}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.videoCard}>
        <TouchableOpacity style={styles.thumbnailContainer} activeOpacity={0.8} onPress={() => handleVideoPress(item)}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImage} />
          {item.duration ? <Text style={styles.durationBadge}>{item.duration}</Text> : null}
        </TouchableOpacity>
        <View style={styles.videoInfoContainer}>
          <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.videoMeta}>{item.views} • {item.publishedTime}</Text>
        </View>
      </View>
    );
  };

  const ChannelHeader = () => (
    <View>
      <Image source={{ uri: channelBanner }} style={styles.bannerImage} />
      <View style={styles.channelProfileSection}>
        <View style={styles.avatarWrapper}>
           <Image source={{ uri: channelAvatar }} style={styles.channelLogoLarge} />
        </View>
        <View style={styles.channelTextInfo}>
          <Text style={styles.channelTitle}>{channelName}</Text>
          <Text style={styles.channelMeta}>{subscriberCount}</Text>
        </View>
      </View>
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity style={[styles.subscribeBtn, isSubscribed ? styles.subscribedState : styles.unsubscribedState]} onPress={handleSubscriptionToggle}>
          <Text style={[styles.subscribeText, {color: isSubscribed ? '#FFF' : '#0F0F0F'}]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tabScrollContainer}>
        {['Videos', 'Shorts'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tabButton, activeTab === tab && styles.activeTabButton]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
           <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{channelName}</Text>
      </View>
      <FlatList 
        key={activeTab === 'Shorts' ? 'G2' : 'L1'}
        numColumns={activeTab === 'Shorts' ? 2 : 1}
        data={tabData[activeTab]}
        renderItem={renderItem}
        ListHeaderComponent={ChannelHeader}
        onEndReached={fetchMoreData}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isLoadingMore ? <ActivityIndicator color="red" style={{margin: 20}}/> : null}
      />
    </SafeAreaView>
  );
}

// Styles remains the same as your original file
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 10 },
  headerIcon: { padding: 10 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },
  bannerImage: { width: width, height: width * 0.25, resizeMode: 'cover', backgroundColor: '#222' },
  channelProfileSection: { flexDirection: 'row', padding: 15, alignItems: 'center' },
  avatarWrapper: { marginRight: 15 },
  channelLogoLarge: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#333' },
  channelTextInfo: { flex: 1 },
  channelTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  channelMeta: { fontSize: 12, color: '#AAA', marginTop: 2 },
  actionButtonsContainer: { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 15 },
  subscribeBtn: { flex: 1, paddingVertical: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  subscribedState: { backgroundColor: '#272727' },
  unsubscribedState: { backgroundColor: '#F1F1F1' },
  subscribeText: { fontSize: 14, fontWeight: 'bold' },
  tabScrollContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222' },
  tabButton: { paddingVertical: 15, paddingHorizontal: 20 },
  activeTabButton: { borderBottomWidth: 2, borderBottomColor: '#FFF' },
  tabText: { color: '#AAA', fontSize: 15 },
  activeTabText: { color: '#FFF', fontWeight: 'bold' },
  videoCard: { marginBottom: 20 },
  thumbnailContainer: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  thumbnailImage: { width: '100%', height: '100%' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', color: '#FFF', padding: 4, borderRadius: 4, fontSize: 12 },
  videoInfoContainer: { padding: 12 },
  videoTitle: { color: '#FFF', fontSize: 15, lineHeight: 20 },
  videoMeta: { color: '#AAA', fontSize: 13, marginTop: 4 },
  shortGridItem: { width: (width / 2) - 10, margin: 5, backgroundColor: '#111', borderRadius: 8 },
  shortGridImage: { width: '100%', height: 250, borderRadius: 8 },
  shortViewsOverlay: { position: 'absolute', bottom: 60, left: 10, flexDirection: 'row', alignItems: 'center' },
  shortViewsText: { color: '#FFF', fontSize: 12, marginLeft: 4 },
  shortTitle: { color: '#FFF', fontSize: 13, padding: 5 }
});