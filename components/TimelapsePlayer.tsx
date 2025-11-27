
import React, { useEffect, useState, useRef, useCallback } from 'react';

// API Endpoints derived from original code
const TIMELAPSE_API_BASE = 'https://cams.projecte4estacions.com/api/galeria/';
const TIMELAPSE_IMAGE_BASE = 'https://cams.projecte4estacions.com/timelapses/';

interface TimelapsePlayerProps {
    webcamId: string;
}

type TimePreset = 'all' | 'morning' | 'evening' | 'last3h';

const TimelapsePlayer: React.FC<TimelapsePlayerProps> = ({ webcamId }) => {
    // Dades crues de l'API (noms de fitxers)
    const [rawImages, setRawImages] = useState<string[]>([]);
    
    // Frames filtrats per mostrar
    const [frames, setFrames] = useState<{url: string, time: string, timestamp: number}[]>([]);
    
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [activePreset, setActivePreset] = useState<TimePreset>('all');
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [imageLoading, setImageLoading] = useState(false); // Per loading frame a frame
    const [error, setError] = useState<string | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState(100); // ms per frame

    // Mobile specific controls visibility
    const [showControls, setShowControls] = useState(true);
    // Video Generation State
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);

    const timerRef = useRef<number | null>(null);
    const imageCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
    const abortControllerRef = useRef<AbortController | null>(null);

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
                    setSelectedDate(data[0]); // Select most recent date
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

    // 2. Fetch Images for Selected Date
    useEffect(() => {
        if (!selectedDate) return;

        const fetchImages = async () => {
            // Cancel·lar fetchs anteriors si n'hi ha
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

    // 3. Filter Frames based on Preset
    useEffect(() => {
        if (rawImages.length === 0) return;

        setIsPlaying(false);
        setCurrentIndex(0);
        imageCacheRef.current.clear();

        const processedFrames = rawImages.map(name => {
             // Parse Time: YYYY-MM-DD_HH-MM-SS.jpg or HH-MM-SS.jpg
             let timeStr = "00:00";
             let hour = 0;
             let timestamp = 0;
             
             try {
                 const parts = name.split('_');
                 const timePart = parts.length > 1 ? parts[1] : parts[0];
                 const cleanTime = timePart.replace('.jpg', '').split('-'); // [HH, MM, SS]
                 if (cleanTime.length >= 2) {
                     hour = parseInt(cleanTime[0], 10);
                     timeStr = `${cleanTime[0]}:${cleanTime[1]}`;
                     // Create pseudo timestamp for sorting/filtering
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

        // Apply Filter
        let filtered = processedFrames;
        
        if (activePreset === 'morning') {
            // 06:00 to 10:00
            filtered = processedFrames.filter(f => f.hour >= 6 && f.hour < 10);
        } else if (activePreset === 'evening') {
            // 17:00 to 21:00
            filtered = processedFrames.filter(f => f.hour >= 17 && f.hour < 21);
        } else if (activePreset === 'last3h') {
             // Take the last frame time and go back 180 mins
             if (processedFrames.length > 0) {
                 const lastTs = processedFrames[processedFrames.length - 1].timestamp;
                 filtered = processedFrames.filter(f => f.timestamp >= (lastTs - 180));
             }
        }

        if (filtered.length === 0) {
             // Fallback if filter returns empty (e.g. requesting sunset at 10am)
             setFrames(processedFrames); 
             setActivePreset('all'); 
        } else {
             setFrames(filtered);
        }

    }, [rawImages, activePreset, webcamId, selectedDate]);


    // 4. Preload logic (Optimized for Memory)
    const preloadNextFrames = useCallback((startIndex: number, count: number) => {
        if (frames.length === 0) return;
        
        // 1. Clean cache (remove images far from current index)
        const cache = imageCacheRef.current;
        if (cache.size > 50) { // Keep max 50 images in memory
            for (const key of cache.keys()) {
                // If key is far from startIndex (circular distance)
                const dist = Math.abs(key - startIndex);
                const circularDist = Math.min(dist, frames.length - dist);
                if (circularDist > 30) {
                    cache.delete(key);
                }
            }
        }

        // 2. Preload forward
        for (let i = 0; i < count; i++) {
            const idx = (startIndex + i) % frames.length;
            if (!cache.has(idx)) {
                const img = new Image();
                img.src = frames[idx].url;
                cache.set(idx, img);
            }
        }
    }, [frames]);

    // 5. Playback Loop (WITH LOOPING)
    useEffect(() => {
        if (isPlaying && frames.length > 0) {
            timerRef.current = window.setInterval(() => {
                setCurrentIndex((prev) => {
                    const next = (prev + 1);
                    if (next >= frames.length) {
                        return 0; // Loop back
                    }
                    // Preload less aggressively to save bandwidth
                    if (next % 5 === 0) preloadNextFrames(next, 10);
                    return next;
                });
            }, playbackSpeed);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPlaying, frames, playbackSpeed, preloadNextFrames]);

    // 6. Manual Scrubbing
    const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value);
        setIsPlaying(false);
        setCurrentIndex(val);
        preloadNextFrames(val, 2);
    };

    // 7. Generate Video (Non-blocking)
    const handleDownloadVideo = async () => {
        if (frames.length === 0 || isGeneratingVideo) return;
        setIsPlaying(false);
        setIsGeneratingVideo(true);
        setGenerationProgress(0);

        try {
            // Get dimensions from first image
            const firstImg = new Image();
            firstImg.crossOrigin = "anonymous";
            firstImg.src = frames[0].url;
            await new Promise((resolve) => { firstImg.onload = resolve; });

            const canvas = document.createElement('canvas');
            canvas.width = firstImg.naturalWidth || 1280;
            canvas.height = firstImg.naturalHeight || 720;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) throw new Error('No canvas context');

            // Setup MediaRecorder
            const stream = canvas.captureStream(30); // 30 FPS stream
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
            const chunks: Blob[] = [];
            
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `timelapse-${webcamId}-${selectedDate}.webm`;
                a.click();
                URL.revokeObjectURL(url);
                setIsGeneratingVideo(false);
                setGenerationProgress(0);
            };

            recorder.start();

            // Draw frames one by one with delays to unblock UI
            for (let i = 0; i < frames.length; i++) {
                // Allow UI updates every few frames
                if (i % 10 === 0) {
                    setGenerationProgress(Math.round((i / frames.length) * 100));
                    await new Promise(resolve => setTimeout(resolve, 0)); 
                }

                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = frames[i].url;
                await new Promise((resolve) => {
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        // Add watermark
                        ctx.font = "bold 24px sans-serif";
                        ctx.fillStyle = "white";
                        ctx.shadowColor = "black";
                        ctx.shadowBlur = 4;
                        ctx.fillText(frames[i].time, 30, 50);
                        ctx.shadowBlur = 0;
                        resolve(null);
                    };
                    img.onerror = () => {
                        // Skip broken images
                        resolve(null); 
                    }
                });
            }

            recorder.stop();

        } catch (e) {
            console.error("Error generating video", e);
            alert("Error generant el vídeo. Prova-ho en un navegador modern.");
            setIsGeneratingVideo(false);
        }
    };

    if (isLoading && frames.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black/60 text-white">
                <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-blue-400"></i>
                <span className="text-sm font-medium">Carregant Timelapse...</span>
            </div>
        );
    }

    if (error || (frames.length === 0 && !isLoading)) {
         return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black/60 text-white p-4 text-center">
                <i className="ph-bold ph-warning-circle text-3xl mb-2 text-white/50"></i>
                <span className="text-sm">{error || "No hi ha imatges disponibles"}</span>
            </div>
        );
    }

    const currentFrame = frames[currentIndex];

    return (
        <div 
            className="relative w-full h-full bg-black group select-none overflow-hidden"
            onClick={() => setShowControls(!showControls)} // Toggle on mobile tap
        >
            {/* Loading Indicator for current frame */}
            {imageLoading && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                     <i className="ph-bold ph-spinner animate-spin text-2xl text-white/50"></i>
                </div>
            )}

            {/* Main Image Display */}
            <img 
                src={currentFrame?.url} 
                alt={`Timelapse ${currentFrame?.time}`}
                className="w-full h-full object-contain bg-black"
                onLoad={() => setImageLoading(false)}
                onLoadStart={() => setImageLoading(true)}
            />
            
            {/* Generating Video Overlay */}
            {isGeneratingVideo && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                    <i className="ph-bold ph-film-strip animate-spin text-4xl text-blue-500 mb-2"></i>
                    <span className="text-white font-bold">Generant vídeo...</span>
                    <span className="text-blue-400 font-mono mt-2">{generationProgress}%</span>
                    <span className="text-white/60 text-xs mt-1">Si us plau, espera</span>
                </div>
            )}

            {/* Top Bar: Date & Presets */}
            <div className={`absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-black/80 to-transparent flex flex-wrap items-center justify-between gap-2 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <select 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-lg px-2 py-1 text-[10px] sm:text-xs font-medium focus:outline-none hover:bg-white/20 transition-colors"
                    >
                        {dates.map(date => (
                            <option key={date} value={date} className="text-black">{date}</option>
                        ))}
                    </select>
                    
                    <span className="font-mono text-base sm:text-xl font-bold text-white drop-shadow-md">{currentFrame?.time}</span>
                </div>

                <div className="flex bg-black/40 backdrop-blur-md rounded-lg p-0.5 sm:p-1 border border-white/10" onClick={(e) => e.stopPropagation()}>
                    {(['all', 'last3h', 'morning', 'evening'] as TimePreset[]).map(preset => (
                        <button 
                            key={preset}
                            onClick={() => setActivePreset(preset)} 
                            className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-1 rounded transition-colors uppercase font-medium ${activePreset === preset ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
                        >
                            {preset === 'all' ? 'Tot' : preset === 'last3h' ? '3h' : preset === 'morning' ? 'Matí' : 'Tarda'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Controls Overlay (Bottom) */}
            <div className={`absolute inset-x-0 bottom-0 p-3 sm:p-4 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300 flex flex-col gap-2 sm:gap-3 z-20 ${showControls ? 'opacity-100' : 'opacity-0'}`} onClick={(e) => e.stopPropagation()}>
                
                {/* Progress Bar / Scrubber */}
                <div className="relative w-full h-6 flex items-center group/scrubber">
                    <input 
                        type="range" 
                        min="0" 
                        max={Math.max(0, frames.length - 1)} 
                        value={currentIndex}
                        onChange={handleScrub}
                        className="w-full z-20 opacity-0 cursor-pointer h-full absolute inset-0" 
                    />
                    {/* Visual Track */}
                    <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden relative z-10 pointer-events-none group-hover/scrubber:h-1.5 transition-all">
                        <div 
                            className="h-full bg-blue-500 transition-all duration-75 ease-out"
                            style={{ width: `${(currentIndex / Math.max(1, frames.length - 1)) * 100}%` }}
                        ></div>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white text-black hover:bg-blue-400 hover:text-white transition-all shadow-lg"
                        >
                            <i className={`ph-fill ${isPlaying ? 'ph-pause' : 'ph-play'} text-base sm:text-xl`}></i>
                        </button>
                        
                        <button 
                            onClick={handleDownloadVideo}
                            title="Descarregar Vídeo"
                            className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white hover:text-black transition-all backdrop-blur-md"
                        >
                             <i className="ph-bold ph-download-simple text-sm sm:text-lg"></i>
                        </button>
                    </div>

                    <span className="text-[10px] sm:text-xs text-white/50 font-mono hidden sm:inline">
                        {currentIndex + 1} / {frames.length} frames
                    </span>

                    {/* Speed Control */}
                    <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-full px-1 border border-white/10">
                        <button 
                            onClick={() => setPlaybackSpeed(200)} 
                            className={`text-[9px] sm:text-[10px] px-2 py-1 rounded-full ${playbackSpeed === 200 ? 'bg-white text-black' : 'text-white/50'}`}
                        >1x</button>
                        <button 
                            onClick={() => setPlaybackSpeed(100)} 
                            className={`text-[9px] sm:text-[10px] px-2 py-1 rounded-full ${playbackSpeed === 100 ? 'bg-white text-black' : 'text-white/50'}`}
                        >2x</button>
                        <button 
                            onClick={() => setPlaybackSpeed(50)} 
                            className={`text-[9px] sm:text-[10px] px-2 py-1 rounded-full ${playbackSpeed === 50 ? 'bg-white text-black' : 'text-white/50'}`}
                        >4x</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimelapsePlayer;
