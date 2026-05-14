import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video'; 
import { Audio } from 'expo-av'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';

LogBox.ignoreLogs(['[expo-av]', 'Video component from `expo-av`']);

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16;
const MINI_WIDTH = width * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoViewRef = useRef(null); // ফুলস্ক্রিন করার জন্য Ref
  const syncAudioRef = useRef(new Audio.Sound()); 
  const currentVideoIdRef = useRef(null);
  const fetchIdRef = useRef(0);
  
  // ডাবল ট্যাপের জন্য Ref
  const lastTapRef = useRef({ time: 0, side: '' });
  const tapTimeoutRef = useRef(null);

  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamMode, setStreamMode] = useState('combined');
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [fallbackData, setFallbackData] = useState(null);

  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // --- [নতুন প্লেয়ার ইঞ্জিন সেটআপ] ---
  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    p.play();
  });

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  // --- [আপডেট ৩: কড়া নিয়মে অন্য স্ক্রিনে গেলে অটো মিনিমাইজ] ---
  useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e) => {
      if (!e.data.state) return;
      const routes = e.data.state.routes;
      const currentRoute = routes[routes.length - 1].name;
      
      // 'Player' বা 'PlayerScreen' ছাড়া অন্য কোথাও গেলে মিনিমাইজ হয়ে যাবে
      if (currentRoute !== 'Player' && currentRoute !== 'PlayerScreen' && playerState === 'full') {
        setPlayerState('mini');
      }
    });
    
    // ম্যানুয়ালি ইভেন্ট দিয়েও মিনিমাইজ করানো যাবে
    const minSub = DeviceEventEmitter.addListener('forceMinimizeGlobalPlayer', () => setPlayerState('mini'));

    return () => {
        unsubscribe();
        minSub.remove();
    };
  }, [navigation, playerState]);

  // অডিও এবং ভিডিও সিঙ্কিং লজিক
  const syncAudioWithVideo = async (targetPositionSeconds) => {
      try {
          const status = await syncAudioRef.current.getStatusAsync();
          if (status.isLoaded) {
              await syncAudioRef.current.setPositionAsync(targetPositionSeconds * 1000);
              if (player.playing) await syncAudioRef.current.playAsync();
          }
      } catch (e) { console.log("Sync Error:", e); }
  };

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      fetchIdRef.current = Date.now();
      currentVideoIdRef.current = data.videoId;
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setFallbackData(null);
      setIsAudioMode(false);
      triggerControls();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });

    return () => playSub.remove();
  }, []);

  const fetchStreamUrl = async (vidId, targetQuality, fetchId) => {
    try {
      const qStr = targetQuality.toString().toUpperCase();
      let reqQ = 720;
      if (qStr.includes('8K') || qStr.includes('4320')) reqQ = 4320;
      else if (qStr.includes('4K') || qStr.includes('2160')) reqQ = 2160;
      else if (qStr.includes('2K') || qStr.includes('1440')) reqQ = 1440;
      else reqQ = parseInt(qStr.replace(/\D/g, '')) || 720;
      
      const res = await fetch(`${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${reqQ}&action=play`);
      const json = await res.json();

      if (fetchId !== fetchIdRef.current) return;

      if (json.success && json.url) {
          const resQ = parseInt(json.quality) || 720;
          if (reqQ > resQ) {
              setFallbackData({ reqQ, resQ, data: json, message: `Requested ${reqQ}p is not available. Play ${resQ}p instead?` });
              return;
          }
          startPlayback(json);
      }
    } catch(e) { console.log("Fetch Error"); }
  };

  const startPlayback = async (json) => {
    setStreamMode(json.streamType || 'combined');
    setStreamUrl(json.url);
    if (json.audioUrl) {
        await syncAudioRef.current.unloadAsync().catch(()=>{});
        await syncAudioRef.current.loadAsync({ uri: json.audioUrl }, { shouldPlay: player.playing }).catch(()=>{});
    }
  };

  // স্কিপিং লজিক
  const handleSkip = async (amount) => {
      let newTime = player.currentTime + amount;
      if (newTime < 0) newTime = 0;
      if (newTime > player.duration) newTime = player.duration;
      
      player.currentTime = newTime; 
      if (streamMode === 'separate') await syncAudioWithVideo(newTime); 
      triggerControls();
  };

  // --- [আপডেট ১: নিখুঁত ডাবল ট্যাপ এবং সিঙ্গেল ট্যাপ লজিক] ---
  const handleTap = (side) => {
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300; // ৩০০ মিলি-সেকেন্ডের মধ্যে ২ বার চাপলে ডাবল ট্যাপ
      
      if (lastTapRef.current.side === side && (now - lastTapRef.current.time) < DOUBLE_TAP_DELAY) {
          // ডাবল ট্যাপ হয়েছে (১০ সেকেন্ড স্কিপ)
          clearTimeout(tapTimeoutRef.current);
          lastTapRef.current = { time: 0, side: '' }; 
          handleSkip(side === 'right' ? 10 : -10);
      } else {
          // সিঙ্গেল ট্যাপ হিসেবে রেকর্ড করা হলো
          lastTapRef.current = { time: now, side };
          tapTimeoutRef.current = setTimeout(() => {
              // যদি ডাবল ট্যাপ না হয়, তবেই কন্ট্রোল দেখাবে/লুকাবে
              setShowControls(prev => !prev);
              lastTapRef.current = { time: 0, side: '' };
              if (!showControls) triggerControls();
          }, DOUBLE_TAP_DELAY);
      }
  };

  // --- [আপডেট ২: সোয়াইপ ডাউন করে মিনিমাইজ করার লজিক] ---
  const fullScreenPanResponder = useRef(PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
          // যদি নিচের দিকে জোরে সোয়াইপ করে, তবেই এটি কাজ করবে
          return gestureState.dy > 30 && Math.abs(gestureState.vy) > 0.5;
      },
      onPanResponderRelease: (evt, gestureState) => {
          if (gestureState.dy > 50) {
              setPlayerState('mini');
              if (navigation.canGoBack()) navigation.goBack();
          }
      }
  })).current;

  // মিনি প্লেয়ার ঘোরানোর লজিক
  const miniPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, 
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10,
    onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      pan.flattenOffset();
      let x = pan.x._value, y = pan.y._value;
      if (x > 10) x = 10; if (x < -(width - MINI_WIDTH - 20)) x = -(width - MINI_WIDTH - 20);
      if (y > 20) y = 20; if (y < -(height - MINI_HEIGHT - 120)) y = -(height - MINI_HEIGHT - 120);
      Animated.spring(pan, { toValue: { x, y }, friction: 6, useNativeDriver: false }).start();
    }
  })).current;

  // ব্যাকগ্রাউন্ড সিঙ্ক মনিটর
  useEffect(() => {
    const interval = setInterval(async () => {
        if (streamMode === 'separate' && player.playing) {
            const audioStatus = await syncAudioRef.current.getStatusAsync();
            if (audioStatus.isLoaded) {
                const diff = Math.abs((player.currentTime * 1000) - audioStatus.positionMillis);
                if (diff > 500) await syncAudioRef.current.setPositionAsync(player.currentTime * 1000);
                if (!audioStatus.isPlaying) await syncAudioRef.current.playAsync();
            }
        } else if (!player.playing) {
            await syncAudioRef.current.pauseAsync().catch(()=>{});
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [player.playing, streamMode]);

  if (playerState === 'hidden') return null;
  const isFull = playerState === 'full';

  return (
    <Animated.View 
        style={[isFull ? styles.fullContainer : styles.miniContainer, !isFull && { transform: pan.getTranslateTransform() }]} 
        {...(isFull ? fullScreenPanResponder.panHandlers : miniPanResponder.panHandlers)}
    >
      <View style={styles.videoWrapper}>
        
        {streamUrl && !fallbackData && !isAudioMode && (
          <VideoView 
            ref={videoViewRef} // ফুলস্ক্রিন অ্যাক্সেস করার জন্য
            player={player} 
            style={styles.video} 
            contentFit="contain"
            allowsFullscreen // নেটিভ ফুলস্ক্রিন সাপোর্ট
          />
        )}

        {/* ডাবল ট্যাপ এবং সিঙ্গেল ট্যাপ ডিটেকশন লেয়ার */}
        {isFull && !fallbackData && (
            <View style={styles.tapOverlay}>
                <TouchableWithoutFeedback onPress={() => handleTap('left')}><View style={styles.tapHalf} /></TouchableWithoutFeedback>
                <TouchableWithoutFeedback onPress={() => handleTap('right')}><View style={styles.tapHalf} /></TouchableWithoutFeedback>
            </View>
        )}

        {/* কন্ট্রোল বার */}
        {isFull && showControls && !fallbackData && (
          <View style={styles.controls} pointerEvents="box-none">
             <TouchableOpacity style={styles.backBtn} onPress={() => {
                 setPlayerState('mini');
                 if (navigation.canGoBack()) navigation.goBack();
             }}>
                <Ionicons name="chevron-down" size={35} color="#FFF" />
             </TouchableOpacity>
             
             <View style={styles.centerRow} pointerEvents="box-none">
                <TouchableOpacity onPress={() => player.playing ? player.pause() : player.play()}>
                   <Ionicons name={player.playing ? "pause-circle" : "play-circle"} size={75} color="#FFF" />
                </TouchableOpacity>
             </View>

             <View style={styles.bottomBar}>
                <Text style={styles.timeText}>{Math.floor(player.currentTime / 60)}:{Math.floor(player.currentTime % 60).toString().padStart(2, '0')}</Text>
                <Slider 
                  style={{flex: 1, height: 40, marginHorizontal: 10}}
                  minimumValue={0}
                  maximumValue={player.duration}
                  value={player.currentTime}
                  onSlidingComplete={async (v) => {
                      player.currentTime = v;
                      if (streamMode === 'separate') await syncAudioWithVideo(v);
                  }}
                  minimumTrackTintColor="#FF0000"
                  thumbTintColor="#FF0000"
                />
                <Text style={styles.timeText}>{Math.floor(player.duration / 60)}:{Math.floor(player.duration % 60).toString().padStart(2, '0')}</Text>
                
                {/* --- [আপডেট ২: স্ক্রিন ঘুরিয়ে ফুলস্ক্রিন করার বাটন] --- */}
                <TouchableOpacity style={{marginLeft: 15}} onPress={() => videoViewRef.current?.enterFullscreen()}>
                    <Ionicons name="expand" size={24} color="#FFF" />
                </TouchableOpacity>
             </View>
          </View>
        )}

        {/* ফলব্যাক মেসেজ */}
        {fallbackData && (
          <View style={styles.fallbackOverlay}>
            <Ionicons name="alert-circle" size={50} color="#FFD700" />
            <Text style={styles.fallbackText}>{fallbackData.message}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => { startPlayback(fallbackData.data); setFallbackData(null); }}>
              <Text style={styles.btnText}>OK, Play Highest Quality</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* মিনি প্লেয়ার ওপেন বাটন */}
        {!isFull && (
            <TouchableOpacity activeOpacity={0.9} style={styles.miniTouchableArea} onPress={() => {
                if (videoData) {
                    navigation.navigate('Player', { videoId: currentVideoIdRef.current, videoData });
                    setPlayerState('full');
                }
            }}>
                <TouchableOpacity onPress={() => setPlayerState('hidden')} style={styles.miniCloseBtn}>
                    <Ionicons name="close-circle" size={28} color="#FFF" />
                </TouchableOpacity>
            </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { position: 'absolute', top: 55, left: 0, width: width, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000' },
  miniContainer: { position: 'absolute', bottom: 100, right: 20, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', borderRadius: 15, overflow: 'hidden', elevation: 10, borderWidth: 1, borderColor: '#00FF00' },
  videoWrapper: { flex: 1, justifyContent: 'center' },
  video: { width: '100%', height: '100%' },
  tapOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 },
  tapHalf: { flex: 1 },
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  backBtn: { position: 'absolute', top: 10, left: 10, zIndex: 20 },
  centerRow: { flexDirection: 'row', alignItems: 'center', zIndex: 20 },
  bottomBar: { position: 'absolute', bottom: 5, width: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, zIndex: 20 },
  timeText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  fallbackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 30 },
  fallbackText: { color: '#FFF', textAlign: 'center', marginVertical: 20, fontSize: 16 },
  btn: { backgroundColor: '#FF0000', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 },
  miniCloseBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 15 },
});