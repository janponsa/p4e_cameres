
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
    
    // Estats del reproductor
    const [isLoading, setIsLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hlsRef = useRef<Hls | null>(null);

    // Determine logo based on time of day
    const isDarkTime = timeOfDay === 'night' || timeOfDay === 'evening';
    const logoUrl = isDarkTime 
        ? "https://app.projecte4estacions.com/images/logo_p4e_2023_h_blanc_200.png"
        : "https://app.projecte4estacions.com/images/logo_p4e_2023_h_blau_200.png";

    // Check if camera is Vielha to force object-fill
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
        };
    }, [streamUrl]);

    // Custom Controls Logic
    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play();
            setIsPlaying(true);
        }
    };

    const toggleFullscreen = () => {
        const video = videoRef.current;
        const container = containerRef.current;

        if (!video) return;

        // iOS Support
        if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
            return;
        }

        // Standard Support
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

    const takeSnapshot = () => {
        if (!videoRef.current) return;
        try {
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg');
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = `p4e-snapshot-${Date.now()}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (e) {
            alert("No s'ha pogut capturar la imatge.");
        }
    };

    return (
        <div ref={containerRef} className="relative w-full h-full bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/10 group/video select-none aspect-video">
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                    <div className="flex flex-col items-center gap-2">
                         <i className="ph-bold ph-spinner animate-spin text-4xl text-blue-500"></i>
                         <span className="text-white/60 text-sm font-medium">Connectant...</span>
                    </div>
                </div>
            )}
            
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 p-4 text-center">
                    <i className="ph-bold ph-warning-circle text-4xl text-red-500 mb-2"></i>
                    <p className="text-gray-300 font-medium">{error}</p>
                    {poster && <p className="text-xs text-gray-500 mt-2">Mostrant última imatge estàtica</p>}
                </div>
            )}

            {/* Logo - Always visible overlay */}
            <img 
                src={logoUrl} 
                alt="P4E Logo" 
                className="absolute top-4 left-4 z-30 w-16 sm:w-28 drop-shadow-lg opacity-80 pointer-events-none"
            />

            {/* LIVE Badge */}
            {!error && !isLoading && (
                <div className="absolute top-4 right-4 z-30 bg-red-600/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5 shadow-lg">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                    DIRECTE
                </div>
            )}

            <video 
                ref={videoRef}
                /* CANVI CLAU: object-cover per defecte (immersiu), object-fill només per a Vielha */
                className={`w-full h-full bg-black ${error ? 'hidden' : 'block'} ${isVielha ? 'object-fill' : 'object-cover'}`}
                playsInline
                muted={true}
                autoPlay
                poster={poster}
                crossOrigin="anonymous"
                onClick={togglePlay}
            />

            {/* Custom Control Bar (Visible on Hover) */}
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover/video:opacity-100 transition-opacity duration-300 flex items-center justify-between z-30">
                <div className="flex items-center gap-4">
                    <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors">
                        <i className={`ph-fill text-2xl ${isPlaying ? 'ph-pause' : 'ph-play'}`}></i>
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={takeSnapshot} 
                        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors backdrop-blur-md border border-white/10"
                    >
                        <i className="ph-bold ph-camera text-lg"></i>
                        <span className="hidden sm:inline">Capturar</span>
                    </button>
                    
                    <button onClick={toggleFullscreen} className="text-white hover:text-blue-400 transition-colors ml-2">
                        <i className={`ph-bold text-xl ${isFullscreen ? 'ph-corners-in' : 'ph-corners-out'}`}></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Add webkitEnterFullscreen definition for TypeScript
declare global {
    interface HTMLVideoElement {
      webkitEnterFullscreen?: () => void;
    }
}

export default VideoPlayer;
