
import React, { useEffect, useState } from 'react';

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      setShowModal(true);
    }
  };

  if (isStandalone) return null;

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full bg-white p-4 rounded-2xl flex items-center transition-all hover:shadow-lg border border-slate-100 shadow-sm group"
      >
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl mr-4 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
          ⬇️
        </div>
        <div className="text-left">
          <h3 className="font-bold text-slate-800">Instalar App</h3>
          <p className="text-xs text-slate-400">Recomendado para mejor uso</p>
        </div>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full relative shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 text-xl font-bold">✕</button>
            
            <div className="text-center mb-6">
               <div className="w-16 h-16 bg-indigo-50 rounded-2xl mx-auto flex items-center justify-center text-3xl mb-3 text-indigo-500">
                 📲
               </div>
               <h3 className="text-xl font-extrabold text-slate-800">Instalación</h3>
               <p className="text-slate-400 text-sm mt-1">Sigue estos pasos para instalar Tino:</p>
            </div>

            {isIOS ? (
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4 text-slate-600">
                <p className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Toca el botón <strong>Compartir</strong> <span className="text-blue-500">⎋</span></span>
                </p>
                <p className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Busca <strong>"Agregar al inicio"</strong> <span className="text-slate-800 text-lg">⊞</span></span>
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4 text-slate-600">
                <p className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Toca el menú <strong>(⋮)</strong> arriba</span>
                </p>
                <p className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Elige <strong>"Instalar aplicación"</strong></span>
                </p>
              </div>
            )}

            <button onClick={() => setShowModal(false)} className="w-full mt-6 bg-slate-800 py-3 rounded-xl font-bold text-white shadow-lg hover:bg-slate-700">
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
