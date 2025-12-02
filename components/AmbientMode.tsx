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
    const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMounted = useRef(true);

    // Deep cleanup function to force GC
    const destroyPlayer = useCallback(() => {
        if (hlsRef.current) {
            try {
                hlsRef.current.stopLoad(); // Stop downloading
                hlsRef.current.detachMedia();
                hlsRef.current.destroy();
            } catch (e) { /* ignore */ }
            hlsRef.current = null;
        }
        
        // Force browser to drop video buffer
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src'); 
            videoRef.current.load(); 
        }

        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            destroyPlayer();
        };
    }, [destroyPlayer]);

    useEffect(() => {
        if (!shouldLoad || !streamUrl) {
            destroyPlayer();
            return;
        }

        const video = videoRef.current;
        if (!video) return;

        // Ensure clean slate
        destroyPlayer();

        // FAIL-SAFE TIMEOUT
        loadTimeoutRef.current = setTimeout(() => {
            if (isMounted.current && video.paused && onError) {
                if (isActive) console.warn(`[Ambient] Timeout: ${streamUrl}`);
                onError();
            }
        }, 8000);

        const cacheBust = Math.floor(Date.now() / 30000);
        const urlWithCache = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}t=${cacheBust}`;

        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                // MEMORY OPTIMIZATION: Tiny buffer
                backBufferLength: 0,
                maxBufferLength: 3, 
                maxMaxBufferLength: 3,
                startLevel: -1,
                capLevelToPlayerSize: true,
                // Fast Failures
                manifestLoadingTimeOut: 5000,
                levelLoadingTimeOut: 5000,
                fragLoadingTimeOut: 5000
            });
            
            hlsRef.current = hls;
            hls.loadSource(urlWithCache);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if(!isMounted.current) return;
                const playPromise = video.play();
                if (playPromise !== undefined) playPromise.catch(() => {});
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if(!isMounted.current) return;
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            destroyPlayer();
                            if (onError) onError();
                            break;
                    }
                }
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = urlWithCache;
            const playPromise = video.play();
            if (playPromise !== undefined) playPromise.catch(() => {});
            
            const errorHandler = () => { if(onError && isMounted.current) onError(); };
            video.addEventListener('error', errorHandler, { once: true });
        }
        
        const handlePlaying = () => {
            if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
            if (onReady && isMounted.current) onReady();
        };

        video.addEventListener('playing', handlePlaying);

        return () => {
            video.removeEventListener('playing', handlePlaying);
        };
    }, [streamUrl, shouldLoad, destroyPlayer, isActive, onError, onReady]);

    return (
        <div className={`absolute inset-0 w-full h-full bg-black transition-opacity duration-1000 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
            <video 
                ref={videoRef}
                className="w-full h-full object-cover bg-black transition-[object-position] duration-100 ease-out will-change-[object-position]"
                style={{ objectPosition: `${panX}% center` }} 
                muted={true}
                playsInline
                webkit-playsinline="true"
            />
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
    const [preloadNext, setPreloadNext] = useState(false);
    
    // Data State
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [panX, setPanX] = useState(50);
    
    const badStreamsRef = useRef<Set<string>>(new Set());
    const touchStartX = useRef<number | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    
    const weatherCache = useRef<Record<string, WeatherCacheEntry>>({});
    const lastAudioUpdate = useRef<number>(0);
    const webcamListRef = useRef<Webcam[]>(webcams);
    
    // CONSTANTS
    const DURATION = 14000; 
    const PRELOAD_DELAY = 10000; 
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

    // Force initialization safety
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isInitialized && playlist.length > 0) {
                 setIsInitialized(true);
            }
        }, 8000);
        return () => clearTimeout(timer);
    }, [isInitialized, playlist]);

    // 0. INIT PLAYLIST
    useEffect(() => {
        if (webcams.length > 0) {
            webcamListRef.current = webcams;
            const pool = webcams.filter(w => !badStreamsRef.current.has(w.streamUrl));
            
            const highAlt = pool.filter(w => w.altitude >= 1500);
            const lowAlt = pool.filter(w => w.altitude < 1500);
            
            const sHigh = shuffleArray(highAlt);
            const sLow = shuffleArray(lowAlt);
            
            const smartPlaylist: Webcam[] = [];
            const maxLength = Math.max(sHigh.length, sLow.length);
            
            for (let i = 0; i < maxLength; i++) {
                if (i < sHigh.length) smartPlaylist.push(sHigh[i]);
                if (i < sLow.length) smartPlaylist.push(sLow[i]);
            }
            
            setPlaylist(smartPlaylist);
            
            if (Date.now() - lastAudioUpdate.current > AUDIO_UPDATE_INTERVAL) {
                const initialWeather: WeatherData = {
                    temp: "15", humidity: 50, wind: 10, rain: 0, 
                    isReal: false, isDay: true, code: 1
                };
                Soundscape.updateContext(initialWeather, "Ambient TV Mode.", true);
                lastAudioUpdate.current = Date.now();
            }
        }
    }, [webcams]);

    // Extend Playlist
    useEffect(() => {
        if (playlist.length > 0 && currentIndex >= playlist.length - 2) {
            const pool = webcamListRef.current.filter(w => !badStreamsRef.current.has(w.streamUrl));
            const highAlt = pool.filter(w => w.altitude >= 1500);
            const lowAlt = pool.filter(w => w.altitude < 1500);
            const sHigh = shuffleArray(highAlt);
            const sLow = shuffleArray(lowAlt);
            
            const nextBatch: Webcam[] = [];
            const maxLength = Math.max(sHigh.length, sLow.length);
            for (let i = 0; i < maxLength; i++) {
                if (i < sHigh.length) nextBatch.push(sHigh[i]);
                if (i < sLow.length) nextBatch.push(sLow[i]);
            }
            
            if (nextBatch.length > 0 && playlist.length > 0) {
                if (nextBatch[0].id === playlist[playlist.length-1].id) {
                    nextBatch.push(nextBatch.shift()!); 
                }
                setPlaylist(prev => [...prev, ...nextBatch]);
            }
        }
    }, [currentIndex, playlist]);

    const activeWebcam = playlist[currentIndex];
    
    // Advance Logic
    const advanceCamera = useCallback(() => {
        setPreloadNext(false); 
        setActiveSlot(prev => prev === 'A' ? 'B' : 'A');
        setCurrentIndex(prev => prev + 1);
        setPanX(50); 
    }, []);

    const handleStreamError = useCallback(() => {
        if (!activeWebcam) return;
        console.log(`[Ambient] Bad stream detected: ${activeWebcam.name}. Removing...`);
        badStreamsRef.current.add(activeWebcam.streamUrl);
        advanceCamera();
    }, [advanceCamera, activeWebcam]);

    const handleStreamReady = useCallback(() => {
        if (!isInitialized) {
            setIsInitialized(true);
        }
    }, [isInitialized]);

    const toggleAudio = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isAudioOn) {
            Soundscape.pause();
            setIsAudioOn(false);
        } else {
            Soundscape.play();
            setIsAudioOn(true);
        }
    };

    // Rotation Timer
    useEffect(() => {
        if (!isInitialized) return;

        const advanceTimer = setTimeout(() => {
            advanceCamera();
        }, DURATION);

        const preloadTimer = setTimeout(() => {
            setPreloadNext(true);
        }, PRELOAD_DELAY);

        return () => {
            clearTimeout(advanceTimer);
            clearTimeout(preloadTimer);
        };
    }, [currentIndex, isInitialized, advanceCamera]);

    // Touch Panning
    const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const currentX = e.touches[0].clientX;
        const diffX = touchStartX.current - currentX;
        const screenWidth = window.innerWidth;
        const panDelta = (diffX / screenWidth) * 100;
        setPanX(prev => Math.max(0, Math.min(100, prev + (panDelta * 0.5))));
        touchStartX.current = currentX;
    };
    const handleTouchEnd = () => { touchStartX.current = null; };

    // Weather Fetching
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

                // Simplified Fetch Logic
                if (omData && omData.current) {
                    finalData = {
                        temp: omData.current.temperature_2m.toFixed(1),
                        humidity: 0,
                        wind: Math.round(omData.current.wind_speed_10m),
                        rain: 0, isReal: false,
                        code: omData.current.weather_code,
                        isDay: omData.current.is_day === 1
                    };
                }

                if (finalData) {
                    weatherCache.current[activeWebcam.id] = {
                        data: finalData,
                        timestamp: Date.now()
                    };
                    setWeather(finalData);
                    if (Date.now() - lastAudioUpdate.current > AUDIO_UPDATE_INTERVAL) {
                        Soundscape.updateContext(finalData, "Ambient TV Mode.", true);
                        lastAudioUpdate.current = Date.now();
                    }
                }
            } catch (e) {}
        };

        fetchData();
    }, [activeWebcam]);

    if (!activeWebcam) return <div className="fixed inset-0 z-[200] bg-black"></div>;

    const weatherIcon = (weather?.code !== undefined && weather?.isDay !== undefined) 
        ? getWeatherIcon(weather.code, weather.isDay) 
        : null;

    const isEvenIndex = currentIndex % 2 === 0;
    const slotAStream = playlist[isEvenIndex ? currentIndex : currentIndex + 1]?.streamUrl;
    const slotBStream = playlist[isEvenIndex ? currentIndex + 1 : currentIndex]?.streamUrl;

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
            <style>{`
                @keyframes progressLinear {
                    0% { transform: scaleX(0); }
                    100% { transform: scaleX(1); }
                }
            `}</style>

            <div className={`absolute inset-0 z-[200] bg-black flex flex-col items-center justify-center transition-opacity duration-700 ${!isInitialized ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <i className="ph-bold ph-broadcast text-4xl text-indigo-500 animate-pulse mb-4"></i>
                <span className="text-white/50 text-xs uppercase tracking-[0.3em]">Sintonitzant mode TV...</span>
            </div>

            <AmbientHlsPlayer 
                streamUrl={slotAStream} 
                isActive={isEvenIndex}
                shouldLoad={isEvenIndex || (!isEvenIndex && preloadNext)} 
                panX={panX}
                onReady={isEvenIndex ? handleStreamReady : undefined}
                onError={handleStreamError}
            />
            
            <AmbientHlsPlayer 
                streamUrl={slotBStream} 
                isActive={!isEvenIndex}
                shouldLoad={!isEvenIndex || (isEvenIndex && preloadNext)} 
                panX={panX}
                onReady={!isEvenIndex ? handleStreamReady : undefined}
                onError={handleStreamError}
            />

            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 mix-blend-overlay pointer-events-none z-20"></div>

            <div className={`
                absolute z-30 flex flex-col transition-opacity duration-500 pointer-events-none 
                ${!isInitialized ? 'opacity-0' : 'opacity-100'}
                gap-1 bottom-6 left-4 md:bottom-10 md:left-10
            `}>
                <div className="flex items-center gap-2 mb-0.5 opacity-80">
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600/80 backdrop-blur-sm text-white font-bold shadow-lg border border-red-500/50 
                        text-[7px] md:text-sm md:px-2.5 md:py-0.5">
                        <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-white rounded-full animate-pulse"></div> LIVE
                    </div>
                    <span className="font-medium border-l border-white/20 pl-2 text-white/70 shadow-black drop-shadow-sm
                        text-[10px] md:text-lg">
                        {activeWebcam.region}
                    </span>
                </div>
                
                <h1 className="font-bold text-white leading-none shadow-black drop-shadow-md
                    text-base md:text-4xl lg:text-5xl">
                    {activeWebcam.name}
                </h1>

                {weather && (
                    <div className="flex items-center mt-1 text-white/90 bg-black/30 backdrop-blur-md rounded-lg border border-white/5 w-fit
                        gap-2 px-2 py-0.5 md:gap-4 md:px-4 md:py-2 md:mt-2 md:rounded-xl">
                        <div className="flex items-center gap-1.5 md:gap-2">
                            {weatherIcon && <i className={`ph-fill ${weatherIcon.icon} ${weatherIcon.color} drop-shadow-sm text-sm md:text-2xl lg:text-3xl`}></i>}
                            <span className="font-medium tracking-tight text-lg md:text-3xl lg:text-4xl">{weather.temp}°</span>
                        </div>
                        
                        <div className="w-px bg-white/20 h-3 md:h-6 lg:h-8"></div>
                        
                        <div className="flex items-center gap-1.5 md:gap-2">
                            <i className="ph-fill ph-wind text-blue-200/70 text-xs md:text-xl lg:text-2xl"></i>
                            <div className="flex items-center gap-1">
                                <span className="font-medium text-sm md:text-xl lg:text-2xl">{weather.wind}</span>
                                <span className="font-medium text-white/40 self-end mb-0.5 text-[9px] md:text-xs md:mb-0.5">km/h</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className={`absolute bottom-0 left-0 h-0.5 bg-white/5 w-full z-40 transition-opacity duration-500 ${!isInitialized ? 'opacity-0' : 'opacity-100'}`}>
                {isInitialized && (
                    <div 
                        key={currentIndex} 
                        className="h-full bg-indigo-500/80 shadow-[0_0_10px_rgba(99,102,241,0.5)] origin-left"
                        style={{ animation: `progressLinear ${DURATION}ms linear` }}
                    ></div>
                )}
            </div>

            <div className={`absolute z-50 transition-all duration-500 top-4 left-4 md:top-8 md:left-8 ${isHovering ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'} flex items-center gap-2 md:gap-4`}>
                <button onClick={onExit} className="group flex items-center gap-2 bg-black/40 hover:bg-white hover:text-black text-white border border-white/20 backdrop-blur-xl rounded-full transition-all shadow-xl pl-3 pr-1.5 py-1.5 md:pl-4 md:pr-3 md:py-2">
                    <span className="font-bold tracking-wider text-[10px] md:text-xs">Sortir</span>
                    <div className="bg-white/20 group-hover:bg-black/10 rounded-full flex items-center justify-center w-5 h-5 md:w-6 md:h-6">
                        <i className="ph-bold ph-x text-[10px] md:text-[10px]"></i>
                    </div>
                </button>
                <button onClick={toggleAudio} className={`flex items-center justify-center rounded-full transition-all shadow-xl backdrop-blur-xl border w-8 h-8 md:w-10 md:h-10 ${isAudioOn ? 'bg-black/40 text-white border-white/20 hover:bg-white hover:text-black' : 'bg-red-500/80 text-white border-red-400 hover:bg-red-600'}`} title={isAudioOn ? "Silenciar" : "Activar So"}>
                    <i className={`ph-bold ${isAudioOn ? 'ph-speaker-high' : 'ph-speaker-slash'} text-sm md:text-base`}></i>
                </button>
            </div>
        </div>
    );
};

export default AmbientMode;
