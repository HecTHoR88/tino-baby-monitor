import React, { useEffect, useRef, useState } from 'react';
import { Peer, MediaConnection, DataConnection } from 'peerjs';
import jsQR from 'jsqr';
import { MonitorHistoryItem, Language } from '../types';
import { getDeviceName, getDeviceId } from '../services/deviceStorage';
import { secureStorage } from '../services/secureStorage';
import { translations } from '../services/translations';
const V85_GRADIENT = { background: 'linear-gradient(180deg, #bae6fd 0%, #fce7f3 100%)' };

interface ParentStationProps { 
    onBack: () => void;
    initialTargetId?: string | null;
    lang: Language;
}

export const ParentStation: React.FC<ParentStationProps> = ({ onBack, initialTargetId, lang }) => {
  const t = translations[lang];
  const [connectionId, setConnectionId] = useState('');
  const [history, setHistory] = useState<MonitorHistoryItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [nightVision, setNightVision] = useState(false);
  const [isNightVision, setIsNightVision] = useState(false); // Filtro digital local
  const [lullaby, setLullaby] = useState(false);
  const [remoteFacingMode, setRemoteFacingMode] = useState<'user' | 'environment'>('environment');
  
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [videoQuality, setVideoQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [showLowBatteryWarning, setShowLowBatteryWarning] = useState(false);

  // Monitor de Red
  const [isNetworkUnstable, setIsNetworkUnstable] = useState(false);
  const lastVideoTimeRef = useRef<number>(0);
  const stabilityCheckIntervalRef = useRef<any>(null);
  
  const peerRef = useRef<Peer | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const talkCallRef = useRef<MediaConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null); 
  const localStreamRef = useRef<MediaStream | null>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = secureStorage.getItem<MonitorHistoryItem[]>('monitor_history') || [];
    setHistory(saved);
    
    const peer = new Peer(undefined as any, { 
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
    
    peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
            setConnectionStatus(t.conn_error);
            setIsConnected(false);
        }
    });

    peer.on('open', () => {
        if (initialTargetId) {
            setConnectionId(initialTargetId);
            const item = saved?.find(h => h.id === initialTargetId);
            handleConnect(initialTargetId, item?.token);
        }
    });

    peer.on('call', (call) => {
        call.answer(); 
        call.on('stream', (remoteStream) => {
            if (videoRef.current) {
                videoRef.current.srcObject = remoteStream;
                videoRef.current.muted = true;
                videoRef.current.play().catch(() => {});
            }
        });
    });

    peerRef.current = peer;
    return () => { 
        peer.destroy(); stopScanner(); 
        if(localStreamRef.current) localStreamRef.current.getTracks().forEach(t=>t.stop()); 
        if(stabilityCheckIntervalRef.current) clearInterval(stabilityCheckIntervalRef.current);
    };
  }, []);

