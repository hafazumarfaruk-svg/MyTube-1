
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, StatusBar, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; 

const { width } = Dimensions.get('window');
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();

  const { channelData = {}, channelName: paramChannelName, channelUrl: paramChannelUrl } = route.params || {};
  const channelName = channelData?.channel || paramChannelName || 'YouTube Channel';

  const [activeTab, setActiveTab] = useState('Videos');
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false); 
  const [tabData, setTabData] = useState({ Videos: [], Shorts: [] });
  const [videoToken, setVideoToken] = useState(null);
  const [shortToken, setShortToken] = useState(null);
  const [apiKey, setApiKey] = useState(null);

  useEffect(() => {
    fetchChannelData();
  }, [channelName]);

  // 🧠 হাইপার-রোবাস্ট স্ক্যানার: এটি কোনো নির্দিষ্ট নাম না খুঁজে সরাসরি প্রপার্টি চেক করে
  const extractDataIteratively = (rootNode, categorizedData, tabType) => {
    const stack = [rootNode];
    const seenIds = new Set();

    while (stack.length > 0) {
      const node = stack.pop();

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (node[i] && typeof node[i] === 'object') stack.push(node[i]);
        }
      } else if (node && typeof node === 'object') {

        // Load More Token সেভ করা
        if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
          categorizedData[`${tabType}Token`] = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        }

        // সরাসরি চেক করা হচ্ছে অবজেক্টের ভেতর ভিডিও আইডি আছে কিনা (ডুপ্লিকেট এড়ানো সহ)
        if (node.videoId && typeof node.videoId === 'string' && !seenIds.has(node.videoId)) {
            
            // টাইটেল বের করা
            let titleObj = node.title || node.headline;
            let extractedTitle = titleObj?.runs?.[0]?.text || titleObj?.simpleText;

            // যদি টাইটেল থাকে, তবেই আমরা ডেটাগুলো ধরব
            if (extractedTitle) {
                seenIds.add(node.videoId);
                const vId = node.videoId;

                // বয়স (Published Time) এবং সময় (Duration) বের করা
                let duration = node.lengthText?.simpleText || node.lengthText?.runs?.[0]?.text || '';
                let age = node.publishedTimeText?.simpleText || node.publishedTimeText?.runs?.[0]?.text || '';
                let views = node.viewCountText?.simpleText || node.viewCountText?.runs?.[0]?.text || '';
                let isLive = JSON.stringify(node).includes('"BADGE_STYLE_TYPE_LIVE_NOW"');

                // যদি সময় বা বয়স থাকে, তাহলে এটি সাধারণ ভিডিও
                if (duration || age || isLive) {
                    categorizedData.Videos.push({
                        id: String(vId),
                        title: String(extractedTitle),
                        value: `https://www.youtube.com/watch?v=${vId}`,
                        publishedTime: age || (isLive ? 'Live Now' : 'জানা যায়নি'),
                        duration: duration || (isLive ? 'Live' : 'জানা যায়নি'),
                    });
                } 
                // যদি সময় না থাকে কিন্তু ভিউজ থাকে, তাহলে এটি শর্টস
                else if (views) {
                    categorizedData.Shorts.push({
                        id: String(vId),
                        title: String(extractedTitle),
                        value: `https://www.youtube.com/watch?v=${vId}`,
                        publishedTime: views, 
                        duration: 'Short',
                    });
                }
            }
        }

        // গভীরে যাওয়ার লজিক
        const values = Object.values(node);
        for (let i = 0; i < values.length; i++) {
            if (values[i] && typeof values[i] === 'object') {
                stack.push(values[i]);
            }
        }
      }
    }
  };

  const parseYtData = (html) => {
    let match = html.match(/ytInitialData\s*=\s*({.+?});/) || 
                html.match(/var ytInitialData\s*=\s*(.*?);<\/script>/) ||
                html.match(/window\["ytInitialData"\]\s*=\s*({.+?});/);
    if (match && match[1]) {
      try { return JSON.parse(match[1]); } catch(e) { return null; }
    }
    return null;
  };

  const fetchChannelData = async () => {
    setLoading(true);
    try {
      let extractedChannelUrl = paramChannelUrl || channelData?.channelUrl || null;

      if (!extractedChannelUrl) {
          const searchResponse = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
          const searchData = parseYtData(await searchResponse.text());

          if (searchData) {
            const findChannelUrl = (node) => {
              if (extractedChannelUrl) return; 
              if (node?.channelRenderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) {
                 extractedChannelUrl = node.channelRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;
                 return;
              }
              if (node?.videoRenderer?.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) {
                 extractedChannelUrl = node.videoRenderer.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url;
                 return;
              }
              if (node && typeof node === 'object') Object.values(node).forEach(child => findChannelUrl(child));
            };
            findChannelUrl(searchData);
          }
      }

      if (!extractedChannelUrl) {
        setLoading(false);
        return; 
      }

      const [videosRes, shortsRes] = await Promise.all([
        fetch(`https://www.youtube.com${extractedChannelUrl}/videos`, { headers: { 'User-Agent': DESKTOP_AGENT } }),
        fetch(`https://www.youtube.com${extractedChannelUrl}/shorts`, { headers: { 'User-Agent': DESKTOP_AGENT } })
      ]);

      const videosHtml = await videosRes.text();
      const shortsHtml = await shortsRes.text();

      const apiMatch = videosHtml.match(/"INNERTUBE_API_KEY":"(.*?)"/);
      if (apiMatch && apiMatch[1]) setApiKey(apiMatch[1]);

      let parsedVideosData = parseYtData(videosHtml);
      let parsedShortsData = parseYtData(shortsHtml);

      const categorizedData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };

      if (parsedVideosData) extractDataIteratively(parsedVideosData, categorizedData, 'Videos');
      if (parsedShortsData) extractDataIteratively(parsedShortsData, categorizedData, 'Shorts');

      // --- Fallback Logic: হোম পেজ চেক ---
      if (categorizedData.Videos.length === 0 && categorizedData.Shorts.length === 0) {
         try {
            const homeRes = await fetch(`https://www.youtube.com${extractedChannelUrl}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
            const homeData = parseYtData(await homeRes.text());
            if (homeData) extractDataIteratively(homeData, categorizedData, 'Videos');
         } catch (err) {}
      }

      categorizedData.Videos = categorizedData.Videos.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
      categorizedData.Shorts = categorizedData.Shorts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

      setVideoToken(categorizedData.VideosToken);
      setShortToken(categorizedData.ShortsToken);
      setTabData({ Videos: categorizedData.Videos, Shorts: categorizedData.Shorts });

    } catch (error) {} finally { setLoading(false); }
  };

  const fetchMoreData = async () => {
    const currentToken = activeTab === 'Videos' ? videoToken : shortToken;
    if (!currentToken || isLoadingMore || !apiKey) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': DESKTOP_AGENT },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20231214.00.00' } },
          continuation: currentToken
        })
      });
      let data;
      try { data = JSON.parse(await response.text()); } catch (err) { setIsLoadingMore(false); return; }

      const newData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };
      extractDataIteratively(data, newData, activeTab);

      const filteredNewItems = newData[activeTab].filter(newObj => !tabData[activeTab].some(existingObj => existingObj.id === newObj.id));
      setTabData(prev => ({ ...prev, [activeTab]: [...prev[activeTab], ...filteredNewItems] }));

      if (activeTab === 'Videos') setVideoToken(newData.VideosToken || null);
      else setShortToken(newData.ShortsToken || null);

    } catch (error) {} finally { setIsLoadingMore(false); }
  };

  const handleVideoPress = (item) => {
    DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item });
    navigation.navigate('Player', { videoId: item.id, videoData: item });
  };

  // 🎯 আপনার নির্দেশ অনুযায়ী পরিবর্তিত রেন্ডারার (থাম্বনেইল ছাড়া, শুধু তথ্য)
  const renderItem = ({ item }) => {
    return (
      <TouchableOpacity style={styles.debugCard} activeOpacity={0.8} onPress={() => handleVideoPress(item)}>
        <Text style={styles.debugTitle} numberOfLines={2}>{item.title}</Text>
        
        <View style={styles.metaContainer}>
          <Text style={styles.debugMeta}>📅 বয়স: <Text style={{color: '#FFF'}}>{item.publishedTime}</Text></Text>
          <Text style={styles.debugMeta}>⏱️ সময়: <Text style={{color: '#FFF'}}>{item.duration}</Text></Text>
        </View>

        <Text style={styles.debugType}>লিংক: <Text style={styles.debugValue}>{item.value}</Text></Text>
      </TouchableOpacity>
    );
  };

  const renderEmptyComponent = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyStateContainer}>
        <Text style={styles.emptyStateText}>{activeTab === 'Shorts' ? 'No short video found' : 'No videos found'}</Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return <View style={{ paddingVertical: 20 }}><ActivityIndicator size="large" color="#0F0" /></View>;
  };

  const ChannelHeader = () => (
    <View>
      <View style={styles.tabScrollContainer}>
        <FlatList 
          horizontal={true} 
          showsHorizontalScrollIndicator={false} 
          data={['Videos', 'Shorts']} 
          keyExtractor={(item) => item} 
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.tabButton, activeTab === item && styles.activeTabButton]} onPress={() => setActiveTab(item)}>
              <Text style={[styles.tabText, activeTab === item && styles.activeTabText]}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
      {loading && <View style={{ padding: 50, alignItems: 'center' }}><ActivityIndicator size="large" color="#0F0" /></View>}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
           <Ionicons name="arrow-back" size={24} color="#0F0" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{channelName}</Text>
      </View>
      <FlatList 
        keyExtractor={(item, index) => item.id + index.toString()} 
        data={tabData[activeTab] || []} 
        renderItem={renderItem} 
        ListHeaderComponent={ChannelHeader}
        ListEmptyComponent={renderEmptyComponent}
        ListFooterComponent={renderFooter}
        onEndReached={fetchMoreData}
        onEndReachedThreshold={0.5} 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 80 }} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, // সম্পূর্ণ কালো ব্যাকগ্রাউন্ড
  header: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerIcon: { padding: 10 },
  headerTitle: { flex: 1, color: '#0F0', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },
  tabScrollContainer: { borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#111' },
  tabButton: { paddingVertical: 15, paddingHorizontal: 20 },
  activeTabButton: { borderBottomWidth: 2, borderBottomColor: '#0F0' },
  tabText: { color: '#AAA', fontSize: 15, fontWeight: '500' },
  activeTabText: { color: '#0F0', fontWeight: 'bold' },
  
  // 🎯 আপনার নির্দেশিত ডিজাইনের স্টাইল (থাম্বনেইল ছাড়া)
  debugCard: { backgroundColor: '#111', padding: 15, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginHorizontal: 10 },
  debugTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 10, lineHeight: 22 },
  metaContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, backgroundColor: '#222', padding: 10, borderRadius: 5 },
  debugMeta: { color: '#0F0', fontSize: 13, fontWeight: 'bold' }, 
  debugType: { color: '#AAA', fontSize: 13 },
  debugValue: { color: '#0F0' }, 
  
  emptyStateContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { color: '#F00', fontSize: 16, fontWeight: 'bold' }
});