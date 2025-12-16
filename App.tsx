
import React, { useState, useEffect } from 'react';
import { AppMode, MonitorHistoryItem, Language } from './types';
import { BabyMonitor } from './components/BabyMonitor';
import { ParentStation } from './components/ParentStation';
import { InstallPrompt } from './components/InstallPrompt';
import { TutorialModal } from './components/TutorialModal';
import { getDeviceName, setDeviceName, initializeSmartName } from './services/deviceStorage';
import { secureStorage } from './services/secureStorage';
import { translations } from './services/translations';
import { DEFAULT_LOGO } from './services/logo';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.SELECTION);
  const [activeTab, setActiveTab] = useState<'home' | 'devices' | 'settings'>('home');
  const [msgIndex, setMsgIndex] = useState(0);
  const [fade, setFade] = useState(true);
  
  // LANGUAGE & TUTORIAL STATE
  const [language, setLanguage] = useState<Language>('es');
  const [showTutorial, setShowTutorial] = useState(false);
  const t = translations[language];

  // HISTORY & STATE
  const [historyItems, setHistoryItems] = useState<MonitorHistoryItem[]>([]);
  const [parentItems, setParentItems] = useState<MonitorHistoryItem[]>([]);
  const [connectionLogs, setConnectionLogs] = useState<Record<string, number[]>>({});
  const [selectedLogParent, setSelectedLogParent] = useState<MonitorHistoryItem | null>(null);

  const [currentDeviceName, setCurrentDeviceName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  const [autoConnectId, setAutoConnectId] = useState<string | null>(null);

  // APP VERSION CONSTANTS
  const APP_VERSION = "1.0.0";
  const BUILD_NUMBER = "Release 85";

  const messagesMap = {
    es: [
      "Cuidando los sueños de tu mayor tesoro.",
      "Vigilancia confiable para que tú también descanses.",
      "Siempre cerca, aunque estés en otra habitación.",
      "Tecnología tierna para tu tranquilidad.",
      "Tu bebé seguro, tu mente tranquila.",
      "El compañero perfecto para la crianza.",
      "Escucha cada respiración, siente cada momento.",
      "Porque su seguridad es tu paz.",
      "Dulces sueños para él, tranquilidad para ti.",
      "Conectando corazones a distancia.",
      "Un par de ojos extra para cuidarlo siempre.",
      "La tranquilidad de saber que está bien.",
      "Cuidamos lo que más amas en el mundo.",
      "Descansa sabiendo que estamos vigilando.",
      "Amor y tecnología unidos para tu bebé.",
      "Tu mirada digital, siempre atenta.",
      "La conexión más segura con tu bebé.",
      "Protegiendo cada suspiro mientras descansas.",
      "Tecnología que abraza a tu familia.",
      "Un lazo invisible de amor y seguridad.",
      "Porque cada segundo cuenta, estamos ahí.",
      "Tu tranquilidad es nuestra prioridad.",
      "Monitoreo inteligente, cuidado constante.",
      "Dulces sueños para él, paz mental para ti.",
      "La ventana digital a su mundo.",
      "Siempre presentes, siempre vigilantes.",
      "El guardián silencioso de sus sueños.",
      "Amor en cada pixel, seguridad en cada dato.",
      "Cerca de ti, sin importar la distancia.",
      "Innovación pensada con el corazón."
    ],
    en: [
      "Guarding the dreams of your greatest treasure.",
      "Reliable monitoring so you can rest too.",
      "Always close, even from another room.",
      "Gentle technology for your peace of mind.",
      "Your baby safe, your mind at ease.",
      "The perfect companion for parenting.",
      "Hear every breath, feel every moment.",
      "Because their safety is your peace.",
      "Sweet dreams for them, tranquility for you.",
      "Connecting hearts across the distance.",
      "An extra pair of eyes to watch over them always.",
      "The peace of knowing they are okay.",
      "We care for what you love most in the world.",
      "Rest knowing we are watching.",
      "Love and technology united for your baby.",
      "Your digital gaze, always attentive.",
      "The safest connection with your baby.",
      "Protecting every breath while you rest.",
      "Technology that embraces your family.",
      "An invisible bond of love and safety.",
      "Because every second counts, we are there.",
      "Your peace of mind is our priority.",
      "Smart monitoring, constant care.",
      "Sweet dreams for them, peace of mind for you.",
      "The digital window to their world.",
      "Always present, always vigilant.",
      "The silent guardian of their dreams.",
      "Love in every pixel, safety in every byte.",
      "Close to you, no matter the distance.",
      "Innovation designed with the heart."
    ]
  };

  const currentMessages = messagesMap[language];

  useEffect(() => {
    // Dynamic Favicon Update
    const link = document.querySelector("link[rel~='icon']");
    if (link) {
      (link as HTMLLinkElement).href = DEFAULT_LOGO;
    } else {
      const newLink = document.createElement('link');
      newLink.rel = 'icon';
      newLink.href = DEFAULT_LOGO;
      document.head.appendChild(newLink);
    }

    const savedMode = localStorage.getItem('app_mode');
    if (savedMode === AppMode.MONITOR) setMode(AppMode.MONITOR);
    if (savedMode === AppMode.PARENT) setMode(AppMode.PARENT);

    // Load Language
    const savedLang = localStorage.getItem('tino_language');
    if (savedLang === 'en') setLanguage('en');

    setCurrentDeviceName(getDeviceName());

    initializeSmartName().then((preciseName) => {
        if (preciseName) setCurrentDeviceName(preciseName);
    });

    const interval = setInterval(() => {
      setFade(false); 
      setTimeout(() => {
        setMsgIndex((prev) => (prev + 1) % 30);
        setFade(true); 
      }, 2000); 
    }, 20000); 

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'devices') {
      const h = secureStorage.getItem<MonitorHistoryItem[]>('monitor_history');
      setHistoryItems(h || []);

      const p = secureStorage.getItem<MonitorHistoryItem[]>('parent_history');
      setParentItems(p || []);
      
      const logs = secureStorage.getItem<Record<string, number[]>>('parent_connection_logs');
      setConnectionLogs(logs || {});
    }
    if (activeTab === 'settings') {
        setCurrentDeviceName(getDeviceName());
    }
  }, [activeTab]);

  const handleSetLanguage = (lang: Language) => {
      setLanguage(lang);
      localStorage.setItem('tino_language', lang);
  };

  const handleSetMode = (newMode: AppMode) => {
    setMode(newMode);
    if (newMode === AppMode.SELECTION) {
        setAutoConnectId(null);
        localStorage.removeItem('app_mode');
    } else {
      localStorage.setItem('app_mode', newMode);
    }
  };

  const connectToDevice = (id: string) => {
      setAutoConnectId(id);
      handleSetMode(AppMode.PARENT);
  };

  const deleteDevice = (id: string) => {
    const newHistory = historyItems.filter(item => item.id !== id);
    setHistoryItems(newHistory);
    secureStorage.setItem('monitor_history', newHistory);
  };
  
  const deleteParent = (id: string) => {
    const newParents = parentItems.filter(item => item.id !== id);
    setParentItems(newParents);
    secureStorage.setItem('parent_history', newParents);
  };
  
  const saveName = () => {
      if (currentDeviceName.trim()) {
          setDeviceName(currentDeviceName);
          setIsEditingName(false);
      }
  };

  const renderContent = () => {
    switch (mode) {
      case AppMode.MONITOR:
        return <BabyMonitor onBack={() => handleSetMode(AppMode.SELECTION)} lang={language} />;
      case AppMode.PARENT:
        return <ParentStation onBack={() => handleSetMode(AppMode.SELECTION)} initialTargetId={autoConnectId} lang={language} />;
      default:
        return (
          <div className="flex flex-col min-h-screen bg-slate-50 relative overflow-hidden font-sans text-slate-700">
            <div className="absolute top-[-10%] left-[-20%] w-[600px] h-[600px] bg-sky-100/70 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-20%] w-[500px] h-[500px] bg-pink-100/60 rounded-full blur-[80px] pointer-events-none"></div>

            {/* TUTORIAL MODAL */}
            {showTutorial && <TutorialModal lang={language} onClose={() => setShowTutorial(false)} />}

            <div className="flex-1 overflow-y-auto pb-24 relative z-10">
              
              {activeTab === 'home' && (
                <div className="flex flex-col items-center justify-center min-h-full p-6 animate-fade-in relative">
                  
                  {/* Tutorial Button */}
                  <button 
                    onClick={() => setShowTutorial(true)}
                    className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/50 backdrop-blur-md flex items-center justify-center text-slate-600 font-bold border border-white shadow-sm hover:bg-white transition-all z-20"
                  >
                    ?
                  </button>

                  <div className="mb-8 text-center w-full max-w-xs pt-10">
                    {/* Fixed Logo Display */}
                    <div className="inline-flex items-center justify-center w-40 h-40 rounded-[3rem] bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] mb-6 animate-float relative z-10 border-4 border-white overflow-hidden">
                      <img src={DEFAULT_LOGO} alt="App Logo" className="w-full h-full object-cover" />
                    </div>

                    <h1 className="text-6xl font-extrabold tracking-tight mb-1 text-gradient-tino">
                      TiNO
                    </h1>
                    <h2 className="text-slate-400 font-bold tracking-[0.2em] text-sm mb-4 uppercase">
                      {t.subtitle}
                    </h2>
                    
                    <div className="h-16 flex items-start justify-center">
                      <p className={`text-slate-500 font-nunito italic text-sm md:text-base leading-snug transition-opacity duration-[2000ms] ease-in-out px-4 ${fade ? 'opacity-100' : 'opacity-0'}`}>
                        {currentMessages[msgIndex]}
                      </p>
                    </div>
                  </div>

                  <div className="w-full max-w-sm grid grid-cols-2 gap-4 mb-8">
                    <button onClick={() => handleSetMode(AppMode.MONITOR)} className="group relative bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 aspect-square flex flex-col items-center justify-center gap-3 active:scale-95">
                      <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-500 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shadow-inner">📷</div>
                      <div className="text-center">
                        <h3 className="text-slate-700 font-elegant font-bold text-2xl leading-none mb-1">{t.baby_title}</h3>
                        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t.mode_camera}</p>
                      </div>
                    </button>

                    <button onClick={() => handleSetMode(AppMode.PARENT)} className="group relative bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 aspect-square flex flex-col items-center justify-center gap-3 active:scale-95">
                      <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shadow-inner">📱</div>
                      <div className="text-center">
                        <h3 className="text-slate-700 font-elegant font-bold text-2xl leading-none mb-1">{t.parent_title}</h3>
                        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t.mode_monitor}</p>
                      </div>
                    </button>
                  </div>

                  <div className="w-full max-w-sm"><InstallPrompt /></div>

                  <div className="p-6 text-center mt-4">
                    <span className="text-[10px] font-bold text-slate-300 tracking-widest uppercase flex items-center justify-center gap-2">
                      TiNO v{APP_VERSION}
                    </span>
                  </div>
                </div>
              )}

              {activeTab === 'devices' && (
                <div className="p-6 pt-12 max-w-md mx-auto animate-fade-in">
                  
                  {selectedLogParent ? (
                      <div className="animate-fade-in">
                          <button onClick={() => setSelectedLogParent(null)} className="mb-6 flex items-center gap-2 text-indigo-500 font-bold text-sm bg-white px-4 py-2 rounded-xl shadow-sm w-max">← {t.back_btn}</button>
                          
                          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
                              <div className="flex items-center gap-4 mb-6">
                                  <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 text-2xl">📱</div>
                                  <div>
                                      <h3 className="font-bold text-slate-800 text-lg">{selectedLogParent.name}</h3>
                                      <p className="text-xs text-slate-400 font-mono">{selectedLogParent.id}</p>
                                  </div>
                              </div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t.conn_history}</h4>
                              <div className="space-y-3 relative">
                                  <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100"></div>
                                  {(connectionLogs[selectedLogParent.id] || []).map((timestamp, i) => (
                                      <div key={i} className="relative pl-10 flex flex-col">
                                          <div className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-indigo-200 border-2 border-white shadow-sm"></div>
                                          <span className="text-slate-700 font-bold text-sm">{new Date(timestamp).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                                          <span className="text-slate-400 text-xs font-mono">{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                  ))}
                                  {(!connectionLogs[selectedLogParent.id] || connectionLogs[selectedLogParent.id].length === 0) && (
                                      <p className="text-slate-400 text-sm italic">Sin registros detallados recientes.</p>
                                  )}
                              </div>
                          </div>
                      </div>
                  ) : (
                      <>
                        <h2 className="text-3xl font-extrabold text-slate-800 mb-2">{t.dev_title}</h2>
                        <p className="text-slate-400 text-sm mb-8">{t.dev_subtitle}</p>

                        <div className="mb-8">
                            <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2"><span>📹</span> {t.my_cameras}</h3>
                            {historyItems.length === 0 ? (
                                <p className="text-slate-400 text-sm italic bg-slate-100 p-4 rounded-xl text-center">{t.no_cameras}</p>
                            ) : (
                                <div className="space-y-3">
                                {historyItems.map((item) => (
                                    <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group cursor-pointer hover:border-indigo-200 transition-colors" onClick={() => connectToDevice(item.id)}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 text-lg">📹</div>
                                            <div>
                                                <h3 className="font-bold text-slate-700 text-sm">{item.name}</h3>
                                                <p className="text-[10px] text-emerald-500 font-bold mt-0.5">{t.connect_btn}</p>
                                            </div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); deleteDevice(item.id); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors">🗑️</button>
                                    </div>
                                ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2"><span>📱</span> {t.auth_receivers}</h3>
                            {parentItems.length === 0 ? (
                                <p className="text-slate-400 text-sm italic bg-slate-100 p-4 rounded-xl text-center">{t.no_receivers}</p>
                            ) : (
                                <div className="space-y-3">
                                {parentItems.map((item) => (
                                    <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setSelectedLogParent(item)}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 text-lg">📱</div>
                                            <div>
                                                <h3 className="font-bold text-slate-700 text-sm">{item.name}</h3>
                                                <p className="text-[10px] text-slate-400 font-mono">{t.last_conn} {new Date(item.lastConnected).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); deleteParent(item.id); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors">🗑️</button>
                                    </div>
                                ))}
                                </div>
                            )}
                        </div>
                      </>
                  )}
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="p-6 pt-12 max-w-md mx-auto animate-fade-in text-center">
                   <h2 className="text-3xl font-extrabold text-slate-800 mb-2">{t.set_title}</h2>
                   <p className="text-slate-400 text-sm mb-12">{t.set_subtitle}</p>
                   
                   {/* Name Config */}
                   <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-start text-left mb-6">
                      <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-2xl text-indigo-500">🏷️</div>
                          <div><h3 className="font-bold text-slate-700">{t.dev_name_title}</h3><p className="text-xs text-slate-400">{t.dev_name_desc}</p></div>
                      </div>
                      
                      {isEditingName ? (
                         <div className="w-full flex gap-2">
                             <input value={currentDeviceName} onChange={(e) => setCurrentDeviceName(e.target.value)} className="flex-1 bg-slate-100 rounded-xl px-4 py-3 outline-none border border-transparent focus:border-indigo-500 transition-colors" placeholder="Ej. Cámara Bebé"/>
                             <button onClick={saveName} className="bg-indigo-600 text-white px-6 rounded-xl font-bold hover:bg-indigo-700">{t.ok_btn}</button>
                         </div>
                      ) : (
                         <div className="w-full bg-slate-50 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setIsEditingName(true)}>
                             <span className="font-bold text-slate-700">{currentDeviceName}</span>
                             <span className="text-indigo-500 text-sm font-bold">{t.edit_btn}</span>
                         </div>
                      )}
                   </div>

                   {/* Compact Language Config */}
                   <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-xl text-indigo-500">🌍</div>
                          <h3 className="font-bold text-slate-700">{t.language}</h3>
                      </div>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                          <button 
                            onClick={() => handleSetLanguage('es')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'es' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
                          >ES</button>
                          <button 
                            onClick={() => handleSetLanguage('en')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'en' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
                          >EN</button>
                      </div>
                   </div>
                   
                   <div className="text-xs text-slate-300 font-mono mt-8 mb-2">
                      ID: {localStorage.getItem('tino_device_id') || '...'}
                   </div>
                   <div className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">
                      Versión {APP_VERSION} ({BUILD_NUMBER})
                   </div>
                </div>
              )}

            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-200 px-6 py-3 pb-safe z-50 flex justify-around items-center shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)] rounded-t-[2rem]">
               <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'home' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
                 <span className={`text-2xl ${activeTab === 'home' ? 'drop-shadow-sm' : ''}`}>🏠</span><span className="text-[10px] font-bold tracking-wide">{t.tab_home}</span>
               </button>
               <button onClick={() => setActiveTab('devices')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'devices' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
                 <span className={`text-2xl ${activeTab === 'devices' ? 'drop-shadow-sm' : ''}`}>📡</span><span className="text-[10px] font-bold tracking-wide">{t.tab_devices}</span>
               </button>
               <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
                 <span className={`text-2xl ${activeTab === 'settings' ? 'drop-shadow-sm' : ''}`}>⚙️</span><span className="text-[10px] font-bold tracking-wide">{t.tab_config}</span>
               </button>
            </div>
          </div>
        );
    }
  };

  return <div className="h-full">{renderContent()}</div>;
};

export default App;
