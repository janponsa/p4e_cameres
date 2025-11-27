import React, { useState, useEffect } from 'react';
import { Webcam } from '../types';
import { SNAPSHOT_BASE_URL } from '../constants';

interface WebcamCardProps {
    webcam: Webcam;
    isFavorite: boolean;
    onToggleFavorite: (e: React.MouseEvent) => void;
    onClick: () => void;
    isDarkMode: boolean;
}

// Helper per traduir codis WMO a icones i colors
const getWeatherIcon = (code: number, isDay: boolean) => {
    // 0: Clar
    if (code === 0) return { 
        icon: isDay ? 'ph-sun' : 'ph-moon', 
        color: isDay ? 'text-yellow-400' : 'text-blue-200',
        label: isDay ? 'Sol' : 'Serè'
    };
    // 1-3: Ennuvolat
    if (code >= 1 && code <= 3) return { 
        icon: isDay ? 'ph-cloud-sun' : 'ph-cloud-moon', 
        color: 'text-gray-400',
        label: 'Núvols'
    };
    // 45, 48: Boira
    if (code === 45 || code === 48) return { 
        icon: 'ph-cloud-fog', 
        color: 'text-gray-400',
        label: 'Boira'
    };
    // 51-67: Pluja
    if (code >= 51 && code <= 67) return { 
        icon: 'ph-cloud-rain', 
        color: 'text-blue-400',
        label: 'Pluja'
    };
    // 71-77: Neu
    if (code >= 71 && code <= 77) return { 
        icon: 'ph-snowflake', 
        color: 'text-white',
        label: 'Neu'
    };
    // 80-82: Ruixats
    if (code >= 80 && code <= 82) return { 
        icon: 'ph-drop', 
        color: 'text-blue-300',
        label: 'Ruixats'
    };
    // 95-99: Tempesta
    if (code >= 95 && code <= 99) return { 
        icon: 'ph-cloud-lightning', 
        color: 'text-purple-400',
        label: 'Tempesta'
    };
    
    // Default
    return { icon: 'ph-cloud', color: 'text-gray-400', label: 'Variable' };
};

