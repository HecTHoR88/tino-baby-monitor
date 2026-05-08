import { App } from '@capacitor/app';
import React, { useEffect, useRef, useState } from 'react';
import { Peer, MediaConnection, DataConnection } from 'peerjs';
import jsQR from 'jsqr';
import { MonitorHistoryItem, Language } from '../types';
import { getDeviceName, getDeviceId } from '../services/deviceStorage';
import { secureStorage } from '../services/secureStorage';
import { translations } from '../services/translations';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Toast } from '@capacitor/toast';

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
  const [isFlashing, setIsFlashing] = useState(false);
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [nightVision, setNightVision] = useState(false);
  const [isNightVision, setIsNightVision] = useState(false); // Filtro digital local
  const [lullaby, setLullaby] = useState(false); // Mantener para evitar errores de referencia
  const [lullabyMode, setLullabyMode] = useState(0); // La nueva para los 3 sonidos
  const [remoteFacingMode, setRemoteFacingMode] = useState<'user' | 'environment'>('environment');
  
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [videoQuality, setVideoQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [showLowBatteryWarning, setShowLowBatteryWarning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'panel' | 'monitor'>('panel');
  const [errorModal, setErrorModal] = useState<{show: boolean, title: string, msg: string}>({show: false, title: '', msg: ''});

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
  const viewModeRef = useRef<'panel' | 'monitor'>('panel');
  const connectionTimeoutRef = useRef<any>(null);

  const initPeerEngine = () => {
    if (peerRef.current && !peerRef.current.destroyed) return;

    console.log(">>> TiNO: Iniciando motor de conexión...");
    const peer = new Peer(undefined as any, { 
        config: { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
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

    // REGLA DE ORO: El motor detecta si debe reconectar al recibir señal de internet
    peer.on('open', (id) => {
        console.log(">>> TiNO: Motor listo. ID asignada:", id);
        const lastId = localStorage.getItem('tino_last_connection_id');
        
        // Si el Wi-Fi volvió y estábamos vigilando al bebé, conectamos de inmediato
        if (viewModeRef.current === 'monitor' && lastId && !isConnected) {
            console.log(">>> TiNO: Internet recuperado, reconectando con el bebé...");
            handleConnect(lastId);
        }
    });

   peer.on('call', (call) => {
        call.answer(); 
        call.on('stream', (remoteStream) => {
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = null; 
                    lastVideoTimeRef.current = -1; 
                    videoRef.current.srcObject = remoteStream;
                    videoRef.current.muted = !audioEnabled;
                    
                    // REGLA DE ORO: Si el video logra reproducirse, quitamos la alerta AL INSTANTE
                    videoRef.current.play()
                        .then(() => {
                            console.log(">>> TiNO: Video fluyendo, limpiando alertas.");
                            setIsNetworkUnstable(false); 
                        })
                        .catch(() => setAudioEnabled(false));
                }
            }, 100);
        });
    });

    peerRef.current = peer;
  };

 // REGLA DE ORO: Función de reconexión total corregida.
  // Limpia el motor zombi y dispara la conexión automática al último ID exitoso.
  const forceFullReconnect = () => {
      console.log(">>> TiNO: Iniciando ciclo de recuperación total...");
      
      // 1. Obtenemos el ID del almacenamiento antes de destruir nada
      const lastId = localStorage.getItem('tino_last_connection_id');
      
      // 2. Destruimos el motor viejo para liberar el puerto
      if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
      }
      
      // 3. Si tenemos un ID, usamos handleConnect. 
      // handleConnect es inteligente: si ve que el motor no existe, lo creará solo.
      if (lastId) {
          handleConnect(lastId);
      } else {
          // Si no hay ID previo, solo preparamos el motor para el futuro
          initPeerEngine();
      }
  };

  // BLOQUE PRINCIPAL DE CICLO DE VIDA
  useEffect(() => {
    const saved = secureStorage.getItem<MonitorHistoryItem[]>('monitor_history') || [];
    setHistory(saved);
    
    // 1. Arrancamos el motor por primera vez
    initPeerEngine();
    preWarmMicrophone();

    // 2. REGLA DE ORO: Escuchador de ciclo de vida (WhatsApp Fix)
    const appListener = App.addListener('appStateChange', (state) => {
        if (state.isActive) {
            console.log(">>> TiNO: App recuperada.");
            preWarmMicrophone();
            
            // REGLA DE ORO: Solo reconectamos si la referencia indica que estábamos en el monitor
            // Esto evita que se conecte solo si estábamos en el panel del QR.
            if (viewModeRef.current === 'monitor') {
                console.log(">>> TiNO: Forzando reconexión tras inactividad...");
                forceFullReconnect();
            }
        }
    });

    return () => { 
        if (peerRef.current) peerRef.current.destroy(); 
        stopScanner(); 
        appListener.then(l => l.remove());
        if(localStreamRef.current) localStreamRef.current.getTracks().forEach(t=>t.stop()); 
        if(stabilityCheckIntervalRef.current) clearInterval(stabilityCheckIntervalRef.current);
    };
  }, []); // REGLA DE ORO: Siempre vacío para que la conexión no se rompa al cambiar de pantalla
    
 // REGLA DE ORO: Watchdog v2.7 (Sin conflictos de estado)
  useEffect(() => {
    let frozenCount = 0;
    let longOutageCount = 0;
    lastVideoTimeRef.current = -1; 

    const stabilityInterval = setInterval(() => {
        if (viewModeRef.current === 'monitor') {
            const video = videoRef.current;
            
            // 1. SI EL VIDEO SE MUEVE: Limpieza absoluta (Manda el video)
            if (video && !video.paused && video.currentTime > lastVideoTimeRef.current) {
                setIsNetworkUnstable(false); 
                frozenCount = 0;
                longOutageCount = 0;
                lastVideoTimeRef.current = video.currentTime;
                return; 
            }

            // 2. SI EL VIDEO ESTÁ DETENIDO
            if (isConnected) {
                // Solo contamos como "congelado" si el video ya había empezado (tiempo > 0)
                if (video && video.currentTime > 0) {
                    frozenCount++;
                    if (frozenCount >= 2) setIsNetworkUnstable(true);
                    if (frozenCount >= 4) {
                        console.warn(">>> Watchdog: Video congelado. Reconectando...");
                        forceFullReconnect();
                        frozenCount = 0;
                    }
                }
            } else {
                // 3. CASO: DESCONECTADO (Wi-Fi Apagado)
                // NO forzamos setIsNetworkUnstable(true) aquí para no chocar con la reconexión.
                // La alerta la activará handleConnect si detecta error persistente.
                longOutageCount++;
                if (longOutageCount >= 10) {
                    forceFullReconnect();
                    longOutageCount = 0;
                }
            }
        }
    }, 3000);

    return () => clearInterval(stabilityInterval);
  }, [isConnected]);
  

 const handleConnect = async (targetId: string, token?: string) => {
    if (!peerRef.current || peerRef.current.destroyed || !peerRef.current.open) {
        if (!peerRef.current || peerRef.current.destroyed) initPeerEngine();
        setTimeout(() => handleConnect(targetId, token), 800);
        return;
    }

    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    setConnectionStatus(t.connecting);
    setIsNetworkUnstable(false);

    if (viewModeRef.current === 'panel') {
        connectionTimeoutRef.current = setTimeout(() => {
            if (!isConnected && viewModeRef.current === 'monitor') {
                setErrorModal({ show: true, title: "Monitor no disponible", msg: "No se pudo establecer conexión. Verifique el monitor del bebé." });
                setViewMode('panel');
                viewModeRef.current = 'panel';
            }
        }, 7000);
    }

    setViewMode('monitor');
    viewModeRef.current = 'monitor';
    
    const conn = peerRef.current.connect(targetId, {
        metadata: { name: getDeviceName(), deviceId: getDeviceId(), token: token || 'VINCULACION_MANUAL' }
    });

    conn.on('open', () => { 
        setIsNetworkUnstable(false); 
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        setIsConnected(true);
        localStorage.setItem('tino_last_connection_id', targetId);
        
        // REGLA DE ORO: Sincronización automática tras reconexión.
        // Forzamos al bebé a que nos envíe video fresco para eliminar el LAG (cuadros viejos).
        conn.send({ type: 'CMD_WATCHDOG_REFRESH', value: true });

        if (videoRef.current) {
            videoRef.current.muted = !audioEnabled;
            videoRef.current.play().catch(() => {});
        } 
        setConnectionStatus("");
    });

    conn.on('data', (data: any) => { 
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        
        // REGLA DE ORO: Detección de cierre voluntario del monitor del bebé
        if (data?.type === 'CMD_SHUTDOWN') {
            setErrorModal({ show: true, title: "Monitor Desconectado", msg: "El monitor del bebé ha dejado de transmitir." });
            setViewMode('panel');
            viewModeRef.current = 'panel';
            if (peerRef.current) peerRef.current.destroy();
            return;
        }

        if (data?.type === 'ERROR_AUTH') { alert(data.message || "Error"); setViewMode('panel'); return; }
        if (data?.type === 'INFO_DEVICE_NAME') addToHistory(targetId, data.name, data.token || token);
        if (data?.type === 'INFO_CAMERA_TYPE') setRemoteFacingMode(data.value);
        if (data?.type === 'BATTERY_STATUS') { setBatteryLevel(data.level); setIsCharging(data.charging); }
    });

    conn.on('error', (err: any) => {
        setIsConnected(false);
        if (viewModeRef.current === 'monitor') {
            setIsNetworkUnstable(true);
            setTimeout(() => forceFullReconnect(), 10000);
        }
    });

    conn.on('close', () => { 
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        setIsConnected(false); 
        if (viewModeRef.current === 'monitor') setIsNetworkUnstable(true);
    });
    dataConnRef.current = conn;
  };

  const enableAudio = () => { 
      if (videoRef.current) {
          videoRef.current.muted = false;
          setAudioEnabled(true);
      }
  };
  
    // REGLA DE ORO: Pre-calentar micrófono para evitar el retraso de 1.5s al hablar
  const preWarmMicrophone = async () => {
      try {
          if (!localStreamRef.current || localStreamRef.current.getAudioTracks()[0].readyState === 'ended') {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              // Mantenemos el track DESACTIVADO para evitar ecos y ahorrar batería
              stream.getAudioTracks().forEach(track => track.enabled = false);
              localStreamRef.current = stream;
              console.log(">>> TiNO: Micrófono pre-calentado y listo.");
          }
      } catch (e) {
          console.error("Error en pre-calentamiento:", e);
      }
  };

const toggleTalk = async (talking: boolean) => { 
      setIsTalking(talking); 
      
      // 1. Sincronizamos el icono en el monitor del bebé vía datos
      if (dataConnRef.current?.open) {
          dataConnRef.current.send({ type: 'INFO_VOICE_STATUS', value: talking });
      }

      if (talking) {
          // REGLA DE ORO: Muteamos nuestro altavoz local para evitar acoples (eco)
          if (videoRef.current) videoRef.current.muted = true;

          try {
              // Pedimos el micro (si no está ya activo)
              if (!localStreamRef.current || localStreamRef.current.getAudioTracks()[0].readyState === 'ended') {
                  localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              }
              
              const audioTrack = localStreamRef.current.getAudioTracks()[0];
              audioTrack.enabled = true; 
              
              if (peerRef.current && connectionId) {
                  // Iniciamos llamada de voz hacia el bebé
                  talkCallRef.current = peerRef.current.call(connectionId, localStreamRef.current);
              }
          } catch (e) {
              console.error("Error micrófono:", e);
              setIsTalking(false);
              // Si falla, devolvemos el audio del bebé por seguridad
              if (videoRef.current && audioEnabled) videoRef.current.muted = false;
          }
      } else {
          // AL SOLTAR EL BOTÓN:
          // 2. Cerramos la llamada para liberar el canal
          if (talkCallRef.current) {
              talkCallRef.current.close();
              talkCallRef.current = null;
          }
          // 3. REGLA DE ORO: Restauramos el audio del bebé en nuestro altavoz
          if (videoRef.current && audioEnabled) {
              videoRef.current.muted = false;
          }
          // Apagamos micro físicamente
          if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach(track => track.enabled = false);
          }
      }
  };

  const sendCommand = (type: string, value: any) => { 
      if (dataConnRef.current?.open) { 
          dataConnRef.current.send({ type, value }); 
          
          // Sincronizamos los estados locales para que la interfaz cambie
          if (type === 'CMD_FLASH') setNightVision(value); 
          if (type === 'CMD_LULLABY') {
              setLullaby(value > 0); // Si es modo 1, 2 o 3, lullaby es true
              setLullabyMode(Number(value));
          }
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

  const takeSnapshot = async () => {
      if (!videoRef.current) return;
      
      try {
          // 1. Efecto visual de Flash (la pantalla parpadea en blanco)
          setIsFlashing(true);
          setTimeout(() => setIsFlashing(false), 100);

          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
              // Dibujamos el frame
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/png');
              
              // 2. Guardar de forma nativa en la carpeta de Imágenes
              const fileName = `TiNO_Baby_${new Date().getTime()}.png`;
              
              await Filesystem.writeFile({
                  path: `Pictures/TiNO/${fileName}`, // Crea carpeta TiNO dentro de Imágenes
                  data: dataUrl,
                  directory: Directory.ExternalStorage,
                  recursive: true // Esto crea la carpeta TiNO si no existe
              });

              // 3. Aviso al usuario
              await Toast.show({
                  text: 'Captura guardada en Galería',
                  duration: 'short',
                  position: 'center'
              });
          }
      } catch (e: any) {
          console.error("Error al guardar:", e);
          // Fallback si falla el acceso a carpetas específicas
          alert("La foto se tomó, pero revisa los permisos de almacenamiento.");
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

 const cycleZoom = () => {
    setZoomLevel(prev => {
      if (prev === 1) return 1.5;
      if (prev === 1.5) return 2;
      if (prev === 2) return 3;
      return 1; // Vuelve al inicio
    });
  };

  if (viewMode === 'panel') return (
      <div className="flex flex-col h-full overflow-hidden relative font-sans" style={V85_GRADIENT}>
          
          {/* HEADER PREMIUM COMPACTO */}
          <div className="p-8 pb-4 flex items-center justify-between relative">
            <button 
    onClick={() => {
        // REGLA DE ORO: Sincronizamos estado y referencia antes de salir
        setViewMode('panel'); 
        viewModeRef.current = 'panel'; 
        onBack(); 
    }} 
    className="w-12 h-12 rounded-full bg-white/90 backdrop-blur shadow-sm flex items-center justify-center text-slate-400 active:scale-90 transition-all"
>
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
        <path d="M15 19l-7-7 7-7" />
    </svg>
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
            {/* MODAL DE ERROR PREMIUM (Sustituye al alert básico) */}
          {errorModal.show && (
            <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
              <div className="bg-white w-full max-w-[300px] rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center border border-white">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4 border border-rose-100">
                    <span className="text-3xl">⚠️</span>
                </div>
                <h3 className="text-lg font-black text-slate-800 text-center mb-2">{errorModal.title}</h3>
                <p className="text-slate-400 text-[11px] font-bold text-center leading-relaxed mb-8 px-2">
                    {errorModal.msg}
                </p>
                <button 
                  onClick={() => setErrorModal({show: false, title: '', msg: ''})}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] tracking-widest uppercase shadow-lg active:scale-95 transition-all"
                >
                  Entendido
                </button>
              </div>
            </div>
          )}
      </div>
  );

  return (
     <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans relative">
          
          {/* SECCIÓN 1: HEADER SUPERIOR FLOTANTE 
              Subido más cerca del borde (mt-1) y con sombra suave. */}
          <div className="absolute top-0 left-0 right-0 z-[60] pt-safe mt-1 px-4 flex justify-between items-center h-14 bg-transparent">
              <div className="flex gap-2 items-center">
                  <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg border border-white/50">
                      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></div>
                      <span className="text-slate-600 text-[9px] font-black uppercase tracking-wide">{t.live_badge}</span>
                  </div>

                  <button 
    onClick={() => {
        // REGLA DE ORO: Borrado forzado de la alerta al tocar el botón
        setIsNetworkUnstable(false); 
        setConnectionStatus("..."); 
        if (!dataConnRef.current || !dataConnRef.current.open) {
            forceFullReconnect();
        } else {
            dataConnRef.current.send({ type: 'CMD_WATCHDOG_REFRESH', value: true });
        }
        setTimeout(() => setConnectionStatus(""), 2000);
    }}
    className="bg-white/90 backdrop-blur-md w-10 h-10 rounded-full flex items-center justify-center text-slate-400 shadow-lg border border-white/50 active:scale-90 transition-all"
>
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
</button>
              </div>

              <div className="flex gap-2 items-center">
                  <button onClick={() => setShowSettings(true)} className="bg-white shadow-xl w-10 h-10 rounded-full flex items-center justify-center text-slate-700 active:scale-90 transition-all border border-white/50">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </button>
                  <button 
    onClick={() => { 
        // REGLA DE ORO: Cerramos conexión y avisamos al cerebro que volvimos al panel
        setIsConnected(false); 
        setViewMode('panel'); 
        viewModeRef.current = 'panel'; 
        if(peerRef.current) peerRef.current.destroy(); 
    }} 
    className="bg-white shadow-xl w-10 h-10 rounded-full flex items-center justify-center text-rose-500 active:scale-90 transition-all border border-white/50"
>
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
        <path d="M6 18L18 6M6 6l12 12"/>
    </svg>
</button>
              </div>
          </div>

          {/* SECCIÓN 2: VISOR DE VIDEO EXPANDIDO
              px-1 para márgenes laterales mínimos. h-[62vh] para que toque el panel inferior pero sea responsivo. */}
          <div className="flex-none w-full px-1 pt-16">    
          <div className={`w-full h-[62vh] rounded-2xl overflow-hidden relative shadow-2xl border-[3px] transition-all duration-700 ${isConnected ? (isNetworkUnstable ? 'border-amber-400' : 'border-emerald-400') : 'border-white'} bg-slate-900`}>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover transition-all duration-300" 
                  style={{ 
                    transform: `scale(${zoomLevel}) scaleX(-1)`,
                    filter: isNightVision ? 'brightness(1.5) contrast(1.2) saturate(0.8)' : 'none'
                  }} 
                />

                {/* NUEVO: MENSAJE DE ALERTA VISUAL (Se activa si el video se congela o la red falla) */}
                {isNetworkUnstable && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-[45] animate-fade-in">
                        <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-3 border-2 border-amber-400">
                            <span className="text-4xl animate-pulse">⚠️</span>
                            <div className="text-center">
                                <p className="text-slate-800 font-black text-xs uppercase tracking-widest leading-none mb-1">Conexión Perdida</p>
                                <p className="text-[10px] text-slate-400 font-bold">Intentando recuperar vídeo...</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* EFECTO DE FLASH VISUAL (REINCORPORADO) */}
                {isFlashing && (
                    <div className="absolute inset-0 bg-white z-[100] animate-pulse"></div>
                )}

                {/* ETIQUETAS INTERNAS CON ICONOS DEL BEBÉ (TRASLÚCIDAS) */}
                <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-30">
                    {/* IA con el RAYO exacto del modo bebé */}
                    <div className="bg-white/40 backdrop-blur-md px-3 py-1.5 rounded-xl text-indigo-700 text-[8px] font-black shadow-sm flex items-center gap-1.5 w-max border border-white/20">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        IA: {sensitivity.toUpperCase()}
                    </div>
                    {/* Calidad con icono CÁMARA */}
                    <div className="bg-white/40 backdrop-blur-md px-3 py-1.5 rounded-xl text-slate-800 text-[8px] font-black shadow-sm flex items-center gap-1.5 uppercase w-max border border-white/20">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                        {videoQuality.toUpperCase()}
                    </div>
                </div>

                {/* ETIQUETA DE BATERÍA BEBÉ (TRASLÚCIDA - RAYO INTEGRADO) */}
                {batteryLevel !== null && (
                    <div className="absolute bottom-6 right-6 bg-white/40 backdrop-blur-md px-3 py-1.5 rounded-xl flex items-center gap-2 border border-white/20 shadow-sm">
                        <span className="text-slate-800 text-[10px] font-black">{Math.round(batteryLevel * 100)}%</span>
                        <div className="w-6 h-3 border border-slate-600 rounded-[3px] p-[1px] relative flex items-center overflow-hidden">
                            {/* Barra de progreso de carga */}
                            <div 
                                className={`h-full rounded-sm transition-all duration-500 ${batteryLevel <= 0.2 ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                                style={{width: `${batteryLevel * 100}%` }} 
                            />
                            {/* Rayo de carga: Ahora centrado absolutamente dentro del contenedor */}
                            {isCharging && (
                                <span className="absolute inset-0 flex items-center justify-center text-[7px] animate-pulse text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
                                    ⚡
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* ACTIVADOR DE AUDIO FLOTANTE */}
                {!audioEnabled && isConnected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 backdrop-blur-sm z-30">
                        <button onClick={enableAudio} className="bg-white px-8 py-4 rounded-full flex items-center gap-3 shadow-2xl animate-bounce border-2 border-indigo-100 active:scale-95">
                            <span className="text-xl">🔇</span>
                            <span className="text-indigo-600 font-black text-xs uppercase tracking-widest">ACTIVAR AUDIO</span>
                        </button>
                    </div>
                )}
              </div>
          </div>
          
          {/* PANEL DE CONTROLES (INFERIOR) */}
          <div className="bg-slate-50 p-6 pb-12" style={V85_GRADIENT}>
              
              {/* NUEVO SISTEMA DE ZOOM POR CICLOS */}
              <div className="flex justify-center items-center mb-6">
                <button 
                    onClick={cycleZoom}
                    className="bg-white/70 backdrop-blur-xl border border-white px-6 py-2 rounded-full shadow-lg flex items-center gap-3 active:scale-95 transition-all"
                >
                    <span className="text-indigo-600 font-black text-[10px] uppercase tracking-widest">Zoom</span>
                    <div className="bg-indigo-600 text-white text-[10px] font-black px-3 py-0.5 rounded-full">
                        {zoomLevel}x
                    </div>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-4">
                  {/* HABLAR */}
                  <button onMouseDown={() => toggleTalk(true)} onMouseUp={() => toggleTalk(false)} onTouchStart={() => toggleTalk(true)} onTouchEnd={() => toggleTalk(false)} className={`aspect-square rounded-[2rem] flex flex-col items-center justify-center gap-2 border border-white shadow-xl transition-all ${isTalking ? 'bg-indigo-500 text-white scale-95' : 'bg-white/70 backdrop-blur-xl text-indigo-500'}`}>
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                    <span className="text-[9px] font-black uppercase">{t.talk_btn}</span>
                  </button>
                {/* BOTÓN DE NANAS PREMIUM */}
<button 
  onClick={() => {
    const nextMode = (lullabyMode + 1) % 4; 
    // Llamamos a la función que actualiza todo
    sendCommand('CMD_LULLABY', nextMode);
  }} 
  className={`aspect-square rounded-[2rem] flex flex-col items-center justify-center gap-2 border border-white shadow-xl transition-all ${lullabyMode > 0 ? 'bg-purple-500 text-white scale-95' : 'bg-white/70 backdrop-blur-xl text-purple-500'}`}
>
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
    <path d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l.31-.088a2.25 2.25 0 001.382-1.353V9m0 0V5.25A2.25 2.25 0 0016.5 3h-2.25a2.25 2.25 0 00-2.25 2.25V15m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l.31-.088A2.25 2.25 0 009 15.503V9z" />
  </svg>
  <span className="text-[9px] font-black uppercase">
    {lullabyMode === 0 ? 'NANAS' : lullabyMode === 1 ? 'LLUVIA' : lullabyMode === 2 ? 'CORAZÓN' : 'ONDAS'}
  </span>
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
         {/* MODAL DE CONFIGURACIÓN PADRES (REFINADO Y ESTILIZADO)
              Este bloque se encarga de mostrar las opciones de IA y Calidad en una tarjeta flotante. */}
          {showSettings && (
            <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in" onClick={() => setShowSettings(false)}>
              <div className="bg-white w-full max-w-[300px] rounded-[3rem] p-8 shadow-2xl relative border border-white" onClick={e => e.stopPropagation()}>
                {/* Botón X para cerrar el modal */}
                <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center font-black active:scale-90 transition-all">✕</button>
                
                <h2 className="text-xl font-black text-slate-800 mb-8 pr-8 tracking-tight">Preferencias</h2>
                
                <div className="space-y-8">
                  {/* CONFIGURACIÓN DE CALIDAD DE VIDEO */}
                  <div>
                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">CALIDAD DE VIDEO</h3>
                    <div className="flex bg-slate-50 p-1 rounded-[1.2rem] border border-slate-100">
                      {['low', 'medium', 'high'].map(q => (
                        <button key={q} onClick={() => changeQuality(q as any)} className={`flex-1 py-2.5 rounded-xl text-[9px] font-black transition-all ${videoQuality === q ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{q.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>

                  {/* CONFIGURACIÓN DE SENSIBILIDAD IA */}
                  <div>
                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">SENSIBILIDAD IA</h3>
                    <div className="flex bg-slate-50 p-1 rounded-[1.2rem] border border-slate-100">
                      {['low', 'medium', 'high'].map(s => (
                        <button key={s} onClick={() => sendCommand('CMD_SENSITIVITY', s)} className={`flex-1 py-2.5 rounded-xl text-[9px] font-black transition-all ${sensitivity === s ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{s.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>

                  {/* INDICADOR DE ESTADO DE AUDIO (Detalle de seguridad) */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                    <h3 className="font-bold text-slate-700 text-sm">Audio del Bebé</h3>
                    <div className={`px-4 py-2 rounded-xl font-black text-[9px] ${audioEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      {audioEnabled ? 'EN VIVO' : 'SILENCIADO'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>
  );
};