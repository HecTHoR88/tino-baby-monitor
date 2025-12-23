import React, { useState, useEffect } from 'react';
import { AppMode, Language, MonitorHistoryItem } from './types';
import { BabyMonitor } from './components/BabyMonitor';
import { ParentStation } from './components/ParentStation';
import { TutorialModal } from './components/TutorialModal';
import { getDeviceName, getDeviceId, initializeSmartName, setDeviceName } from './services/deviceStorage';
import { secureStorage } from './services/secureStorage';
import { translations } from './services/translations';
import { BRAND_LOGO, applyGlobalBranding } from './services/logo';
import { InstallPrompt } from './components/InstallPrompt';

const PHRASE_INTERVAL = 15000;
const FADE_DURATION = 1500;

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
    } catch (e) { console.error("History error", e); }
  };

  useEffect(() => {
    applyGlobalBranding();
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
    const backupContent = `TiNO Baby Monitor - v1.3.7 HERMETIC\nFecha: ${new Date().toLocaleString()}\nID Dispositivo: ${getDeviceId()}\nStatus: Stable Golden Build`;
    const blob = new Blob([backupContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TiNO_v1.3.7_Backup.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-full p-6 animate-fade-in relative z-10">
      <button onClick={() => setShowTutorial(true)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/50 backdrop-blur-md flex items-center justify-center text-slate-600 font-bold border border-white shadow-sm z-20">?</button>
      <div className="mb-8 text-center w-full max-w-xs pt-10">
        <div className="inline-flex items-center justify-center w-40 h-40 rounded-[3rem] bg-white shadow-xl mb-6 animate-float-premium relative z-10 border-4 border-white overflow-hidden">
          <img src={BRAND_LOGO.length > 100 ? BRAND_LOGO : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='} alt="TiNO" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-6xl font-black tracking-tighter mb-1 text-gradient-tino">TiNO</h1>
        <p className="text-slate-400 font-bold text-[10px] tracking-[0.4em] uppercase mb-6">{t.subtitle}</p>
        <div className="h-16 flex items-start justify-center">
          <p style={{ transitionDuration: `${FADE_DURATION}ms` }} className={`text-slate-500 italic font-medium text-sm leading-relaxed text-center transition-all px-4 ${fadeStatus === 'in' ? 'opacity-100' : 'opacity-0'}`}>{t.phrases[phraseIndex]}</p>
        </div>
      </div>
      <div className="w-full max-w-sm grid grid-cols-2 gap-4 mb-8">
        <button onClick={() => setMode(AppMode.MONITOR)} className="group bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all border border-slate-100 aspect-square flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-500 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">📷</div>
          <div className="text-center">
            <h3 className="font-bold text-slate-700 text-2xl leading-none mb-1">{t.baby_title}</h3>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{t.mode_camera}</p>
          </div>
        </button>
        <button onClick={() => setMode(AppMode.PARENT)} className="group bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all border border-slate-100 aspect-square flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">📱</div>
          <div className="text-center">
            <h3 className="font-bold text-slate-700 text-2xl leading-none mb-1">{t.parent_title}</h3>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{t.mode_monitor}</p>
          </div>
        </button>
      </div>
      <div className="w-full max-w-sm"><InstallPrompt /></div>
      <div className="p-6 text-center mt-4"><p className="text-[10px] font-bold text-slate-300 tracking-widest uppercase">{t.version_label}</p></div>
    </div>
  );

  const renderContent = () => {
    if (mode === AppMode.MONITOR) return <BabyMonitor onBack={() => { setMode(AppMode.SELECTION); refreshHistory(); }} lang={language} />;
    if (mode === AppMode.PARENT) return <ParentStation onBack={() => { setMode(AppMode.SELECTION); refreshHistory(); }} lang={language} />;
    return (
      <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
        {showTutorial && <TutorialModal lang={language} onClose={() => setShowTutorial(false)} />}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
          {activeTab === 'home' && renderHome()}
          {activeTab === 'devices' && (
            <div className="p-8 animate-fade-in pt-12">
              <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">{t.tab_devices}</h2>
              <p className="text-slate-400 text-sm font-bold mb-10">{t.dev_subtitle}</p>
              <div className="space-y-10">
                <div>
                   <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4">📷 {t.my_cameras}</h3>
                   {history.length > 0 ? history.map(h => (
                      <div key={h.id} className="w-full bg-white p-5 rounded-[1.8rem] shadow-sm border border-slate-100 flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-2xl">📹</div>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-slate-800 text-md truncate">{h.name}</p>
                          <div className="flex gap-3 mt-1">
                            <button onClick={() => setMode(AppMode.PARENT)} className="text-[9px] text-emerald-500 font-black uppercase">{t.connect_btn}</button>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteHistory(h.id, 'monitor')} className="text-slate-300">🗑️</button>
                      </div>
                    )) : <div className="p-8 rounded-[2rem] border-2 border-dashed border-slate-200 text-center text-slate-300 uppercase text-[10px]">Vacío</div>}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="p-8 animate-fade-in pt-12">
               <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">{t.tab_config}</h2>
               <div className="space-y-6 mt-10">
                 <div className="bg-white p-7 rounded-[2.2rem] shadow-sm border border-slate-100">
                   <h3 className="font-black text-slate-800 text-lg">{t.dev_name_title}</h3>
                   {isEditingName ? (
                      <div className="flex gap-2 mt-4">
                        <input value={currentDeviceName} onChange={(e) => setCurrentDeviceName(e.target.value)} className="flex-1 bg-slate-50 border rounded-xl px-4 py-3 outline-none" />
                        <button onClick={handleSaveName} className="bg-indigo-600 text-white px-6 rounded-xl font-bold">OK</button>
                      </div>
                   ) : (
                      <div onClick={() => setIsEditingName(true)} className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center mt-4">
                        <span className="font-black text-slate-700">{currentDeviceName}</span>
                        <button className="text-indigo-500 text-xs font-black">{t.edit_btn}</button>
                      </div>
                   )}
                 </div>
                 <div className="bg-white p-7 rounded-[2.2rem] shadow-sm border border-slate-100">
                    <h3 className="font-black text-slate-800 text-lg mb-4">{t.backup_title}</h3>
                    <button onClick={handleDownloadBackup} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] tracking-widest uppercase shadow-lg shadow-emerald-200">{t.backup_btn}</button>
                 </div>
               </div>
            </div>
          )}
        </div>
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-sm h-20 bg-white/90 backdrop-blur-3xl border border-white/40 rounded-[2.5rem] shadow-2xl flex justify-around items-center z-[60]">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center flex-1 ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-300'}`}>🏠<span className="text-[8px] font-black uppercase">Home</span></button>
          <button onClick={() => setActiveTab('devices')} className={`flex flex-col items-center flex-1 ${activeTab === 'devices' ? 'text-indigo-600' : 'text-slate-300'}`}>📡<span className="text-[8px] font-black uppercase">Equipos</span></button>
          <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center flex-1 ${activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-300'}`}>⚙️<span className="text-[8px] font-black uppercase">Ajustes</span></button>
        </div>
      </div>
    );
  };

  return <div className="h-full w-full fixed inset-0 overflow-hidden font-sans select-none bg-slate-50">{renderContent()}</div>;
};

export default App;