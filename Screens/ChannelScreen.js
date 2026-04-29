import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, StatusBar, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MY_API_SERVER = "http://127.0.0.1:10000";

export default function ChannelScreen({ navigation }) {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoData, setVideoData] = useState(null);
  const [loadingThumb, setLoadingThumb] = useState(false);

  // ফাস্ট থাম্বনেইল ফেস করার ফাংশন
  const fetchFastThumbnail = async () => {
    if (!videoUrl) return;
    setLoadingThumb(true);
    try {
      const res = await fetch(`${MY_API_SERVER}/api/thumbnail?url=${encodeURIComponent(videoUrl)}`);
      const data = await res.json();
      if (data.success) {
        setVideoData({
          title: "New Video Found", // এখানে চাইলে টাইটেল API থেকেও আনতে পারেন
          url: videoUrl,
          thumbnail: data.thumbnail
        });
      }
    } catch (error) {
      console.error("Thumbnail Fetch Error: ", error);
    }
    setLoadingThumb(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>চ্যানেল ভিডিও</Text>
      </View>

      <View style={styles.searchSection}>
        <TextInput 
          style={styles.input}
          placeholder="ভিডিও লিংক পেস্ট করুন..."
          placeholderTextColor="#888"
          value={videoUrl}
          onChangeText={setVideoUrl}
        />
        <TouchableOpacity style={styles.fetchBtn} onPress={fetchFastThumbnail} disabled={loadingThumb}>
           <Ionicons name="search" size={20} color="#FFF" />
           <Text style={styles.fetchBtnText}>{loadingThumb ? "খুঁজছে..." : "থাম্বনেইল আনুন"}</Text>
        </TouchableOpacity>
      </View>

      {/* ভিডিও কার্ড */}
      {videoData && (
        <View style={styles.card}>
          <Image source={{ uri: videoData.thumbnail }} style={styles.thumbnail} resizeMode="cover" />
          <View style={styles.info}>
            <Text style={styles.title}>{videoData.title}</Text>
            <TouchableOpacity style={styles.downloadBtn} onPress={() => {
              // এখানে ডাউনলোড স্ক্রিনে ডাটা পাঠিয়ে ডাউনলোড শুরু করার লজিক দিতে পারেন
            }}>
              <Ionicons name="download" size={18} color="#FFF" />
              <Text style={styles.btnText}>ডাউনলোড করুন</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  backBtn: { marginRight: 15 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  
  searchSection: { padding: 15 },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 10 },
  fetchBtn: { flexDirection: 'row', backgroundColor: '#00BFA5', padding: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  fetchBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },

  card: { margin: 15, backgroundColor: '#1A1A1A', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  thumbnail: { width: '100%', height: 200, backgroundColor: '#222' },
  info: { padding: 15 },
  title: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  downloadBtn: { flexDirection: 'row', backgroundColor: '#FF4444', padding: 10, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#FFF', marginLeft: 5, fontWeight: 'bold' }
});