import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    panX, 
    onReady,
    onError
}: { 
    streamUrl: string, 
    isActive: boolean, 
    shouldLoad: boolean,
    panX: number,
    onReady?: () => void,
    onError?: () => void
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const loadTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);

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

        // FAIL-SAFE: If video doesn't play in 7 seconds, skip
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

        // Add both playing and loadedmetadata listeners for better reliability
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('loadedmetadata', handlePlaying);

        return () => {
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('loadedmetadata', handlePlaying);
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
                className="w-full h-full object-cover bg-black transition-[object-position] duration-100 ease-out"
                style={{ objectPosition: `${panX}% center` }} 
                muted
                autoPlay
                playsInline
                webkit-playsinline="true"
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

type WeatherCacheEntry = {
    data: WeatherData;
    timestamp: number;
};

const AmbientMode: React.FC<AmbientModeProps> = ({ webcams, onExit }) => {
    // Playlist Management
    const [playlist, setPlaylist] = useState<Webcam[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0); 
    
    // Slot Logic
    const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
    
    // Data State
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [progress, setProgress] = useState(0);
    const [isHovering, setIsHovering] = useState(false);
    
    // Pan Interaction State
    const [panX, setPanX] = useState(50);
    const touchStartX = useRef<number | null>(null);
    
    // Loading State
    const [isInitialized, setIsInitialized] = useState(false);
    
    // REFS
    const weatherCache = useRef<Record<string, WeatherCacheEntry>>({});
    const lastAudioUpdate = useRef<number>(0);
    const webcamListRef = useRef<Webcam[]>(webcams);
    
    // CONSTANTS
    const DURATION = 10000; 
    const PRELOAD_PCT = 60; 
    const CACHE_TTL = 10 * 60 * 1000; 
    const AUDIO_UPDATE_INTERVAL = 3 * 60 * 1000;

    // Helper: Fisher-Yates Shuffle
    const shuffleArray = (array: Webcam[]) => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    // Force initialization after 3 seconds to prevent stuck white screen
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isInitialized) setIsInitialized(true);
        }, 3000);
        return () => clearTimeout(timer);
    }, [isInitialized]);

    // 0. INIT PLAYLIST (SMART SHUFFLE: High/Low Alt Mix)
    useEffect(() => {
        if (webcams.length > 0) {
            webcamListRef.current = webcams;
            
            const highAlt = webcams.filter(w => w.altitude >= 1500);
            const lowAlt = webcams.filter(w => w.altitude < 1500);
            
            const shuffledHigh = shuffleArray(highAlt);
            const shuffledLow = shuffleArray(lowAlt);
            
            const smartPlaylist: Webcam[] = [];
            const maxLength = Math.max(shuffledHigh.length, shuffledLow.length);
            
            for (let i = 0; i < maxLength; i++) {
                if (i < shuffledHigh.length) smartPlaylist.push(shuffledHigh[i]);
                if (i < shuffledLow.length) smartPlaylist.push(shuffledLow[i]);
            }
            
            setPlaylist(smartPlaylist);
            
            if (Date.now() - lastAudioUpdate.current > AUDIO_UPDATE_INTERVAL) {
                const initialWeather: WeatherData = {
                    temp: "15", humidity: 50, wind: 10, rain: 0, 
                    isReal: false, isDay: true, code: 1
                };
                Soundscape.updateContext(initialWeather, "Ambient TV Mode.");
                lastAudioUpdate.current = Date.now();
            }
        }
    }, [webcams]);

    // Extend Playlist when needed
    useEffect(() => {
        if (playlist.length > 0 && currentIndex >= playlist.length - 2) {
            const highAlt = webcamListRef.current.filter(w => w.altitude >= 1500);
            const lowAlt = webcamListRef.current.filter(w => w.altitude < 1500);
            const shuffledHigh = shuffleArray(highAlt);
            const shuffledLow = shuffleArray(lowAlt);
            
            const nextBatch: Webcam[] = [];
            const maxLength = Math.max(shuffledHigh.length, shuffledLow.length);
            for (let i = 0; i < maxLength; i++) {
                if (i < shuffledHigh.length) nextBatch.push(shuffledHigh[i]);
                if (i < shuffledLow.length) nextBatch.push(shuffledLow[i]);
            }
            
            if (nextBatch[0].id === playlist[playlist.length-1].id) {
                nextBatch.push(nextBatch.shift()!); 
            }

            setPlaylist(prev => [...prev, ...nextBatch]);
        }
    }, [currentIndex, playlist]);

    const activeWebcam = playlist[currentIndex];
    
    // Advance Logic
    const advanceCamera = () => {
        setActiveSlot(prev => prev === 'A' ? 'B' : 'A');
        setCurrentIndex(prev => prev + 1);
        setPanX(50); 
    };

    const handleStreamError = () => {
        advanceCamera();
    };

    const handleStreamReady = () => {
        if (!isInitialized) {
            setIsInitialized(true);
        }
    };

    // 1. ROTATION TIMER
    useEffect(() => {
        if (!isInitialized) return;

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
    }, [currentIndex, isInitialized]);

    // 2. TOUCH PANNING LOGIC
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        
        const currentX = e.touches[0].clientX;
        const diffX = touchStartX.current - currentX;
        const screenWidth = window.innerWidth;
        const panDelta = (diffX / screenWidth) * 100;
        
        setPanX(prev => {
            let newPan = prev + (panDelta * 0.5); 
            return Math.max(0, Math.min(100, newPan));
        });
        
        touchStartX.current = currentX;
    };

    const handleTouchEnd = () => {
        touchStartX.current = null;
    };

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

    if (!activeWebcam) return <div className="fixed inset-0 z-[200] bg-black"></div>;

    const weatherIcon = (weather?.code !== undefined && weather?.isDay !== undefined) 
        ? getWeatherIcon(weather.code, weather.isDay) 
        : null;

    const isEvenIndex = currentIndex % 2 === 0;
    const slotAStream = isEvenIndex ? playlist[currentIndex]?.streamUrl : playlist[currentIndex + 1]?.streamUrl;
    const slotBStream = isEvenIndex ? playlist[currentIndex + 1]?.streamUrl : playlist[currentIndex]?.streamUrl;

