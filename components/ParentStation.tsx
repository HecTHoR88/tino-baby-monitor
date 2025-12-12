
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
  
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [videoQuality, setVideoQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [isMirrored, setIsMirrored] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [showLowBatteryWarning, setShowLowBatteryWarning] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null); 
  const localStreamRef = useRef<MediaStream | null>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if ('Notification' in window) Notification.requestPermission();
    const saved = secureStorage.getItem<MonitorHistoryItem[]>('monitor_history');
    if (saved) setHistory(saved);
    
    const peer = new Peer(undefined as any, { 
        config: { 
            iceServers: [
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ] 
        } 
    });
    
    peer.on('error', (err) => {
        console.warn("Peer Error:", err.type);
        if (err.type === 'peer-unavailable') {
            setConnectionStatus(t.conn_error);
            setIsConnected(false);
            if(connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        }
    });

    peer.on('open', () => {
        if (initialTargetId) {
            setConnectionId(initialTargetId);
            const item = saved?.find(h => h.id === initialTargetId);
            const token = (item as any)?.token; 
            handleConnect(initialTargetId, token);
        }
    });

    peer.on('call', (call) => {
        call.answer(); 
        call.on('stream', (remoteStream) => {
            if (videoRef.current) {
                videoRef.current.srcObject = remoteStream;
                videoRef.current.muted = true;
                const p = videoRef.current.play();
                if (p) { p.catch(e => console.error("Playback failed", e)); }
            }
        });
    });

    peerRef.current = peer;
    return () => { 
        peer.destroy(); stopScanner(); 
        if(localStreamRef.current) localStreamRef.current.getTracks().forEach(t=>t.stop()); 
        if(connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    };
  }, []);

  const handleConnect = async (targetId: string, token?: string) => {
    if (!targetId || !peerRef.current) return;
    setConnectionStatus(t.scanning.replace('Escaneando...', t.connecting)); // Reuse connecting text
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = setTimeout(() => {
        if (!dataConnRef.current?.open) setConnectionStatus(t.conn_timeout);
    }, 10000);
    
    const conn = peerRef.current.connect(targetId, {
        metadata: { name: getDeviceName(), deviceId: getDeviceId(), token: token }
    });

    conn.on('open', () => { 
        setIsConnected(true); setConnectionStatus("");
        if(connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        addToHistory(targetId, undefined, token); 
    });

    conn.on('data', (data: any) => { 
        if (data?.type === 'ERROR_AUTH') { alert("Error: " + data.message); conn.close(); return; }
        if (data?.type === 'INFO_DEVICE_NAME') addToHistory(targetId, data.name, token);
        if (data?.type === 'BATTERY_STATUS') {
            setBatteryLevel(data.level);
            setIsCharging(data.charging);
            if (data.level <= 0.20 && !data.charging) setShowLowBatteryWarning(true);
            else setShowLowBatteryWarning(false);
        }
        if (data?.type === 'CMD_NOTIFICATION') {
            if (Notification.permission === 'granted') {
                try { new Notification(data.title, { body: data.body, icon: '/icon.png' }); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
            } else { alert(`${data.title}\n${data.body}`); }
        }
    });
    conn.on('close', () => { setIsConnected(false); setConnectionStatus(t.conn_ended); });
    conn.on('error', () => { setConnectionStatus(t.conn_error); setIsConnected(false); });
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
                  peerRef.current.call(connectionId, localStreamRef.current);
              }
          } catch (e) { console.warn("Talkback failed", e); }
      } else {
          if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(t => t.stop());
              localStreamRef.current = null;
          }
      }
  };

  const sendCommand = (type: 'CMD_FLASH' | 'CMD_LULLABY', value: boolean) => { if (dataConnRef.current?.open) { dataConnRef.current.send({ type, value }); if (type === 'CMD_FLASH') setNightVision(value); if (type === 'CMD_LULLABY') setLullaby(value); } };
  
  const changeQuality = (level: 'high' | 'medium' | 'low') => {
      if (dataConnRef.current?.open) {
          dataConnRef.current.send({ type: 'CMD_QUALITY', value: level });
          setVideoQuality(level);
          setShowQualityMenu(false);
      }
  };

  const addToHistory = (id: string, customName?: string, token?: string) => { 
      const existing = history.find(h => h.id === id);
      const nameToUse = customName || existing?.name || `Cámara ${new Date().toLocaleDateString()}`;
      const others = history.filter(h => h.id !== id);
      const newItem = { id, name: nameToUse, lastConnected: Date.now(), token };
      const nw = [newItem, ...others].slice(0, 5); 
      setHistory(nw); secureStorage.setItem('monitor_history', nw); 
  };

  const startScanner = async () => { setIsScanning(true); try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); if (scannerVideoRef.current) { scannerVideoRef.current.srcObject = s; scannerVideoRef.current.play(); rafRef.current = requestAnimationFrame(scanTick); } } catch (e) { setIsScanning(false); } };
  const stopScanner = () => { if (scannerVideoRef.current && scannerVideoRef.current.srcObject) { (scannerVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); } if (rafRef.current) cancelAnimationFrame(rafRef.current); setIsScanning(false); };
  
  const scanTick = () => { 
      if (scannerVideoRef.current && scannerCanvasRef.current) { 
          const v = scannerVideoRef.current; const c = scannerCanvasRef.current; 
          if (v.readyState === 4) { 
              c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')?.drawImage(v,0,0); const d = c.getContext('2d')?.getImageData(0,0,c.width,c.height); 
              if (d) { 
                  const code = jsQR(d.data, d.width, d.height); 
                  if (code) { 
                      stopScanner(); 
                      let targetId = code.data; let token = undefined;
                      try { const payload = JSON.parse(code.data); if (payload.id && payload.token) { targetId = payload.id; token = payload.token; } } catch(e) {}
                      setConnectionId(targetId); handleConnect(targetId, token); return; 
                  } 
              } 
          } 
      } 
      rafRef.current = requestAnimationFrame(scanTick); 
  };

  const handleZoom = (delta: number) => {
      setZoomLevel(prev => {
          const next = prev + delta;
          if (next < 1) return 1;
          if (next > 3) return 3;
          return next;
      });
  };

  if (isScanning) return (
      <div className="h-full bg-slate-900 relative">
          <video ref={scannerVideoRef} className="w-full h-full object-cover opacity-80" playsInline />
          <canvas ref={scannerCanvasRef} className="hidden" />
          <div className="absolute top-10 w-full text-center z-20"><div className="inline-block px-6 py-2 bg-white/20 backdrop-blur-md rounded-full text-white font-bold tracking-wide">{t.scanning}</div></div>
          <button onClick={stopScanner} className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white text-slate-900 px-8 py-3 rounded-full font-bold shadow-lg">{t.cancel_btn}</button>
      </div>
  );

  if (!isConnected) return (
      <div className="h-full bg-slate-50 p-6 flex flex-col font-sans text-slate-700">
          <div className="flex items-center justify-between mb-8">
              <button onClick={onBack} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600">←</button>
              <h2 className="text-slate-800 font-extrabold text-xl">{t.connect_title}</h2>
              <div className="w-10"></div>
          </div>
          
          <div className="flex-1 overflow-y-auto no-scrollbar">
              {connectionStatus && <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-600 text-sm font-bold flex items-center gap-3 animate-fade-in"><span>⚠️</span> {connectionStatus}</div>}
              <button onClick={startScanner} className="w-full aspect-[2/1] bg-gradient-to-br from-indigo-500 to-violet-600 rounded-[2rem] p-6 flex flex-col justify-end shadow-xl shadow-indigo-500/20 relative overflow-hidden group mb-8 transition-transform active:scale-95">
                  <div className="absolute top-6 right-6 text-6xl opacity-20 group-hover:scale-110 transition-transform text-white">📷</div>
                  <h3 className="text-2xl font-bold text-white mb-1">{t.scan_qr_btn}</h3>
                  <p className="text-indigo-100 text-sm">{t.scan_qr_desc}</p>
              </button>
              <div className="mb-8"><div className="flex gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-100"><input value={connectionId} onChange={e=>setConnectionId(e.target.value)} placeholder={t.manual_id} className="flex-1 bg-transparent px-4 py-2 text-slate-700 outline-none placeholder-slate-400 font-mono"/><button onClick={() => handleConnect(connectionId)} className="bg-slate-800 text-white px-5 rounded-xl font-bold shadow-md">Ir</button></div></div>
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 ml-2">{t.conn_history}</h3>
              {history.map(h => (
                  <button key={h.id} onClick={() => handleConnect(h.id, (h as any).token)} className="w-full bg-white p-4 rounded-2xl mb-3 flex items-center gap-4 hover:shadow-md transition-all text-left border border-slate-100">
                      <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center text-sky-500 text-xl">👶</div>
                      <div><p className="text-slate-800 font-bold">{h.name}</p><p className="text-slate-400 text-xs font-mono mt-0.5">{h.id}</p></div>
                  </button>
              ))}
          </div>
      </div>
  );

  return (
      <div className="flex flex-col h-full bg-slate-50">
          <div className="flex-1 relative bg-slate-200 rounded-b-[2.5rem] overflow-hidden shadow-2xl z-10 group bg-slate-900">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-contain transition-transform duration-200 ease-out" 
                style={{ 
                    transform: `scale(${zoomLevel}) ${isMirrored ? 'rotateY(180deg)' : ''}` 
                }} 
              />
              
              <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full flex items-center gap-1.5 z-20">
                 <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.8)]"></div>
                 <span className="text-white/80 text-[10px] font-bold tracking-wide">{t.secure_badge}</span>
              </div>

              <button onClick={() => setShowQualityMenu(!showQualityMenu)} className="absolute top-4 left-24 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-1 text-white border border-white/10 hover:bg-black/60 transition-colors z-20">
                  <span className="text-xs">⚙️</span>
                  <span className="text-[10px] font-bold uppercase">{videoQuality === 'high' ? 'HD' : videoQuality === 'medium' ? 'SD' : 'ECO'}</span>
              </button>

              <button 
                onClick={() => setIsMirrored(!isMirrored)} 
                className={`absolute top-4 left-56 bg-black/40 backdrop-blur-md w-8 h-8 rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-black/60 transition-colors z-20 ${isMirrored ? 'text-indigo-400 border-indigo-400/50' : ''}`}
                title="Voltear imagen"
              >
                  <span className="text-sm">↔️</span>
              </button>

              {showQualityMenu && (
                  <div className="absolute top-14 left-24 bg-white/90 backdrop-blur-xl rounded-xl shadow-xl overflow-hidden flex flex-col w-32 border border-white/20 animate-fade-in z-50">
                      <button onClick={() => changeQuality('high')} className={`px-4 py-3 text-left text-xs font-bold border-b border-slate-100 flex justify-between ${videoQuality === 'high' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600 hover:bg-slate-50'}`}><span>HD</span> {videoQuality === 'high' && '✓'}</button>
                      <button onClick={() => changeQuality('medium')} className={`px-4 py-3 text-left text-xs font-bold border-b border-slate-100 flex justify-between ${videoQuality === 'medium' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600 hover:bg-slate-50'}`}><span>SD</span> {videoQuality === 'medium' && '✓'}</button>
                      <button onClick={() => changeQuality('low')} className={`px-4 py-3 text-left text-xs font-bold flex justify-between ${videoQuality === 'low' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600 hover:bg-slate-50'}`}><span>Eco</span> {videoQuality === 'low' && '✓'}</button>
                  </div>
              )}
              
              {batteryLevel !== null && (
                  <div className={`absolute top-4 right-4 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-2 ${showLowBatteryWarning ? 'animate-pulse bg-red-500/80' : ''}`}>
                      <div className="relative"><span className="text-white text-xs font-mono font-bold">{Math.round(batteryLevel * 100)}%</span></div>
                      <div className="w-6 h-3 border-2 border-white/80 rounded-sm relative p-0.5">
                          <div className={`h-full rounded-[1px] ${batteryLevel <= 0.2 ? 'bg-red-400' : 'bg-green-400'} ${isCharging ? 'animate-pulse' : ''}`} style={{width: `${batteryLevel * 100}%`}} />
                          {isCharging && <span className="absolute -left-3 -top-1 text-xs">⚡</span>}
                      </div>
                  </div>
              )}
              {showLowBatteryWarning && <div className="absolute top-16 right-4 bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg animate-bounce z-30">{t.low_battery}</div>}
              {!audioEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-20">
                      <button onClick={enableAudio} className="bg-white px-8 py-4 rounded-full flex items-center gap-3 shadow-2xl animate-bounce"><span className="text-2xl text-slate-800">🔇</span><span className="text-slate-800 font-bold text-sm tracking-wide">{t.activate_sound}</span></button>
                  </div>
              )}
          </div>
          
          <div className="bg-slate-50 p-6 pb-10 relative z-0">
              <div className="flex justify-between items-center mb-6 px-4">
                 <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-slate-500 font-bold text-sm">{t.live_badge}</span>
                 </div>
                 
                 {/* New Zoom Placement */}
                 <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
                      <button onClick={() => handleZoom(-0.5)} className="text-slate-400 hover:text-indigo-500 font-bold px-1 active:scale-95">-</button>
                      <div className="w-20 h-1 bg-slate-200 rounded-full relative overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${((zoomLevel - 1) / 2) * 100}%` }}></div>
                      </div>
                      <button onClick={() => handleZoom(0.5)} className="text-slate-400 hover:text-indigo-500 font-bold px-1 active:scale-95">+</button>
                 </div>

                 <button onClick={() => { setIsConnected(false); if(peerRef.current) peerRef.current.destroy(); }} className="text-rose-500 text-xs font-bold bg-rose-50 px-4 py-2 rounded-full hover:bg-rose-100">FINALIZAR</button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                  <button onMouseDown={() => toggleTalk(true)} onMouseUp={() => toggleTalk(false)} onTouchStart={() => toggleTalk(true)} onTouchEnd={() => toggleTalk(false)} className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center gap-3 transition-all shadow-sm ${isTalking ? 'bg-indigo-500 text-white scale-95 shadow-inner' : 'bg-white text-indigo-500 hover:shadow-md'}`}><span className="text-3xl">🎙️</span><span className="text-xs font-bold tracking-wide">{t.talk_btn}</span></button>
                  <button onClick={() => sendCommand('CMD_LULLABY', !lullaby)} className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center gap-3 transition-all shadow-sm border-2 ${lullaby ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-white border-transparent text-slate-400 hover:text-purple-400'}`}><span className="text-3xl">🎵</span><span className="text-xs font-bold tracking-wide">{t.lullaby_btn}</span></button>
                  <button onClick={() => sendCommand('CMD_FLASH', !nightVision)} className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center gap-3 transition-all shadow-sm border-2 ${nightVision ? 'bg-amber-50 border-amber-200 text-amber-500' : 'bg-white border-transparent text-slate-400 hover:text-amber-400'}`}><span className="text-3xl">💡</span><span className="text-xs font-bold tracking-wide">{t.light_btn}</span></button>
              </div>
          </div>
      </div>
  );
};