
import React, { useEffect, useState, useRef, useCallback } from 'react';

// API Endpoints
const TIMELAPSE_API_BASE = 'https://cams.projecte4estacions.com/api/galeria/';
const TIMELAPSE_IMAGE_BASE = 'https://cams.projecte4estacions.com/timelapses/';

interface TimelapsePlayerProps {
    webcamId: string;
}

type TimePreset = 'all' | 'morning' | 'day' | 'evening' | 'solar' | 'last3h' | 'custom';

// MAPING TRADUCCIÓ
const PRESET_LABELS: Record<TimePreset, string> = {
    all: 'Tot',
    morning: 'Matí',
    day: 'Dia',
    evening: 'Tarda',
    solar: 'Sol',
    last3h: '3h',
    custom: 'Personalitzat'
};

const TimelapsePlayer: React.FC<TimelapsePlayerProps> = ({ webcamId }) => {
    const [rawImages, setRawImages] = useState<string[]>([]);
    const [frames, setFrames] = useState<{url: string, time: string, timestamp: number, hour: number}[]>([]);
    
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [activePreset, setActivePreset] = useState<TimePreset>('all');
    
    // Custom Range State
    const [customStart, setCustomStart] = useState(8);
    const [customEnd, setCustomEnd] = useState(18);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState(100); 
    const [isBuffering, setIsBuffering] = useState(false);
    const [showControls, setShowControls] = useState(true); // TAP TO HIDE

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const imageCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
    const abortControllerRef = useRef<AbortController | null>(null);
    const isPausedRef = useRef(false);

    // 1. Fetch Available Dates
    useEffect(() => {
        const fetchDates = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(`${TIMELAPSE_API_BASE}${webcamId}/dates`);
                if (!response.ok) throw new Error('Error al carregar dates');
                const data = await response.json();
                
                if (Array.isArray(data) && data.length > 0) {
                    setDates(data);
                    setSelectedDate(data[0]);
                } else {
                    setError("No hi ha dates disponibles");
                    setIsLoading(false);
                }
            } catch (err) {
                console.error(err);
                setError("No s'ha pogut connectar amb el servidor de timelapse");
                setIsLoading(false);
            }
        };
        fetchDates();
    }, [webcamId]);

    // 2. Fetch Images
    useEffect(() => {
        if (!selectedDate) return;

        const fetchImages = async () => {
            if (abortControllerRef.current) abortControllerRef.current.abort();
            abortControllerRef.current = new AbortController();

            setIsLoading(true);
            setIsPlaying(false);
            setRawImages([]);
            setFrames([]);
            imageCacheRef.current.clear();
            
            try {
                const response = await fetch(`${TIMELAPSE_API_BASE}${webcamId}/${selectedDate}/images`, {
                    signal: abortControllerRef.current.signal
                });
                if (!response.ok) throw new Error('Error al carregar imatges');
                const imageNames = await response.json();

                if (Array.isArray(imageNames) && imageNames.length > 0) {
                    setRawImages(imageNames);
                } else {
                    setError("No hi ha imatges per aquesta data");
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error(err);
                    setError("Error carregant les imatges");
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchImages();
    }, [webcamId, selectedDate]);

    // 3. Filter Frames
    useEffect(() => {
        if (rawImages.length === 0) return;

        setIsPlaying(false);
        setCurrentIndex(0);
        imageCacheRef.current.clear();

        const processedFrames = rawImages.map(name => {
             let timeStr = "00:00";
             let hour = 0;
             let timestamp = 0;
             try {
                 const parts = name.split('_');
                 const timePart = parts.length > 1 ? parts[1] : parts[0];
                 const cleanTime = timePart.replace('.jpg', '').split('-'); 
                 if (cleanTime.length >= 2) {
                     hour = parseInt(cleanTime[0], 10);
                     timeStr = `${cleanTime[0]}:${cleanTime[1]}`;
                     timestamp = hour * 60 + parseInt(cleanTime[1], 10); 
                 }
             } catch (e) {}

             return {
                 url: `${TIMELAPSE_IMAGE_BASE}${webcamId}/${selectedDate}/${name}`,
                 time: timeStr,
                 timestamp: timestamp,
                 hour: hour
             };
        });

        let filtered = processedFrames;
        
        // LOGICA PRESETS CATALANS
        if (activePreset === 'morning') {
            filtered = processedFrames.filter(f => f.hour >= 6 && f.hour < 13);
        } else if (activePreset === 'day') { // Migdia/Dia complet
             filtered = processedFrames.filter(f => f.hour >= 8 && f.hour < 20);
        } else if (activePreset === 'evening') { // Tarda
            filtered = processedFrames.filter(f => f.hour >= 13 && f.hour < 21);
        } else if (activePreset === 'solar') {
            filtered = processedFrames.filter(f => f.hour >= 6 && f.hour <= 21); // Inclou alba i posta
        } else if (activePreset === 'custom') {
            filtered = processedFrames.filter(f => f.hour >= customStart && f.hour < customEnd);
        } else if (activePreset === 'last3h') {
             if (processedFrames.length > 0) {
                 const lastTs = processedFrames[processedFrames.length - 1].timestamp;
                 filtered = processedFrames.filter(f => f.timestamp >= (lastTs - 180));
             }
        }

        if (filtered.length === 0) {
             setFrames(processedFrames); 
             if (activePreset !== 'custom') setActivePreset('all'); 
        } else {
             setFrames(filtered);
        }

    }, [rawImages, activePreset, webcamId, selectedDate, customStart, customEnd]);

    // 4. Preload
    const preloadNextFrames = useCallback((startIndex: number, count: number) => {
        if (frames.length === 0) return;
        const cache = imageCacheRef.current;
        if (cache.size > 50) {
             for (const [key] of cache) {
                if (Math.abs(key - startIndex) > 20) cache.delete(key);
             }
        }
        for (let i = 0; i < count; i++) {
            const idx = (startIndex + i) % frames.length;
            if (!cache.has(idx)) {
                const img = new Image();
                img.src = frames[idx].url;
                cache.set(idx, img);
            }
        }
    }, [frames]);

    // 5. Smart Playback Loop
    useEffect(() => {
        const loop = () => {
            if (!isPlaying || isPausedRef.current) return;

            setCurrentIndex(prev => {
                const next = (prev + 1) % frames.length;
                
                // Pause at end of loop for 2 seconds
                if (next === 0 && prev === frames.length - 1) {
                    isPausedRef.current = true;
                    setTimeout(() => {
                        isPausedRef.current = false;
                        if(isPlaying) loop(); 
                    }, 2000);
                    return prev; // Stay on last frame
                }

                // Smart Buffer Check
                if (!imageCacheRef.current.has(next)) {
                    setIsBuffering(true);
                    preloadNextFrames(next, 5);
                    timerRef.current = setTimeout(loop, 100); // Retry soon
                    return prev;
                }

                setIsBuffering(false);
                preloadNextFrames(next + 1, 5);
                timerRef.current = setTimeout(loop, playbackSpeed);
                return next;
            });
        };

        if (isPlaying) {
            isPausedRef.current = false;
            loop();
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isPlaying, frames, playbackSpeed, preloadNextFrames]);


    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsPlaying(p => !p);
    };

    const handleContainerClick = () => {
        setShowControls(prev => !prev);
    };

    const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        setCurrentIndex(val);
        setIsPlaying(false);
    };

    if (isLoading && frames.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black text-white">
                <i className="ph-bold ph-spinner animate-spin text-3xl"></i>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black text-white p-4 text-center">
                <span className="text-sm">{error}</span>
            </div>
        );
    }

    const currentFrame = frames[currentIndex];

    return (
        <div 
            className="relative w-full h-full bg-black group/player select-none cursor-pointer"
            onClick={handleContainerClick}
        >
            {currentFrame && (
                <img 
                    src={currentFrame.url} 
                    alt={currentFrame.time}
                    className="w-full h-full object-contain"
                />
            )}

            {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 p-3 rounded-full backdrop-blur-sm">
                        <i className="ph-bold ph-spinner animate-spin text-2xl text-white"></i>
                    </div>
                </div>
            )}

            {/* CONTROLS OVERLAY (Tap to Hide) */}
            <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 flex flex-col gap-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <input 
                    type="range" 
                    min={0} 
                    max={frames.length - 1} 
                    value={currentIndex}
                    onChange={handleScrubberChange}
                    onClick={e => e.stopPropagation()}
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer hover:h-1.5 transition-all accent-blue-500"
                />
                
                <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-4">
                        <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors">
                            <i className={`ph-fill text-3xl ${isPlaying ? 'ph-pause' : 'ph-play'}`}></i>
                        </button>
                        
                        <div className="flex flex-col">
                             <span className="text-white font-mono font-bold text-lg leading-none">
                                {currentFrame?.time || '--:--'}
                            </span>
                            <span className="text-white/50 text-[10px] font-medium uppercase tracking-wider">
                                {selectedDate}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setPlaybackSpeed(s => s === 100 ? 50 : s === 50 ? 200 : 100)}
                            className="text-xs font-bold text-white/80 bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition-colors"
                        >
                            {playbackSpeed === 100 ? '1x' : playbackSpeed === 50 ? '2x' : '0.5x'}
                        </button>
                        
                        <a 
                            href={currentFrame?.url} 
                            download={`timelapse.jpg`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded transition-colors"
                        >
                            <i className="ph-bold ph-download-simple text-lg"></i>
                        </a>
                    </div>
                </div>
            </div>

            {/* TOP CONTROLS (Compact Dropdown + Custom Range) */}
            <div className={`absolute top-0 inset-x-0 p-3 flex flex-wrap justify-between items-start bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex items-center gap-2 pointer-events-auto" onClick={e => e.stopPropagation()}>
                    
                    {/* Compact Filter Menu */}
                    <div className="relative group">
                        <div className="flex items-center bg-black/40 text-white border border-white/20 rounded-lg px-2 py-1 backdrop-blur-md">
                            <i className="ph-bold ph-funnel text-xs mr-2 opacity-70"></i>
                            <select 
                                value={activePreset}
                                onChange={(e) => setActivePreset(e.target.value as TimePreset)}
                                className="bg-transparent text-xs font-bold uppercase focus:outline-none appearance-none pr-4 cursor-pointer"
                            >
                                {Object.entries(PRESET_LABELS).map(([key, label]) => (
                                    <option key={key} value={key} className="text-black">{label}</option>
                                ))}
                            </select>
                            <i className="ph-bold ph-caret-down absolute right-2 text-[10px] pointer-events-none opacity-50"></i>
                        </div>
                    </div>

                    {/* CUSTOM RANGE SELECTORS (Visible only if Custom) */}
                    {activePreset === 'custom' && (
                        <div className="flex items-center gap-1 bg-black/40 border border-white/20 rounded-lg px-2 py-1 backdrop-blur-md">
                            <select 
                                value={customStart}
                                onChange={e => setCustomStart(Number(e.target.value))}
                                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
                            >
                                {[...Array(24)].map((_, i) => <option key={i} value={i} className="text-black">{i}h</option>)}
                            </select>
                            <span className="text-white/50 text-[10px]">-</span>
                            <select 
                                value={customEnd}
                                onChange={e => setCustomEnd(Number(e.target.value))}
                                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
                            >
                                {[...Array(24)].map((_, i) => <option key={i} value={i} className="text-black">{i}h</option>)}
                            </select>
                        </div>
                    )}
                </div>

                <div className="pointer-events-auto" onClick={e => e.stopPropagation()}>
                     <select 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-black/40 text-white text-xs border border-white/20 rounded-lg px-2 py-1 backdrop-blur-md focus:outline-none"
                     >
                         {dates.map(date => (
                             <option key={date} value={date} className="text-black">{date}</option>
                         ))}
                     </select>
                </div>
            </div>
        </div>
    );
};

export default TimelapsePlayer;