return (
        <div 
            className="fixed inset-0 z-[100] bg-black text-white overflow-hidden font-sans cursor-grab active:cursor-grabbing select-none"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={() => setIsHovering(h => !h)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* INITIAL LOADING SCREEN */}
            <div className={`absolute inset-0 z-[200] bg-black flex flex-col items-center justify-center transition-opacity duration-700 ${!isInitialized ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <i className="ph-bold ph-broadcast text-4xl text-indigo-500 animate-pulse mb-4"></i>
                <span className="text-white/50 text-xs uppercase tracking-[0.3em]">Sintonitzant mode TV...</span>
            </div>

            {/* Slot A */}
            <AmbientHlsPlayer 
                streamUrl={slotAStream} 
                isActive={isEvenIndex}
                shouldLoad={isEvenIndex || (!isEvenIndex && progress > PRELOAD_PCT)} 
                panX={panX}
                onReady={isEvenIndex ? handleStreamReady : undefined}
                onError={isEvenIndex ? handleStreamError : undefined}
            />
            
            {/* Slot B */}
            <AmbientHlsPlayer 
                streamUrl={slotBStream} 
                isActive={!isEvenIndex}
                shouldLoad={!isEvenIndex || (isEvenIndex && progress > PRELOAD_PCT)} 
                panX={panX}
                onReady={!isEvenIndex ? handleStreamReady : undefined}
                onError={!isEvenIndex ? handleStreamError : undefined}
            />

            {/* Noise Overlay */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 mix-blend-overlay pointer-events-none z-20"></div>

            {/* HUD BOTTOM LEFT - MÉS PETIT EN VERTICAL */}
            <div className={`
                absolute z-30 flex flex-col transition-opacity duration-500 pointer-events-none 
                ${!isInitialized ? 'opacity-0' : 'opacity-100'}
                
                /* POSICIÓ */
                gap-1 
                bottom-8 left-6                     /* Base */
                portrait:bottom-10 portrait:left-6  /* Vertical: Més avall que abans */
                landscape:bottom-3 landscape:left-6 
                md:bottom-10 md:left-10
            `}>
                {/* Meta Header */}
                <div className="flex items-center gap-2 mb-0.5 opacity-80">
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600/80 backdrop-blur-sm text-white font-bold shadow-lg border border-red-500/50 
                        text-[9px] portrait:text-[9px] landscape:text-[8px] md:text-[10px]">
                        <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div> LIVE
                    </div>
                    <span className="font-medium border-l border-white/20 pl-2 text-white/70 shadow-black drop-shadow-sm
                        text-xs portrait:text-xs landscape:text-[10px] md:text-xs">
                        {activeWebcam.region}
                    </span>
                </div>
                
                {/* Main Title - REDUÏT EN VERTICAL */}
                <h1 className="font-bold text-white leading-none shadow-black drop-shadow-md
                    text-3xl                /* Base */
                    portrait:text-2xl       /* Vertical: Ara és 2xl (molt més contingut) */
                    landscape:text-xl       /* Horitzontal: Petit */
                    md:text-5xl             /* Desktop */
                ">
                    {activeWebcam.name}
                </h1>

                {/* Weather Info - TOT MÉS PETIT EN VERTICAL */}
                {weather && (
                    <div className="flex items-center mt-1 text-white/90 bg-black/30 backdrop-blur-md rounded-lg border border-white/5 w-fit
                        gap-3 px-3 py-1.5                             /* Base */
                        portrait:gap-3 portrait:px-3 portrait:py-1.5  /* Vertical: Padding més petit */
                        landscape:gap-2 landscape:px-2 landscape:py-1 
                        md:gap-5 md:px-4 md:py-2
                    ">
                        {/* --- BLOC TEMPERATURA --- */}
                        <div className="flex items-center gap-1.5">
                            {weatherIcon && <i className={`ph-fill ${weatherIcon.icon} ${weatherIcon.color} drop-shadow-sm 
                                text-lg portrait:text-lg landscape:text-sm md:text-2xl
                            `}></i>}
                            <span className="font-medium tracking-tight
                                text-xl portrait:text-xl landscape:text-lg md:text-4xl
                            ">{weather.temp}°</span>
                        </div>
                        
                        {/* Separador */}
                        <div className="w-px bg-white/20 h-4 portrait:h-4 landscape:h-3 md:h-8"></div>
                        
                        {/* --- BLOC VENT --- */}
                        <div className="flex items-center gap-1.5">
                            <i className="ph-fill ph-wind text-blue-200/70 
                                text-lg portrait:text-lg landscape:text-sm md:text-2xl
                            "></i>
                            
                            <div className="flex items-center gap-1">
                                <span className="font-medium 
                                    text-xl portrait:text-xl landscape:text-lg md:text-4xl
                                ">{weather.wind}</span>
                                
                                <span className="font-medium text-white/40 self-end mb-0.5
                                    text-[9px] portrait:text-[9px] landscape:text-[7px] md:text-sm
                                ">km/h</span>
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

            {/* EXIT BUTTON - TAMBÉ REDUÏT EN VERTICAL */}
            <div className={`absolute z-50 transition-all duration-500 
                top-6 left-6 
                portrait:top-6 portrait:left-6 /* Vertical: Més petit i a la cantonada */
                landscape:top-3 landscape:left-4 
                md:top-8 md:left-8
                ${isHovering ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <button 
                    onClick={onExit}
                    className="group flex items-center gap-2 bg-black/40 hover:bg-white hover:text-black text-white border border-white/20 backdrop-blur-xl rounded-full transition-all shadow-xl
                        pl-3 pr-1.5 py-1.5 
                        portrait:pl-3 portrait:pr-1.5 portrait:py-1.5 /* Botó vertical petit */
                        landscape:pl-2 landscape:pr-1 landscape:py-0.5
                    "
                >
                    <span className="font-bold tracking-wider
                        text-[10px] portrait:text-[10px] landscape:text-[8px]
                    ">Sortir</span>
                    <div className="bg-white/20 group-hover:bg-black/10 rounded-full flex items-center justify-center
                        w-5 h-5 portrait:w-5 portrait:h-5 landscape:w-4 landscape:h-4
                    ">
                        <i className="ph-bold ph-x text-[10px] portrait:text-[10px] landscape:text-[8px]"></i>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default AmbientMode;
