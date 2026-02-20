import React, { useState, useEffect } from 'react';
import { AppMode, Language, MonitorHistoryItem, BatteryState } from './types';
import { BabyMonitor } from './components/BabyMonitor';
import { ParentStation } from './components/ParentStation';
import { TutorialModal } from './components/TutorialModal';
import { getDeviceName, getDeviceId, initializeSmartName, setDeviceName } from './services/deviceStorage';
import { secureStorage } from './services/secureStorage';
import { translations } from './services/translations';
import { BRAND_LOGO, applyGlobalBranding } from './services/logo';
import { InstallPrompt } from './components/InstallPrompt';

const V85_GRADIENT = { background: 'linear-gradient(180deg, #bae6fd 0%, #fce7f3 100%)' };

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.SELECTION);
  const [activeTab, setActiveTab] = useState<'home' | 'devices' | 'settings'>('home');
  const [language, setLanguage] = useState<Language>('es');
  const [currentDeviceName, setCurrentDeviceName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [history, setHistory] = useState<MonitorHistoryItem[]>([]);
  const [parentHistory, setParentHistory] = useState<MonitorHistoryItem[]>([]);
  const [selectedLogDevice, setSelectedLogDevice] = useState<MonitorHistoryItem | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [localBattery, setLocalBattery] = useState<BatteryState | null>(null);

  const t = translations[language];

  const messagesMap = {
    es: ["Cuidando los sueños de tu mayor tesoro.", "Vigilancia confiable para que tú también descanses.", "Siempre cerca, aunque estés en otra habitación.", "Tecnología tierna para tu tranquilidad.", "Tu bebé seguro, tu mente tranquila.", "El compañero perfecto para la crianza.", "Escucha cada respiración, siente cada momento.", "Porque su seguridad es tu paz.", "Dulces sueños para él, tranquilidad para ti.", "Conectando corazones a distancia.", "Un par de ojos extra para cuidarlo siempre.", "La tranquilidad de saber que está bien.", "Cuidamos lo que más amas en el mundo.", "Descansa sabiendo que estamos vigilando.", "Amor y tecnología unidos para tu bebé.", "Tu mirada digital, siempre atenta.", "La conexión más segura con tu bebé.", "Protegiendo cada suspiro mientras descansas.", "Tecnología que abraza a tu familia.", "Un lazo invisible de amor y seguridad.", "Porque cada segundo cuenta, estamos ahí.", "Tu tranquilidad es nuestra prioridad.", "Monitoreo inteligente, cuidado constante.", "Dulces sueños para él, paz mental para ti.", "La ventana digital a su mundo.", "Siempre presentes, siempre vigilantes.", "El guardián silencioso de sus sueños.", "Amor en cada pixel, seguridad en cada dato.", "Cerca de ti, sin importar la distancia.", "Innovación pensada con el corazón."],
    en: ["Guarding the dreams of your greatest treasure.", "Reliable monitoring so you can rest too.", "Always close, even from another room.", "Gentle technology for your peace of mind.", "Your baby safe, your mind at ease.", "The perfect companion for parenting.", "Hear every breath, feel every moment.", "Because their safety is your peace.", "Sweet dreams for them, tranquility for you.", "Connecting hearts across the distance.", "An extra pair of eyes to watch over them always.", "The peace of knowing they are okay.", "We care for what you love most in the world.", "Rest knowing we are watching.", "Love and technology united for your baby.", "Your digital gaze, always attentive.", "The safest connection with your baby.", "Protecting every breath while you rest.", "Technology that embraces your family.", "An invisible bond of love and safety.", "Because every second counts, we are there.", "Your peace of mind is our priority.", "Smart monitoring, constant care.", "Sweet dreams for them, peace of mind for you.", "The digital window to their world.", "Always present, always vigilant.", "The silent guardian of their dreams.", "Love in every pixel, safety in every byte.", "Close to you, no matter the distance.", "Innovation designed with the heart."]
  };

  const currentMessages = messagesMap[language];

  const refreshHistory = () => {
    const monHist = secureStorage.getItem<MonitorHistoryItem[]>('monitor_history') || [];
    const parHist = secureStorage.getItem<MonitorHistoryItem[]>('parent_history') || [];
    setHistory(monHist);
    setParentHistory(parHist);
  };

  useEffect(() => {
    applyGlobalBranding();
    setCurrentDeviceName(getDeviceName());
    initializeSmartName().then(name => name && setCurrentDeviceName(name));
    const savedLang = secureStorage.getItem<Language>('tino_lang');
    if (savedLang) setLanguage(savedLang);
    refreshHistory();

    // Habilitar Modo Full Screen si estamos en Capacitor
    const setupNativeEnvironment = async () => {
      if ((window as any).Capacitor) {
        try {
          const { StatusBar } = await import('@capacitor/status-bar');
          await StatusBar.hide();
        } catch (e) {
          console.debug("StatusBar hide failed or not installed:", e);
        }
      }
    };
    setupNativeEnvironment();

    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBattery = () => { setLocalBattery({ level: battery.level, charging: battery.charging }); };
        updateBattery();
        battery.onlevelchange = updateBattery;
        battery.onchargingchange = updateBattery;
      });
    }

    const interval = setInterval(() => {
      setFade(false); 
      setTimeout(() => { setMsgIndex((prev) => (prev + 1) % 30); setFade(true); }, 2000); 
    }, 20000); 

    return () => clearInterval(interval);
  }, [activeTab, mode]);

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    secureStorage.setItem('tino_lang', lang);
  };

  const handleSaveName = () => {
    if (currentDeviceName.trim()) {
      setDeviceName(currentDeviceName);
      setIsEditingName(false);
    }
  };

  const handleDeleteHistory = (id: string, type: 'monitor' | 'parent') => {
    const key = type === 'monitor' ? 'monitor_history' : 'parent_history';
    const currentList = type === 'monitor' ? history : parentHistory;
    const updated = currentList.filter(h => h.id !== id);
    if (type === 'monitor') setHistory(updated); else setParentHistory(updated);
    secureStorage.setItem(key, updated);
  };

  const handleDownloadBackup = () => {
    const backupContent = `TiNO Baby Monitor - v1.4.0 Native Edition\nID: ${getDeviceId()}\nNombre: ${currentDeviceName}\nFecha: ${new Date().toLocaleString()}`;
    const blob = new Blob([backupContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TiNO_v140_Native_Config.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

 const renderHome = () => (
    <div className="flex flex-col items-center min-h-full p-6 animate-fade-in relative z-10 pb-4 pt-safe">
      
      {/* CONTENIDO PRINCIPAL (LOGO Y BOTONES) */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="text-center w-full max-w-xs mt-4">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-[3rem] bg-white shadow-xl mb-4 animate-float-premium relative z-10 border-4 border-white overflow-hidden">
            <img src={BRAND_LOGO} alt="TiNO" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-6xl font-black tracking-tighter text-gradient-tino">TiNO</h1>
          <p className="text-slate-400 font-bold text-[10px] tracking-[0.4em] uppercase mb-4">{t.subtitle}</p>
          
          <div className="h-12 flex items-start justify-center mb-4">
            <p className={`text-slate-500 font-nunito italic text-sm md:text-base leading-snug transition-opacity duration-[2000ms] ease-in-out px-4 ${fade ? 'opacity-100' : 'opacity-0'}`}>
              {currentMessages[msgIndex]}
            </p>
          </div>
        </div>

        <div className="w-full max-w-sm grid grid-cols-2 gap-6 mb-6 px-2">
          {/* MODO BEBÉ */}
          <button 
            onClick={() => setMode(AppMode.MONITOR)} 
            className="group relative bg-gradient-to-br from-white to-sky-50 p-5 rounded-[3rem] shadow-[0_20px_40px_rgba(186,230,253,0.3)] flex flex-col items-center justify-center gap-4 aspect-square transition-all duration-300 hover:scale-[1.03] active:scale-95 border border-sky-100 overflow-hidden"
          >
            <div className="w-20 h-20 flex items-center justify-center relative z-10">
              <svg className="absolute inset-0 w-full h-full text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="6" y="2" width="12" height="20" rx="6" />
                <circle cx="12" cy="8.5" r="5" fill="white" />
              </svg>
              <div className="absolute top-[35.4%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34px] h-[34px] rounded-full overflow-hidden flex items-center justify-center z-20">
                <div className="absolute w-[24px] h-[24px] rounded-full blur-[0.9px] opacity-90" style={{background: 'radial-gradient(circle at 35% 35%, rgba(103, 232, 249, 0.8) 0%, rgba(37, 99, 235, 0.85) 60%, rgba(15, 23, 42, 1) 100%)'}} />
                <div className="absolute w-1.5 h-1.5 bg-slate-950 rounded-full blur-[0.3px]"></div>
                <div className="absolute top-0 left-0 w-full h-1/2 bg-white origin-top animate-eye-refined"></div>
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-white origin-bottom animate-eye-refined"></div>
              </div>
              <div className="absolute -top-1 -right-1 bg-white p-1.5 rounded-full shadow-lg border border-sky-50 animate-premium-beat z-30">
                <svg className="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </div>
            </div>
            <div className="text-center relative z-10">
              <h3 className="font-bold text-slate-700 text-xl leading-none">BaBy</h3>
              <p className="text-[8px] text-sky-400 uppercase font-black tracking-[0.2em] mt-1.5">{t.mode_camera}</p>
            </div>
          </button>

          {/* MODO PADRES */}
          <button 
            onClick={() => setMode(AppMode.PARENT)} 
            className="group relative bg-gradient-to-br from-white to-rose-50 p-5 rounded-[3rem] shadow-[0_20px_40px_rgba(252,231,243,0.3)] flex flex-col items-center justify-center gap-4 aspect-square transition-all duration-300 hover:scale-[1.03] active:scale-95 border border-rose-100 overflow-hidden"
          >
            <div className="w-20 h-20 flex items-center justify-center relative z-10">
              <svg className="w-12 h-12 text-rose-500 filter drop-shadow-sm relative z-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="3" fill="currentColor" fillOpacity="0.05"/>
                <path d="M12 18h.01" strokeWidth="3" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 border-2 border-rose-200 rounded-full animate-[ping_2.5s_linear_infinite] opacity-40"></div>
                <div className="w-16 h-16 border-2 border-rose-100 rounded-full animate-[ping_3s_linear_infinite] opacity-20 absolute"></div>
              </div>
              <div className="absolute -bottom-1 -right-1 bg-white p-1.5 rounded-full shadow-lg border border-rose-50">
                <svg className="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                </svg>
              </div>
            </div>
            <div className="text-center relative z-10">
              <h3 className="font-bold text-slate-700 text-xl leading-none">{t.parent_title}</h3>
              <p className="text-[8px] text-rose-400 uppercase font-black tracking-[0.2em] mt-1.5">{t.mode_monitor}</p>
            </div>
          </button>
        </div>

        <div className="w-full max-w-sm">
          <InstallPrompt />
        </div>
      </div>

      {/* INFO DE SISTEMA AL FINAL (BATERÍA ARRIBA, VERSIÓN ABAJO) */}
      <div className="mt-auto mb-6 flex flex-col items-center gap-1 opacity-40">
        {localBattery && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500">{Math.round(localBattery.level * 100)}%</span>
            <div className="w-5 h-2.5 border border-slate-400 rounded-[2px] p-[1px] relative">
              <div 
                className={`h-full rounded-px ${localBattery.level <= 0.2 ? 'bg-rose-400' : 'bg-slate-500'}`} 
                style={{ width: `${localBattery.level * 100}%` }} 
              />
              {localBattery.charging && (
                <span className="absolute -right-3 -top-1.5 text-[8px] animate-pulse">⚡</span>
              )}
            </div>
          </div>
        )}
       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">
         TiNO v1.7.0 - UI Symmetry & Audio Fix
       </p>
      </div>
    </div>
  );

  const renderEquipos = () => {
    if (selectedLogDevice) {
      return (
        <div className="p-6 pt-12 max-w-md mx-auto animate-fade-in pt-safe">
          <button onClick={() => setSelectedLogDevice(null)} className="mb-6 mt-4 flex items-center gap-2 text-indigo-500 font-bold text-sm bg-white px-4 py-2 rounded-xl shadow-sm w-max">← {t.back_btn}</button>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-500 text-2xl">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="2" width="10" height="16" rx="2" />
                  <rect x="4" y="6" width="10" height="16" rx="2" fill="currentColor" fillOpacity="0.1" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">{selectedLogDevice.name}</h3>
                <p className="text-[10px] text-slate-400 font-mono">{selectedLogDevice.id}</p>
              </div>
            </div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t.conn_history}</h4>
            <div className="space-y-3 relative">
              <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100"></div>
              {(selectedLogDevice.logs || []).map((timestamp, i) => (
                <div key={i} className="relative pl-10 flex flex-col">
                  <div className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-indigo-200 border-2 border-white shadow-sm"></div>
                  <span className="text-slate-700 font-bold text-xs">{new Date(timestamp).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                  <span className="text-slate-400 text-[10px] font-mono">{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              {(!selectedLogDevice.logs || selectedLogDevice.logs.length === 0) && (
                <p className="text-slate-400 text-xs italic">{t.history_empty}</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 pt-12 max-w-md mx-auto animate-fade-in pt-safe">
        <h2 className="text-lg font-black text-slate-800 mb-2 mt-4">{t.tab_devices}</h2>
        <p className="text-slate-400 text-[11px] font-bold mb-10">{t.dev_subtitle}</p>

        <div className="mb-10">
          <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span>📷</span> {t.my_cameras}
          </h3>
          {history.length === 0 ? (
            <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 p-8 rounded-[2rem] text-center">
              <p className="text-slate-300 text-[9px] font-black uppercase tracking-widest">{t.history_empty}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group cursor-pointer" onClick={() => setSelectedLogDevice(item)}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-500">
                       <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                         <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                       </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base leading-tight">{item.name}</h3>
                      <button onClick={(e) => { e.stopPropagation(); setMode(AppMode.PARENT); }} className="text-[10px] text-indigo-500 font-black uppercase mt-1">{t.connect_btn}</button>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.id, 'monitor'); }} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-200 hover:bg-rose-50 hover:text-rose-500 transition-colors">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span>📱</span> {t.auth_receivers}
          </h3>
          {parentHistory.length === 0 ? (
            <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 p-12 rounded-[2.5rem] flex items-center justify-center">
              <p className="text-slate-300 text-[9px] font-black uppercase tracking-widest">{t.no_receivers}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {parentHistory.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer" onClick={() => setSelectedLogDevice(item)}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base leading-tight">{item.name}</h3>
                      <p className="text-[8px] text-slate-400 font-black uppercase mt-1">{t.last_conn} {new Date(item.lastConnected).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.id, 'parent'); }} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-200 hover:bg-rose-50 hover:text-rose-500 transition-colors">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

 const renderContent = () => {
    if (mode === AppMode.MONITOR) return <BabyMonitor onBack={() => { setMode(AppMode.SELECTION); refreshHistory(); }} lang={language} />;
    if (mode === AppMode.PARENT) return <ParentStation onBack={() => { setMode(AppMode.SELECTION); refreshHistory(); }} lang={language} />;
    return (
      <div className="flex flex-col h-full relative overflow-hidden" style={V85_GRADIENT}>
        {showTutorial && <TutorialModal lang={language} onClose={() => setShowTutorial(false)} />}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
          {activeTab === 'home' && renderHome()}
          {activeTab === 'devices' && renderEquipos()}
          {activeTab === 'settings' && (
            <div className="p-8 animate-fade-in pt-12 pt-safe">
               <h2 className="text-lg font-black text-slate-900 mb-2 mt-4">{t.tab_config}</h2>
               <div className="space-y-6 mt-10">
                 {/* BLOQUE IDIOMA */}
                 <div className="bg-white px-7 py-4 rounded-[2.2rem] shadow-sm border border-slate-100 w-full">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-black text-slate-800 text-sm">🌐 {t.language}</h3>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => changeLanguage('es')} className={`px-4 py-2 rounded-lg font-bold text-[10px] ${language === 'es' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>ES</button>
                        <button onClick={() => changeLanguage('en')} className={`px-4 py-2 rounded-lg font-bold text-[10px] ${language === 'en' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>EN</button>
                      </div>
                    </div>
                 </div>
                 {/* BLOQUE IDENTIFICACIÓN */}
                 <div className="bg-white px-7 py-4 rounded-[2.2rem] shadow-sm border border-slate-100 w-full">
                   <h3 className="font-black text-slate-800 text-sm">🪪 {t.dev_name_title}</h3>
                   {isEditingName ? (
                      <div className="flex gap-2 mt-4">
                        <input value={currentDeviceName} onChange={(e) => setCurrentDeviceName(e.target.value)} className="flex-1 bg-slate-50 border rounded-xl px-4 py-2 text-xs" />
                        <button onClick={handleSaveName} className="bg-indigo-600 text-white px-4 rounded-xl font-bold text-xs">OK</button>
                      </div>
                   ) : (
                      <div onClick={() => setIsEditingName(true)} className="bg-slate-50 p-3 rounded-2xl flex justify-between items-center mt-3 cursor-pointer">
                        <span className="font-black text-slate-700 text-xs">{currentDeviceName}</span>
                        <button className="text-indigo-500 text-[10px] font-black">{t.edit_btn}</button>
                      </div>
                   )}
                 </div>
                 {/* BLOQUE RESPALDO */}
                 <div className="bg-white px-7 py-4 rounded-[2.2rem] shadow-sm border border-slate-100 w-full">
                    <h3 className="font-black text-slate-800 text-sm mb-3">💾 {t.backup_title}</h3>
                    <button onClick={handleDownloadBackup} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[9px] tracking-widest uppercase">{t.backup_btn}</button>
                 </div>
                 {/* BLOQUE TUTORIAL (NUEVO) */}
                 <div className="bg-white px-7 py-4 rounded-[2.2rem] shadow-sm border border-slate-100 w-full">
                    <h3 className="font-black text-slate-800 text-sm mb-3">📖 {t.help_title || 'Ayuda'}</h3>
                    <button 
                      onClick={() => setShowTutorial(true)} 
                      className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black text-[10px] tracking-widest uppercase"
                    >
                      VER TUTORIAL
                    </button>
                 </div>
               </div>
            </div>
          )}
        </div>
        
        {/* BARRA DE NAVEGACIÓN INFERIOR */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[360px] h-20 bg-white/90 backdrop-blur-2xl border border-white/40 rounded-[2.5rem] shadow-2xl flex justify-between items-center px-4 z-[60]">
          
          <button onClick={() => { setActiveTab('home'); setSelectedLogDevice(null); }} className="flex flex-col items-center justify-center flex-1">
            <div className={`w-8 h-8 rounded-full overflow-hidden border-2 mb-1 transition-all ${activeTab === 'home' ? 'border-indigo-400 scale-110 shadow-md' : 'border-slate-100 opacity-40'}`}>
               <img src={BRAND_LOGO} alt="Inicio" className="w-full h-full object-cover" />
            </div>
            <span className={`text-[9px] font-black uppercase transition-colors ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-400'}`}>{t.tab_home}</span>
          </button>

          <button onClick={() => { setActiveTab('devices'); setSelectedLogDevice(null); }} className="flex flex-col items-center justify-center flex-1">
            <div className={`transition-all ${activeTab === 'devices' ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </div>
            <span className={`text-[9px] font-black uppercase transition-colors ${activeTab === 'devices' ? 'text-indigo-600' : 'text-slate-400'}`}>{t.tab_devices}</span>
          </button>

          <button onClick={() => { setActiveTab('settings'); setSelectedLogDevice(null); }} className="flex flex-col items-center justify-center flex-1">
            <div className={`transition-all ${activeTab === 'settings' ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            </div>
            <span className={`text-[9px] font-black uppercase transition-colors ${activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-400'}`}>{t.tab_config}</span>
          </button>
        </div>
      </div>
    );
  };
  return <div className="h-full w-full fixed inset-0 overflow-hidden font-sans select-none" style={V85_GRADIENT}>{renderContent()}</div>;
};

export default App;

// para ver si el comitt funciono correctamente