// Monitor de Estabilidad con Auto-Reparación (Watchdog)
  useEffect(() => {
    let frozenCount = 0; // Contador de segundos congelado

    if (isConnected) {
        stabilityCheckIntervalRef.current = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused) {
                const currentTime = videoRef.current.currentTime;
                
                if (currentTime === lastVideoTimeRef.current) {
                    frozenCount += 3; // Sumamos los 3 segundos del intervalo
                    
                    // Nivel 1: Aviso visual (3 segundos)
                    setIsNetworkUnstable(true);
                    
                    // Nivel 2: Auto-reparación (Más de 7 segundos congelado)
                    if (frozenCount >= 7) {
                        console.warn(">>> Watchdog: Video congelado detectado. Refrescando...");
                        sendCommand('CMD_WATCHDOG_REFRESH', true);
                        frozenCount = 0; // Reseteamos contador para esperar el nuevo stream
                    }
                } else {
                    // Si el video se mueve, todo está bien
                    setIsNetworkUnstable(false);
                    frozenCount = 0;
                }
                lastVideoTimeRef.current = currentTime;
            }
        }, 3000); 
    }

    return () => {
        if(stabilityCheckIntervalRef.current) clearInterval(stabilityCheckIntervalRef.current);
    };
  }, [isConnected]);

  // REGLA DE ORO: Pre-calentar micrófono para audio instantáneo
  const preWarmMicrophone = async () => {
      try {
          if (!localStreamRef.current) {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              stream.getAudioTracks().forEach(track => track.enabled = false);
              localStreamRef.current = stream;
          }
      } catch (e) {
          console.error("No se pudo pre-activar el micrófono:", e);
      }
  };

  const handleConnect = async (targetId: string, token?: string) => {
    if (!targetId || !peerRef.current) return;
    setConnectionStatus(t.connecting);
    
    // Enviamos un token temporal si es manual para que el bebé nos deje entrar
    const conn = peerRef.current.connect(targetId, {
        metadata: { 
            name: getDeviceName(), 
            deviceId: getDeviceId(), 
            token: token || 'VINCULACION_MANUAL' 
        }
    });

    conn.on('open', () => { 
        setIsConnected(true); 
        setConnectionStatus("");
    });

    conn.on('data', (data: any) => { 
        if (data?.type === 'ERROR_AUTH') { 
            alert(data.message || "Error de autorización"); 
            conn.close(); 
            return; 
        }
        
        // RECIBIR NOMBRE Y EL TOKEN REAL DEL BEBÉ
        if (data?.type === 'INFO_DEVICE_NAME') {
            // Guardamos el ID de 6 números junto con su token real
            addToHistory(targetId, data.name, data.token || token);
        }

        if (data?.type === 'INFO_CAMERA_TYPE') setRemoteFacingMode(data.value);
        if (data?.type === 'BATTERY_STATUS') {
            setBatteryLevel(data.level);
            setIsCharging(data.charging);
        }
    });

    conn.on('error', (err: any) => {
        alert("Fallo de conexión: ID no encontrado");
        setIsConnected(false);
    });

    conn.on('close', () => { setIsConnected(false); });
    dataConnRef.current = conn;
  };

  const enableAudio = () => { 
      if (videoRef.current) {
          videoRef.current.muted = false;
          setAudioEnabled(true);
      }
  };
  
  // REGLA DE ORO: Audio instantáneo activando/desactivando track
  const toggleTalk = async (talking: boolean) => { 
      setIsTalking(talking); 
      if (talking) {
          try {
              if (!localStreamRef.current) {
                  await preWarmMicrophone();
              }
              if (localStreamRef.current) {
                  localStreamRef.current.getAudioTracks().forEach(track => track.enabled = true);
                  
                  if (!talkCallRef.current && peerRef.current && connectionId) {
                      const call = peerRef.current.call(connectionId, localStreamRef.current);
                      talkCallRef.current = call;
                  }
              }
          } catch (e) {
              console.error("No se pudo iniciar Talk:", e);
              setIsTalking(false);
          }
      } else {
          if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach(track => track.enabled = false);
          }
          // No cerramos la llamada para mantener la conexión "caliente" y re-utilizarla si es posible
          // O la cerramos si el protocolo lo requiere, pero el track ya estará listo.
          if (talkCallRef.current) {
              talkCallRef.current.close();
              talkCallRef.current = null;
          }
      }
  };

  const sendCommand = (type: 'CMD_FLASH' | 'CMD_LULLABY' | 'CMD_CAMERA' | 'CMD_SENSITIVITY', value: any) => { 
      if (dataConnRef.current?.open) { 
          dataConnRef.current.send({ type, value }); 
          if (type === 'CMD_FLASH') {
              setNightVision(value); 
              setIsNightVision(value); // Sincronizamos filtro digital con flash remoto
          }
          if (type === 'CMD_LULLABY') setLullaby(value); 
          if (type === 'CMD_SENSITIVITY') setSensitivity(value);
      } 
  };
  
  const changeQuality = (level: 'high' | 'medium' | 'low') => {
      if (dataConnRef.current?.open) {
          dataConnRef.current.send({ type: 'CMD_QUALITY', value: level });
          setVideoQuality(level);
          setShowQualityMenu(false);
          setIsNetworkUnstable(false); 
      }
  };

  const takeSnapshot = () => {
      if (!videoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoRef.current, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = `TiNO_Snapshot_${new Date().getTime()}.png`;
          link.href = dataUrl;
          link.click();
      }
  };

 const addToHistory = (id: string, customName?: string, token?: string) => { 
      const now = Date.now();
      const existingHistory = secureStorage.getItem<MonitorHistoryItem[]>('monitor_history') || [];
      const others = existingHistory.filter(h => h.id !== id);
      const oldItem = existingHistory.find(h => h.id === id);

      const updatedItem = {
          id,
          name: customName || oldItem?.name || `Cámara ${new Date().toLocaleDateString()}`,
          lastConnected: now,
          token: token || oldItem?.token,
          logs: [now, ...(oldItem?.logs || [])].slice(0, 50)
      };

      const newFullHistory = [updatedItem, ...others].slice(0, 10);
      setHistory(newFullHistory);
      secureStorage.setItem('monitor_history', newFullHistory); 
  };

  const startScanner = async () => { 
      setIsScanning(true); 
      try { 
          const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); 
          if (scannerVideoRef.current) { 
              scannerVideoRef.current.srcObject = s; 
              scannerVideoRef.current.play(); 
              rafRef.current = requestAnimationFrame(scanTick); 
          } 
      } catch (e) { setIsScanning(false); } 
  };

  const stopScanner = () => { 
      if (scannerVideoRef.current?.srcObject) (scannerVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); 
      if (rafRef.current) cancelAnimationFrame(rafRef.current); 
      setIsScanning(false); 
  };
  
  const scanTick = () => { 
      if (scannerVideoRef.current && scannerCanvasRef.current) { 
          const v = scannerVideoRef.current; const c = scannerCanvasRef.current; 
          if (v.readyState === 4) { 
              c.width = v.videoWidth; c.height = v.videoHeight; 
              const ctx = c.getContext('2d');
              ctx?.drawImage(v,0,0); 
              const d = ctx?.getImageData(0,0,c.width,c.height); 
              if (d) { 
                  const code = jsQR(d.data, d.width, d.height); 
                  if (code) { 
                      stopScanner(); 
                      try {
                          const parsed = JSON.parse(code.data);
                          setConnectionId(parsed.id); handleConnect(parsed.id, parsed.token);
                      } catch {
                          setConnectionId(code.data); handleConnect(code.data);
                      }
                      return; 
                  } 
              } 
          } 
      } 
      rafRef.current = requestAnimationFrame(scanTick); 
  };

  const handleZoom = (delta: number) => {
      setZoomLevel(prev => Math.min(Math.max(prev + delta, 1), 3));
  };

  if (!isConnected) return (
      <div className="flex flex-col h-full overflow-hidden relative font-sans" style={V85_GRADIENT}>
          
          {/* HEADER PREMIUM COMPACTO */}
          <div className="p-8 pb-4 flex items-center justify-between relative">
              <button onClick={onBack} className="w-12 h-12 rounded-full bg-white/90 backdrop-blur shadow-sm flex items-center justify-center text-slate-400 active:scale-90 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h2 className="absolute left-1/2 -translate-x-1/2 text-xl font-black text-slate-800 tracking-tighter">Panel de Control</h2>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar px-8">
              {/* TARJETA DE ESCANEO PRO (EL RECUADRO MORADO) */}
              <div className="relative group mb-10 mt-2">
                <button 
                  onClick={isScanning ? stopScanner : startScanner}
                  className="w-full aspect-[4/3] bg-gradient-to-br from-indigo-700 via-purple-600 to-indigo-800 rounded-[3.5rem] shadow-[0_25px_50px_-12px_rgba(79,70,229,0.5)] overflow-hidden flex flex-col items-center justify-center relative transition-all active:scale-[0.98]"
                >
                    {isScanning ? (
                      <div className="absolute inset-0 w-full h-full">
                        {/* EL VIDEO DENTRO DEL RECUADRO */}
                        <video ref={scannerVideoRef} className="w-full h-full object-cover opacity-80" playsInline />
                        
                        {/* MARCO DE ENCUADRE Y LÁSER */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-56 h-48 relative">
                                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
                                {/* LÁSER ROJO FLUIDO */}
                                <div className="animate-laser-smooth"></div>
                            </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center relative">
   
   {/* CUADRO DINÁMICO - AJUSTE FINAL DE MÁRGENES Y POSICIÓN */}
   <div className="relative w-40 h-40 mb-4 flex items-center justify-center"> {/* mb-8 cambiado a mb-4 para subir los textos */}
      
      {/* 1. Fondo con movimiento de colores (Mesh) */}
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600 via-purple-500 to-pink-400 rounded-[3.5rem] animate-mesh shadow-[0_20px_50px_rgba(168,85,247,0.4)]"></div>
      
      {/* 2. Brillo giratorio */}
      <div className="absolute w-full h-full animate-rotate-shine opacity-50">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-full bg-gradient-to-b from-white/40 to-transparent blur-xl"></div>
      </div>

      {/* 3. La burbuja de cristal interior - AHORA CON MARGEN MÁS PEQUEÑO (inset-5) */}
      <div className="absolute inset-5 bg-white/10 backdrop-blur-2xl rounded-[2.2rem] border border-white/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center overflow-hidden z-10">
          
          {/* Ondas de radar */}
          <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-white/10 rounded-full animate-ping opacity-30"></div>
          </div>

          {/* Icono QR Premium */}
          <svg className="w-10 h-10 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] relative z-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h6v6H3V3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6v6h-6V3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15h6v6H3v-6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 15h2m3 0h1m-4 3h1m2 0h1m-4 3h4" />
              <rect x="18" y="18" width="1" height="1" fill="currentColor" />
          </svg>
      </div>
   </div>
   
   {/* TEXTOS AHORA MÁS CERCA DEL CUADRO */}
   <h3 className="text-xl font-black text-white mb-1 tracking-tight">Escanear QR</h3>
   <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-[0.3em] opacity-80 animate-pulse">Pulse para conectar</p>
</div>
                    )}
                </button>
                <canvas ref={scannerCanvasRef} className="hidden" />
              </div>

             {/* INPUT MANUAL PILL-STYLE (MÁS FLACA Y TECLADO NUMÉRICO) */}
<div className="mb-10 bg-white/90 backdrop-blur-xl p-1.5 rounded-full shadow-2xl border border-white flex items-center gap-3">
    <input 
      value={connectionId} 
      onChange={e=>setConnectionId(e.target.value)} 
      placeholder="ID de Cámara Manual" 
      type="text"
      inputMode="numeric"      // Abre teclado numérico en Android/iOS
      pattern="[0-9]*"        // Asegura que el sistema entienda que son números
      maxLength={6}           // Limita a los 6 dígitos que definimos
      className="flex-1 bg-transparent px-6 font-bold text-slate-600 placeholder-slate-300 outline-none text-sm"
    />
    <button 
      onClick={() => handleConnect(connectionId)} 
      className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M14 5l7 7-7 7M3 12h18" /></svg>
    </button>
</div>

              {/* HISTORIAL PREMIUM CON ESTADO VACÍO */}
              <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-6 ml-4">Cámaras Guardadas</h3>
              <div className="space-y-4 pb-20">
                  {history.length > 0 ? history.map(h => (
                      <div key={h.id} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-50 flex items-center justify-between animate-fade-in">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-sky-50 flex items-center justify-center text-2xl shadow-inner">👶</div>
                            <div className="flex-1 overflow-hidden">
                                <p className="text-slate-800 font-bold truncate leading-tight text-sm">{h.name}</p>
                                <p className="text-slate-400 text-[9px] font-black uppercase mt-0.5">VISTO: {new Date(h.lastConnected).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => { setConnectionId(h.id); handleConnect(h.id, h.token); }} 
                            className="bg-indigo-50 text-indigo-600 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                          >
                            CONECTAR
                          </button>
                      </div>
                  )) : (
                   <div className="p-12 text-center text-slate-300 text-[10px] uppercase font-black tracking-[0.2em] border-2 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center min-h-[150px] animate-pulse">
                   <span>NO HAY REGISTROS</span>
                   </div>
                  )}
              </div>
          </div>
      </div>
  );

  return (
      <div className="flex flex-col h-full bg-slate-900 overflow-hidden font-sans">
          
          {/* VISTA DEL VIDEO (SUPERIOR) */}
          <div className="flex-1 relative bg-slate-900 rounded-b-[2.5rem] overflow-hidden shadow-2xl z-10">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-contain transition-all duration-300 ease-out" 
                style={{ 
                  transform: `scale(${zoomLevel}) scaleX(-1)`,
                  filter: isNightVision ? 'brightness(1.5) contrast(1.2) saturate(0.8)' : 'none'
                }} 
              />

              {/* CABECERA PRO: INDICADORES COMPACTOS Y BOTÓN X */}
              <div className="absolute top-4 left-4 right-4 z-50 flex justify-between items-start">
                  
                  {/* GRUPO IZQUIERDO: ESTADOS */}
                  <div className="flex gap-1.5 flex-wrap max-w-[75%]">
                      {/* VIVO */}
                      <div className="bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1.5 border border-white/10 shadow-lg">
                          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isNetworkUnstable ? 'bg-amber-400' : 'bg-emerald-400'}`}></div>
                          <span className="text-white text-[9px] font-black tracking-widest uppercase">{t.live_badge}</span>
                      </div>

                      {/* CALIDAD */}
                      <button onClick={() => setShowQualityMenu(!showQualityMenu)} className="bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1.5 border border-white/10 shadow-lg active:scale-95 transition-all">
                          <svg className="w-3 h-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          <span className="text-white text-[9px] font-black uppercase">{videoQuality}</span>
                      </button>

                      {/* SENSIBILIDAD */}
                      <button onClick={() => {
                          const next = sensitivity === 'low' ? 'medium' : sensitivity === 'medium' ? 'high' : 'low';
                          sendCommand('CMD_SENSITIVITY', next);
                      }} className="bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1.5 border border-white/10 shadow-lg active:scale-95 transition-all">
                          <svg className="w-3 h-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                          <span className="text-white text-[9px] font-black uppercase">{t[`sens_${sensitivity.substring(0,3)}` as any] || sensitivity}</span>
                      </button>

                      {/* REFRESCAR (SOLO ICONO) */}
                      <button 
                          onClick={() => {
                              sendCommand('CMD_WATCHDOG_REFRESH', true);
                              setConnectionStatus("..."); 
                              setTimeout(() => setConnectionStatus(""), 2000);
                          }}
                          className="bg-black/40 backdrop-blur-md w-7 h-7 rounded-lg flex items-center justify-center border border-white/10 shadow-lg active:scale-90 transition-all text-white"
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      </button>
                  </div>

                  {/* BOTÓN X PARA CERRAR */}
                  <button 
                      onClick={() => { setIsConnected(false); if(peerRef.current) peerRef.current.destroy(); }} 
                      className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-90 transition-all shadow-xl"
                  >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
              </div>

              {/* AVISO DE RED INESTABLE */}
              {isNetworkUnstable && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
                    <div className="bg-amber-500/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-white/20 flex items-center gap-2">
                        <span className="text-white text-[10px] font-black uppercase tracking-widest">⚠️ Red Inestable</span>
                    </div>
                </div>
              )}

              {/* MENÚ DE CALIDAD FLOTANTE */}
              {showQualityMenu && (
                  <div className="absolute top-14 left-10 bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl flex flex-col w-28 overflow-hidden z-50 border border-slate-100">
                      {['high', 'medium', 'low'].map((q: any) => (
                          <button key={q} onClick={() => changeQuality(q)} className={`px-4 py-2.5 text-left text-[10px] font-black ${videoQuality === q ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`}>{q.toUpperCase()}</button>
                      ))}
                  </div>
              )}
              
              {/* BATERÍA REMOTA */}
              {batteryLevel !== null && (
                  <div className={`absolute bottom-6 right-6 bg-black/40 backdrop-blur px-2 py-1 rounded-lg flex items-center gap-1.5 border border-white/10 ${showLowBatteryWarning ? 'bg-rose-500 animate-pulse' : ''}`}>
                      <span className="text-white text-[9px] font-black">{Math.round(batteryLevel * 100)}%</span>
                      <div className="w-5 h-2.5 border border-white/50 rounded-[2px] p-[1px] relative">
                          <div className={`h-full rounded-px ${batteryLevel <= 0.2 ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{width: `${batteryLevel * 100}%` }} />
                      </div>
                  </div>
              )}

              {!audioEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm z-30">
                      <button onClick={enableAudio} className="bg-white px-8 py-4 rounded-full flex items-center gap-3 shadow-2xl animate-bounce">
                          <span className="text-xl">🔇</span><span className="text-slate-800 font-bold text-sm uppercase tracking-tight">{t.activate_sound}</span>
                      </button>
                  </div>
              )}
          </div>
          
          {/* PANEL DE CONTROLES (INFERIOR) */}
          <div className="bg-slate-50 p-6 pb-12" style={V85_GRADIENT}>
              <div className="flex justify-center items-center mb-6">
                 <div className="flex items-center gap-4 bg-white/70 backdrop-blur-xl px-4 py-2 rounded-full shadow-sm border border-white">
                      <button onClick={() => handleZoom(-0.5)} className="text-slate-400 font-black px-2 text-xl">-</button>
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${((zoomLevel - 1) / 2) * 100}%` }}></div>
                      </div>
                      <button onClick={() => handleZoom(0.5)} className="text-slate-400 font-black px-2 text-xl">+</button>
                 </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                  {/* HABLAR */}
                  <button onMouseDown={() => toggleTalk(true)} onMouseUp={() => toggleTalk(false)} onTouchStart={() => toggleTalk(true)} onTouchEnd={() => toggleTalk(false)} className={`aspect-square rounded-[2rem] flex flex-col items-center justify-center gap-2 border border-white shadow-xl transition-all ${isTalking ? 'bg-indigo-500 text-white scale-95' : 'bg-white/70 backdrop-blur-xl text-indigo-500'}`}>
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                    <span className="text-[9px] font-black uppercase">{t.talk_btn}</span>
                  </button>
                  {/* NANAS */}
                  <button onClick={() => sendCommand('CMD_LULLABY', !lullaby)} className={`aspect-square rounded-[2rem] flex flex-col items-center justify-center gap-2 border border-white shadow-xl transition-all ${lullaby ? 'bg-purple-500 text-white' : 'bg-white/70 backdrop-blur-xl text-purple-500'}`}>
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l.31-.088a2.25 2.25 0 001.382-1.353V9m0 0V5.25A2.25 2.25 0 0016.5 3h-2.25a2.25 2.25 0 00-2.25 2.25V15m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l.31-.088A2.25 2.25 0 009 15.503V9z" /></svg>
                    <span className="text-[9px] font-black uppercase">NANAS</span>
                  </button>
                  {/* MODO NOCHE */}
                  <button onClick={() => setIsNightVision(!isNightVision)} className={`aspect-square rounded-[2rem] flex flex-col items-center justify-center gap-2 border border-white shadow-xl transition-all ${isNightVision ? 'bg-amber-500 text-white' : 'bg-white/70 backdrop-blur-xl text-amber-500'}`}>
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
                    <span className="text-[9px] font-black uppercase">NOCHE</span>
                  </button>
                  {/* CAPTURA */}
                  <button onClick={takeSnapshot} className="aspect-square rounded-[2rem] bg-white/70 backdrop-blur-xl border border-white text-emerald-500 flex flex-col items-center justify-center gap-2 shadow-xl active:scale-95 transition-all">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039a48.774 48.774 0 00-5.232 0a2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                    <span className="text-[9px] font-black uppercase">CAPTURA</span>
                  </button>
              </div>

              <button onClick={() => sendCommand('CMD_CAMERA', remoteFacingMode === 'user' ? 'environment' : 'user')} className="w-full mt-6 bg-white/70 backdrop-blur-xl border border-white py-4 rounded-3xl shadow-xl flex items-center justify-center gap-3 text-sky-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                {t.cam_select}
              </button>
          </div>
      </div>
  );
};