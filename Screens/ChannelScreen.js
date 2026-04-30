import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function ChannelScreen() {
  const route = useRoute();
  const { channelData = {}, channelName: paramChannelName, channelUrl: paramChannelUrl } = route.params || {};
  const channelName = channelData?.channel || paramChannelName || 'Unknown Channel';

  const [loading, setLoading] = useState(true);
  const [debugData, setDebugData] = useState([]);

  useEffect(() => {
    fetchRawData();
  }, [channelName]);

  // আপডেটেড স্ক্যানার: এটি এখন ওপরের লেভেলের টাইটেল মনে রেখে নিচে নামবে
  const aggressiveScanner = (rootNode) => {
    // স্ট্যাকের ভেতর এখন নোডের পাশাপাশি 'currentTitle' ও সেভ করা হচ্ছে
    const stack = [{ node: rootNode, currentTitle: 'টাইটেল পাওয়া যায়নি' }];
    const foundItems = [];
    const seenIds = new Set(); 

    while (stack.length > 0) {
      const { node, currentTitle } = stack.pop();

      // যদি এই নোডের ভেতর কোনো টাইটেল থাকে, তবে সেটিকে নতুন টাইটেল হিসেবে ধরে নাও
      let newTitle = currentTitle;
      if (node && typeof node === 'object') {
        if (node.title?.runs?.[0]?.text) {
          newTitle = node.title.runs[0].text;
        } else if (node.title?.simpleText) {
          newTitle = node.title.simpleText;
        } else if (node.headline?.simpleText) {
          newTitle = node.headline.simpleText;
        }
      }

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (node[i] && typeof node[i] === 'object') {
            stack.push({ node: node[i], currentTitle: newTitle });
          }
        }
      } else if (node && typeof node === 'object') {
        
        // ভিডিও আইডি পেলে সেটিকে লিংকে রূপান্তর করে সেভ করবে এবং সাথে টাইটেল রাখবে
        if (node.videoId && !seenIds.has(node.videoId)) {
          seenIds.add(node.videoId);
          foundItems.push({
            type: 'Video Link',
            value: `https://www.youtube.com/watch?v=${node.videoId}`,
            title: newTitle
          });
        }

        const values = Object.values(node);
        for (let i = 0; i < values.length; i++) {
          if (values[i] && typeof values[i] === 'object') {
            stack.push({ node: values[i], currentTitle: newTitle });
          }
        }
      }
    }
    return foundItems;
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

  const fetchRawData = async () => {
    setLoading(true);
    console.log(`\n================================================`);
    console.log(`🛠️ [STEP 1] লিংক এবং টাইটেল স্ক্যান: ${channelName}`);
    
    try {
      let url = paramChannelUrl || channelData?.channelUrl || null;

      if (!url) {
         const searchRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
         const searchData = parseYtData(await searchRes.text());
         
         const findUrl = (n) => {
           if (url) return;
           if (n?.channelRenderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) url = n.channelRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;
           else if (n && typeof n === 'object') Object.values(n).forEach(findUrl);
         };
         if (searchData) findUrl(searchData);
      }

      if (!url) {
        setLoading(false); return;
      }

      const res = await fetch(`https://www.youtube.com${url}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const html = await res.text();
      const rawJson = parseYtData(html);

      if (rawJson) {
        const extracted = aggressiveScanner(rawJson);
        setDebugData(extracted);
      }

    } catch (e) {
      console.log(`❌ Error:`, e.message);
    } finally {
      setLoading(false);
      console.log(`================================================\n`);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.debugCard}>
      <Text style={styles.debugTitle}>{item.title}</Text>
      <Text style={styles.debugType}>লিংক: <Text style={styles.debugValue}>{item.value}</Text></Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ধাপ ১: টাইটেল ও লিংক ({channelName})</Text>
      </View>
      
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F0" />
          <Text style={{ color: '#0F0', marginTop: 10 }}>ডাটা প্রসেস করা হচ্ছে...</Text>
        </View>
      ) : (
        <FlatList 
          data={debugData}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          ListEmptyComponent={<Text style={styles.emptyText}>কোনো ভিডিও বা লিংক পাওয়া যায়নি।</Text>}
          contentContainerStyle={{ padding: 10 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, 
  header: { padding: 15, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#0F0', fontSize: 18, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  debugCard: { backgroundColor: '#111', padding: 15, marginBottom: 10, borderRadius: 5, borderWidth: 1, borderColor: '#333' },
  debugTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  debugType: { color: '#AAA', fontSize: 13 },
  debugValue: { color: '#0F0' }, // লিংকের রঙ সবুজ
  emptyText: { color: '#F00', textAlign: 'center', marginTop: 50, fontSize: 16 }
});