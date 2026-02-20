import React, { useEffect, useRef, useState } from 'react';
import { Peer, MediaConnection, DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { analyzeBabyFrame } from '../services/geminiService';
import { getDeviceId, getDeviceName, getPersistentNumericId, getCameraPreference, setCameraPreference } from '../services/deviceStorage';
import { secureStorage } from '../services/secureStorage';
import { MonitorHistoryItem, Language } from '../types';
import { translations } from '../services/translations';

// Agregamos la nueva función a la lista, manteniendo las anteriores
import { getDeviceId, getDeviceName, getPersistentNumericId } from '../services/deviceStorage';
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
  const [lullabyMode, setLullabyMode] = useState<number>(0); // 0: off, 1: Lluvia, 2: Corazón, 3: Ondas
  const [isReceivingVoice, setIsReceivingVoice] = useState(false); 
  
  // Lógica Dinámica de QR e ID
  const [qrForceVisible, setQrForceVisible] = useState(false);
  const qrTimeoutRef = useRef<any>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [currentQuality, setCurrentQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [micEnabled, setMicEnabled] = useState(true);
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

  const nightVisionRef = useRef(isNightVision);
  const sensitivityRef = useRef(sensitivity);

  useEffect(() => { nightVisionRef.current = isNightVision; }, [isNightVision]);
  useEffect(() => { 
    sensitivityRef.current = sensitivity;
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      startAIAnalysisLoop();
    }
  }, [sensitivity]);

  const toggleQrManually = () => {
    setQrForceVisible(true);
    if (qrTimeoutRef.current) clearTimeout(qrTimeoutRef.current);
    qrTimeoutRef.current = setTimeout(() => {
        setQrForceVisible(false);
    }, 30000); // 30 segundos de gracia
  };

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
        
        // LEEMOS LA PREFERENCIA GUARDADA
        const savedCamera = getCameraPreference();
        
        // INICIAMOS CON LA CÁMARA QUE EL USUARIO PREFIRIÓ LA ÚLTIMA VEZ
        await startStream(savedCamera, 'medium');
        
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
      if (qrTimeoutRef.current) clearTimeout(qrTimeoutRef.current);
      stopLullaby();
    };
  }, []);

