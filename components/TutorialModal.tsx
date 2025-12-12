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
      color: "bg-indigo-50 text-indigo-600"
    },
    {
      icon: "📷 ⚡ 📲",
      title: t.tut_2_title,
      desc: t.tut_2_desc,
      color: "bg-purple-50 text-purple-600"
    },
    {
      icon: "🧠 🔔 🎵",
      title: t.tut_3_title,
      desc: t.tut_3_desc,
      color: "bg-pink-50 text-pink-600"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-6 animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-6 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">{t.tut_title}</h2>
          <button onClick={onClose} className="text-slate-400 text-sm font-bold hover:text-slate-600">{t.tut_skip}</button>
        </div>

        {/* Content */}
        <div className="px-8 py-4 flex flex-col items-center text-center min-h-[200px]">
          <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-sm transition-all duration-500 ${steps[step].color}`}>
            {steps[step].icon}
          </div>
          <h3 className="text-2xl font-extrabold text-slate-800 mb-3 transition-all duration-300">{steps[step].title}</h3>
          <p className="text-slate-500 leading-relaxed text-sm transition-all duration-300">{steps[step].desc}</p>
        </div>

        {/* Navigation */}
        <div className="p-6 pt-2">
          {/* Dots */}
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-slate-800' : 'w-2 bg-slate-200'}`}></div>
            ))}
          </div>

          <button 
            onClick={handleNext}
            className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-slate-700 active:scale-95 transition-all"
          >
            {step === steps.length - 1 ? t.tut_start : t.tut_next}
          </button>
        </div>

      </div>
    </div>
  );
};