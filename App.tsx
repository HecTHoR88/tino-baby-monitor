import React, { useState, useEffect } from 'react';
import { AppMode, Language, MonitorHistoryItem } from './types';
import { BabyMonitor } from './components/BabyMonitor';
import { ParentStation } from './components/ParentStation';
import { TutorialModal } from './components/TutorialModal';
import { getDeviceName, getDeviceId, initializeSmartName, setDeviceName } from './services/deviceStorage';
import { secureStorage } from './services/secureStorage';
import { translations } from './services/translations';
import { BRAND_LOGO } from './services/logo';
import { InstallPrompt } from './components/InstallPrompt';

const PHRASE_INTERVAL = 20000;
const FADE_DURATION = 2000;

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.SELECTION);
  const [activeTab, setActiveTab] = useState<'home' | 'devices' | 'settings'>('home');
  const [language, setLanguage] = useState<Language>('es');
  const [currentDeviceName, setCurrentDeviceName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [history, setHistory] = useState<MonitorHistoryItem[]>([]);
  const [parentHistory, setParentHistory] = useState<MonitorHistoryItem[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<MonitorHistoryItem | null>(null);
  
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [fadeStatus, setFadeStatus] = useState<'in' | 'out'>('in');

  const t = translations[language];

  const refreshHistory = () => {
    try {
      const monHist = secureStorage.getItem<MonitorHistoryItem[]>('monitor_history') || [];
      const parHist = secureStorage.getItem<MonitorHistoryItem[]>('parent_history') || [];
      setHistory(monHist);
      setParentHistory(parHist);
    } catch (e) {
      console.error("Error refreshing history", e);
    }
  };

  useEffect(() => {
    setCurrentDeviceName(getDeviceName());
    initializeSmartName().then(name => name && setCurrentDeviceName(name));

    const savedLang = secureStorage.getItem<Language>('tino_lang');
    if (savedLang) setLanguage(savedLang);
    
    refreshHistory();
  }, [activeTab, mode]);

  useEffect(() => {
    if (activeTab !== 'home' || mode !== AppMode.SELECTION) return;
    const timer = setInterval(() => {
      setFadeStatus('out');
      setTimeout(() => {
        setPhraseIndex((prev) => (prev + 1) % t.phrases.length);
        setFadeStatus('in');
      }, FADE_DURATION);
    }, PHRASE_INTERVAL);
    return () => clearInterval(timer);
  }, [activeTab, mode, t.phrases.length]);

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
    if (type === 'monitor') setHistory(updated);
    else setParentHistory(updated);
    secureStorage.setItem(key, updated);
  };

  const handleDownloadBackup = () => {
    const backupContent = `
# TiNO Baby Monitor - MASTER FINAL v1.3.6
Fecha: ${new Date().toLocaleDateString()}
Estado: Configuración Completa con Branding

ESTA VERSIÓN INCLUYE:
1. Logo e Iconos PWA/Apple sincronizados.
2. IA Gemini 3 Flash activa para llanto/movimiento.
3. Canal P2P seguro v1.3.6.
4. Historial de sesiones mejorado.
    `;
    const blob = new Blob([backupContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TiNO_Master_Final_v1.3.6.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-full p-6 animate-fade-in relative z-10">
      <button 
        onClick={() => setShowTutorial(true)}
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/50 backdrop-blur-md flex items-center justify-center text-slate-600 font-bold border border-white shadow-sm hover:bg-white transition-all z-20"
      >
        ?
      </button>

      <div className="mb-8 text-center w-full max-w-xs pt-10">
        <div className="inline-flex items-center justify-center w-40 h-40 rounded-[3rem] bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] mb-6 animate-float-premium relative z-10 border-4 border-white overflow-hidden">
          <img 
            src={BRAND_LOGO && BRAND_LOGO !== "" ? BRAND_LOGO : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='} 
            alt="TiNO Logo" 
            className="w-full h-full object-cover" 
          />
        </div>

        <h1 className="text-6xl font-black tracking-tighter mb-1 text-gradient-tino drop-shadow-sm">TiNO</h1>
        <p className="text-slate-400 font-bold text-[10px] tracking-[0.4em] uppercase mb-6">{t.subtitle}</p>
        
        <div className="h-16 flex items-start justify-center">
          <p 
            style={{ transitionDuration: `${FADE_DURATION}ms` }}
            className={`text-slate-500 italic font-medium text-sm leading-relaxed text-center transition-all px-4 ${
              fadeStatus === 'in' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            {t.phrases[phraseIndex]}
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm grid grid-cols-2 gap-4 mb-8">
        <button 
          onClick={() => setMode(AppMode.MONITOR)} 
          className="group bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all border border-slate-100 aspect-square flex flex-col items-center justify-center gap-3 active:scale-95"
        >
          <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-500 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shadow-inner">📷</div>
          <div className="text-center">
            <h3 className="font-bold text-slate-700 text-2xl leading-none mb-1">{t.baby_title}</h3>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{t.mode_camera}</p>
          </div>
        </button>

        <button 
          onClick={() => setMode(AppMode.PARENT)} 
          className="group bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all border border-slate-100 aspect-square flex flex-col items-center justify-center gap-3 active:scale-95"
        >
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shadow-inner">📱</div>
          <div className="text-center">
            <h3 className="font-bold text-slate-700 text-2xl leading-none mb-1">{t.parent_title}</h3>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{t.mode_monitor}</p>
          </div>
        </button>
      </div>

      <div className="w-full max-w-sm">
        <InstallPrompt />
      </div>

      <div className="p-6 text-center mt-4">
        <p className="text-[10px] font-bold text-slate-300 tracking-widest uppercase">TiNO V1.3.6 (MASTER FINAL PACK)</p>
      </div>
    </div>
  );

  const renderContent = () => {
    if (mode === AppMode.MONITOR) return <BabyMonitor onBack={() => { setMode(AppMode.SELECTION); refreshHistory(); }} lang={language} />;
    if (mode === AppMode.PARENT) return <ParentStation onBack={() => { setMode(AppMode.SELECTION); refreshHistory(); }} lang={language} />;

    return (
      <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-20%] w-[600px] h-[600px] bg-sky-100/70 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-20%] w-[500px] h-[500px] bg-pink-100/60 rounded-full blur-[80px] pointer-events-none"></div>

        {showTutorial && <TutorialModal lang={language} onClose={() => setShowTutorial(false)} />}

        {selectedLogs && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setSelectedLogs(null)}>
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-slate-800 text-xl tracking-tight">{t.history_logs}</h3>
                <button onClick={() => setSelectedLogs(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">✕</button>
              </div>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4">{selectedLogs.name}</p>
              <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar pr-2">
                {selectedLogs.logs && selectedLogs.logs.length > 0 ? (
                    selectedLogs.logs.map((log, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center border border-slate-100">
                        <span className="text-slate-400 font-bold text-xs">{new Date(log).toLocaleDateString()}</span>
                        <span className="text-slate-800 font-black text-sm">{new Date(log).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    ))
                ) : (
                    <p className="text-center text-slate-400 text-sm py-10 italic">Sin registros</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
          {activeTab === 'home' && renderHome()}
          
          {activeTab === 'devices' && (
            <div className="p-8 animate-fade-in pt-12 relative z-10">
              <div className="mb-10">
                <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">{t.tab_devices}</h2>
                <p className="text-slate-400 text-sm font-bold tracking-tight">{t.dev_subtitle}</p>
              </div>
              
              <div className="space-y-10">
                <div>
                   <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                     📷 {t.my_cameras}
                   </h3>
                   {history.length > 0 ? (
                      <div className="space-y-4">
                        {history.map(h => (
                          <div key={h.id} className="w-full bg-white p-5 rounded-[1.8rem] shadow-sm border border-slate-100 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-2xl">📹</div>
                            <div className="flex-1 overflow-hidden" onClick={() => setSelectedLogs(h)}>
                              <p className="font-bold text-slate-800 text-md leading-tight truncate">{h.name}</p>
                              <div className="flex gap-3 mt-1">
                                <button onClick={(e) => { e.stopPropagation(); setMode(AppMode.PARENT); }} className="text-[9px] text-emerald-500 font-black uppercase tracking-widest hover:underline">{t.connect_btn}</button>
                                <button onClick={(e) => { e.stopPropagation(); setSelectedLogs(h); }} className="text-[9px] text-indigo-500 font-black uppercase tracking-widest hover:underline">{t.view_logs}</button>
                              </div>
                            </div>
                            <button onClick={() => handleDeleteHistory(h.id, 'monitor')} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
                          </div>
                        ))}
                      </div>
                   ) : (
                      <div className="p-8 rounded-[2rem] border-2 border-dashed border-slate-200 text-center">
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest opacity-60">No hay cámaras</p>
                      </div>
                   )}
                </div>

                <div>
                   <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                     📱 {t.auth_receivers}
                   </h3>
                   {parentHistory.length > 0 ? (
                      <div className="space-y-4">
                        {parentHistory.map(h => (
                          <div key={h.id} className="w-full bg-white p-5 rounded-[1.8rem] shadow-sm border border-slate-100 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-2xl">📱</div>
                            <div className="flex-1 overflow-hidden" onClick={() => setSelectedLogs(h)}>
                              <p className="font-bold text-slate-800 text-md leading-tight truncate">{h.name}</p>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedLogs(h); }} className="text-[9px] text-indigo-500 font-black uppercase tracking-widest hover:underline block mt-1">{t.view_logs}</button>
                            </div>
                            <button onClick={() => handleDeleteHistory(h.id, 'parent')} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
                          </div>
                        ))}
                      </div>
                   ) : (
                      <div className="p-8 rounded-[2rem] border-2 border-dashed border-slate-200 text-center">
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest opacity-60">{t.no_receivers}</p>
                      </div>
                   )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-8 animate-fade-in pt-12 relative z-10">
               <div className="mb-10">
                 <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">{t.tab_config}</h2>
                 <p className="text-slate-400 text-sm font-bold tracking-tight">{t.set_subtitle}</p>
               </div>

               <div className="space-y-6">
                 <div className="bg-white p-7 rounded-[2.2rem] shadow-sm border border-slate-100 relative overflow-hidden">
                   <div className="flex items-center gap-4 mb-6">
                     <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-xl shadow-inner">🏷️</div>
                     <div>
                       <h3 className="font-black text-slate-800 text-lg leading-tight">{t.dev_name_title}</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{t.dev_name_desc}</p>
                     </div>
                   </div>

                   {isEditingName ? (
                      <div className="flex gap-2">
                        <input 
                          value={currentDeviceName} 
                          onChange={(e) => setCurrentDeviceName(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 font-bold outline-none focus:border-indigo-500 transition-all"
                        />
                        <button onClick={handleSaveName} className="bg-indigo-600 text-white px-6 rounded-xl font-bold">{t.tab_home}</button>
                      </div>
                   ) : (
                      <div onClick={() => setIsEditingName(true)} className="bg-slate-50 p-4 px-6 rounded-2xl flex justify-between items-center border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all">
                        <span className="font-black text-slate-700 text-md tracking-tight truncate max-w-[60%]">{currentDeviceName}</span>
                        <button className="font-black text-indigo-500 text-xs tracking-widest uppercase">{t.edit_btn}</button>
                      </div>
                   )}
                 </div>

                 <div className="bg-white p-7 rounded-[2.2rem] shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-xl shadow-inner">🛡️</div>
                      <div>
                        <h3 className="font-black text-slate-800 text-lg leading-tight">{t.backup_title}</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{t.backup_desc}</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleDownloadBackup}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-[10px] tracking-[0.2em] transition-all shadow-lg shadow-emerald-200 uppercase"
                    >
                      {t.backup_btn}
                    </button>
                 </div>

                 <div className="bg-white/60 px-4 py-2 rounded-2xl border border-white/80 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <span className="text-lg">🌍</span>
                       <h3 className="font-black text-slate-700 text-[11px] uppercase tracking-wider">{t.language}</h3>
                    </div>
                    <div className="flex gap-0.5 p-0.5 bg-slate-200/50 rounded-lg">
                       <button onClick={() => changeLanguage('es')} className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${language === 'es' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>ES</button>
                       <button onClick={() => changeLanguage('en')} className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${language === 'en' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>EN</button>
                    </div>
                 </div>

                 <div className="pt-8 text-center space-y-1 opacity-40">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">ID: {getDeviceId()}</p>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.version_label}</p>
                 </div>
               </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-sm h-20 bg-white/90 backdrop-blur-3xl border border-white/40 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex justify-around items-center z-[60] px-2">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center justify-center h-full flex-1 rounded-3xl transition-all duration-300 ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-300'}`}>
            <span className="text-2xl mb-1">🏠</span>
            <span className="text-[8px] font-black uppercase tracking-tight">{t.tab_home}</span>
          </button>
          <button onClick={() => setActiveTab('devices')} className={`flex flex-col items-center justify-center h-full flex-1 rounded-3xl transition-all duration-300 ${activeTab === 'devices' ? 'text-indigo-600' : 'text-slate-300'}`}>
            <span className="text-2xl mb-1">📡</span>
            <span className="text-[8px] font-black uppercase tracking-tight">{t.tab_devices}</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center justify-center h-full flex-1 rounded-3xl transition-all duration-300 ${activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-300'}`}>
            <span className="text-2xl mb-1">⚙️</span>
            <span className="text-[8px] font-black uppercase tracking-tight">{t.tab_config}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full fixed inset-0 overflow-hidden font-sans select-none bg-slate-50">
      {renderContent()}
    </div>
  );
};

export default App;