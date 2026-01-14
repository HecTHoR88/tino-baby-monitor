
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
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  
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

  const lightTrackRef = useRef<MediaStreamTrack | null>(null);

  const notificationsEnabledRef = useRef(notificationsEnabled);
  useEffect(() => { notificationsEnabledRef.current = notificationsEnabled; }, [notificationsEnabled]);

  const nightVisionRef = useRef(isNightVision);
  useEffect(() => { nightVisionRef.current = isNightVision; }, [isNightVision]);

  const sensitivityRef = useRef(sensitivity);
  useEffect(() => { 
    sensitivityRef.current = sensitivity;
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      startAIAnalysisLoop();
    }
  }, [sensitivity]);

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
      // Corrected: Remove redundant getTracks() call on the MediaStreamTrack[] array.
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (lightTrackRef.current) {
          try {
              lightTrackRef.current.stop();
              const s = (lightTrackRef.current as any)._streamOwner;
              if (s) s.getTracks().forEach((t: any) => t.stop());
          } catch(e){}
      }
      stopLullaby();
    };
  }, []);

  useEffect(() => {
      if (connectedPeers.length > 0) setShowQrPanel(false);
      else setShowQrPanel(true);
  }, [connectedPeers.length]);

  const startStream = async (faceMode: 'user' | 'environment', quality: 'high' | 'medium' | 'low') => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
      }
      
      const constraints = {
          high: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } },
          medium: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
          low: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 10 } }
      };
      
      try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: faceMode }, ...constraints[quality] },
              audio: { echoCancellation: true, noiseSuppression: true }
          });

          streamRef.current = mediaStream;
          const videoTrack = mediaStream.getVideoTracks()[0];
          const settings = videoTrack.getSettings();
          const actualFacing = settings.facingMode as any || faceMode;
          
          setFacingMode(actualFacing);
          setCurrentQuality(quality);

          if (localVideoRef.current) {
              localVideoRef.current.srcObject = mediaStream;
              localVideoRef.current.muted = true;
          }

          activeDataConnsRef.current.forEach(conn => {
              if (conn.open) conn.send({ type: 'INFO_CAMERA_TYPE', value: actualFacing });
          });

          if (nightVisionRef.current) {
              setTimeout(() => toggleFlash(true), 1500);
          }
          
          activeCallsRef.current.forEach(call => {
              if (call.peerConnection) {
                  call.peerConnection.getSenders().forEach(sender => {
                      if (sender.track?.kind === 'video') sender.replaceTrack(videoTrack).catch(() => {});
                  });
              }
          });

      } catch (error) {
          console.error("Stream Error:", error);
          if (faceMode === 'environment') startStream('user', quality);
      }
  };

  const toggleFlash = async (enable: boolean) => {
      setIsNightVision(enable);
      
      if (lightTrackRef.current) {
          try { 
              lightTrackRef.current.stop(); 
              const owner = (lightTrackRef.current as any)._streamOwner;
              if (owner) owner.getTracks().forEach((t: any) => t.stop());
          } catch(e){}
          lightTrackRef.current = null;
      }

      if (!enable) {
          if (streamRef.current) {
              const track = streamRef.current.getVideoTracks()[0];
              try { await track.applyConstraints({ advanced: [{ torch: false } as any] }); } catch(e){}
          }
          return;
      }

      if (!streamRef.current) return;

      const attemptTorch = async (track: MediaStreamTrack) => {
          try {
              await track.applyConstraints({ advanced: [{ torch: true } as any] });
              return true;
          } catch (e) { return false; }
      };

      let success = false;
      if (facingMode === 'environment') {
          success = await attemptTorch(streamRef.current.getVideoTracks()[0]);
      }

      if (!success) {
          try {
              const auxStream = await navigator.mediaDevices.getUserMedia({
                  video: { 
                      facingMode: 'environment',
                      width: { ideal: 1 }, 
                      height: { ideal: 1 } 
                  }
              });
              const auxTrack = auxStream.getVideoTracks()[0];
              (auxTrack as any)._streamOwner = auxStream;
              success = await attemptTorch(auxTrack);
              
              if (success) {
                  lightTrackRef.current = auxTrack;
              } else {
                  auxStream.getTracks().forEach(t => t.stop());
              }
          } catch (e) {
              console.warn("Fallo canal secundario de luz:", e);
          }
      }

      if (!success && enable) {
          setTimeout(() => {
              if (nightVisionRef.current) toggleFlash(true);
          }, 1000);
      }
  };

  const changeCamera = (mode: 'user' | 'environment') => {
      startStream(mode, currentQuality);
  };

  const changeQuality = (newQuality: 'high' | 'medium' | 'low') => {
      startStream(facingMode, newQuality);
  };

  const toggleMic = (enabled: boolean) => {
      setMicEnabled(enabled);
      if (streamRef.current) streamRef.current.getAudioTracks().forEach(t => t.enabled = enabled);
  };

  const setupPeer = (token: string) => {
    const myId = getDeviceId();
    const peer = new Peer(myId, { 
        config: { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        },
        debug: 1
    });

    peer.on('open', (id) => { setPeerId(id); setServerStatus('connected'); generateSecureQR(id, token); });
    
    peer.on('connection', (conn) => {
        const incomingToken = (conn.metadata as any)?.token;
        if (incomingToken !== token) {
            conn.on('open', () => { conn.send({ type: 'ERROR_AUTH' }); setTimeout(() => conn.close(), 500); });
            return;
        }

        conn.on('open', () => { 
            activeDataConnsRef.current.push(conn);
            const parentName = (conn.metadata as any)?.name || 'Padre';
            const parentDeviceId = (conn.metadata as any)?.deviceId;

            if (parentDeviceId) {
                const now = Date.now();
                const existingHistory = secureStorage.getItem<MonitorHistoryItem[]>('parent_history') || [];
                const existingIndex = existingHistory.findIndex(h => h.id === parentDeviceId);
                
                let updatedHistory: MonitorHistoryItem[];
                if (existingIndex >= 0) {
                    const oldItem = existingHistory[existingIndex];
                    const newLogs = [now, ...(oldItem.logs || [])].slice(0, 50);
                    const updatedItem = { ...oldItem, name: parentName, lastConnected: now, logs: newLogs };
                    const others = existingHistory.filter(h => h.id !== parentDeviceId);
                    updatedHistory = [updatedItem, ...others];
                } else {
                    const newItem = { id: parentDeviceId, name: parentName, lastConnected: now, logs: [now] };
                    updatedHistory = [newItem, ...existingHistory].slice(0, 20);
                }
                secureStorage.setItem('parent_history', updatedHistory);
            }

            conn.send({ type: 'INFO_DEVICE_NAME', name: getDeviceName() });
            conn.send({ type: 'INFO_CAMERA_TYPE', value: facingMode });
            
            setConnectedPeers(prev => {
                if (prev.find(p => p.deviceId === parentDeviceId)) return prev;
                return [...prev, { id: conn.peer, deviceId: parentDeviceId, name: parentName, conn }];
            });

            setTimeout(() => {
                if (peerRef.current && streamRef.current) {
                    const call = peerRef.current.call(conn.peer, streamRef.current);
                    activeCallsRef.current.push(call);
                }
            }, 1000);
        });
        
        conn.on('data', (data: any) => { 
            if (data?.type === 'CMD_FLASH') toggleFlash(data.value); 
            if (data?.type === 'CMD_LULLABY') toggleLullaby(data.value);
            if (data?.type === 'CMD_QUALITY') changeQuality(data.value);
            if (data?.type === 'CMD_CAMERA') changeCamera(data.value);
            if (data?.type === 'CMD_SENSITIVITY') setSensitivity(data.value);
        });
        
        conn.on('close', () => { 
            activeDataConnsRef.current = activeDataConnsRef.current.filter(c => c !== conn); 
            setConnectedPeers(prev => prev.filter(p => p.conn !== conn)); 
        });
    });

    peer.on('call', (call) => {
        call.answer();
        setIsReceivingVoice(true);
        call.on('stream', (remoteStream) => {
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStream;
                remoteAudioRef.current.play().catch(() => {});
            }
        });
        call.on('close', () => setIsReceivingVoice(false));
    });

    peerRef.current = peer;
  };

  const generateSecureQR = async (id: string, token: string) => { 
      try { 
          setQrCodeUrl(await QRCode.toDataURL(JSON.stringify({ id, token }), { margin: 2, width: 300 })); 
      } catch (e) {} 
  };

  const toggleLullaby = (enable: boolean) => {
    setIsLullabyOn(enable);
    if (enable) {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        const ctx = audioCtxRef.current;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < buffer.length; i++) {
            let white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.02 * white)) / 1.02;
            data[i] = lastOut * 3.5;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer; noise.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 450;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 2);
        noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        noise.start();
        lullabySourceRef.current = noise; lullabyGainRef.current = gain;
    } else {
        stopLullaby();
    }
  };

  const stopLullaby = () => {
      if (lullabySourceRef.current && lullabyGainRef.current) {
          lullabyGainRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current!.currentTime + 1);
          setTimeout(() => { try{lullabySourceRef.current?.stop();}catch(e){} }, 1000);
          lullabySourceRef.current = null; lullabyGainRef.current = null;
      }
      setIsLullabyOn(false);
  };

  const setupBattery = async () => {
    if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        batteryRef.current = battery;
        const update = () => {
            const status = { type: 'BATTERY_STATUS', level: battery.level, charging: battery.charging };
            activeDataConnsRef.current.forEach(conn => { if (conn.open) conn.send(status); });
        };
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
        update();
    }
  };

  const startAIAnalysisLoop = () => {
      const intervals = { low: 15000, medium: 7000, high: 3000 };
      const currentInterval = intervals[sensitivityRef.current] || 7000;

      analysisIntervalRef.current = setInterval(async () => {
          if (activeDataConnsRef.current.length === 0 || !localVideoRef.current) return;
          const canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = 240;
          canvas.getContext('2d')?.drawImage(localVideoRef.current, 0, 0, 320, 240);
          try {
              const result = await analyzeBabyFrame(canvas.toDataURL('image/jpeg', 0.5));
              if ((result.status === 'crying' || result.status === 'awake') && notificationsEnabledRef.current) {
                  const now = Date.now();
                  const cooldown = sensitivityRef.current === 'high' ? 15000 : 30000;
                  if (now - lastNotificationTimeRef.current > cooldown) {
                      lastNotificationTimeRef.current = now;
                      activeDataConnsRef.current.forEach(conn => {
                          if (conn.open) conn.send({ type: 'CMD_NOTIFICATION', title: result.status === 'crying' ? t.alert_cry_title : t.alert_move_title, body: result.description });
                      });
                  }
              }
          } catch (e) {}
      }, currentInterval);
  };

  const dimOpacity = 1 - (useDefaultDim ? 0.1 : (dimBrightness / 100));

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden relative font-sans" onClick={unlockAudio}>
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      
      {isReceivingVoice && (
          <div className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center">
              <div className="bg-indigo-500/10 border-4 border-indigo-500/20 p-12 rounded-full backdrop-blur-sm animate-pulse">
                  <span className="text-7xl opacity-20">📢</span>
              </div>
          </div>
      )}

      {isDimmed && (
          <div 
            className="absolute inset-0 z-[70] flex flex-col items-center justify-center text-white/40 cursor-pointer backdrop-blur-sm transition-all duration-500" 
            style={{ backgroundColor: `rgba(0,0,0,${dimOpacity})` }}
            onClick={resetInactivityTimer}
          >
              <span className="text-5xl animate-pulse mb-4 opacity-50">🔋</span>
              <p className="text-sm font-bold tracking-widest uppercase opacity-50">{t.power_save}</p>
              <p className="text-xs mt-2 opacity-30">{t.dim_wake}</p>
          </div>
      )}

      {/* ENCABEZADO OPTIMIZADO: pt-2 para subir botones al máximo en Fullscreen */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 pt-2 flex justify-between items-start">
        <div className="flex flex-col gap-1.5">
            <div className="bg-white/90 backdrop-blur-md shadow-sm px-3 py-1.5 rounded-full flex items-center gap-2 w-max">
                <div className={`w-2 h-2 rounded-full ${serverStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></div>
                <span className="text-slate-600 text-[10px] font-bold tracking-wide uppercase">{serverStatus === 'connected' ? t.online : t.connecting}</span>
            </div>
            {!showQrPanel && (
                <button onClick={() => setShowQrPanel(true)} className="bg-white/90 shadow-sm px-3 py-1.5 rounded-full text-slate-500 text-[10px] font-bold w-max flex items-center gap-1">
                    <span>📱</span> {connectedPeers.length}/3
                </button>
            )}
        </div>
        <div className="flex gap-2">
            <button onClick={() => setShowSettings(true)} className="bg-white/90 shadow-sm w-9 h-9 rounded-full flex items-center justify-center text-slate-700 active:scale-95 transition-all">
                <span className="text-lg">⚙️</span>
            </button>
            <button onClick={onBack} className="bg-white/90 shadow-sm w-9 h-9 mr-2 rounded-full flex items-center justify-center text-slate-500 active:scale-95 transition-all">✕</button>
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
        
        {/* ETIQUETAS DE ESTADO COMPACTAS: text-[9px] y padding reducido */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-30">
            <div className="bg-white/90 backdrop-blur px-2 py-0.5 rounded-lg text-sky-600 text-[9px] font-bold animate-pulse shadow-sm flex items-center gap-1 w-max"><span>🧠</span> {t.ai_active}</div>
            {isLullabyOn && <div className="bg-white/90 backdrop-blur px-2 py-0.5 rounded-lg text-indigo-500 text-[9px] font-bold animate-pulse shadow-sm flex items-center gap-1 w-max"><span>🎵</span> {t.lullaby_active}</div>}
            {isNightVision && (
                <div className="bg-white/90 backdrop-blur px-2 py-0.5 rounded-lg text-amber-500 text-[9px] font-bold shadow-sm flex items-center gap-1 w-max">
                    <span>⚡</span> {t.flash_on}
                </div>
            )}
            <div className="bg-white/90 backdrop-blur px-2 py-0.5 rounded-lg text-slate-600 text-[9px] font-bold shadow-sm flex items-center gap-1 uppercase w-max">
                <span>📹</span> {currentQuality.toUpperCase()}
            </div>
        </div>
      </div>

      {showQrPanel && (
          <div className="flex-1 p-6 flex flex-col items-center justify-start overflow-y-auto no-scrollbar animate-fade-in">
            <div className="w-full max-w-sm flex flex-col items-center pt-4">
                <div className="bg-white p-4 rounded-[2rem] shadow-lg shadow-slate-200/50 mb-6 border border-slate-100">
                    {qrCodeUrl && <img src={qrCodeUrl} className="w-48 h-48 rounded-xl" alt="QR" />}
                </div>
                <h2 className="text-xl font-extrabold text-slate-800">{t.link_device}</h2>
                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mt-1 mb-4">{t.secure_conn}</p>
                <p className="text-slate-400 text-center text-sm mb-6 px-4">{t.scan_instruction}</p>
                
                {connectedPeers.length > 0 && (
                    <div className="w-full">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-2">{t.connected_users} ({connectedPeers.length})</h3>
                        <div className="space-y-2">
                            {connectedPeers.map(peer => (
                                <div key={peer.id} className="bg-white p-3 rounded-xl border border-emerald-100 flex items-center gap-3 shadow-sm">
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-sm">📱</div>
                                    <span className="text-sm font-bold text-slate-700 truncate">{peer.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
          </div>
      )}

      {showSettings && (
          <div className="absolute inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center animate-fade-in p-6" onClick={() => setShowSettings(false)}>
              <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-2">
                      <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">{t.settings_modal}</h2>
                      <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold">✕</button>
                  </div>

                  <div>
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">{t.cam_select}</h3>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                          <button onClick={() => changeCamera('environment')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${facingMode === 'environment' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500'}`}>{t.back_cam}</button>
                          <button onClick={() => changeCamera('user')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${facingMode === 'user' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500'}`}>{t.front_cam}</button>
                      </div>
                  </div>

                  <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 text-sm">{t.mic_title}</h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={micEnabled} onChange={(e) => toggleMic(e.target.checked)} />
                        <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                  </div>

                  <div>
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">{t.res_title}</h3>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                          {['low', 'medium', 'high'].map(q => (
                              <button key={q} onClick={() => changeQuality(q as any)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${currentQuality === q ? 'bg-indigo-500 text-white' : 'text-slate-500'}`}>{q.toUpperCase()}</button>
                          ))}
                      </div>
                  </div>

                  <div>
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">{t.sensitivity_title}</h3>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                          {['low', 'medium', 'high'].map(s => (
                              <button key={s} onClick={() => setSensitivity(s as any)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${sensitivity === s ? 'bg-indigo-500 text-white' : 'text-slate-500'}`}>{t[`sens_${s.substring(0,3)}` as any] || s.toUpperCase()}</button>
                          ))}
                      </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <h3 className="font-bold text-slate-800 text-sm">{t.power_save}</h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={powerSaving} onChange={(e) => setPowerSaving(e.target.checked)} />
                        <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};