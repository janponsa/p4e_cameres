import React, { useState, useEffect } from 'react';
import { Webcam } from '../types';
import { SNAPSHOT_BASE_URL } from '../constants';

// --- API KEYS ---
const WG_API_KEY = "e1f10a1e78da46f5b10a1e78da96f525";

interface WebcamCardProps {
    webcam: Webcam;
    onClick: () => void;
    isDarkMode: boolean;
    mobileViewMode: 'list' | 'grid';
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

// Helpers conversió
const fToC = (f: number) => (f - 32) * 5/9;
const mphToKmh = (m: number) => m * 1.60934;

const WebcamCard: React.FC<WebcamCardProps> = ({ webcam, onClick, isDarkMode, mobileViewMode }) => {
    const snapshotUrl = `${SNAPSHOT_BASE_URL}${webcam.id}-mini.jpg?r=${Math.floor(Date.now() / 60000)}`; 
    
    // Hybrid Weather State
    const [weather, setWeather] = useState<{ temp: string, code: number, isDay: boolean, wind: number } | null>(null);

    useEffect(() => {
        if (!webcam.lat || !webcam.lng) return;

        const fetchHybridWeather = async () => {
            try {
                // 1. Always fetch Open-Meteo for Icon (Code + IsDay)
                const omPromise = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${webcam.lat}&longitude=${webcam.lng}&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto`)
                    .then(res => res.json())
                    .catch(() => null);

                // 2. Conditionally fetch Real Station for Temp/Wind
                let realPromise = Promise.resolve(null);

                if (webcam.meteoStationType && webcam.meteoStationId) {
                    if (webcam.meteoStationType === 'meteocat') {
                        const now = new Date();
                        const twoHoursAgo = new Date(now.getTime() - (120 * 60 * 1000));
                        const fmt = (d: Date) => d.toISOString().split('.')[0];
                        const query = `SELECT codi_variable, valor_lectura WHERE codi_estacio='${webcam.meteoStationId}' AND data_lectura >= '${fmt(twoHoursAgo)}' AND codi_variable IN ('32', '56') ORDER BY data_lectura DESC LIMIT 5`;
                        realPromise = fetch(`https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json?$query=${encodeURIComponent(query)}`)
                            .then(res => res.json())
                            .catch(() => null);
                    } else if (webcam.meteoStationType === 'wunderground') {
                        realPromise = fetch(`https://api.weather.com/v2/pws/observations/current?stationId=${webcam.meteoStationId}&format=json&units=m&numericPrecision=decimal&apiKey=${WG_API_KEY}`)
                            .then(res => res.json())
                            .catch(() => null);
                    } else if (webcam.meteoStationType === 'weatherlink') {
                        realPromise = fetch(`https://www.weatherlink.com/map/data/station/${webcam.meteoStationId}?aqiSchemeId=10&woodsmokeEnabled=false`)
                            .then(res => res.json())
                            .catch(() => null);
                    }
                }

                // Wait for both
                const [omData, realData] = await Promise.all([omPromise, realPromise]);

                if (omData && omData.current) {
                    // Default values from OpenMeteo
                    let temp = omData.current.temperature_2m.toFixed(1);
                    let wind = Math.round(omData.current.wind_speed_10m);
                    const code = omData.current.weather_code;
                    const isDay = omData.current.is_day === 1;

                    // Override with Real Data if available
                    if (realData) {
                        if (webcam.meteoStationType === 'meteocat' && Array.isArray(realData)) {
                            const tObj = realData.find((d: any) => d.codi_variable === '32');
                            const wObj = realData.find((d: any) => d.codi_variable === '56');
                            if (tObj) temp = parseFloat(tObj.valor_lectura).toFixed(1);
                            if (wObj) wind = Math.round(parseFloat(wObj.valor_lectura) * 3.6);
                        } else if (webcam.meteoStationType === 'wunderground' && realData.observations?.[0]) {
                            const obs = realData.observations[0];
                            temp = obs.metric.temp.toFixed(1);
                            wind = Math.round(obs.metric.windGust || obs.metric.windSpeed);
                        } else if (webcam.meteoStationType === 'weatherlink' && realData) {
                            if (realData.temperature) temp = fToC(realData.temperature).toFixed(1);
                            if (realData.windGust) wind = Math.round(mphToKmh(realData.windGust));
                            else if (realData.windSpeed) wind = Math.round(mphToKmh(realData.windSpeed));
                        }
                    }

                    setWeather({ temp, code, isDay, wind });
                }

            } catch (e) {
                // Silent fail
            }
        };

        fetchHybridWeather();
    }, [webcam]);

    // Icona del temps
    const weatherInfo = weather ? getWeatherIcon(weather.code, weather.isDay) : { icon: 'ph-thermometer', color: 'text-gray-400', label: '--' };

    // Dynamic Styles based on Theme
    const containerStyle = isDarkMode 
        ? "bg-black/20 hover:bg-black/30 border-white/10" 
        : "bg-white border-gray-200 shadow-sm hover:shadow-md";

    const titleColor = isDarkMode ? "text-gray-100" : "text-gray-900";
    const subtitleColor = isDarkMode ? "text-gray-400" : "text-gray-500";
    const infoColor = isDarkMode ? "text-gray-300" : "text-gray-600";
    const mountainIconColor = isDarkMode ? "text-gray-500" : "text-gray-400";

    const isMobileGrid = mobileViewMode === 'grid';
    
    // exact layout provided by user
    const layoutClasses = isMobileGrid 
        ? "flex-col aspect-[16/10] sm:aspect-auto sm:h-56" 
        : "flex-row h-20 sm:flex-col sm:h-56"; 

    return (
        <div 
            onClick={onClick}
            className={`group relative ${containerStyle} backdrop-blur-md border rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 sm:hover:shadow-2xl sm:hover:-translate-y-1 flex w-full ${layoutClasses}`}
        >
            {/* --- IMAGE CONTAINER --- */}
            <div className={`relative overflow-hidden bg-black/50
                ${isMobileGrid ? "w-full h-full" : "w-28 min-w-[112px] h-full sm:w-full sm:h-full"}
            `}>
                <img 
                    src={snapshotUrl} 
                    alt={webcam.name} 
                    className="w-full h-full object-cover transition-transform duration-700 sm:group-hover:scale-110 opacity-90 sm:group-hover:opacity-100"
                    loading="lazy"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/600x400/222/999?text=Offline';
                    }}
                />
                
                <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-60 sm:opacity-80
                    ${isMobileGrid ? 'block' : 'hidden sm:block'}
                `}></div>

                <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 z-10 flex items-center gap-1 sm:gap-1.5 px-1 sm:px-1.5 py-0.5 rounded bg-black/60 border border-white/10 backdrop-blur-sm shadow-sm">
                     <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                     <span className="text-[7px] sm:text-[9px] font-bold text-white uppercase tracking-wider">
                        Live
                    </span>
                </div>

                 <div className="hidden sm:flex absolute inset-0 z-[5] items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                    <div className="bg-white/20 backdrop-blur-md p-3 rounded-full border border-white/30">
                        <i className="ph-fill ph-play text-3xl text-white"></i>
                    </div>
                </div>
            </div>

            {/* --- MOBILE LIST CONTENT (SIDE TEXT) --- */}
            {!isMobileGrid && (
                <div className="sm:hidden flex-1 px-3 py-2 flex flex-col justify-center min-w-0 relative">
                     <div className="flex flex-col gap-0 mb-0.5">
                        <h3 className={`font-bold text-[13px] leading-tight truncate ${titleColor}`}>
                            {webcam.name}
                        </h3>
                        <p className={`text-[11px] ${subtitleColor} truncate`}>{webcam.region}</p>
                     </div>
                     
                     <div className={`flex items-center gap-3 ${infoColor} mt-auto font-medium text-xs`}>
                        {weather ? (
                            <>
                                <span className="flex items-center gap-1">
                                    <i className={`ph-fill ${weatherInfo.icon} ${weatherInfo.color}`}></i>
                                    <span>{weather.temp}°</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <i className="ph-fill ph-wind text-blue-300"></i>
                                    <span>{weather.wind} km/h</span>
                                </span>
                            </>
                        ) : (
                             <span className="flex items-center gap-1 opacity-50">
                                <i className="ph-bold ph-spinner animate-spin"></i>
                            </span>
                        )}
                        <span className="flex items-center gap-1 ml-auto opacity-70 text-[10px]">
                            <i className="ph-fill ph-mountain"></i> {webcam.altitude}m
                        </span>
                    </div>
                </div>
            )}

            {/* --- OVERLAY CONTENT (DESKTOP OR MOBILE GRID) --- */}
            <div className={`absolute bottom-0 inset-x-0 p-3 sm:p-4 z-10 flex-col justify-end h-full pointer-events-none
                ${isMobileGrid ? 'flex' : 'hidden sm:flex'}
            `}>
                <div className="flex justify-between items-end">
                    <div className="min-w-0 pr-1">
                        <h3 className={`font-bold text-white truncate leading-tight shadow-black drop-shadow-md ${isMobileGrid ? 'text-[11px]' : 'text-base'}`}>
                            {webcam.name}
                        </h3>
                        <p className={`text-white/70 truncate mt-0.5 font-medium ${isMobileGrid ? 'text-[9px]' : 'text-xs'}`}>{webcam.region}</p>
                    </div>
                </div>

                <div className={`mt-1.5 sm:mt-2 flex items-center justify-between text-white/80 border-t border-white/10 pt-1.5 sm:pt-2 font-medium ${isMobileGrid ? 'text-[10px]' : 'text-xs'}`}>
                    <div className="flex items-center gap-2 sm:gap-3">
                         {weather ? (
                            <>
                                <span className="flex items-center gap-1" title={weatherInfo.label}>
                                    <i className={`ph-fill ${weatherInfo.icon} ${weatherInfo.color} ${isMobileGrid ? 'text-xs' : 'text-base'} drop-shadow-sm`}></i>
                                    <span className={`font-bold ${isMobileGrid ? 'text-xs' : 'text-sm'}`}>{weather.temp}°</span>
                                </span>
                                {!isMobileGrid && (
                                    <span className="flex items-center gap-1">
                                        <i className="ph-fill ph-wind text-white/60"></i>
                                        <span>{weather.wind} km/h</span>
                                    </span>
                                )}
                            </>
                         ) : (
                            <span className="flex items-center gap-1 opacity-50">
                                <i className="ph-bold ph-spinner animate-spin"></i>
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