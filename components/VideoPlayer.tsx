
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface VideoPlayerProps {
    streamUrl: string;
    poster?: string;
    timeOfDay: 'morning' | 'day' | 'evening' | 'night';
    webcamId?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ streamUrl, poster, timeOfDay, webcamId }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    
    // Estats del reproductor
    const [isLoading, setIsLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Controls Visibility (Tap to Hide)
    const [showControls, setShowControls] = useState(true);

    const hlsRef = useRef<Hls | null>(null);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const isRecordingRef = useRef(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<number | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const isVielha = webcamId === 'vielha';

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        let currentHls: Hls | null = null;
        
        const urlWithCacheBust = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}r=${Date.now()}`;

        const handleMediaError = () => {
             setError("Stream offline");
             setIsLoading(false);
        };

        if (Hls.isSupported() && videoRef.current) {
            currentHls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });
            hlsRef.current = currentHls;

            currentHls.loadSource(urlWithCacheBust);
            currentHls.attachMedia(videoRef.current);

            currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
                const playPromise = videoRef.current?.play();
                if (playPromise !== undefined) {
                    playPromise
                    .then(() => setIsPlaying(true))
                    .catch(() => {
                        console.log("Autoplay prevented");
                        setIsPlaying(false);
                    });
                }
                setIsLoading(false);
            });

            currentHls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            currentHls?.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            currentHls?.recoverMediaError();
                            break;
                        default:
                            currentHls?.destroy();
                            handleMediaError();
                            break;
                    }
                }
            });
        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current.src = urlWithCacheBust;
            videoRef.current.addEventListener('loadedmetadata', () => {
                videoRef.current?.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
                setIsLoading(false);
            });
            videoRef.current.addEventListener('error', handleMediaError);
        } else {
            setError("Format no suportat");
            setIsLoading(false);
        }

        return () => {
            if (currentHls) {
                currentHls.destroy();
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            stopRecording();
        };
    }, [streamUrl]);

    // Handle Tap on Video Container
    const handleContainerClick = (e: React.MouseEvent) => {
        // Toggle controls visibility
        setShowControls(prev => !prev);
    };

    // Custom Controls Logic
    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent toggling UI
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play();
            setIsPlaying(true);
        }
    };

    const toggleFullscreen = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent toggling UI
        const video = videoRef.current;
        const container = containerRef.current;

        if (!video) return;

        if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
            return;
        }

        if (container) {
            if (!document.fullscreenElement) {
                container.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable fullscreen: ${err.message}`);
                });
                setIsFullscreen(true);
            } else {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    // --- WATERMARK DRAWING FUNCTION (TEXT ONLY) ---
    const drawWatermark = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
        const text = "© Projecte 4 Estacions";
        const fontSize = Math.max(10, width * 0.015);
        const padding = 15;

        ctx.font = `500 ${fontSize}px "Inter", sans-serif`;
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';

        const x = padding;
        const y = height - padding;

        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillText(text, x, y);

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    };

    const takeSnapshot = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!videoRef.current) return;
        try {
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                drawWatermark(ctx, canvas.width, canvas.height);
                triggerDownload(canvas.toDataURL('image/jpeg', 0.9), `p4e-snapshot-${Date.now()}.jpg`);
            }
        } catch (e) {
            console.error(e);
            alert("No s'ha pogut capturar la imatge.");
        }
    };

    const triggerDownload = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // RECORDING LOGIC
    const toggleRecording = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const startRecording = () => {
        if (!videoRef.current) return;
        
        try {
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) throw new Error("Canvas context failed");
            canvasRef.current = canvas;

            setIsRecording(true);
            isRecordingRef.current = true;

            const drawFrame = () => {
                if (!canvasRef.current) return;
                
                if (ctx && video && !video.paused && !video.ended) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    drawWatermark(ctx, canvas.width, canvas.height);
                }
                
                if (isRecordingRef.current) {
                    animationFrameRef.current = requestAnimationFrame(drawFrame);
                }
            };
            
            animationFrameRef.current = requestAnimationFrame(drawFrame);

            let mimeType = 'video/webm';
            if (MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4';
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9';
            }

            const stream = canvas.captureStream(30);
            const mediaRecorder = new MediaRecorder(stream, { 
                mimeType,
                videoBitsPerSecond: 2500000 
            });
            
            mediaRecorderRef.current = mediaRecorder;
            recordedChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                triggerDownload(url, `p4e-recording-${Date.now()}.${ext}`);
                URL.revokeObjectURL(url);
                
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
                canvasRef.current = null;
            };

            mediaRecorder.start();
            setRecordingTime(0);
            
            recordingTimerRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (e) {
            console.error("Recording error:", e);
            alert("El navegador no permet gravar aquest stream.");
            setIsRecording(false);
            isRecordingRef.current = false;
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecordingRef.current) {
            setIsRecording(false);
            isRecordingRef.current = false;
            mediaRecorderRef.current.stop();
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div 
            ref={containerRef} 
            className="relative w-full h-full bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/10 group/video select-none aspect-video cursor-pointer"
            onClick={handleContainerClick}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20 pointer-events-none">
                    <div className="flex flex-col items-center gap-2">
                         <i className="ph-bold ph-spinner animate-spin text-4xl text-blue-500"></i>
                         <span className="text-white/60 text-sm font-medium">Connectant...</span>
                    </div>
                </div>
            )}
            
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 p-4 text-center pointer-events-none">
                    <i className="ph-bold ph-warning-circle text-4xl text-red-500 mb-2"></i>
                    <p className="text-gray-300 font-medium">{error}</p>
                    {poster && <p className="text-xs text-gray-500 mt-2">Mostrant última imatge estàtica</p>}
                </div>
            )}

            {/* LIVE/REC BADGE */}
            <div className={`absolute top-4 right-4 z-30 flex flex-col items-end gap-2 transition-opacity duration-300 ${showControls || isRecording || isLoading || error ? 'opacity-100' : 'opacity-0'}`}>
                {!error && !isLoading && !isRecording && (
                    <div className="bg-red-600/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5 shadow-lg">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                        DIRECTE
                    </div>
                )}
                
                {isRecording && (
                    <div className="bg-white/90 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1.5 shadow-lg animate-pulse border border-red-500">
                        <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                        REC {formatTime(recordingTime)}
                    </div>
                )}
            </div>

            <video 
                ref={videoRef}
                className={`w-full h-full bg-black ${error ? 'hidden' : 'block'} ${isVielha ? 'object-fill' : 'object-cover'}`}
                playsInline
                muted={true}
                autoPlay
                poster={poster}
                crossOrigin="anonymous"
            />

            {/* Bottom Controls */}
            <div className={`absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between z-30 transition-all duration-300 
                ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
            `}>
                <div className="flex items-center gap-4">
                    <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors">
                        <i className={`ph-fill text-3xl ${isPlaying ? 'ph-pause' : 'ph-play'}`}></i>
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {/* Buttons Grouped: Snapshot + Rec */}
                    <div className="flex items-center bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/10">
                        <button 
                            onClick={takeSnapshot} 
                            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors"
                            title="Capturar Foto"
                        >
                            <i className="ph-bold ph-camera text-xl"></i>
                        </button>

                        <div className="w-px h-4 bg-white/20 mx-1"></div>

                        <button 
                            onClick={toggleRecording} 
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-white text-red-600' : 'hover:bg-white/20 text-white'}`}
                            title={isRecording ? "Aturar Gravació" : "Gravar Clip"}
                        >
                            {isRecording ? (
                                <div className="w-3 h-3 bg-red-600 rounded-sm"></div>
                            ) : (
                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                            )}
                        </button>
                    </div>
                    
                    <button onClick={toggleFullscreen} className="text-white hover:text-blue-400 transition-colors ml-2">
                        <i className={`ph-bold text-2xl ${isFullscreen ? 'ph-corners-in' : 'ph-corners-out'}`}></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

declare global {
    interface HTMLVideoElement {
      webkitEnterFullscreen?: () => void;
    }
}

export default VideoPlayer;
