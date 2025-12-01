import React, { useState, useEffect } from 'react';

interface OnboardingProps {
    onComplete: () => void;
    onUnlockAudio?: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onUnlockAudio }) => {
    const [step, setStep] = useState(0);
    const [isExiting, setIsExiting] = useState(false);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    // Gestió de la seqüència temporal
    useEffect(() => {
        const timers: ReturnType<typeof setTimeout>[] = [];
        const next = (s: number, delay: number) => {
            timers.push(setTimeout(() => setStep(s), delay));
        };

        if (step === 0) next(1, 3500); // Intro
        if (step === 1) next(2, 4500); // Live Network (Animació millorada)
        if (step === 2) next(3, 5000); // AI Vision (Textos nous + Models)
        if (step === 3) next(4, 4500); // Timelapses (Text actualitzat)
        if (step === 4) next(5, 4500); // Soundscape
        if (step === 5) next(6, 4500); // TV Mode -> Ready

        return () => timers.forEach(clearTimeout);
    }, [step]);

    const handleStart = () => {
        if (dontShowAgain) {
            localStorage.setItem('p4e_nexus_skip_intro_v2', 'true');
        }
        if (onUnlockAudio) onUnlockAudio();
        
        setIsExiting(true);
        setTimeout(onComplete, 1000); 
    };

    return (
        <div className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden transition-opacity duration-1000 ${isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            
            <style>{`
                @keyframes scanline {
                    0% { transform: translateY(-150%); }
                    100% { transform: translateY(150%); }
                }
                @keyframes radar-sweep {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 0; }
                    50% { opacity: 0.5; }
                    100% { transform: scale(1.3); opacity: 0; }
                }
                @keyframes spin-reverse {
                    0% { transform: rotate(360deg); }
                    100% { transform: rotate(0deg); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `}</style>

            {/* FONS ATMOSFÈRIC DINÀMIC */}
            <div className="absolute inset-0 z-0">
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] transition-colors duration-1000 
                    ${step === 2 ? 'bg-indigo-600/20' : step === 4 ? 'bg-emerald-600/10' : 'bg-blue-600/10'} animate-pulse`}></div>
            </div>

            {/* CONTINGUT */}
            <div className="relative z-10 text-center px-6 max-w-md w-full min-h-[350px] flex flex-col items-center justify-center">
                
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
                        <p className="text-white/50 text-xs font-mono tracking-widest uppercase mt-4">
                            Connectant amb el territori
                        </p>
                    </div>
                )}

                {/* PAS 1: XARXA EN VIU */}
                {step === 1 && (
                    <div className="animate-fade-in flex flex-col items-center gap-8">
                        {/* Network Map Viz */}
                        <div className="relative w-32 h-32">
                            {/* Connecting Lines */}
                            <svg className="absolute inset-0 w-full h-full opacity-30 animate-pulse" viewBox="0 0 100 100">
                                <line x1="50" y1="50" x2="20" y2="20" stroke="white" strokeWidth="1" />
                                <line x1="50" y1="50" x2="80" y2="30" stroke="white" strokeWidth="1" />
                                <line x1="50" y1="50" x2="30" y2="80" stroke="white" strokeWidth="1" />
                                <line x1="50" y1="50" x2="70" y2="70" stroke="white" strokeWidth="1" />
                            </svg>
                            {/* Nodes */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.8)]"></div>
                            <div className="absolute top-[20%] left-[20%] w-2 h-2 bg-white/50 rounded-full animate-ping"></div>
                            <div className="absolute top-[30%] right-[20%] w-2 h-2 bg-white/50 rounded-full animate-ping" style={{animationDelay: '0.5s'}}></div>
                            <div className="absolute bottom-[20%] left-[30%] w-2 h-2 bg-white/50 rounded-full animate-ping" style={{animationDelay: '1s'}}></div>
                        </div>
                        <div className="space-y-3">
                            <h2 className="text-2xl font-light text-white">Xarxa en Viu</h2>
                            <p className="text-white/60 text-sm leading-relaxed font-light">
                                Accés directe a desenes de sensors i càmeres d'alta resolució distribuïdes pel Pirineu.
                            </p>
                        </div>
                    </div>
                )}

                {/* PAS 2: NEXUS VISION */}
                {step === 2 && (
                    <div className="animate-fade-in flex flex-col items-center gap-8">
                        {/* AI Radar Viz */}
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <div className="absolute inset-0 border border-indigo-500/30 rounded-full"></div>
                            <div className="absolute inset-4 border border-indigo-500/20 rounded-full"></div>
                            {/* Scanning Beam */}
                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-transparent to-indigo-500/20 animate-[radar-sweep_3s_linear_infinite]"></div>
                            
                            <i className="ph-fill ph-brain text-4xl text-indigo-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.6)] relative z-10"></i>
                            
                            {/* Data Points */}
                            <div className="absolute -right-2 top-0 text-[8px] font-mono text-indigo-300 opacity-80">AROME</div>
                            <div className="absolute -left-2 bottom-0 text-[8px] font-mono text-indigo-300 opacity-80">VISION</div>
                        </div>
                        <div className="space-y-3">
                            <h2 className="text-2xl font-light text-white">Nexus Vision</h2>
                            <p className="text-white/60 text-sm leading-relaxed font-light">
                                Intel·ligència Artificial que analitza la <span className="text-indigo-300">meteorologia</span> en temps real combinant visió per computador i models numèrics.
                            </p>
                        </div>
                    </div>
                )}

                {/* PAS 3: TIMELAPSES (UPDATED) */}
                {step === 3 && (
                    <div className="animate-fade-in flex flex-col items-center gap-8">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <div className="absolute inset-0 border-2 border-dashed border-white/20 rounded-full animate-[spin-reverse_10s_linear_infinite]"></div>
                            <i className="ph-bold ph-clock-counter-clockwise text-5xl text-white/90"></i>
                            <div className="absolute bottom-0 right-0 bg-white/10 backdrop-blur-md rounded-lg p-1.5 border border-white/20 animate-[float_3s_ease-in-out_infinite]">
                                <i className="ph-fill ph-film-strip text-xl text-white"></i>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h2 className="text-2xl font-light text-white">Viatge Temporal</h2>
                            <p className="text-white/60 text-sm leading-relaxed font-light">
                                Reviu l'evolució dels <span className="text-white font-medium">últims 7 dies</span> amb timelapses d'alta definició generats instantàniament.
                            </p>
                        </div>
                    </div>
                )}

                {/* PAS 4: SOUNDSCAPE */}
                {step === 4 && (
                    <div className="animate-fade-in flex flex-col items-center gap-8">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <div className="absolute inset-0 border border-white/10 rounded-full animate-[pulse-ring_3s_ease-out_infinite]"></div>
                            <div className="absolute inset-4 border border-white/10 rounded-full animate-[pulse-ring_3s_ease-out_infinite_1s]"></div>
                            <div className="absolute inset-8 bg-white/5 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10">
                                <i className="ph-fill ph-wave-sine text-4xl text-white/80"></i>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h2 className="text-2xl font-light text-white">Àudio Generatiu</h2>
                            <p className="text-white/60 text-sm leading-relaxed font-light">
                                Una atmosfera sonora infinita que es transforma segons el vent, la pluja i la llum del lloc.
                            </p>
                        </div>
                    </div>
                )}

                {/* PAS 5: TV MODE */}
                {step === 5 && (
                    <div className="animate-fade-in flex flex-col items-center gap-8">
                        <div className="relative w-32 h-24 flex items-center justify-center">
                            <div className="absolute inset-0 border border-white/20 rounded-xl bg-white/5 backdrop-blur-sm overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/10 to-transparent h-full w-full animate-[scanline_2s_linear_infinite]"></div>
                            </div>
                            <i className="ph-fill ph-television-simple text-5xl text-white/90 relative z-10"></i>
                        </div>
                        <div className="space-y-3">
                            <h2 className="text-2xl font-light text-white">Mode TV</h2>
                            <p className="text-white/60 text-sm leading-relaxed font-light">
                                Converteix la teva pantalla en una finestra viva. Un recorregut automàtic per tot el territori.
                            </p>
                        </div>
                    </div>
                )}

                {/* PAS 6: READY */}
                {step === 6 && (
                    <div className="animate-fade-in flex flex-col items-center gap-10 w-full">
                        <div className="text-center space-y-2">
                            <p className="text-white/40 text-[10px] font-mono uppercase tracking-[0.2em]">Sistemes preparats</p>
                            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Benvingut</h2>
                        </div>

                        <button 
                            onClick={handleStart}
                            className="group relative px-8 py-3 bg-white text-black rounded-full font-medium text-sm tracking-wide transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-95"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                ENTRAR <i className="ph-bold ph-arrow-right group-hover:translate-x-1 transition-transform"></i>
                            </span>
                        </button>

                        <div className="flex flex-col items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer group opacity-60 hover:opacity-100 transition-opacity">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${dontShowAgain ? 'bg-indigo-500 border-indigo-500' : 'border-white/30 group-hover:border-white/50'}`}>
                                    {dontShowAgain && <i className="ph-bold ph-check text-[10px] text-white"></i>}
                                </div>
                                <input 
                                    type="checkbox" 
                                    className="hidden" 
                                    checked={dontShowAgain}
                                    onChange={(e) => setDontShowAgain(e.target.checked)}
                                />
                                <span className="text-[10px] text-white font-medium">No tornar a mostrar la benvinguda</span>
                            </label>
                            
                            <p className="text-white/30 text-[9px] max-w-xs text-center leading-normal">
                                Recomanem utilitzar auriculars.<br/>Aquesta experiència utilitza dades en temps real.
                            </p>
                        </div>
                    </div>
                )}

                {/* INDICADORS DE PROGRÉS */}
                <div className="absolute bottom-[-60px] flex gap-2">
                    {[0,1,2,3,4,5,6].map(i => (
                        <div 
                            key={i} 
                            className={`h-1 rounded-full transition-all duration-500 ${step === i ? 'w-6 bg-white' : 'w-1 bg-white/20'}`}
                        ></div>
                    ))}
                </div>

            </div>
        </div>
    );
};

export default Onboarding;