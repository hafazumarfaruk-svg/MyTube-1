import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, Modal, Alert, Platform, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 
const MY_API_SERVER = "http://127.0.0.1:10000"; 

// =========================================================
// [NEW]: সম্পূর্ণ আলাদা 3D কম্পোনেন্ট (পারফরম্যান্স স্মুথ করার জন্য)
// =========================================================
const ThreeDDownloadModal = ({ visible, onClose, downloadLinks, downloadType, onToggleType, isLoading, onExecute }) => {
    const [rotation, setRotation] = useState({ x: 0, y: 0 });
    const rotationRef = useRef({ x: 0, y: 0 });

    const panResponder = useRef(
        PanResponder.create({
            // শুধুমাত্র সোয়াইপ করলেই এটি কাজ করবে, সাধারণ টাচ বা ক্লিকে বাধা দেবে না
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
            },
            onPanResponderMove: (evt, gestureState) => {
                // ন্যাচারাল সোয়াইপ ফিল দেওয়ার জন্য মাইনাস/প্লাস ব্যালেন্স করা হয়েছে
                setRotation({
                    x: rotationRef.current.x - gestureState.dy * 0.6,
                    y: rotationRef.current.y + gestureState.dx * 0.6
                });
            },
            onPanResponderRelease: (evt, gestureState) => {
                rotationRef.current.x -= gestureState.dy * 0.6;
                rotationRef.current.y += gestureState.dx * 0.6;
            }
        })
    ).current;

    // মডাল ওপেন হলে রোটেশন রিসেট করা
    useEffect(() => {
        if (visible) {
            setRotation({ x: 0, y: 0 });
            rotationRef.current = { x: 0, y: 0 };
        }
    }, [visible]);

    let backgroundCards = [];
    let foregroundCards = [];

    if (!isLoading && downloadLinks.length > 0) {
        // সর্বোচ্চ ১২টি লিংক রেন্ডার করা হবে যাতে ওভারল্যাপ বেশি না হয়
        const displayLinks = downloadLinks.slice(0, 12);
        const N = displayLinks.length;
        const radius = 160; // 3D বৃত্তের সাইজ

        const mappedCards = displayLinks.map((item, index) => {
            const angle = (index / N) * Math.PI * 2;
            const yOffset = N > 6 ? (index % 2 === 0 ? 45 : -45) : 0; 

            const baseZ = Math.sin(angle) * radius;
            const baseX = Math.cos(angle) * radius;
            const baseY = yOffset;

            const p = rotation.x * Math.PI / 180;
            const yw = rotation.y * Math.PI / 180;

            const y1 = baseY * Math.cos(p) - baseZ * Math.sin(p);
            const z1 = baseY * Math.sin(p) + baseZ * Math.cos(p);
            const x2 = baseX * Math.cos(yw) + z1 * Math.sin(yw);
            const z2 = -baseX * Math.sin(yw) + z1 * Math.cos(yw);

            const perspective = 800;
            const scale = perspective / (perspective - z2);
            const opacity = Math.max(0.15, Math.min(1, scale - 0.2)); 

            return { item, index, x: x2 * scale, y: y1 * scale, z: z2, scale, opacity };
        });

        mappedCards.sort((a, b) => a.z - b.z);

        backgroundCards = mappedCards.filter(c => c.z < 0);
        foregroundCards = mappedCards.filter(c => c.z >= 0);
    }

    const renderCard = (c) => (
        <TouchableOpacity 
            key={c.index} 
            style={[
                styles.floatingGlassCard, 
                { 
                    transform: [{ translateX: c.x }, { translateY: c.y }, { scale: c.scale }],
                    opacity: c.opacity,
                    zIndex: Math.round(c.z)
                }
            ]} 
            activeOpacity={0.8}
            onPress={() => onExecute(c.item)}
        >
            <Text style={styles.floatingType}>{downloadType === 'video' ? 'MP4' : 'MP3'}</Text>
            <Text style={styles.floatingQuality}>{c.item.quality}</Text>
            <Text style={styles.floatingSize}>{c.item.size || (downloadType === 'video' ? '≈ HD' : '≈ 128kbps')}</Text>
        </TouchableOpacity>
    );

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.threeDOverlay} {...panResponder.panHandlers}>
                
                {/* ডানপাশের উপরে থাকা ক্লোজ বাটন */}
                <TouchableOpacity style={styles.closeTopRightBtn} onPress={onClose}>
                    <Ionicons name="close" size={28} color="#FFF" />
                </TouchableOpacity>

                <View style={styles.threeDCluster}>
                    {/* পেছনের কার্ডগুলো */}
                    {backgroundCards.map(renderCard)}

                    {/* সেন্টার কিউব */}
                    <TouchableOpacity 
                        style={[
                            styles.centerGlassCube,
                            {
                                transform: [
                                    { perspective: 800 },
                                    { rotateX: `${-rotation.x}deg` },
                                    { rotateY: `${rotation.y}deg` }
                                ],
                                zIndex: 0
                            }
                        ]} 
                        activeOpacity={0.9} 
                        onPress={onToggleType}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="large" color="#FFF" />
                        ) : (
                            <>
                                <Ionicons name="videocam" size={32} color={downloadType === 'video' ? '#00BFA5' : 'rgba(255,255,255,0.4)'} />
                                <Ionicons name="swap-vertical" size={24} color="#888" style={{ marginVertical: 8 }} />
                                <Ionicons name="musical-notes" size={32} color={downloadType === 'audio' ? '#00BFA5' : 'rgba(255,255,255,0.4)'} />
                            </>
                        )}
                    </TouchableOpacity>

                    {/* সামনের কার্ডগুলো */}
                    {foregroundCards.map(renderCard)}
                </View>
            </View>
        </Modal>
    );
};
// =========================================================

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};

  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isExpandedDesc, setIsExpandedDesc] = useState(false);

  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // 3D Download Modal States
  const [show3DModal, setShow3DModal] = useState(false);
  const [downloadStep, setDownloadStep] = useState('fetching'); 
  const [downloadLinks, setDownloadLinks] = useState([]);
  const [downloadType, setDownloadType] = useState('video'); 

  const [isDownloading, setIsDownloading] = useState(false);
  const [isAudioMode, setIsAudioMode] = useState(videoData?.type === 'audio');

  useFocusEffect(
    useCallback(() => {
      DeviceEventEmitter.emit('maximizeVideo');
      if (Platform.OS === 'android') {
          NavigationBar.setVisibilityAsync("hidden");
      }
      return () => {
          DeviceEventEmitter.emit('minimizeVideo');
      };
    }, [])
  );

  useEffect(() => {
    checkSubscriptionStatus();
    fetchRelatedVideos(false);

    if (videoId && videoData) {
        DeviceEventEmitter.emit('playVideo', { videoId: videoId, videoData: videoData });
        setIsAudioMode(videoData?.type === 'audio');

        setIsInitialLoading(true);
        const timer = setTimeout(() => {
            setIsInitialLoading(false);
        }, 3000);

        return () => clearTimeout(timer);
    }
  }, [videoId]);

  const checkSubscriptionStatus = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      const parsedSubs = subs ? JSON.parse(subs) : [];
      setIsSubscribed(parsedSubs.some(s => s.name === videoData.channel));
    } catch (e) {}
  };

  const toggleSubscription = async () => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      subs = subs ? JSON.parse(subs) : [];
      const exists = subs.some(s => s.name === videoData.channel);
      if (exists) subs = subs.filter(s => s.name !== videoData.channel);
      else subs.push({ id: Date.now().toString(), name: videoData.channel, avatar: videoData.avatar });

      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
      setIsSubscribed(!exists);
    } catch (e) {}
  };

  const handleBackgroundPlay = () => {
    const newMode = !isAudioMode;
    setIsAudioMode(newMode);
    DeviceEventEmitter.emit('toggleAudioMode', newMode);
  };

  const handleDownloadExecute = async (item) => {
    try {
      setShow3DModal(false);
      setIsDownloading(true);
      setTimeout(() => setIsDownloading(false), 2000);

      const downloadId = Date.now().toString(); 
      const safeTitle = (videoData.title || 'video').replace(/[<>:"\/\\|?*]+/g, '').trim();
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const dlApiUrl = `${MY_API_SERVER}/api/aria-download?id=${downloadId}&url=${encodeURIComponent(targetUrl)}&quality=${encodeURIComponent(item.quality)}&type=${downloadType}&title=${encodeURIComponent(safeTitle)}`;

      const response = await fetch(dlApiUrl);
      const resJson = await response.json();

      if (resJson.success) {
          // সাইলেন্ট ডাউনলোড
      }
    } catch (error) {
      Alert.alert("সার্ভার এরর", "সার্ভারের সাথে কানেক্ট করা যায়নি।");
    }
  };

  const open3DDownloadWindow = () => {
      setShow3DModal(true);
      setDownloadType('video'); 
      setDownloadStep('fetching');
      fetchDownloadLinks('video');
  };

  const toggle3DDownloadType = () => {
      const newType = downloadType === 'video' ? 'audio' : 'video';
      setDownloadType(newType);
      setDownloadStep('fetching');
      fetchDownloadLinks(newType);
  };

  const fetchDownloadLinks = async (type) => {
    try {
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(targetUrl)}&action=download&type=${type}`;
      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.success && data.availableLinks) {
        setDownloadLinks(data.availableLinks);
        setDownloadStep('list');
      } else {
        Alert.alert("ত্রুটি", "কোনো লিংক পাওয়া যায়নি।");
        setShow3DModal(false);
      }
    } catch (error) {
      setShow3DModal(false);
    }
  };

  const fetchRelatedVideos = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    try {
      if (videoData.localUri || videoData.channel === 'Downloaded File') {
        const stored = await AsyncStorage.getItem('recorded_downloads');
        if (stored) {
          const parsed = JSON.parse(stored);
          const offlineVids = parsed
            .filter(item => item.videoId !== videoId && item.isCompleted)
            .map(item => ({
              id: item.videoId, title: item.title, channel: 'Downloaded File',
              views: `অফলাইন • ${item.quality}`, thumbnail: item.thumbnail, localUri: item.localUri, type: item.type
            }));
          setRelatedVideos(offlineVids);
        }
        setIsLoadingMore(false);
        return;
      }
      
      let searchQuery = "trending bangla";
      if (videoData?.title) {
          searchQuery = videoData.title.split(' ').slice(0, 4).join(' ');
      }

      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`);
      const text = await response.text();
      const match = text.match(/var ytInitialData = (.*?);<\/script>/);
      if (!match) return;
      
      const jsonData = JSON.parse(match[1]);
      const extractedVids = [];
      const extractNodes = (node) => {
        if (Array.isArray(node)) node.forEach(extractNodes);
        else if (node && typeof node === 'object') {
          if (node.videoRenderer && node.videoRenderer.videoId !== videoId) {
            extractedVids.push({ 
              id: node.videoRenderer.videoId, 
              title: node.videoRenderer.title?.runs?.[0]?.text, 
              channel: node.videoRenderer.ownerText?.runs?.[0]?.text, 
              views: node.videoRenderer.viewCountText?.simpleText || node.videoRenderer.shortViewCountText?.simpleText || '', 
              publishedTime: node.videoRenderer.publishedTimeText?.simpleText || '',
              duration: node.videoRenderer.lengthText?.simpleText || '',
              thumbnail: `https://i.ytimg.com/vi/${node.videoRenderer.videoId}/hqdefault.jpg`,
              avatar: node.videoRenderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url
            });
          } else Object.values(node).forEach(extractNodes);
        }
      };
      
      extractNodes(jsonData);
      setRelatedVideos(isLoadMore ? [...relatedVideos, ...extractedVids] : extractedVids.slice(0, 15));
    } catch (e) {} finally { setIsLoadingMore(false); }
  };

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <View style={styles.titleRow}>
         <TouchableOpacity activeOpacity={0.8} onPress={() => setIsExpandedDesc(!isExpandedDesc)} style={styles.titleTextContainer}>
            <Text style={styles.mainTitle} numberOfLines={isExpandedDesc ? null : 2}>{videoData?.title}</Text>
         </TouchableOpacity>
      </View>
      
      <View style={styles.metaActionRow}>
         <View style={styles.metaLeft}>
             <Text style={styles.mainViews}>{videoData?.views} {videoData?.publishedTime ? `• ${videoData.publishedTime}` : ''}</Text>
             <Text style={styles.moreText}>...more</Text>
         </View>
         
         <View style={styles.actionRight}>
            {!videoData.localUri && (
              <TouchableOpacity style={styles.iconOnlyBtn} onPress={open3DDownloadWindow} activeOpacity={0.6}>
                 <Ionicons name="download-outline" size={24} color="#FFF" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconOnlyBtn} onPress={handleBackgroundPlay} activeOpacity={0.6}>
               <Ionicons name={isAudioMode ? "headset" : "headset-outline"} size={24} color={isAudioMode ? "#00BFA5" : "#FFF"} />
            </TouchableOpacity>
         </View>
      </View>

      <View style={styles.channelRow}>
        <TouchableOpacity style={styles.channelLeft} onPress={() => navigation.navigate('Channel', { channelName: videoData.channel, channelAvatar: videoData.avatar })}>
          <Image source={{ uri: videoData.avatar || 'https://via.placeholder.com/40' }} style={styles.channelAvatar} />
          <View style={styles.channelTextCol}>
            <Text style={styles.channelName} numberOfLines={1}>{videoData.channel}</Text>
            <Text style={styles.subCount}>{videoData.localUri ? 'Offline Storage' : 'Subscriber Info'}</Text>
          </View>
        </TouchableOpacity>
        {!videoData.localUri && (
          <TouchableOpacity style={[styles.subscribeBtn, isSubscribed && styles.subscribedBtn]} onPress={toggleSubscription}>
            <Text style={[styles.subscribeText, isSubscribed && styles.subscribedText]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.divider} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} /> 
      
      <View style={styles.header}>
        <View style={styles.logoContainer}>
           <TouchableOpacity onPress={() => navigation.goBack()} style={{marginRight: 10}}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
           </TouchableOpacity>
           <Ionicons name="logo-youtube" size={28} color="#FF0000" />
           <Text style={styles.logoText}>MyTube</Text>
        </View>
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
          <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>সার্চ...</Text>
          <Ionicons name="search" size={18} color="#AAA" />
        </TouchableOpacity>
      </View>

      <View style={styles.playerWrapper}>
          {isInitialLoading && (
              <View style={styles.initialPlayerLoader}>
                  <ActivityIndicator size="large" color="#00BFA5" />
                  <Text style={styles.initialLoaderText}>ভিডিওটি লোড হচ্ছে...</Text>
              </View>
          )}
      </View>
      
      {isInitialLoading ? (
          <View style={styles.fullScreenLoader}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonMeta} />
              <View style={styles.skeletonChannel} />
          </View>
      ) : (
          <FlatList 
            ListHeaderComponent={renderHeader}
            data={relatedVideos} 
            keyExtractor={(item, index) => item.id + index.toString()} 
            renderItem={({item}) => (
              <TouchableOpacity style={styles.recCard} onPress={() => navigation.push('Player', { videoId: item.id, videoData: item })}>
                <View style={styles.thumbWrapper}>
                   <Image source={{ uri: item.thumbnail }} style={styles.recThumb} />
                   {item.duration ? (
                     <View style={styles.durationBadge}>
                       <Text style={styles.durationText}>{item.duration}</Text>
                     </View>
                   ) : null}
                </View>
                <View style={styles.recInfo}>
                  <Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.recMeta}>{item.channel}</Text>
                  <Text style={styles.recViewsInfo}>
                     {item.views} {item.publishedTime ? `• ${item.publishedTime}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            onEndReached={() => { if(!videoData.localUri) fetchRelatedVideos(true); }}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
      )}

      {/* অপ্টিমাইজড 3D মডাল রেন্ডার */}
      <ThreeDDownloadModal 
          visible={show3DModal} 
          onClose={() => setShow3DModal(false)}
          downloadLinks={downloadLinks}
          downloadType={downloadType}
          isLoading={downloadStep === 'fetching'}
          onToggleType={toggle3DDownloadType}
          onExecute={handleDownloadExecute}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#0F0F0F' },
    logoContainer: { flexDirection: 'row', alignItems: 'center', width: 130 },
    logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
    searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, paddingHorizontal: 12, alignItems: 'center', height: 38 },
    
    playerWrapper: { width: '100%', height: PLAYER_HEIGHT, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    initialPlayerLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    initialLoaderText: { color: '#00BFA5', marginTop: 10, fontSize: 14, fontWeight: '500' },

    fullScreenLoader: { padding: 15 },
    skeletonTitle: { height: 20, backgroundColor: '#1A1A1A', width: '90%', borderRadius: 4, marginBottom: 10 },
    skeletonMeta: { height: 12, backgroundColor: '#1A1A1A', width: '60%', borderRadius: 4, marginBottom: 20 },
    skeletonChannel: { height: 40, backgroundColor: '#1A1A1A', width: '100%', borderRadius: 8 },

    detailsContainer: { padding: 12, backgroundColor: '#0F0F0F' },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
    titleTextContainer: { flex: 1 },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    
    metaActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 15 },
    metaLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    mainViews: { color: '#AAA', fontSize: 12 },
    moreText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 8 },
    
    actionRight: { flexDirection: 'row', alignItems: 'center' },
    iconOnlyBtn: { padding: 8, marginLeft: 15 }, 
    
    divider: { height: 1, backgroundColor: '#222', marginVertical: 10 },
    channelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    channelLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    channelAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#333' },
    channelTextCol: { flex: 1 },
    channelName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    subCount: { color: '#AAA', fontSize: 12 },
    subscribeBtn: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    subscribeText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
    subscribedBtn: { backgroundColor: '#222' },
    subscribedText: { color: '#FFF' },
    
    recCard: { flexDirection: 'row', padding: 10, backgroundColor: '#0F0F0F' },
    thumbWrapper: { position: 'relative' },
    recThumb: { width: 150, height: 85, borderRadius: 10, backgroundColor: '#222' },
    durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0, 0, 0, 0.8)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
    durationText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
    recInfo: { flex: 1, marginLeft: 12, justifyContent: 'flex-start', paddingTop: 2 },
    recTitle: { color: '#FFF', fontSize: 14, fontWeight: '500', lineHeight: 20 },
    recMeta: { color: '#AAA', fontSize: 12, marginTop: 4 },
    recViewsInfo: { color: '#888', fontSize: 11, marginTop: 2 },
    
    // ==========================================
    // 3D UI Styles
    // ==========================================
    threeDOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center' },
    threeDCluster: { position: 'relative', width: 0, height: 0, justifyContent: 'center', alignItems: 'center' },
    
    centerGlassCube: {
        position: 'absolute',
        width: 120, height: 120,
        marginLeft: -60, marginTop: -60, 
        backgroundColor: 'rgba(25, 25, 25, 0.9)',
        borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 25,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#00BFA5', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3, shadowRadius: 30,
        elevation: 15
    },

    floatingGlassCard: {
        position: 'absolute',
        width: 110, height: 65,
        marginLeft: -55, marginTop: -32.5,
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)',
        borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.8, shadowRadius: 15,
    },
    floatingType: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
    floatingQuality: { color: '#00BFA5', fontSize: 11, marginTop: 2, fontWeight: '700' },
    floatingSize: { color: '#AAA', fontSize: 10, marginTop: 2 },

    closeTopRightBtn: {
        position: 'absolute', 
        top: Platform.OS === 'ios' ? 55 : 35, 
        right: 25,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.4)',
        zIndex: 9999
    }
});