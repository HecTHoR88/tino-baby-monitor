import React, { useEffect, useRef, useState } from 'react';
import { Peer, MediaConnection, DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { analyzeBabyFrame } from '../services/geminiService';
import { getDeviceId, getDeviceName } from '../services/deviceStorage';
import { secureStorage } from '../services/secureStorage';
import { MonitorHistoryItem, Language } from '../types';
import { translations } from '../services/translations';

interface BabyMonitorProps {
  onBack: () => void;
  lang: Language;
}

interface ConnectedPeer {
  id: string; 
  deviceId: string; 
  name: string;
  conn: DataConnection;
}

export const BabyMonitor: React.FC<BabyMonitorProps> = ({ onBack, lang }) => {
  const t = translations[lang];
  const [peerId, setPeerId] = useState<string>('');
  const [connectionToken, setConnectionToken] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [connectedPeers, setConnectedPeers] = useState<ConnectedPeer[]>([]);
  const [serverStatus, setServerStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const [isNightVision, setIsNightVision] = useState(false);
  const [isLullabyOn, setIsLullabyOn] = useState(false);
  const [showQrPanel, setShowQrPanel] = useState(true);
  const [isReceivingVoice, setIsReceivingVoice] = useState(false); 
  
  const [showSettings, setShowSettings] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [currentQuality, setCurrentQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [micEnabled, setMicEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
  const [powerSaving, setPowerSaving] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);
  const [useDefaultDim, setUseDefaultDim] = useState(true);
  const [dimBrightness, setDimBrightness] = useState(10);
  
  const peerRef = useRef<Peer | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null); 
  const activeCallsRef = useRef<MediaConnection[]>([]);
  const activeDataConnsRef = useRef<DataConnection[]>([]);
  const analysisIntervalRef = useRef<any>(null);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lullabyGainRef = useRef<GainNode | null>(null);
  const lullabySourceRef = useRef<AudioBufferSourceNode | null>(null);

  const batteryRef = useRef<any>(null);
  const lastNotificationTimeRef = useRef<number>(0);
  const inactivityTimerRef = useRef<any>(null);

  const notificationsEnabledRef = useRef(notificationsEnabled);
  useEffect(() => { notificationsEnabledRef.current = notificationsEnabled; }, [notificationsEnabled]);

  const unlockAudio = () => {
    if (remoteAudioRef.current) {
        remoteAudioRef.current.play().then(() => {
            remoteAudioRef.current?.pause();
        }).catch(() => {});
    }
  };

  const resetInactivityTimer = () => {
      if (!powerSaving) return;
      setIsDimmed(false); 
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
          setIsDimmed(true);
      }, 20000); 
  };

  useEffect(() => {
      if (powerSaving) {
          resetInactivityTimer();
          const events = ['touchstart', 'click', 'mousemove', 'keydown'];
          events.forEach(ev => window.addEventListener(ev, resetInactivityTimer));
          return () => events.forEach(ev => window.removeEventListener(ev, resetInactivityTimer));
      } else {
          setIsDimmed(false);
          if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      }
  }, [powerSaving]);

  useEffect(() => {
    unlockAudio();
    let token = secureStorage.getItem<string>('tino_conn_token');
    if (!token) {
        token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        secureStorage.setItem('tino_conn_token', token);
    }
    setConnectionToken(token);

    const initializeMonitor = async () => {
      try {
        setServerStatus('connecting');
        await startStream('environment', 'medium');
        setupPeer(token!);
        setupBattery();
        startAIAnalysisLoop(); 
        try { if ('wakeLock' in navigator) await (navigator as any).wakeLock.request('screen'); } catch (e) {}
      } catch (err) { console.error("Init Error:", err); }
    };

    initializeMonitor();
    const heartbeat = setInterval(() => {
        if (peerRef.current && peerRef.current.disconnected && !peerRef.current.destroyed) peerRef.current.reconnect();
    }, 5000);

    return () => {
      clearInterval(heartbeat);
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
      if (peerRef.current) peerRef.current.destroy();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      stopLullaby();
      if (batteryRef.current) {
        batteryRef.current.onlevelchange = null;
        batteryRef.current.onchargingchange = null;
      }
    };
  }, []);

  useEffect(() => {
      if (connectedPeers.length > 0) setShowQrPanel(false);
      else setShowQrPanel(true);
  }, [connectedPeers.length]);

  const saveParentToHistory = (uniqueId: string, name: string) => {
      try {
          const now = Date.now();
          const currentHistory = secureStorage.getItem<MonitorHistoryItem[]>('parent_history') || [];
          const existingIndex = currentHistory.findIndex(h => h.id === uniqueId);
          let newHistory;

          if (existingIndex >= 0) {
              const oldItem = currentHistory[existingIndex];
              const oldLogs = oldItem.logs || [];
              const newLogs = [now, ...oldLogs].slice(0, 50);
              const updatedItem = { ...oldItem, name, lastConnected: now, logs: newLogs };
              const others = currentHistory.filter(h => h.id !== uniqueId);
              newHistory = [updatedItem, ...others];
          } else {
              const newItem: MonitorHistoryItem = { id: uniqueId, name, lastConnected: now, logs: [now] };
              newHistory = [newItem, ...currentHistory];
          }
          secureStorage.setItem('parent_history', newHistory.slice(0, 20));
      } catch (e) { console.error("Error guardando historial padres", e); }
  };

  const getConstraints = (quality: 'high' | 'medium' | 'low') => {
      switch (quality) {
          case 'high': return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } }; 
          case 'low': return { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 10 } }; 
          case 'medium': 
          default: return { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }; 
      }
  };

  const startStream = async (faceMode: 'user' | 'environment', quality: 'high' | 'medium' | 'low') => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (localVideoRef.current) {
          localVideoRef.current.srcObject = null;
      }

      const constraints = getConstraints(quality);
      
      try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: faceMode, ...constraints },
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });

          streamRef.current = mediaStream;
          
          const videoTrack = mediaStream.getVideoTracks()[0];
          const settings = videoTrack.getSettings();
          
          let actualFacing = settings.facingMode as any || faceMode;
          const isPC = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          
          if (isPC || faceMode === 'user') actualFacing = 'user';
          
          setFacingMode(actualFacing);
          setCurrentQuality(quality);

          mediaStream.getAudioTracks().forEach(t => t.enabled = micEnabled);

          if (localVideoRef.current) {
              localVideoRef.current.srcObject = mediaStream;
              localVideoRef.current.muted = true;
          }
          
          activeCallsRef.current.forEach(call => {
              if (call.peerConnection) {
                  call.peerConnection.getSenders().forEach(sender => {
                      if (sender.track?.kind === 'video') {
                          sender.replaceTrack(mediaStream.getVideoTracks()[0]).catch(e => console.warn("Video replace fail", e));
                      }
                      if (sender.track?.kind === 'audio') {
                          sender.replaceTrack(mediaStream.getAudioTracks()[0]).catch(e => console.warn("Audio replace fail", e));
                      }
                  });
              }
          });
          
          setIsNightVision(false);

      } catch (error) {
          console.error("Failed to start stream:", error);
          if (faceMode === 'environment') {
              startStream('user', quality);
          } else if (quality === 'high') {
              startStream(faceMode, 'medium');
          } else {
              alert("Error al acceder a la cámara.");
          }
      }
  };

  const changeCamera = async (mode: 'user' | 'environment') => {
      if (mode === facingMode) return;
      try { await startStream(mode, currentQuality); } catch (e) { alert("Error al cambiar cámara"); }
  };

  const changeQuality = async (newQuality: 'high' | 'medium' | 'low') => {
      if (newQuality === currentQuality) return;
      try {
          await startStream(facingMode, newQuality);
      } catch (e) { console.error("Quality switch failed", e); }
  };

  const toggleMic = (enabled: boolean) => {
      setMicEnabled(enabled);
      if (streamRef.current) {
          streamRef.current.getAudioTracks().forEach(t => t.enabled = enabled);
      }
  };

  const callParent = (targetPeerId: string) => {
      if (!peerRef.current || !streamRef.current) return;
      const call = peerRef.current.call(targetPeerId, streamRef.current);
      activeCallsRef.current.push(call);
      call.on('close', () => {
          activeCallsRef.current = activeCallsRef.current.filter(c => c !== call);
      });
  };

  const setupPeer = (token: string) => {
    const myId = getDeviceId();
    const peer = new Peer(myId, { 
        config: { 
            iceServers: [
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ] 
        } 
    });

    peer.on('open', (id) => { setPeerId(id); setServerStatus('connected'); generateSecureQR(id, token); });
    
    peer.on('call', (call) => { 
        call.answer(); 
        setIsReceivingVoice(true);
        call.on('stream', (remoteStream) => {
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStream;
                const playAudio = () => {
                    remoteAudioRef.current?.play().catch(e => {
                        console.warn("Retrying playback...");
                        setTimeout(playAudio, 500);
                    });
                };
                playAudio();
            }
        });
        call.on('close', () => setIsReceivingVoice(false));
    });
    
    peer.on('connection', (conn) => {
        const incomingToken = (conn.metadata as any)?.token;
        if (incomingToken !== token) {
            conn.on('open', () => {
                conn.send({ type: 'ERROR_AUTH', message: t.auth_error });
                setTimeout(() => conn.close(), 500);
            });
            return;
        }

        conn.on('open', () => { 
            activeDataConnsRef.current.push(conn);
            conn.send({ type: 'INFO_DEVICE_NAME', name: getDeviceName() });
            
            const metadata = conn.metadata as any;
            const deviceName = metadata?.name || `Padre ${conn.peer.substr(0,4)}`;
            const deviceId = metadata?.deviceId || conn.peer;

            setConnectedPeers(prev => {
                if (prev.find(p => p.deviceId === deviceId)) return prev;
                return [...prev, { id: conn.peer, deviceId, name: deviceName, conn }];
            });

            saveParentToHistory(deviceId, deviceName);
            broadcastBatteryStatus();
            
            setTimeout(() => callParent(conn.peer), 500);
        });
        
        conn.on('data', (data: any) => { 
            if (data?.type === 'CMD_FLASH') toggleFlash(data.value); 
            if (data?.type === 'CMD_LULLABY') toggleLullaby(data.value);
            if (data?.type === 'CMD_QUALITY') changeQuality(data.value);
        });
        
        conn.on('close', () => { 
            activeDataConnsRef.current = activeDataConnsRef.current.filter(c => c !== conn); 
            setConnectedPeers(prev => prev.filter(p => p.conn !== conn)); 
        });
    });
    peerRef.current = peer;
  };

  const setupBattery = async () => {
    try {
        if ('getBattery' in navigator) {
            const battery = await (navigator as any).getBattery();
            batteryRef.current = battery;
            const handleBatteryChange = () => broadcastBatteryStatus();
            battery.addEventListener('levelchange', handleBatteryChange);
            battery.addEventListener('chargingchange', handleBatteryChange);
            broadcastBatteryStatus();
        }
    } catch (e) { }
  };

  const broadcastBatteryStatus = () => {
    if (!batteryRef.current) return;
    const status = { type: 'BATTERY_STATUS', level: batteryRef.current.level, charging: batteryRef.current.charging };
    activeDataConnsRef.current.forEach(conn => { if (conn.open) try { conn.send(status); } catch(e){} });
  };

  const startAIAnalysisLoop = () => {
      analysisIntervalRef.current = setInterval(async () => {
          if (activeDataConnsRef.current.length === 0 || !localVideoRef.current) return;
          const canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = 240;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(localVideoRef.current, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL('image/jpeg', 0.5);
          
          try {
              const result = await analyzeBabyFrame(base64);
              if (result.status === 'crying' || result.status === 'awake') {
                  const now = Date.now();
                  if (now - lastNotificationTimeRef.current > 30000) {
                      lastNotificationTimeRef.current = now;
                      const title = result.status === 'crying' ? t.alert_cry_title : t.alert_move_title;
                      const body = result.description || t.alert_body;
                      
                      if (notificationsEnabledRef.current) {
                          activeDataConnsRef.current.forEach(conn => {
                              if (conn.open) conn.send({ type: 'CMD_NOTIFICATION', title, body });
                          });
                      }
                  }
              }
          } catch (e) {}
      }, 5000);
  };

  const generateSecureQR = async (id: string, token: string) => { 
      try { 
          const payload = JSON.stringify({ id, token });
          setQrCodeUrl(await QRCode.toDataURL(payload, { margin: 2, width: 300, color: { dark: '#334155', light: '#ffffff' } })); 
      } catch (e) {} 
  };
  
  const toggleFlash = async (enable: boolean) => { 
      if (!streamRef.current) return; 
      try { 
          const track = streamRef.current.getVideoTracks()[0]; 
          if (facingMode === 'environment') {
            await track.applyConstraints({ advanced: [{ torch: enable } as any] }); 
            setIsNightVision(enable); 
          }
      } catch (e) {} 
  };
  
  const toggleLullaby = (enable: boolean) => {
    setIsLullabyOn(enable);
    if (enable) {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        const ctx = audioCtxRef.current;
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.02 * white)) / 1.02;
            data[i] = lastOut * 3.5; 
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 450; 
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 2); 
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
        lullabySourceRef.current = noise;
        lullabyGainRef.current = gain;
    } else { 
        stopLullaby(); 
    }
  };

  const stopLullaby = () => { 
      if (lullabySourceRef.current && lullabyGainRef.current && audioCtxRef.current) { 
          const ctx = audioCtxRef.current;
          const gain = lullabyGainRef.current;
          const source = lullabySourceRef.current;
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
          setTimeout(() => {
              try { source.stop(); } catch(e){}
          }, 1000);
          lullabySourceRef.current = null;
          lullabyGainRef.current = null;
      } 
      setIsLullabyOn(false); 
  };

  const dimOpacity = 1 - (useDefaultDim ? 0.1 : (dimBrightness / 100));

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden relative font-sans" onClick={unlockAudio}>
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      
      {isReceivingVoice && (
          <div className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center animate-pulse">
              <div className="bg-indigo-500/10 border-4 border-indigo-500/20 p-12 rounded-full backdrop-blur-sm">
                  <span className="text-7xl opacity-20">📢</span>
              </div>
          </div>
      )}

      {isDimmed && (
          <div 
            className="absolute inset-0 z-50 flex flex-col items-center justify-center text-white/40 cursor-pointer backdrop-blur-sm transition-all duration-500" 
            style={{ backgroundColor: `rgba(0,0,0,${dimOpacity})` }}
            onClick={resetInactivityTimer}
          >
              <span className="text-5xl animate-pulse mb-4 opacity-50">🔋</span>
              <p className="text-sm font-bold tracking-widest uppercase opacity-50">{t.power_save}</p>
              <p className="text-xs mt-2 opacity-30">{t.dim_wake}</p>
          </div>
      )}

      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start">
        <div className="flex flex-col gap-2">
            <div className="bg-white/90 backdrop-blur-md shadow-sm px-4 py-2 rounded-full flex items-center gap-2 w-max">
                <div className={`w-2.5 h-2.5 rounded-full ${serverStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></div>
                <span className="text-slate-600 text-xs font-bold tracking-wide">{serverStatus === 'connected' ? t.online : t.connecting}</span>
            </div>
            {!showQrPanel && (
                <button onClick={() => setShowQrPanel(true)} className="bg-white/90 shadow-sm px-4 py-2 rounded-full text-slate-500 text-xs font-bold w-max hover:bg-white flex items-center gap-1">
                    <span>📱</span> {connectedPeers.length}/3
                </button>
            )}
        </div>
        <div className="flex gap-3">
            <button onClick={() => setShowSettings(true)} className="bg-white/90 shadow-sm w-10 h-10 rounded-full flex items-center justify-center text-slate-700 hover:bg-white transition-colors active:scale-95">
                <span className="text-xl">⚙️</span>
            </button>
            <button onClick={onBack} className="bg-white/90 shadow-sm w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-white transition-colors active:scale-95">✕</button>
        </div>
      </div>

      <div className={`relative transition-all duration-500 ease-in-out ${showQrPanel ? 'h-[45%] rounded-b-[2.5rem] shadow-xl z-10' : 'flex-1 h-full z-0' } bg-slate-200 overflow-hidden`}>
        <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover transition-transform duration-500"
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
        />
        
        <div className="absolute bottom-6 left-6 flex flex-col gap-2">
            <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl text-sky-600 text-xs font-bold animate-pulse shadow-sm flex items-center gap-2">🧠 {t.ai_active}</div>
            {isLullabyOn && <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl text-indigo-500 text-xs font-bold animate-pulse shadow-sm flex items-center gap-2">🎵 {t.lullaby_active}</div>}
            {isNightVision && <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl text-amber-500 text-xs font-bold shadow-sm flex items-center gap-2">⚡ {t.flash_on}</div>}
            {powerSaving && <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl text-emerald-600 text-xs font-bold shadow-sm flex items-center gap-2">🔋 {t.saver_on}</div>}
            
            <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl text-slate-600 text-xs font-bold shadow-sm flex items-center gap-2 uppercase">
                <span>📹</span> {currentQuality === 'high' ? 'HD 720p' : currentQuality === 'medium' ? 'SD 480p' : 'ECO 240p'}
            </div>
        </div>
      </div>

      {showQrPanel && (
          <div className="flex-1 p-6 flex flex-col items-center justify-start overflow-y-auto no-scrollbar animate-fade-in">
            {connectedPeers.length < 3 ? (
                <div className="w-full max-w-sm flex flex-col items-center pt-4">
                    <div className="bg-white p-4 rounded-[2rem] shadow-lg shadow-slate-200/50 mb-6 border border-slate-100">
                        {qrCodeUrl && <img src={qrCodeUrl} className="w-48 h-48 rounded-xl" alt="QR" />}
                    </div>
                    <div className="flex flex-col items-center mb-2">
                        <h2 className="text-xl font-extrabold text-slate-800">{t.link_device}</h2>
                        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mt-1">{t.secure_conn}</p>
                    </div>
                    <p className="text-slate-400 text-center text-sm mb-6 px-4">{t.scan_instruction}</p>
                    
                    {connectedPeers.length > 0 && (
                        <div className="w-full mb-6">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-2">{t.connected_users} ({connectedPeers.length})</h3>
                            <div className="space-y-2">
                                {connectedPeers.map(peer => (
                                    <div key={peer.id} className="bg-white p-3 rounded-xl border border-emerald-100 flex items-center gap-3 shadow-sm">
                                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-sm">📱</div>
                                        <span className="text-sm font-bold text-slate-700">{peer.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl w-full max-w-sm border border-emerald-100 shadow-sm">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-4xl mb-4">🛡️</div>
                    <h3 className="text-xl font-bold text-emerald-600">{t.max_users}</h3>
                    <p className="text-slate-400 mt-2 text-sm">{t.max_users_desc}</p>
                </div>
            )}
          </div>
      )}

      {showSettings && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center animate-fade-in p-6" onClick={() => setShowSettings(false)}>
              <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl space-y-5 max-h-[90%] overflow-y-auto no-scrollbar" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-2">
                      <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">{t.settings_modal}</h2>
                      <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold hover:bg-slate-200 transition-colors">✕</button>
                  </div>

                  <div>
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">{t.cam_select}</h3>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                          <button onClick={() => changeCamera('environment')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${facingMode === 'environment' ? 'bg-gradient-to-r from-indigo-500 to-pink-500 text-white' : 'text-slate-500'}`}>{t.back_cam}</button>
                          <button onClick={() => changeCamera('user')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${facingMode === 'user' ? 'bg-gradient-to-r from-indigo-500 to-pink-500 text-white' : 'text-slate-500'}`}>{t.front_cam}</button>
                      </div>
                  </div>

                  <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 text-sm">{t.mic_title}</h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={micEnabled} onChange={(e) => toggleMic(e.target.checked)} />
                        <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-indigo-500 shadow-inner after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                  </div>

                  <div>
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">{t.res_title}</h3>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                          <button onClick={() => changeQuality('low')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${currentQuality === 'low' ? 'bg-indigo-500 text-white' : 'text-slate-500'}`}>Eco</button>
                          <button onClick={() => changeQuality('medium')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${currentQuality === 'medium' ? 'bg-indigo-500 text-white' : 'text-slate-500'}`}>SD</button>
                          <button onClick={() => changeQuality('high')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${currentQuality === 'high' ? 'bg-indigo-500 text-white' : 'text-slate-500'}`}>HD</button>
                      </div>
                  </div>

                  <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 text-sm">{t.ai_alerts}</h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={notificationsEnabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} />
                        <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-rose-500 shadow-inner after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                          <h3 className="font-bold text-slate-800 text-sm">{t.power_save}</h3>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={powerSaving} onChange={(e) => setPowerSaving(e.target.checked)} />
                            <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 shadow-inner after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                      </div>
                      {powerSaving && (
                          <div className="bg-slate-50 p-3 rounded-xl space-y-2">
                              <div className="flex items-center gap-2">
                                  <input type="checkbox" className="accent-indigo-600" checked={useDefaultDim} onChange={(e) => setUseDefaultDim(e.target.checked)} />
                                  <span className="text-[10px] font-bold text-slate-600">{t.dim_default}</span>
                              </div>
                              {!useDefaultDim && (
                                  <input type="range" min="0" max="50" step="5" value={dimBrightness} onChange={(e) => setDimBrightness(parseInt(e.target.value))} className="w-full accent-indigo-600" />
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};