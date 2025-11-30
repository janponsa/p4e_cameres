import React, { useState, useEffect } from 'react';

interface OnboardingProps {
    onComplete: () => void;
    // AFEGIT 1: Acceptem la funció per desbloquejar l'àudio
    onUnlockAudio: () => void; 
}

// AFEGIT 2: Rebem 'onUnlockAudio' aquí
const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onUnlockAudio }) => {
    const [step, setStep] = useState(0);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        if (step === 0) {
            const timer = setTimeout(() => setStep(1), 3500);
            return () => clearTimeout(timer);
        }
        if (step === 1) {
            const timer = setTimeout(() => setStep(2), 4500);
            return () => clearTimeout(timer);
        }
    }, [step]);

    const handleStart = () => {
        // --- AQUESTA ÉS LA CLAU QUE FALTAVA ---
        // Si no cridem això, l'iPhone no s'assabenta que ha de reproduir so
        if (onUnlockAudio) {
            console.log("🔊 [Onboarding] Botó premut: Enviant senyal d'activació a iOS...");
            onUnlockAudio();
        } else {
            console.error("⚠️ [Onboarding] ALERTA: No tinc la clau per activar l'àudio!");
        }
        // --------------------------------------

        setIsExiting(true);
        setTimeout(onComplete, 1000);
    };

    return (
        <div className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden transition-opacity duration-1000 ${isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            
            {/* FONS ATMOSFÈRIC */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[80px] animate-bounce" style={{animationDuration: '10s'}}></div>
            </div>

            {/* CONTINGUT */}
            <div className="relative z-10 text-center px-6 max-w-md w-full">
                
                {/* PAS 0: IDENTITAT */}
                {step === 0 && (
                    <div className="animate-fade-in-up flex flex-col items-center gap-6">
                        <img 
                            src="https://app.projecte4estacions.com/images/logo_p4e_2023_h_blanc_200.png" 
                            alt="P4E Logo" 
                            className="h-8 md:h-10 opacity-90"
                        />
                        <div className="h-px w-12 bg-white/20 my-2"></div>
                        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-white">
                            NEXUS <span className="font-bold">0.2</span>
                        </h1>
                        <p className="text-white/50 text-sm font-mono tracking-widest uppercase mt-4">
                            Connectant amb el territori
                        </p>
                    </div>
                )}

                {/* PAS 1: SOUNDSCAPE */}
                {step === 1 && (
                    <div className="animate-fade-in flex flex-col items-center gap-8">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <div className="absolute inset-0 border border-white/10 rounded-full animate-[ping_3s_ease-in-out_infinite]"></div>
                            <div className="absolute inset-2 border border-white/20 rounded-full animate-[ping_3s_ease-in-out_infinite_0.5s]"></div>
                            <div className="absolute inset-8 bg-white/5 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10">
                                <i className="ph-fill ph-wave-sine text-4xl text-white/80 animate-pulse"></i>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-2xl font-light text-white">Àudio Generatiu</h2>
                            <p className="text-white/60 text-sm leading-relaxed font-light">
                                Una banda sonora infinita creada per <span className="text-indigo-300 font-medium">IA</span> que reacciona en temps real a la boira, el vent i la llum de cada càmera.
                            </p>
                        </div>
                        
                        <div className="flex gap-1 mt-8">
                             <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                             <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                             <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                        </div>
                    </div>
                )}

                {/* PAS 2: READY */}
                {step === 2 && (
                    <div className="animate-fade-in flex flex-col items-center gap-10">
                        <div className="text-center space-y-2">
                            <p className="text-white/40 text-xs font-mono uppercase tracking-[0.2em]">Experiència llesta</p>
                            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Benvingut</h2>
                        </div>

                        <button 
                            onClick={handleStart}
                            className="group relative px-8 py-3 bg-white text-black rounded-full font-medium text-sm tracking-wide transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-95 cursor-pointer"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                ENTRAR <i className="ph-bold ph-arrow-right group-hover:translate-x-1 transition-transform"></i>
                            </span>
                        </button>

                        <p className="text-white/30 text-[10px] max-w-xs">
                            Recomanem utilitzar auriculars per a una immersió completa.
                        </p>
                    </div>
                )}

            </div>
        </div>
    );
};

export default Onboarding;
