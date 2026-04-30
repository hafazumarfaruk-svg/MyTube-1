import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 🎯 আপনার আইডিয়া অনুযায়ী নতুন কম্পোনেন্ট: এটি নিজে নিজে ১ কেবি ডাটা খরচ করে টাইটেল আনবে
const MicroFetchVideoCard = ({ videoId }) => {
  const [info, setInfo] = useState({ loading: true, title: 'টাইটেল আনা হচ্ছে...', error: false });

  useEffect(() => {
    let isMounted = true;
    
    const fetchVideoInfo = async () => {
      try {
        // ইউটিউবের oEmbed API (এটি মাত্র কয়েক বাইটের JSON রিটার্ন করে, খুবই ফাস্ট)
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        
        if (isMounted) {
          setInfo({ loading: false, title: data.title, error: false });
        }
      } catch (error) {
        if (isMounted) {
          setInfo({ loading: false, title: 'টাইটেল পাওয়া যায়নি', error: true });
        }
      }
    };

    fetchVideoInfo();

    return () => { isMounted = false; };
  }, [videoId]);

  return (
    <TouchableOpacity style={styles.debugCard} activeOpacity={0.8}>
      {info.loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <ActivityIndicator size="small" color="#FFD700" style={{ marginRight: 10 }} />
          <Text style={{ color: '#FFD700' }}>ইন্টারনেট থেকে টাইটেল খুঁজছে...</Text>
        </View>
      ) : (
        <Text style={styles.debugTitle} numberOfLines={2}>{info.title}</Text>
      )}
      <Text style={styles.debugType}>লিংক: <Text style={styles.debugValue}>https://www.youtube.com/watch?v={videoId}</Text></Text>
    </TouchableOpacity>
  );
};

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  
  const { channelData = {}, channelName: paramChannelName, channelUrl: paramChannelUrl } = route.params || {};
  const channelName = channelData?.channel || paramChannelName || 'YouTube Channel';

  const [loading, setLoading] = useState(true);
  const [videoIds, setVideoIds] = useState([]);

  useEffect(() => {
    fetchChannelVideoIds();
  }, [channelName]);

  // 🧠 আল্ট্রা-অ্যাগ্রেসিভ আইডি ফাইন্ডার (এটি কোনো JSON স্ট্রাকচার মানবে না, শুধু আইডি খুঁজবে)
  const fetchChannelVideoIds = async () => {
    setLoading(true);
    try {
      let url = paramChannelUrl || channelData?.channelUrl || null;

      // যদি URL না থাকে, সার্চ করে বের করো
      if (!url) {
          const searchResponse = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
          const searchHtml = await searchResponse.text();
          let match = searchHtml.match(/ytInitialData\s*=\s*({.+?});/) || searchHtml.match(/var ytInitialData\s*=\s*(.*?);<\/script>/);
          
          if (match && match[1]) {
             const searchData = JSON.parse(match[1]);
             const findUrl = (node) => {
               if (url) return;
               if (node?.channelRenderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) url = node.channelRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;
               else if (node && typeof node === 'object') Object.values(node).forEach(findUrl);
             };
             findUrl(searchData);
          }
      }

      if (!url) {
        setLoading(false);
        return; 
      }

      // ভিডিও পেজ এবং হোম পেজ থেকে ডাটা আনা
      const [videosRes, homeRes] = await Promise.all([
        fetch(`https://www.youtube.com${url}/videos`, { headers: { 'User-Agent': DESKTOP_AGENT } }),
        fetch(`https://www.youtube.com${url}`, { headers: { 'User-Agent': DESKTOP_AGENT } })
      ]);

      const videosHtml = await videosRes.text();
      const homeHtml = await homeRes.text();

      // 강력한 Regex (Regular Expression) দিয়ে পেজের সব জায়গা থেকে শুধু ১১ অক্ষরের ভিডিও আইডি ছাঁকা
      const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
      const ids = new Set(); // Set ব্যবহার করছি যাতে একই ভিডিও দুইবার না আসে

      let match;
      while ((match = regex.exec(videosHtml)) !== null) {
          ids.add(match[1]);
      }
      
      // যদি ভিডিও পেজে কিছু না পায়, হোম পেজ খুঁজবে
      if (ids.size === 0) {
          while ((match = regex.exec(homeHtml)) !== null) {
              ids.add(match[1]);
          }
      }

      setVideoIds(Array.from(ids));

    } catch (error) {
      console.error("Error fetching IDs:", error);
    } finally { 
      setLoading(false); 
    }
  };

  const renderEmptyComponent = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyStateContainer}>
        <Text style={styles.emptyStateText}>কোনো ভিডিও লিংক পাওয়া যায়নি</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
           <Ionicons name="arrow-back" size={24} color="#0F0" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{channelName} (Micro-Fetch)</Text>
      </View>
      
      {loading ? (
        <View style={{ padding: 50, alignItems: 'center', flex: 1, justifyContent: 'center' }}>
           <ActivityIndicator size="large" color="#0F0" />
           <Text style={{ color: '#0F0', marginTop: 10 }}>লিংক স্ক্যান করা হচ্ছে...</Text>
        </View>
      ) : (
        <FlatList 
          keyExtractor={(item, index) => item + index.toString()} 
          data={videoIds} 
          renderItem={({ item }) => <MicroFetchVideoCard videoId={item} />} 
          ListEmptyComponent={renderEmptyComponent}
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ paddingBottom: 80, paddingTop: 10 }} 
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerIcon: { padding: 10 },
  headerTitle: { flex: 1, color: '#0F0', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },
  
  debugCard: { backgroundColor: '#111', padding: 15, marginBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginHorizontal: 10 },
  debugTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 10, lineHeight: 22 },
  debugType: { color: '#AAA', fontSize: 13 },
  debugValue: { color: '#0F0' }, 
  
  emptyStateContainer: { padding: 40, alignItems: 'center', justifyContent: 'center', flex: 1 },
  emptyStateText: { color: '#F00', fontSize: 16, fontWeight: 'bold' }
});