import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Webcam, WeatherData } from '../types';
import { Soundscape } from '../utils/Soundscape';

// --- API KEYS ---
const WG_API_KEY = "e1f10a1e78da46f5b10a1e78da96f525";

interface AmbientModeProps {
    webcams: Webcam[];
    onExit: () => void;
}

// --- SUB-COMPONENT: HLS PLAYER ---
const AmbientHlsPlayer = React.memo(({ 
    streamUrl, 
    isActive, 
    shouldLoad,
    onReady,
    onError
}: { 
    streamUrl: string, 
    isActive: boolean, 
    shouldLoad: boolean,
    onReady?: () => void,
    onError?: () => void
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const loadTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        // RESET
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);

        // CLEANUP: If we shouldn't load, destroy everything
        if (!shouldLoad) {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.removeAttribute('src'); 
                videoRef.current.load(); 
            }
            return;
        }

        const video = videoRef.current;
        if (!video) return;

        // FAIL-SAFE: If video doesn't play in 7 seconds, trigger error to skip
        loadTimeoutRef.current = window.setTimeout(() => {
            if (video.paused && onError) {
                console.warn("Stream timeout, skipping:", streamUrl);
                onError();
            }
        }, 7000);

        const cacheBust = Math.floor(Date.now() / 10000); 
        const urlWithCache = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}t=${cacheBust}`;

        if (Hls.isSupported()) {
            if (hlsRef.current) hlsRef.current.destroy();
            
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 0, 
                startLevel: -1,
            });
            
            hlsRef.current = hls;
            hls.loadSource(urlWithCache);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    if (onError) onError();
                    hls.destroy();
                }
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = urlWithCache;
            video.play().catch(() => {});
            video.addEventListener('error', () => {
                if (onError) onError();
            });
        }

        const handlePlaying = () => {
            if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
            if (onReady) onReady();
        };

        video.addEventListener('playing', handlePlaying);
        return () => {
            video.removeEventListener('playing', handlePlaying);
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
        };
    }, [streamUrl, shouldLoad]);

    return (
        <div className={`absolute inset-0 w-full h-full bg-black transition-opacity duration-1000 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
            <video 
                ref={videoRef}
                className="w-full h-full object-contain bg-black"
                muted
                playsInline
            />
            {/* Reduced gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none"></div>
        </div>
    );
});


// Helpers
const fToC = (f: number) => (f - 32) * 5/9;
const mphToKmh = (m: number) => m * 1.60934;

const getWeatherIcon = (code: number, isDay: boolean) => {
    if (code === 0) return { icon: isDay ? 'ph-sun' : 'ph-moon', color: isDay ? 'text-yellow-400' : 'text-blue-200' };
    if (code >= 1 && code <= 3) return { icon: isDay ? 'ph-cloud-sun' : 'ph-cloud-moon', color: 'text-gray-300' };
    if (code === 45 || code === 48) return { icon: 'ph-cloud-fog', color: 'text-gray-400' };
    if (code >= 51 && code <= 67) return { icon: 'ph-cloud-rain', color: 'text-blue-400' };
    if (code >= 71 && code <= 77) return { icon: 'ph-snowflake', color: 'text-white' };
    if (code >= 80 && code <= 82) return { icon: 'ph-drop', color: 'text-blue-300' };
    if (code >= 95) return { icon: 'ph-cloud-lightning', color: 'text-purple-400' };
    return { icon: 'ph-cloud', color: 'text-gray-400' };
};

// CACHE TYPE
type WeatherCacheEntry = {
    data: WeatherData;
    timestamp: number;
};

const AmbientMode: React.FC<AmbientModeProps> = ({ webcams, onExit }) => {
    const [playlist, setPlaylist] = useState<Webcam[]>([]);
    
    // Slot Logic
    const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
    const [indexA, setIndexA] = useState(0);
    const [indexB, setIndexB] = useState(1);

    // Data State
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [progress, setProgress] = useState(0);
    const [isHovering, setIsHovering] = useState(false);
    
    // Loading State
    const [isInitialized, setIsInitialized] = useState(false);
    
    // REFS
    const weatherCache = useRef<Record<string, WeatherCacheEntry>>({});
    const lastAudioUpdate = useRef<number>(0);
    
    // CONSTANTS
    const DURATION = 20000; 
    const PRELOAD_PCT = 75; 
    const CACHE_TTL = 10 * 60 * 1000; 
    const AUDIO_UPDATE_INTERVAL = 3 * 60 * 1000;

    // 0. INIT & SHUFFLE
    useEffect(() => {
        if (webcams.length > 0) {
            const shuffled = [...webcams];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            setPlaylist(shuffled);
            
            // Initial Soundscape
            if (Date.now() - lastAudioUpdate.current > AUDIO_UPDATE_INTERVAL) {
                const initialWeather: WeatherData = {
                    temp: "15", humidity: 50, wind: 10, rain: 0, 
                    isReal: false, isDay: true, code: 1
                };
                Soundscape.updateContext(initialWeather, "Ambient TV Mode. Paisatges relaxants.");
                lastAudioUpdate.current = Date.now();
            }
        }
    }, [webcams]);

    const activeWebcam = playlist.length > 0 
        ? (activeSlot === 'A' ? playlist[indexA] : playlist[indexB])
        : null;

    // Helper to advance to next camera
    const advanceCamera = () => {
        setActiveSlot(prev => {
            const nextSlot = prev === 'A' ? 'B' : 'A';
            setTimeout(() => {
                // Update hidden slot
                if (nextSlot === 'A') setIndexB(prevIndex => (prevIndex + 1) % playlist.length);
                else setIndexA(prevIndex => (prevIndex + 1) % playlist.length);
            }, 500); 
            return nextSlot;
        });
    };

    // Callback when stream fails or times out
    const handleStreamError = () => {
        // Immediate skip
        advanceCamera();
    };

    // Callback when stream is ready (used for initial loading)
    const handleStreamReady = () => {
        if (!isInitialized) {
            setIsInitialized(true);
        }
    };

    // 1. ROTATION TIMER
    useEffect(() => {
        if (playlist.length === 0 || !isInitialized) return;

        const startTime = Date.now();
        let switchScheduled = false;

        const timer = setInterval(() => {
            const now = Date.now();
            const elapsed = now - startTime;
            const pct = Math.min(100, (elapsed / DURATION) * 100);
            setProgress(pct);

            if (elapsed >= DURATION && !switchScheduled) {
                switchScheduled = true;
                advanceCamera();
            }
        }, 100);

        return () => clearInterval(timer);
    }, [indexA, indexB, playlist, isInitialized]); // Reset on index change

    // 3. WEATHER FETCHING
    useEffect(() => {
        if (!activeWebcam) return;
        
        const cached = weatherCache.current[activeWebcam.id];
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            setWeather(cached.data);
            return;
        }

        const fetchData = async () => {
            try {
                let finalData: WeatherData | null = null;
                let omData: any = null;

                if (activeWebcam.lat && activeWebcam.lng) {
                    try {
                        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${activeWebcam.lat}&longitude=${activeWebcam.lng}&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto`);
                        omData = await res.json();
                    } catch(e) {}
                }

                if (activeWebcam.meteoStationType && activeWebcam.meteoStationId) {
                    if (activeWebcam.meteoStationType === 'meteocat') {
                        const now = new Date();
                        const twoHoursAgo = new Date(now.getTime() - (120 * 60 * 1000));
                        const fmt = (d: Date) => d.toISOString().split('.')[0];
                        const query = `SELECT codi_variable, valor_lectura WHERE codi_estacio='${activeWebcam.meteoStationId}' AND data_lectura >= '${fmt(twoHoursAgo)}' AND codi_variable IN ('32', '56') ORDER BY data_lectura DESC LIMIT 5`;
                        const res = await fetch(`https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json?$query=${encodeURIComponent(query)}`);
                        const data = await res.json();
                        const tObj = data.find((d: any) => d.codi_variable === '32');
                        const wObj = data.find((d: any) => d.codi_variable === '56');
                        if (tObj) {
                            finalData = { 
                                temp: parseFloat(tObj.valor_lectura).toFixed(1), 
                                humidity: 0, 
                                wind: wObj ? Math.round(parseFloat(wObj.valor_lectura) * 3.6) : 0, 
                                rain: 0, isReal: true, source: 'SMC' 
                            };
                        }
                    } else if (activeWebcam.meteoStationType === 'wunderground') {
                        const res = await fetch(`https://api.weather.com/v2/pws/observations/current?stationId=${activeWebcam.meteoStationId}&format=json&units=m&numericPrecision=decimal&apiKey=${WG_API_KEY}`);
                        const data = await res.json();
                        const obs = data.observations?.[0];
                        if (obs) {
                            finalData = {
                                temp: obs.metric.temp.toFixed(1),
                                humidity: obs.humidity,
                                wind: Math.round(obs.metric.windGust || obs.metric.windSpeed),
                                rain: 0, isReal: true, source: 'WG'
                            };
                        }
                    } else if (activeWebcam.meteoStationType === 'weatherlink') {
                        const res = await fetch(`https://www.weatherlink.com/map/data/station/${activeWebcam.meteoStationId}?aqiSchemeId=10&woodsmokeEnabled=false`);
                        const data = await res.json();
                        if (data) {
                            finalData = { 
                                temp: data.temperature ? fToC(data.temperature).toFixed(1) : "--", 
                                humidity: 0, 
                                wind: data.windGust ? Math.round(mphToKmh(data.windGust)) : 0, 
                                rain: 0, isReal: true, source: 'DAVIS' 
                            };
                        }
                    }
                }

                if (omData && omData.current) {
                    if (!finalData) {
                        finalData = {
                            temp: omData.current.temperature_2m.toFixed(1),
                            humidity: 0,
                            wind: Math.round(omData.current.wind_speed_10m),
                            rain: 0, isReal: false,
                            code: omData.current.weather_code,
                            isDay: omData.current.is_day === 1
                        };
                    } else {
                        finalData.code = omData.current.weather_code;
                        finalData.isDay = omData.current.is_day === 1;
                    }
                }

                if (finalData) {
                    weatherCache.current[activeWebcam.id] = {
                        data: finalData,
                        timestamp: Date.now()
                    };
                    setWeather(finalData);

                    if (Date.now() - lastAudioUpdate.current > AUDIO_UPDATE_INTERVAL) {
                        Soundscape.updateContext(finalData, "Mode TV.");
                        lastAudioUpdate.current = Date.now();
                    }
                }

            } catch (e) { console.error(e); }
        };

        fetchData();
    }, [activeWebcam]);

    if (playlist.length === 0 || !activeWebcam) return <div className="bg-black fixed inset-0"></div>;

    const weatherIcon = (weather?.code !== undefined && weather?.isDay !== undefined) 
        ? getWeatherIcon(weather.code, weather.isDay) 
        : null;

    return (
        <div 
            className="fixed inset-0 z-[100] bg-black text-white overflow-hidden font-sans cursor-none hover:cursor-default select-none"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={() => setIsHovering(h => !h)}
        >
            {/* INITIAL LOADING SCREEN */}
            {!isInitialized && (
                <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
                    <i className="ph-bold ph-broadcast text-4xl text-indigo-500 animate-pulse mb-4"></i>
                    <span className="text-white/50 text-xs uppercase tracking-[0.3em]">Sintonitzant mode TV...</span>
                </div>
            )}

            {/* Slot A */}
            <AmbientHlsPlayer 
                streamUrl={playlist[indexA].streamUrl} 
                isActive={activeSlot === 'A'} 
                shouldLoad={activeSlot === 'A' || (activeSlot === 'B' && progress > PRELOAD_PCT)} 
                onReady={activeSlot === 'A' ? handleStreamReady : undefined}
                onError={activeSlot === 'A' ? handleStreamError : undefined}
            />
            
            {/* Slot B */}
            <AmbientHlsPlayer 
                streamUrl={playlist[indexB].streamUrl} 
                isActive={activeSlot === 'B'} 
                shouldLoad={activeSlot === 'B' || (activeSlot === 'A' && progress > PRELOAD_PCT)} 
                onReady={activeSlot === 'B' ? handleStreamReady : undefined}
                onError={activeSlot === 'B' ? handleStreamError : undefined}
            />

            {/* Noise Overlay */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 mix-blend-overlay pointer-events-none z-20"></div>

            {/* HUD BOTTOM LEFT - COMPACT & CLEAN */}
            <div className={`absolute bottom-6 left-6 sm:bottom-10 sm:left-10 z-30 flex flex-col gap-1 transition-opacity duration-500 pointer-events-none ${!isInitialized ? 'opacity-0' : 'opacity-100'}`}>
                {/* Meta Header */}
                <div className="flex items-center gap-3 mb-1 opacity-80">
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-red-600/80 backdrop-blur-sm text-white text-[8px] sm:text-[9px] font-bold uppercase tracking-wider shadow-lg border border-red-500/50">
                        <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div> LIVE
                    </div>
                    <span className="text-white/70 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest border-l border-white/20 pl-2">
                        {activeWebcam.region}
                    </span>
                </div>
                
                {/* Main Title - Much Smaller */}
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tighter text-white leading-none shadow-black drop-shadow-md">
                    {activeWebcam.name}
                </h1>

                {/* Weather Info */}
                {weather && (
                    <div className="flex items-center gap-3 sm:gap-5 mt-2 text-white/90 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 w-fit">
                        <div className="flex items-center gap-2">
                            {weatherIcon && <i className={`ph-fill ${weatherIcon.icon} text-lg sm:text-2xl ${weatherIcon.color} drop-shadow-sm`}></i>}
                            <span className="text-lg sm:text-2xl font-medium tracking-tight">{weather.temp}°</span>
                        </div>
                        <div className="w-px h-4 sm:h-5 bg-white/20"></div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <i className="ph-fill ph-wind text-sm sm:text-lg text-blue-200/70"></i>
                            <div className="flex flex-col leading-none">
                                <span className="text-xs sm:text-sm font-medium">{weather.wind}</span>
                                <span className="text-[7px] uppercase font-bold text-white/40 tracking-wider">km/h</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* PROGRESS BAR */}
            <div className={`absolute bottom-0 left-0 h-0.5 bg-white/5 w-full z-40 transition-opacity duration-500 ${!isInitialized ? 'opacity-0' : 'opacity-100'}`}>
                <div 
                    className="h-full bg-indigo-500/80 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-100 ease-linear"
                    style={{ width: `${progress}%` }}
                ></div>
            </div>

            {/* EXIT BUTTON */}
            <div className={`absolute top-4 left-4 sm:top-6 sm:left-6 z-50 transition-all duration-500 ${isHovering ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <button 
                    onClick={onExit}
                    className="group flex items-center gap-2 bg-black/40 hover:bg-white hover:text-black text-white border border-white/20 backdrop-blur-xl pl-3 pr-1.5 py-1.5 rounded-full transition-all shadow-xl"
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider">Sortir</span>
                    <div className="bg-white/20 group-hover:bg-black/10 rounded-full w-5 h-5 flex items-center justify-center">
                        <i className="ph-bold ph-x text-[10px]"></i>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default AmbientMode;
