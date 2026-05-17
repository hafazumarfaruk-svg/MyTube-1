import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, FlatList, Image, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

export default function PlaylistPage({ navigation }) {
  const [savedPlaylist, setSavedPlaylist] = useState([]); 

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // প্লেলিস্ট লোড করার এবং রিয়েল-টাইম আপডেটের লজিক
  useEffect(() => {
    loadPlaylist();
    const sub = DeviceEventEmitter.addListener('playlistUpdated', loadPlaylist);
    return () => sub.remove();
  }, []);

  const loadPlaylist = async () => {
    try {
      const data = await AsyncStorage.getItem('my_saved_playlist');
      if (data) setSavedPlaylist(JSON.parse(data));
    } catch (e) {
      console.log("Error loading playlist", e);
    }
  };

  // প্লেলিস্ট থেকে ভিডিও রিমুভ করার ফাংশন
  const removeVideo = async (id) => {
    try {
      const filtered = savedPlaylist.filter(v => v.id !== id);
      setSavedPlaylist(filtered);
      await AsyncStorage.setItem('my_saved_playlist', JSON.stringify(filtered));
    } catch(e) {}
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />

      {/* 🚨 সিম্পল এবং সুন্দর হেডার 🚨 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Saved Playlist</Text>
        <Text style={styles.videoCount}>{savedPlaylist.length} Videos</Text>
      </View>

      {/* 🚨 সেভ করা প্লেলিস্টের লিস্ট 🚨 */}
      <FlatList 
        data={savedPlaylist} 
        keyExtractor={(item, index) => item.id + index} 
        contentContainerStyle={{ paddingBottom: 150 }} // গ্লোবাল প্লেয়ারের জন্য নিচে জায়গা রাখা হলো
        renderItem={({item}) => (
          <TouchableOpacity 
            style={styles.recVideoCard} 
            // 🚨 ক্লিক করলেই সরাসরি গ্লোবাল প্লেয়ারে প্লে হবে 🚨
            onPress={() => DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item })}
          >
            <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImage} />
            <View style={styles.videoInfo}>
              <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.videoMeta}>{item.channel} {item.views ? `• ${item.views}` : ''}</Text>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => removeVideo(item.id)}>
                <Ionicons name="trash-outline" size={24} color="#FF4444" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={70} color="#333" />
                <Text style={styles.emptyTitle}>প্লেলিস্ট একদম ফাঁকা!</Text>
                <Text style={styles.emptySubtitle}>ভিডিও চলাকালীন সেটিংস থেকে "Save to Playlist" এ ক্লিক করে ভিডিও সেভ করুন।</Text>
            </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 15,
    paddingBottom: 15,
    paddingHorizontal: 15,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    elevation: 5
  },
  backBtn: { marginRight: 15 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', flex: 1 },
  videoCount: { color: '#AAA', fontSize: 14, fontWeight: 'bold' },

  recVideoCard: { 
    flexDirection: 'row', 
    padding: 12, 
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A'
  },
  thumbnailImage: { width: 140, height: 80, borderRadius: 8, backgroundColor: '#222' },
  videoInfo: { flex: 1, marginLeft: 12 },
  videoTitle: { color: '#FFF', fontSize: 15, lineHeight: 20, fontWeight: '500' },
  videoMeta: { color: '#AAA', fontSize: 12, marginTop: 6 },
  deleteBtn: { padding: 10 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 15 },
  emptySubtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});