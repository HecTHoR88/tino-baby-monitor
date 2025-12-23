import React, { useState } from 'react';
import { Language } from '../types';
import { translations } from '../services/translations';

interface TutorialModalProps {
  lang: Language;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ lang, onClose }) => {
  const [step, setStep] = useState(0);
  const t = translations[lang];

  const steps = [
    {
      icon: "📱 ↔️ 📱",
      title: t.tut_1_title,
      desc: t.tut_1_desc,
      color: "bg-indigo-50 text-indigo-600 shadow-indigo-100"
    },
    {
      icon: "📷 ⚡ 📲",
      title: t.tut_2_title,
      desc: t.tut_2_desc,
      color: "bg-purple-50 text-purple-600 shadow-purple-100"
    },
    {
      icon: "🧠 🔔 🎵",
      title: t.tut_3_title,
      desc: t.tut_3_desc,
      color: "bg-pink-50 text-pink-600 shadow-pink-100"
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-lg p-6 animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-[3rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden relative" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-8 pb-4 flex justify-between items-center">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">{t.tut_title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold hover:bg-slate-200 transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="px-10 py-6 flex flex-col items-center text-center">
          <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl mb-8 shadow-2xl transition-all duration-500 transform ${steps[step].color}`}>
            {steps[step].icon}
          </div>
          <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight leading-tight">{steps[step].title}</h3>
          <p className="text-slate-500 leading-relaxed font-medium text-sm mb-4">
            {steps[step].desc}
          </p>
        </div>

        {/* Navigation */}
        <div className="p-10 pt-2">
          {/* Dots */}
          <div className="flex justify-center gap-2.5 mb-8">
            {steps.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all duration-500 ${i === step ? 'w-10 bg-indigo-600 shadow-lg shadow-indigo-200' : 'w-2 bg-slate-200'}`}></div>
            ))}
          </div>

          <button 
            onClick={handleNext}
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black tracking-widest uppercase text-xs shadow-xl hover:bg-indigo-600 active:scale-95 transition-all"
          >
            {step === steps.length - 1 ? t.tut_start : t.tut_next}
          </button>
        </div>

      </div>
    </div>
  );
};