const WebcamCard: React.FC<WebcamCardProps> = ({ webcam, isFavorite, onToggleFavorite, onClick, isDarkMode }) => {
    // Cache buster per evitar imatges velles
    const snapshotUrl = `${SNAPSHOT_BASE_URL}${webcam.id}-mini.jpg?r=${Math.floor(Date.now() / 60000)}`; 
    
    // Estat per la meteo real
    const [weather, setWeather] = useState<{ temp: string, code: number, isDay: boolean, wind: number } | null>(null);

    // Fetch Weather Data
    useEffect(() => {
        if (!webcam.lat || !webcam.lng) return;

        const fetchWeather = async () => {
            try {
                // Fetch simple current weather
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${webcam.lat}&longitude=${webcam.lng}&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto`);
                const data = await res.json();
                
                if (data.current) {
                    setWeather({
                        temp: data.current.temperature_2m.toFixed(1),
                        code: data.current.weather_code,
                        isDay: data.current.is_day === 1,
                        wind: Math.round(data.current.wind_speed_10m)
                    });
                }
            } catch (e) {
                // Silent fail
            }
        };

        fetchWeather();
    }, [webcam.id, webcam.lat, webcam.lng]);

    // Icona del temps
    const weatherInfo = weather ? getWeatherIcon(weather.code, weather.isDay) : { icon: 'ph-thermometer', color: 'text-gray-400', label: '--' };

    // Dynamic Styles based on Theme
    const containerStyle = isDarkMode 
        ? "bg-black/20 hover:bg-black/30 border-white/10" 
        : "bg-white border-gray-200 shadow-sm hover:shadow-md";

    const titleColor = isDarkMode ? "text-gray-100" : "text-gray-900";
    const subtitleColor = isDarkMode ? "text-gray-400" : "text-gray-600";
    const infoColor = isDarkMode ? "text-gray-300" : "text-gray-700";
    const badgeBg = isDarkMode ? "bg-white/10 border-white/5" : "bg-gray-100 border-gray-200";
    const mountainIconColor = isDarkMode ? "text-gray-500" : "text-gray-400";

    return (
        <div 
            onClick={onClick}
            className={`group relative ${containerStyle} backdrop-blur-md border rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 sm:hover:shadow-2xl sm:hover:-translate-y-1 flex flex-row sm:flex-col h-28 sm:h-56 w-full`}
        >
            {/* --- MOBILE LIST VIEW (LEFT IMAGE) --- */}
            <div className="relative w-36 min-w-[144px] sm:w-full h-full sm:h-full sm:aspect-auto overflow-hidden bg-black/50">
                <img 
                    src={snapshotUrl} 
                    alt={webcam.name} 
                    className="w-full h-full object-cover transition-transform duration-700 sm:group-hover:scale-110 opacity-90 sm:group-hover:opacity-100"
                    loading="lazy"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/600x400/222/999?text=Offline';
                    }}
                />
                
                {/* Desktop Gradient Overlay (Hidden on Mobile) */}
                <div className="hidden sm:block absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-60 sm:opacity-80"></div>

                {/* Badge Directe - NO NUMBERS */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-black/60 border border-white/10 backdrop-blur-sm shadow-sm">
                     <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                     <span className="text-[9px] font-bold text-white uppercase tracking-wider">
                        Directe
                    </span>
                </div>

                {/* Favorite Button (Absolute for both layouts) */}
                <button 
                    onClick={onToggleFavorite}
                    className="absolute top-1 right-1 sm:top-2 sm:right-2 z-20 p-1.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white/70 hover:text-yellow-400 transition-colors"
                >
                    <i className={`ph-fill ${isFavorite ? 'ph-star text-yellow-400' : 'ph-star'}`}></i>
                </button>

                 {/* Play Icon (Desktop Hover) */}
                 <div className="hidden sm:flex absolute inset-0 z-[5] items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                    <div className="bg-white/20 backdrop-blur-md p-3 rounded-full border border-white/30">
                        <i className="ph-fill ph-play text-3xl text-white"></i>
                    </div>
                </div>
            </div>

            {/* --- CONTENT AREA --- */}
            
            {/* MOBILE CONTENT (RIGHT SIDE LIST) */}
            <div className="sm:hidden flex-1 p-3 flex flex-col justify-center min-w-0">
                 <h3 className={`font-bold text-sm ${titleColor} truncate leading-tight mb-1`}>
                    {webcam.name}
                 </h3>
                 <p className={`text-xs ${subtitleColor} truncate mb-2`}>{webcam.region}</p>
                 
                 <div className={`flex items-center gap-2 text-xs ${infoColor} mt-auto`}>
                    {weather ? (
                        <>
                            <span className={`flex items-center gap-1.5 ${badgeBg} border px-1.5 py-1 rounded`}>
                                <i className={`ph-fill ${weatherInfo.icon} ${weatherInfo.color} text-sm`}></i>
                                <span className="font-bold">{weather.temp}°</span>
                            </span>
                             <span className={`flex items-center gap-1 ${badgeBg} border px-1.5 py-1 rounded`}>
                                <i className="ph-fill ph-wind text-blue-300"></i>
                                <span>{weather.wind}</span>
                            </span>
                        </>
                    ) : (
                         <span className={`flex items-center gap-1 ${badgeBg} border px-1.5 py-1 rounded opacity-50`}>
                            <i className="ph-bold ph-spinner animate-spin"></i>
                        </span>
                    )}
                </div>
            </div>

            {/* DESKTOP CONTENT (OVERLAY - Always White Text on Dark Gradient) */}
            <div className="hidden sm:flex absolute bottom-0 inset-x-0 p-4 z-10 flex-col justify-end h-full pointer-events-none">
                <div className="flex justify-between items-end">
                    <div className="min-w-0 pr-2">
                        <h3 className="font-bold text-base text-white truncate leading-tight shadow-black drop-shadow-md">
                            {webcam.name}
                        </h3>
                        <p className="text-xs text-white/70 truncate mt-0.5 font-medium">{webcam.region}</p>
                    </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-white/80 border-t border-white/10 pt-2 font-medium">
                    <div className="flex items-center gap-3">
                         {weather ? (
                            <>
                                <span className="flex items-center gap-1.5" title={weatherInfo.label}>
                                    <i className={`ph-fill ${weatherInfo.icon} ${weatherInfo.color} text-base drop-shadow-sm`}></i>
                                    <span className="font-bold text-sm">{weather.temp}°</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <i className="ph-fill ph-wind text-white/60"></i>
                                    <span>{weather.wind} km/h</span>
                                </span>
                            </>
                         ) : (
                            <span className="flex items-center gap-1 opacity-50">
                                <i className="ph-bold ph-spinner animate-spin"></i> Carregant...
                            </span>
                         )}
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <i className={`ph-fill ph-mountain ${mountainIconColor}`}></i>
                        <span>{webcam.altitude}m</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WebcamCard;