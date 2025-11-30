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
    onReady 
}: { 
    streamUrl: string, 
    isActive: boolean, 
    shouldLoad: boolean,
    onReady?: () => void
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    useEffect(() => {
        // CLEANUP: If we shouldn't load, destroy everything to save bandwidth/memory
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

        // Cache bust slightly less aggressive (every 10s) to allow some browser caching
        const cacheBust = Math.floor(Date.now() / 10000); 
        const urlWithCache = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}t=${cacheBust}`;

        if (Hls.isSupported()) {
            if (hlsRef.current) hlsRef.current.destroy();
            
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 0, 
                startLevel: -1, 
                maxBufferLength: 10, 
            });
            
            hlsRef.current = hls;
            hls.loadSource(urlWithCache);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = urlWithCache;
            video.play().catch(() => {});
        }

        const handlePlaying = () => {
            if (onReady) onReady();
        };

        video.addEventListener('playing', handlePlaying);
        return () => {
            video.removeEventListener('playing', handlePlaying);
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [streamUrl, shouldLoad]);

    return (
        <div className={`absolute inset-0 w-full h-full bg-black transition-opacity duration-1000 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
            <video 
                ref={videoRef}
                className="w-full h-full object-cover scale-105 animate-[kenburnsVideo_30s_infinite_alternate]"
                muted
                playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none"></div>
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
    // Playlist State (Shuffled)
    const [playlist, setPlaylist] = useState<Webcam[]>([]);
    
    // Slot Logic
    const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
    const [indexA, setIndexA] = useState(0);
    const [indexB, setIndexB] = useState(1);

    // Data State
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [progress, setProgress] = useState(0);
    const [isHovering, setIsHovering] = useState(false);
    
    // REFS
    const weatherCache = useRef<Record<string, WeatherCacheEntry>>({});
    const lastAudioUpdate = useRef<number>(0); // Track last soundscape update
    
    // CONSTANTS
    const DURATION = 20000; // 20s
    const PRELOAD_PCT = 75; // Start loading next cam at 75%
    const CACHE_TTL = 10 * 60 * 1000; // 10 Minutes Cache
    const AUDIO_UPDATE_INTERVAL = 3 * 60 * 1000; // Update audio context only every 3 minutes

    // 0. INIT & SHUFFLE
    useEffect(() => {
        if (webcams.length > 0) {
            // Fisher-Yates Shuffle
            const shuffled = [...webcams];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            setPlaylist(shuffled);
            
            // Set Initial Global Soundscape (Generic) if not already playing
            if (Date.now() - lastAudioUpdate.current > AUDIO_UPDATE_INTERVAL) {
                // Use a generic pleasant start
                const initialWeather: WeatherData = {
                    temp: "15", humidity: 50, wind: 10, rain: 0, 
                    isReal: false, isDay: true, code: 1
                };
                Soundscape.updateContext(initialWeather, "Ambient TV Mode. Paisatges relaxants de muntanya.");
                lastAudioUpdate.current = Date.now();
            }
        }
    }, [webcams]);

    const activeWebcam = playlist.length > 0 
        ? (activeSlot === 'A' ? playlist[indexA] : playlist[indexB])
        : null;

    // 1. ROTATION TIMER
    useEffect(() => {
        if (playlist.length === 0) return;

        const startTime = Date.now();
        let switchScheduled = false;

        const timer = setInterval(() => {
            const now = Date.now();
            const elapsed = now - startTime;
            const pct = Math.min(100, (elapsed / DURATION) * 100);
            setProgress(pct);

            if (elapsed >= DURATION && !switchScheduled) {
                switchScheduled = true;
                setActiveSlot(prev => {
                    const nextSlot = prev === 'A' ? 'B' : 'A';
                    setTimeout(() => {
                        if (nextSlot === 'A') setIndexB((indexA + 1) % playlist.length);
                        else setIndexA((indexB + 1) % playlist.length);
                    }, 1500); 
                    return nextSlot;
                });
            }
        }, 100);

        return () => clearInterval(timer);
    }, [indexA, indexB, playlist]);

    // 2. CLOCK
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // 3. ROBUST WEATHER FETCHING & CACHING
    useEffect(() => {
        if (!activeWebcam) return;
        
        // --- CACHE CHECK ---
        const cached = weatherCache.current[activeWebcam.id];
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            // console.log(`[Cache Hit] ${activeWebcam.name}`);
            setWeather(cached.data);
            return;
        }

        // console.log(`[Fetching] ${activeWebcam.name}`);
        setWeather(null); // Clear previous weather to show loading/empty state if desired, or keep old one? Better clear or show spinner logic.

        const fetchData = async () => {
            try {
                let finalData: WeatherData | null = null;
                let omData: any = null;

                // A. FETCH OPEN-METEO (Always needed for icons/backup)
                if (activeWebcam.lat && activeWebcam.lng) {
                    try {
                        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${activeWebcam.lat}&longitude=${activeWebcam.lng}&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto`);
                        omData = await res.json();
                    } catch(e) { console.warn("OM Fetch Fail", e); }
                }

                // B. FETCH REAL STATION (If exists)
                if (activeWebcam.meteoStationType && activeWebcam.meteoStationId) {
                    // (Simplified logic for speed)
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

                // C. MERGE DATA
                if (omData && omData.current) {
                    if (!finalData) {
                        // Pure OpenMeteo Data
                        finalData = {
                            temp: omData.current.temperature_2m.toFixed(1),
                            humidity: 0,
                            wind: Math.round(omData.current.wind_speed_10m),
                            rain: 0, isReal: false,
                            code: omData.current.weather_code,
                            isDay: omData.current.is_day === 1
                        };
                    } else {
                        // Real data + OM Icons
                        finalData.code = omData.current.weather_code;
                        finalData.isDay = omData.current.is_day === 1;
                    }
                }

                if (finalData) {
                    // SAVE TO CACHE
                    weatherCache.current[activeWebcam.id] = {
                        data: finalData,
                        timestamp: Date.now()
                    };
                    setWeather(finalData);

                    // AUDIO UPDATE (THROTTLED 3 MIN)
                    // Only update soundscape if enough time has passed to allow music to develop
                    if (Date.now() - lastAudioUpdate.current > AUDIO_UPDATE_INTERVAL) {
                        // console.log("🎵 Updating Ambient Soundscape (Slow Drift)");
                        Soundscape.updateContext(finalData, `Mode TV. Viatge visual per ${activeWebcam.name}.`);
                        lastAudioUpdate.current = Date.now();
                    }
                }

            } catch (e) { console.error("Weather fetch error", e); }
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
            {/* Slot A */}
            <AmbientHlsPlayer 
                streamUrl={playlist[indexA].streamUrl} 
                isActive={activeSlot === 'A'} 
                shouldLoad={activeSlot === 'A' || (activeSlot === 'B' && progress > PRELOAD_PCT)} 
            />
            
            {/* Slot B */}
            <AmbientHlsPlayer 
                streamUrl={playlist[indexB].streamUrl} 
                isActive={activeSlot === 'B'} 
                shouldLoad={activeSlot === 'B' || (activeSlot === 'A' && progress > PRELOAD_PCT)} 
            />

            {/* Noise Overlay */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 mix-blend-overlay pointer-events-none z-20"></div>

            {/* HUD BOTTOM LEFT (COMPACT & MODERN) */}
            <div className="absolute bottom-10 left-10 z-30 flex flex-col gap-1 animate-fade-in drop-shadow-lg pointer-events-none">
                {/* Meta Header */}
                <div className="flex items-center gap-3 mb-1 opacity-90">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-600/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider shadow-lg border border-red-500/50">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div> LIVE
                    </div>
                    <span className="text-white/80 text-xs font-bold uppercase tracking-widest border-l border-white/30 pl-3">
                        {activeWebcam.region}
                    </span>
                </div>
                
                {/* Main Title */}
                <h1 className="text-5xl md:text-6xl font-bold tracking-tighter text-white leading-none shadow-black drop-shadow-2xl">
                    {activeWebcam.name}
                </h1>

                {/* Weather Info */}
                {weather && (
                    <div className="flex items-center gap-6 mt-2 text-white/90 bg-black/20 backdrop-blur-md px-4 py-2 rounded-xl border border-white/5 w-fit">
                        <div className="flex items-center gap-3">
                            {weatherIcon && <i className={`ph-fill ${weatherIcon.icon} text-3xl ${weatherIcon.color} drop-shadow-md`}></i>}
                            <span className="text-4xl font-light tracking-tighter">{weather.temp}°</span>
                        </div>
                        <div className="w-px h-8 bg-white/20"></div>
                        <div className="flex items-center gap-3">
                            <i className="ph-fill ph-wind text-2xl text-blue-200/80"></i>
                            <div className="flex flex-col leading-none">
                                <span className="text-xl font-medium">{weather.wind}</span>
                                <span className="text-[9px] uppercase font-bold text-white/50 tracking-wider">km/h</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* CLOCK TOP RIGHT */}
            <div className="absolute top-8 right-10 z-30 text-right pointer-events-none">
                <div className="text-6xl font-extralight tracking-tight font-mono text-white/90 drop-shadow-xl">
                    {currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
                <div className="text-sm font-bold uppercase tracking-widest text-white/40 mt-0">
                    {currentTime.toLocaleDateString([], {weekday: 'long', day: 'numeric', month: 'short'})}
                </div>
            </div>

            {/* PROGRESS BAR */}
            <div className="absolute bottom-0 left-0 h-1 bg-white/5 w-full z-40">
                <div 
                    className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] transition-all duration-100 ease-linear"
                    style={{ width: `${progress}%` }}
                ></div>
            </div>

            {/* EXIT BUTTON */}
            <div className={`absolute top-8 left-8 z-50 transition-all duration-500 ${isHovering ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <button 
                    onClick={onExit}
                    className="group flex items-center gap-2 bg-black/40 hover:bg-white hover:text-black text-white border border-white/20 backdrop-blur-xl pl-4 pr-2 py-2 rounded-full transition-all shadow-xl"
                >
                    <span className="text-xs font-bold uppercase tracking-wider">Sortir</span>
                    <div className="bg-white/20 group-hover:bg-black/10 rounded-full w-6 h-6 flex items-center justify-center">
                        <i className="ph-bold ph-x text-xs"></i>
                    </div>
                </button>
            </div>

            <style>{`
                @keyframes kenburnsVideo {
                    0% { transform: scale(1.02); }
                    100% { transform: scale(1.10); }
                }
            `}</style>
        </div>
    );
};

export default AmbientMode;