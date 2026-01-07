import React, { useEffect, useRef, useState } from 'react';
import { Peer, MediaConnection, DataConnection } from 'peerjs';
import jsQR from 'jsqr';
import { MonitorHistoryItem, Language } from '../types';
import { getDeviceName, getDeviceId } from '../services/deviceStorage';
import { secureStorage } from '../services/secureStorage';
import { translations } from '../services/translations';

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
  const [lullaby, setLullaby] = useState(false);
  const [remoteFacingMode, setRemoteFacingMode] = useState<'user' | 'environment'>('environment');
  
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [videoQuality, setVideoQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [showLowBatteryWarning, setShowLowBatteryWarning] = useState(false);
  
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
    
    // OPTIMIZACIÓN DE LATENCIA: Servidores ICE robustos y pool de candidatos
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
    };
  }, []);

  const handleConnect = async (targetId: string, token?: string) => {
    if (!targetId || !peerRef.current) return;
    setConnectionStatus(t.connecting);
    
    const conn = peerRef.current.connect(targetId, {
        metadata: { name: getDeviceName(), deviceId: getDeviceId(), token: token }
    });

    conn.on('open', () => { 
        setIsConnected(true); setConnectionStatus("");
        addToHistory(targetId, undefined, token); 
    });

    conn.on('data', (data: any) => { 
        if (data?.type === 'ERROR_AUTH') { alert(data.message); conn.close(); return; }
        if (data?.type === 'INFO_DEVICE_NAME') addToHistory(targetId, data.name, token);
        if (data?.type === 'INFO_CAMERA_TYPE') {
            setRemoteFacingMode(data.value);
        }
        if (data?.type === 'BATTERY_STATUS') {
            setBatteryLevel(data.level);
            setIsCharging(data.charging);
            setShowLowBatteryWarning(data.level <= 0.20 && !data.charging);
        }
        if (data?.type === 'CMD_NOTIFICATION') {
            if (Notification.permission === 'granted') {
                new Notification(data.title, { body: data.body });
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            } else { alert(`${data.title}\n${data.body}`); }
        }
    });
    conn.on('close', () => { setIsConnected(false); setConnectionStatus(t.conn_ended); });
    dataConnRef.current = conn;
  };

  const enableAudio = () => { 
      if (videoRef.current) {
          videoRef.current.muted = false;
          setAudioEnabled(true);
      }
  };
  
  const toggleTalk = async (talking: boolean) => { 
      setIsTalking(talking); 
      if (talking) {
          try {
              if (!localStreamRef.current) {
                  localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              }
              if (peerRef.current && connectionId) {
                  const call = peerRef.current.call(connectionId, localStreamRef.current);
                  talkCallRef.current = call;
              }
          } catch (e) {
              console.error("No se pudo iniciar Talk:", e);
              setIsTalking(false);
          }
      } else {
          if (talkCallRef.current) {
              talkCallRef.current.close();
              talkCallRef.current = null;
          }
          if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(t => t.stop());
              localStreamRef.current = null;
          }
      }
  };

  const sendCommand = (type: 'CMD_FLASH' | 'CMD_LULLABY' | 'CMD_CAMERA' | 'CMD_SENSITIVITY', value: any) => { 
      if (dataConnRef.current?.open) { 
          dataConnRef.current.send({ type, value }); 
          if (type === 'CMD_FLASH') setNightVision(value); 
          if (type === 'CMD_LULLABY') setLullaby(value); 
          if (type === 'CMD_SENSITIVITY') setSensitivity(value);
      } 
  };
  
  const changeQuality = (level: 'high' | 'medium' | 'low') => {
      if (dataConnRef.current?.open) {
          dataConnRef.current.send({ type: 'CMD_QUALITY', value: level });
          setVideoQuality(level);
          setShowQualityMenu(false);
      }
  };

  const takeSnapshot = () => {
      if (!videoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          // Aplicar espejo si es necesario al capturar
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
      const existingIndex = existingHistory.findIndex(h => h.id === id);
      
      let updatedItem: MonitorHistoryItem;
      let others = existingHistory.filter(h => h.id !== id);

      if (existingIndex >= 0) {
        const oldItem = existingHistory[existingIndex];
        const lastLogTime = (oldItem.logs && oldItem.logs.length > 0) ? oldItem.logs[0] : 0;
        
        const isTooRecent = (now - lastLogTime) < 60000;
        const newLogs = isTooRecent ? (oldItem.logs || [now]) : [now, ...(oldItem.logs || [])];

        updatedItem = {
          ...oldItem,
          name: customName || oldItem.name,
          lastConnected: now,
          token: token || oldItem.token,
          logs: newLogs.slice(0, 50)
        };
      } else {
        updatedItem = {
          id,
          name: customName || `Cámara ${new Date().toLocaleDateString()}`,
          lastConnected: now,
          token,
          logs: [now]
        };
      }

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

  if (isScanning) return (
      <div className="h-full bg-slate-900 relative flex flex-col items-center justify-center">
          <video ref={scannerVideoRef} className="w-full h-full object-cover opacity-80" playsInline />
          <canvas ref={scannerCanvasRef} className="hidden" />
          <div className="absolute top-10 px-6 py-2 bg-white/20 backdrop-blur-md rounded-full text-white font-bold">{t.secure_badge}</div>
          <button onClick={stopScanner} className="absolute bottom-10 bg-white text-slate-900 px-8 py-3 rounded-full font-bold shadow-lg">{t.cancel_btn}</button>
      </div>
  );

  if (!isConnected) return (
      <div className="h-full bg-slate-50 p-6 flex flex-col font-sans text-slate-700">
          <div className="flex items-center justify-between mb-8">
              <button onClick={onBack} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400">←</button>
              <h2 className="text-slate-800 font-extrabold text-xl">{t.connect_title}</h2>
              <div className="w-10"></div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
              {connectionStatus && <div className="mb-6 p-4 bg-amber-50 rounded-2xl text-amber-600 text-sm font-bold flex items-center gap-3"><span>⚠️</span> {connectionStatus}</div>}
              <button onClick={startScanner} className="w-full aspect-[2/1] bg-gradient-to-br from-indigo-500 to-violet-600 rounded-[2rem] p-6 flex flex-col justify-end shadow-xl relative overflow-hidden group mb-8">
                  <div className="absolute top-6 right-6 text-6xl opacity-20 text-white">📷</div>
                  <h3 className="text-2xl font-bold text-white mb-1">{t.scan_qr_btn}</h3>
                  <p className="text-indigo-100 text-sm">{t.scan_qr_desc}</p>
              </button>
              <div className="mb-8 flex gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                  <input value={connectionId} onChange={e=>setConnectionId(e.target.value)} placeholder={t.manual_id} className="flex-1 px-4 py-2 outline-none font-mono"/>
                  <button onClick={() => handleConnect(connectionId)} className="bg-slate-800 text-white px-5 rounded-xl font-bold">Ir</button>
              </div>
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 ml-2">{t.conn_history}</h3>
              {history.length > 0 ? history.map(h => (
                  <button key={h.id} onClick={() => { setConnectionId(h.id); handleConnect(h.id, h.token); }} className="w-full bg-white p-4 rounded-2xl mb-3 flex items-center gap-4 hover:shadow-md border border-slate-100 transition-all active:scale-95 text-left">
                      <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center text-xl">👶</div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-slate-800 font-bold truncate">{h.name}</p>
                        <p className="text-slate-400 text-[10px] font-bold uppercase">{t.last_connection}: {new Date(h.lastConnected).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                  </button>
              )) : (
                <div className="p-8 text-center text-slate-300 text-[10px] uppercase font-bold border-2 border-dashed border-slate-200 rounded-2xl">{t.history_empty}</div>
              )}
          </div>
      </div>
  );

  return (
      <div className="flex flex-col h-full bg-slate-900 overflow-hidden">
          <div className="flex-1 relative bg-slate-900 rounded-b-[2.5rem] overflow-hidden shadow-2xl z-10">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-contain transition-all duration-300 ease-out" 
                style={{ 
                  transform: `scale(${zoomLevel}) scaleX(-1)` 
                }} 
              />
              
              <div className="absolute top-4 left-4 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 z-20">
                 <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                 <span className="text-white text-[10px] font-bold tracking-widest">{t.live_badge}</span>
              </div>

              <div className="absolute top-4 left-24 flex gap-2 z-20">
                  <button onClick={() => setShowQualityMenu(!showQualityMenu)} className="bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full text-white text-[10px] font-bold border border-white/10 uppercase">{videoQuality}</button>
                  <button onClick={() => {
                      const next = sensitivity === 'low' ? 'medium' : sensitivity === 'medium' ? 'high' : 'low';
                      sendCommand('CMD_SENSITIVITY', next);
                  }} className="bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full text-white text-[10px] font-bold border border-white/10 uppercase">
                      {t[`sens_${sensitivity.substring(0,3)}` as any] || sensitivity}
                  </button>
              </div>

              {showQualityMenu && (
                  <div className="absolute top-14 left-24 bg-white rounded-xl shadow-2xl flex flex-col w-32 overflow-hidden z-50">
                      {['high', 'medium', 'low'].map((q: any) => (
                          <button key={q} onClick={() => changeQuality(q)} className={`px-4 py-3 text-left text-xs font-bold ${videoQuality === q ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`}>{q.toUpperCase()}</button>
                      ))}
                  </div>
              )}
              
              {batteryLevel !== null && (
                  <div className={`absolute top-4 right-4 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-2 ${showLowBatteryWarning ? 'bg-rose-500 animate-pulse' : ''}`}>
                      <span className="text-white text-xs font-bold">{Math.round(batteryLevel * 100)}%</span>
                      <div className="w-6 h-3 border border-white/50 rounded-sm p-0.5 relative">
                          <div className={`h-full rounded-px ${batteryLevel <= 0.2 ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{width: `${batteryLevel * 100}%` }} />
                          {isCharging && <span className="absolute -left-3 -top-1 text-[8px]">⚡</span>}
                      </div>
                  </div>
              )}

              {!audioEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm z-30">
                      <button onClick={enableAudio} className="bg-white px-8 py-4 rounded-full flex items-center gap-3 shadow-2xl animate-bounce">
                          <span className="text-xl">🔇</span><span className="text-slate-800 font-bold text-sm">{t.activate_sound}</span>
                      </button>
                  </div>
              )}
          </div>
          
          <div className="bg-slate-50 p-6 pb-12">
              <div className="flex justify-between items-center mb-6">
                 <div className="flex items-center gap-4 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
                      <button onClick={() => handleZoom(-0.5)} className="text-slate-400 font-black px-2">-</button>
                      <div className="w-20 h-1 bg-slate-100 rounded-full"><div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${((zoomLevel - 1) / 2) * 100}%` }}></div></div>
                      <button onClick={() => handleZoom(0.5)} className="text-slate-400 font-black px-2">+</button>
                 </div>
                 <button onClick={() => { setIsConnected(false); if(peerRef.current) peerRef.current.destroy(); }} className="text-rose-500 text-[10px] font-black tracking-widest bg-rose-50 px-4 py-2 rounded-full uppercase">CERRAR</button>
              </div>

              <div className="grid grid-cols-4 gap-3">
                  <button onMouseDown={() => toggleTalk(true)} onMouseUp={() => toggleTalk(false)} onTouchStart={() => toggleTalk(true)} onTouchEnd={() => toggleTalk(false)} className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center gap-2 transition-all ${isTalking ? 'bg-indigo-500 text-white scale-95 shadow-inner' : 'bg-white text-indigo-500 shadow-sm'}`}><span className="text-2xl">🎙️</span><span className="text-[9px] font-bold uppercase">{t.talk_btn}</span></button>
                  <button onClick={() => sendCommand('CMD_LULLABY', !lullaby)} className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center gap-2 transition-all ${lullaby ? 'bg-purple-500 text-white shadow-inner' : 'bg-white text-purple-500 shadow-sm'}`}><span className="text-2xl">🎵</span><span className="text-[9px] font-bold uppercase">{t.lullaby_btn}</span></button>
                  <button onClick={() => sendCommand('CMD_FLASH', !nightVision)} className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center gap-2 transition-all ${nightVision ? 'bg-amber-500 text-white shadow-inner' : 'bg-white text-amber-500 shadow-sm'}`}><span className="text-2xl">💡</span><span className="text-[9px] font-bold uppercase">{t.light_btn}</span></button>
                  <button onClick={takeSnapshot} className="aspect-square rounded-[1.5rem] flex flex-col items-center justify-center gap-2 transition-all bg-white text-emerald-500 shadow-sm active:scale-95">
                    <span className="text-2xl">📸</span>
                    <span className="text-[9px] font-bold uppercase">{t.snapshot_btn}</span>
                  </button>
              </div>
              <div className="mt-4 flex justify-center">
                  <button onClick={() => sendCommand('CMD_CAMERA', remoteFacingMode === 'user' ? 'environment' : 'user')} className="w-full bg-white py-3 rounded-2xl shadow-sm flex items-center justify-center gap-3 active:scale-95 transition-all text-sky-500">
                    <span className="text-xl">🔄</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{t.cam_select}</span>
                  </button>
              </div>
          </div>
      </div>
  );
};