const startStream = async (faceMode: 'user' | 'environment', quality: 'high' | 'medium' | 'low') => {
      const existingAudioTrack = streamRef.current?.getAudioTracks()[0];
      if (streamRef.current) {
          streamRef.current.getVideoTracks().forEach(t => t.stop());
      }

      // AJUSTE PRO: Ponemos mínimos para forzar la lente principal
      const constraints = {
          high: { 
              width: { min: 1280, ideal: 1920 }, 
              height: { min: 720, ideal: 1080 }, 
              frameRate: { ideal: 20 } 
          },
          medium: { 
              width: { min: 1280, ideal: 1280 }, 
              height: { min: 720, ideal: 720 }, 
              frameRate: { ideal: 15 } 
          },
          low: { 
              width: { ideal: 640 }, 
              height: { ideal: 480 }, 
              frameRate: { ideal: 10 } 
          }
      };

      try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: faceMode }, ...constraints[quality] },
              audio: existingAudioTrack ? false : { echoCancellation: true, noiseSuppression: true }
          });

          const newVideoTrack = mediaStream.getVideoTracks()[0];

          if (streamRef.current) {
              streamRef.current.getVideoTracks().forEach(t => streamRef.current?.removeTrack(t));
              streamRef.current.addTrack(newVideoTrack);
              activeCallsRef.current.forEach(call => {
                  const videoSender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                  if (videoSender) videoSender.replaceTrack(newVideoTrack).catch(e => console.error(e));
              });
          } else {
              streamRef.current = mediaStream;
          }

          setFacingMode(faceMode);
          setCurrentQuality(quality);

          if (localVideoRef.current) {
              localVideoRef.current.srcObject = null;
              localVideoRef.current.srcObject = streamRef.current;
              localVideoRef.current.muted = true;
              await localVideoRef.current.play().catch(() => {});
          }

          activeDataConnsRef.current.forEach(conn => {
              if (conn.open) conn.send({ type: 'INFO_CAMERA_TYPE', value: faceMode });
          });

      } catch (error) {
          console.error("Error en lentes, reintentando modo compatible...", error);
          // Si los mínimos fallan, reintentamos sin mínimos (modo seguro)
          const fallback = await navigator.mediaDevices.getUserMedia({ video: { facingMode: faceMode } });
          streamRef.current = fallback;
          if (localVideoRef.current) localVideoRef.current.srcObject = fallback;
      }
  };

  const toggleFlash = async (enable: boolean) => {
    setIsNightVision(enable);
    if (!streamRef.current) return;
    try {
        const track = streamRef.current.getVideoTracks()[0];
        await track.applyConstraints({ advanced: [{ torch: enable } as any] });
    } catch (e) { console.warn("Flash no disponible"); }
  };

  const changeCamera = (mode: 'user' | 'environment') => {
      // ANOTAMOS EN EL BAÚL LA NUEVA PREFERENCIA
      setCameraPreference(mode);
      startStream(mode, currentQuality);
  };
  // REGLA DE ORO: Usamos la preferencia real guardada para que al cambiar calidad no se resetee la lente
  const changeQuality = (newQuality: 'high' | 'medium' | 'low') => {
      const currentActualCamera = getCameraPreference(); 
      startStream(currentActualCamera, newQuality);
  };
  const toggleMic = (enabled: boolean) => {
      setMicEnabled(enabled);
      if (streamRef.current) streamRef.current.getAudioTracks().forEach(t => t.enabled = enabled);
  };

  const setupPeer = (token: string) => {
    const numericId = getPersistentNumericId();
    const peer = new Peer(numericId, { 
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
        debug: 1
    });
    peer.on('open', (id) => { setPeerId(id); setServerStatus('connected'); generateSecureQR(id, token); });
    peer.on('connection', (conn) => {
        // --- LÓGICA DE VINCULACIÓN MANUAL REPARADA ---
        conn.on('open', () => { 
            activeDataConnsRef.current.push(conn);
            
            const parentName = (conn.metadata as any)?.name || 'Padre';
            const parentDeviceId = (conn.metadata as any)?.deviceId;

            // Guardamos al padre en el historial (lo que arreglamos hace un momento)
            if (parentDeviceId) {
                const now = Date.now();
                const existingHistory = secureStorage.getItem<MonitorHistoryItem[]>('parent_history') || [];
                const others = existingHistory.filter(h => h.id !== parentDeviceId);
                const oldItem = existingHistory.find(h => h.id === parentDeviceId);
                const updatedItem = {
                    id: parentDeviceId,
                    name: parentName,
                    lastConnected: now,
                    logs: [now, ...(oldItem?.logs || [])].slice(0, 50)
                };
                secureStorage.setItem('parent_history', [updatedItem, ...others].slice(0, 20));
            }

            // ENVIAMOS EL NOMBRE Y EL TOKEN PARA QUE EL PADRE TENGA LA LLAVE
            conn.send({ 
                type: 'INFO_DEVICE_NAME', 
                name: getDeviceName(),
                token: token // Enviamos el token real para que el padre lo guarde
            });

            setConnectedPeers(prev => {
                if (prev.find(p => p.deviceId === parentDeviceId)) return prev;
                return [...prev, { id: conn.peer, deviceId: parentDeviceId, name: parentName, conn }];
            });

            if (peerRef.current && streamRef.current) {
                const call = peerRef.current.call(conn.peer, streamRef.current);
                activeCallsRef.current.push(call);
            }
        });

        conn.on('data', (data: any) => { 
            if (data?.type === 'CMD_FLASH') toggleFlash(data.value); 
            if (data?.type === 'CMD_LULLABY') toggleLullaby(Number(data.value));
            if (data?.type === 'CMD_QUALITY') changeQuality(data.value);
            if (data?.type === 'CMD_CAMERA') changeCamera(data.value);
            if (data?.type === 'CMD_WATCHDOG_REFRESH') {
            // REGLA DE ORO: En lugar de confiar en la memoria 'suelta', 
            // leemos directamente la preferencia real guardada en el baúl.
            const currentActualCamera = getCameraPreference();
            
            console.log(">>> Watchdog: Refrescando con la cámara real guardada:", currentActualCamera);
            
            // Forzamos el inicio con la cámara correcta
            startStream(currentActualCamera, currentQuality);
        }
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
      try { setQrCodeUrl(await QRCode.toDataURL(JSON.stringify({ id, token }), { margin: 2, width: 300 })); } catch (e) {} 
  };

 
  const stopLullaby = () => {
      if (lullabySourceRef.current) {
          try {
              lullabySourceRef.current.stop();
              lullabySourceRef.current.disconnect();
          } catch (e) {}
          lullabySourceRef.current = null;
      }
      if (lullabyGainRef.current) {
          lullabyGainRef.current.disconnect();
          lullabyGainRef.current = null;
      }
      // Cerramos el contexto para liberar el hardware de sonido por completo
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
      }
      setIsLullabyOn(false);
  };

const toggleLullaby = (mode: number) => {
    // Si el modo es 0 o el mismo que ya suena, apagamos
    if (mode === 0) {
        stopLullaby();
        setLullabyMode(0);
        return;
    }

    // Limpieza previa si ya estaba sonando una
    if (lullabySourceRef.current) stopLullaby();

    setLullabyMode(mode);
    setIsLullabyOn(true);

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const ctx = audioCtxRef.current;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    // Configuración inicial del volumen (SILENCIO TOTAL para empezar el Fade-in)
    gain.gain.setValueAtTime(0, ctx.currentTime);
    
    if (mode === 1) { // MODO 1: LLUVIA / RUIDO BLANCO SUAVE
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) { data[i] = Math.random() * 2 - 1; }
        const source = ctx.createBufferSource();
        source.buffer = buffer; source.loop = true;
        filter.type = 'lowpass'; filter.frequency.value = 400; // Sonido más cálido
        source.connect(filter); filter.connect(gain);
        source.start();
        lullabySourceRef.current = source;
    } 
    else if (mode === 2) { // MODO 2: LATIDO DE CORAZÓN
        const osc = ctx.createOscillator();
        const thump = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 50; // Frecuencia muy baja
        // Lógica de pulso (Latido doble: Tum-tum... Tum-tum)
        const lfo = ctx.createOscillator();
        lfo.type = 'square'; lfo.frequency.value = 1.2; // Ritmo cardíaco
        lfo.connect(thump.gain); osc.connect(thump); thump.connect(gain);
        osc.start(); lfo.start();
        lullabySourceRef.current = osc;
    }
    else if (mode === 3) { // MODO 3: ONDAS RELAJANTES
        const osc = ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = 150;
        const vca = ctx.createGain();
        // LFO para simular el vaivén del mar
        const lfo = ctx.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = 0.2; // Movimiento lento
        lfo.connect(vca.gain); osc.connect(vca); vca.connect(gain);
        osc.start(); lfo.start();
        lullabySourceRef.current = osc;
    }

    gain.connect(ctx.destination);
    lullabyGainRef.current = gain;

    // FADE-IN PROFESIONAL: Sube de 0 a 0.08 (volumen medio) en 4 segundos
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 4);
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
      analysisIntervalRef.current = setInterval(async () => {
          if (activeDataConnsRef.current.length === 0 || !localVideoRef.current) return;
          const canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = 240;
          canvas.getContext('2d')?.drawImage(localVideoRef.current, 0, 0, 320, 240);
          try {
              const result = await analyzeBabyFrame(canvas.toDataURL('image/jpeg', 0.5));
              if ((result.status === 'crying' || result.status === 'awake')) {
                  const now = Date.now();
                  if (now - lastNotificationTimeRef.current > 30000) {
                      lastNotificationTimeRef.current = now;
                      activeDataConnsRef.current.forEach(conn => {
                          if (conn.open) conn.send({ type: 'CMD_NOTIFICATION', title: result.status === 'crying' ? t.alert_cry_title : t.alert_move_title, body: result.description });
                      });
                  }
              }
          } catch (e) {}
      }, 7000);
  };

  const dimOpacity = 1 - (useDefaultDim ? 0.1 : (dimBrightness / 100));
  const isSomeoneConnected = connectedPeers.length > 0;
  const showQrSection = !isSomeoneConnected || qrForceVisible;

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden relative font-sans" onClick={unlockAudio}>
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      
      {/* REGLA DE ORO: Cabecera Ultra-High con iconos SVG unificados */}
      <div className="absolute top-0 left-0 right-0 z-[60] pt-safe mt-1 px-5 flex justify-between items-center h-16">
        <div className="flex gap-2 items-center">
            <div className={`bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border shadow-sm transition-all ${isSomeoneConnected ? 'border-emerald-200' : 'border-white'}`}>
                <div className={`w-2 h-2 rounded-full ${isSomeoneConnected ? 'bg-emerald-400' : serverStatus === 'connected' ? 'bg-indigo-400' : 'bg-amber-400 animate-pulse'}`}></div>
                <span className="text-slate-600 text-[9px] font-black uppercase tracking-wide">{isSomeoneConnected ? t.online : t.connecting}</span>
            </div>
            {isSomeoneConnected && (
                <div className="bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white shadow-sm text-[9px] font-black text-slate-400">
                    📱 {connectedPeers.length}/3
                </div>
            )}
        </div>
        <div className="flex gap-3">
            <button onClick={() => setShowSettings(true)} className="bg-white shadow-xl w-10 h-10 rounded-full flex items-center justify-center text-slate-700 active:scale-90 transition-all border border-white/50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </button>
            <button onClick={onBack} className="bg-white shadow-xl w-10 h-10 rounded-full flex items-center justify-center text-rose-500 active:scale-90 transition-all border border-white/50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
      </div>

      {/* REGLA DE ORO: Estructura Vertical Dinámica */}
      <div className="flex flex-col h-full w-full pt-20">
        
        {/* SECCIÓN SUPERIOR: VIDEO DINÁMICO */}
        <div className={`flex-none flex justify-center transition-all duration-700 ease-in-out ${showQrSection ? 'mb-4' : 'flex-1 mb-10'}`}>
            <div 
              className={`aspect-[4/5] bg-slate-200 rounded-[3rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden relative border-[2px] transition-all duration-700 ${isSomeoneConnected ? 'w-full max-w-[380px] border-emerald-300' : 'w-[92%] max-w-[340px] border-white/80'}`}
            >
                <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                    style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />
                
                {/* Burbujas de estado con iconos */}
                <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-30">
                    <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-xl text-sky-600 text-[9px] font-black animate-pulse shadow-sm flex items-center gap-1.5 w-max border border-white/20">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        IA
                    </div>
                    {isLullabyOn && (
    <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-xl text-indigo-500 text-[9px] font-black animate-pulse shadow-sm flex items-center gap-1.5 w-max border border-white/20 uppercase">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg>
        {lullabyMode === 1 ? 'LLUVIA' : lullabyMode === 2 ? 'CORAZÓN' : 'ONDAS'}
    </div>
)}
                    <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-xl text-slate-600 text-[9px] font-black shadow-sm flex items-center gap-1.5 uppercase w-max border border-white/20">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        {currentQuality.toUpperCase()}
                    </div>
                </div>
            </div>
        </div>

        {/* SECCIÓN INFERIOR: QR DINÁMICO */}
        <div className="flex-1 px-8 pb-10 flex flex-col items-center justify-start overflow-y-auto no-scrollbar transition-all duration-500">
            {showQrSection ? (
                <div className="w-full max-w-[320px] flex flex-col items-center animate-fade-in">
                    <div className="bg-white p-4 rounded-[2.5rem] shadow-xl border border-white/60 mb-6 relative">
                        {qrCodeUrl ? <img src={qrCodeUrl} className="w-36 h-36 rounded-[1.5rem]" alt="QR" /> : <div className="w-36 h-36 bg-slate-100 animate-pulse rounded-[1.5rem]" />}
                        {qrForceVisible && isSomeoneConnected && (
                            <div className="absolute -top-3 -right-3 bg-indigo-600 text-white text-[8px] px-2 py-1 rounded-full font-black animate-pulse">
                                AUTO-HIDE
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-indigo-50 border border-indigo-100 px-6 py-3 rounded-[1.5rem] mb-4 shadow-sm w-full">
                        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] text-center mb-1">CÓDIGO DE VINCULACIÓN</p>
                        <p className="text-xl font-black text-indigo-700 text-center tracking-[0.15em] font-mono">{peerId || '------'}</p>
                    </div>
                    <p className="text-slate-400 text-center text-[10px] leading-relaxed px-4 font-bold">{t.scan_instruction}</p>
                </div>
            ) : (
                <div className="w-full max-w-[320px] flex flex-col items-center animate-fade-in">
                    <button 
                        onClick={toggleQrManually}
                        className="w-full py-5 bg-white border border-indigo-100 text-indigo-600 rounded-[2rem] font-black text-[10px] tracking-widest uppercase shadow-sm active:scale-95 transition-all flex items-center justify-center gap-3"
                    >
                        <span className="text-lg">➕</span> {t.link_device}
                    </button>
                    <p className="text-slate-300 text-[9px] font-black uppercase tracking-widest mt-6">Protección P2P Activa</p>
                </div>
            )}
        </div>
      </div>

      {/* Modal de Ajustes Compacto */}
      {showSettings && (
          <div className="absolute inset-0 z-[80] bg-slate-900/50 backdrop-blur-md flex items-center justify-center animate-fade-in p-6" onClick={() => setShowSettings(false)}>
              <div className="bg-white w-full max-w-[300px] rounded-[3rem] p-8 shadow-2xl space-y-6 border border-white" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-2">
                      <h2 className="text-xl font-black text-slate-800 tracking-tight">{t.settings_modal}</h2>
                      <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-black active:scale-90 transition-all">✕</button>
                  </div>
                  <div>
                      <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">{t.cam_select}</h3>
                      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-100">
                          <button onClick={() => changeCamera('environment')} className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${facingMode === 'environment' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>{t.back_cam}</button>
                          <button onClick={() => changeCamera('user')} className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${facingMode === 'user' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>{t.front_cam}</button>
                      </div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                      <h3 className="font-black text-slate-700 text-xs">{t.mic_title}</h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={micEnabled} onChange={(e) => toggleMic(e.target.checked)} />
                        <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-[16px]"></div>
                      </label>
                  </div>
                  <div>
                      <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">{t.res_title}</h3>
                      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-100">
                          {['low', 'medium', 'high'].map(q => (
                              <button key={q} onClick={() => changeQuality(q as any)} className={`flex-1 py-2 rounded-xl text-[9px] font-black transition-all ${currentQuality === q ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>{q.toUpperCase()}</button>
                          ))}
                      </div>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <h3 className="font-black text-slate-700 text-xs">{t.power_save}</h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={powerSaving} onChange={(e) => setPowerSaving(e.target.checked)} />
                        <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-[16px]"></div>
                      </label>
                  </div>
              </div>
          </div>
      )}

      {isReceivingVoice && (
          <div className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center">
              <div className="bg-indigo-500/10 border-4 border-indigo-500/20 p-12 rounded-full backdrop-blur-sm animate-pulse">
                  <span className="text-7xl opacity-20">📢</span>
              </div>
          </div>
      )}

      {isDimmed && (
          <div 
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center text-white/40 cursor-pointer backdrop-blur-md transition-all duration-500" 
            style={{ backgroundColor: `rgba(0,0,0,${dimOpacity})` }}
            onClick={resetInactivityTimer}
          >
              <span className="text-5xl animate-pulse mb-4 opacity-50">🔋</span>
              <p className="text-sm font-bold tracking-widest uppercase opacity-50">{t.power_save}</p>
          </div>
      )}
    </div>
  );
};