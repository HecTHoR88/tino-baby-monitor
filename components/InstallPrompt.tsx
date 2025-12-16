
import React, { useEffect, useState } from 'react';

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  // Nuevo estado para controlar si ya mostramos la invitación automática
  const [hasAutoShown, setHasAutoShown] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Si detectamos que se puede instalar y no estamos en modo standalone,
      // mostramos el modal automáticamente una vez por sesión.
      if (!hasAutoShown) {
        setShowModal(true);
        setHasAutoShown(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, [hasAutoShown]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      setShowModal(false);
    } else {
      // Si no hay prompt automático (ej. iOS o ya instalado pero no detectado), mostramos instrucciones manuales
      setShowModal(true);
    }
  };

  if (isStandalone) return null;

  return (
    <>
      {/* Botón manual que siempre permanece visible en la lista */}
      <button
        onClick={() => setShowModal(true)}
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

      {/* Modal de Instalación (Automático o Manual) */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[2rem] p-6 max-w-sm w-full relative shadow-2xl animate-float" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 text-xl font-bold p-2">✕</button>
            
            <div className="text-center mb-6 pt-2">
               <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl mx-auto flex items-center justify-center text-4xl mb-4 text-white shadow-lg shadow-indigo-500/30">
                 📲
               </div>
               <h3 className="text-2xl font-extrabold text-slate-800">Instalar TiNO</h3>
               <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                 Obtén la mejor experiencia a pantalla completa y acceso rápido.
               </p>
            </div>

            {deferredPrompt ? (
              // Botón directo si el navegador lo soporta (Android/Desktop Chrome)
              <button 
                onClick={handleInstallClick}
                className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-white shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 active:scale-95 transition-all text-lg"
              >
                Instalar Ahora
              </button>
            ) : (
              // Instrucciones manuales (iOS / Otros)
              <div className="space-y-4">
                {isIOS ? (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3 text-slate-600 text-sm">
                    <p className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                      <span>Toca el botón <strong>Compartir</strong> <span className="text-blue-500 text-lg">⎋</span></span>
                    </p>
                    <p className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                      <span>Selecciona <strong>"Agregar al inicio"</strong> <span className="text-slate-800 text-lg">⊞</span></span>
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3 text-slate-600 text-sm">
                    <p className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                      <span>Toca el menú del navegador <strong>(⋮)</strong></span>
                    </p>
                    <p className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                      <span>Elige <strong>"Instalar aplicación"</strong></span>
                    </p>
                  </div>
                )}
                <button onClick={() => setShowModal(false)} className="w-full mt-2 bg-slate-100 text-slate-500 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  Entendido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
