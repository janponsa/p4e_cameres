
import React, { useState, useEffect } from 'react';
import { Webcam, WeatherData } from '../types';
import VideoPlayer from './VideoPlayer';
import TimelapsePlayer from './TimelapsePlayer';
import { SNAPSHOT_BASE_URL } from '../constants';

interface DetailViewProps {
    webcam: Webcam;
    onBack: () => void;
    timeOfDay: 'morning' | 'day' | 'evening' | 'night';
    isDarkMode: boolean;
}

export const DetailView: React.FC<DetailViewProps> = ({ webcam, onBack, timeOfDay, isDarkMode }) => {
    const [activeTab, setActiveTab] = useState<'live' | 'timelapse'>('live');
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);
    
    const snapshotUrl = `${SNAPSHOT_BASE_URL}${webcam.id}-mini.jpg?r=${Math.floor(Date.now() / 60000)}`;

    // FETCH REAL WEATHER FROM OPEN-METEO
    useEffect(() => {
        const fetchWeather = async () => {
            if (!webcam.lat || !webcam.lng) {
                // Fallback si no hi ha coordenades
                setWeather({
                    temp: (Math.random() * 15 - 2).toFixed(1),
                    humidity: Math.floor(Math.random() * 40 + 40),
                    wind: Math.floor(Math.random() * 30),
                    pressure: 1013 + Math.floor(Math.random() * 10),
                    isReal: false
                });
                return;
            }

            setIsWeatherLoading(true);
            try {
                // Fetch from Open-Meteo API (Free, no key needed)
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${webcam.lat}&longitude=${webcam.lng}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m`);
                const data = await res.json();
                
                if (data.current) {
                    setWeather({
                        temp: data.current.temperature_2m.toFixed(1),
                        humidity: data.current.relative_humidity_2m,
                        wind: Math.round(data.current.wind_speed_10m),
                        pressure: Math.round(data.current.surface_pressure),
                        isReal: true
                    });
                }
            } catch (error) {
                console.error("Error fetching weather:", error);
                // Fallback en cas d'error
                setWeather({
                    temp: "--",
                    humidity: 0,
                    wind: 0,
                    pressure: 0,
                    isReal: false
                });
            } finally {
                setIsWeatherLoading(false);
            }
        };

        fetchWeather();
    }, [webcam.id, webcam.lat, webcam.lng]);

    // SHARE FUNCTION
    const handleShare = async () => {
        const url = window.location.href; // O una URL custom si féssim routing real
        const text = `Mira aquesta vista de ${webcam.name} a P4E Nexus!`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Projecte 4 Estacions',
                    text: text,
                    url: url,
                });
            } catch (err) {
                console.log('Error compartint', err);
            }
        } else {
            // Fallback escriptori
            navigator.clipboard.writeText(url);
            alert("Enllaç copiat al porta-retalls!");
        }
    };

    // DYNAMIC STYLES
    const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
    const textSecondary = isDarkMode ? 'text-white/80' : 'text-gray-600';
    const textMuted = isDarkMode ? 'text-white/50' : 'text-gray-500';

    const btnBackClass = isDarkMode
        ? 'text-white/90 hover:text-white bg-black/30 hover:bg-black/50 border border-white/10'
        : 'text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 shadow-sm';

    const btnShareClass = isDarkMode
        ? 'text-white/90 hover:text-white hover:bg-white/10'
        : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50';

    const segmentContainerClass = isDarkMode
        ? 'bg-black/30 border border-white/10'
        : 'bg-gray-100 border border-gray-200';
    
    const segmentActive = isDarkMode
        ? 'bg-white text-black shadow-sm'
        : 'bg-white text-gray-900 shadow-sm border border-gray-200';
    
    const segmentInactive = isDarkMode
        ? 'text-white/70 hover:text-white hover:bg-white/5'
        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50';

    const panelClass = isDarkMode
        ? 'bg-black/40 border border-white/10 backdrop-blur-xl shadow-lg'
        : 'bg-white border border-gray-200 shadow-lg';

    const gridItemClass = isDarkMode
        ? 'bg-white/5 hover:bg-white/10'
        : 'bg-gray-50 hover:bg-gray-100 border border-gray-100';

    const labelClass = isDarkMode ? 'text-white/50' : 'text-gray-500';

    return (
        <div className="animate-fade-in w-full flex flex-col items-start pb-10">
            {/* Header / Nav */}
            <div className="w-full flex flex-col gap-4 mb-6">
                {/* Row 1: Back, Share & Controls */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={onBack}
                            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md transition-colors ${btnBackClass}`}
                        >
                            <i className="ph-bold ph-arrow-left text-xs group-hover:-translate-x-0.5 transition-transform"></i>
                            <span className="font-medium text-xs">Tornar</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                         {/* Share Button */}
                         <button 
                            onClick={handleShare}
                            className={`p-2 rounded-full transition-colors ${btnShareClass}`}
                            title="Compartir"
                        >
                            <i className="ph-bold ph-share-network text-lg"></i>
                        </button>

                        {/* Segmented Control */}
                        <div className={`p-1 rounded-lg inline-flex backdrop-blur-md shadow-sm ${segmentContainerClass}`}>
                            <button 
                                onClick={() => setActiveTab('live')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ${activeTab === 'live' ? segmentActive : segmentInactive}`}
                            >
                                Directe
                            </button>
                            <button 
                                onClick={() => setActiveTab('timelapse')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ${activeTab === 'timelapse' ? segmentActive : segmentInactive}`}
                            >
                                Timelapse
                            </button>
                        </div>
                    </div>
                </div>

                {/* Row 2: Title & Info */}
                <div className="flex flex-col gap-1">
                    <h1 className={`text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight drop-shadow-sm leading-none ${textPrimary}`}>
                        {webcam.name}
                    </h1>
                    <div className={`flex items-center gap-2 text-xs sm:text-sm font-medium ${textSecondary}`}>
                        <span>{webcam.region}</span>
                        <span className="text-white/30">•</span>
                        <span>{webcam.altitude}m</span>
                    </div>
                </div>
            </div>

            {/* Layout Fluid */}
            <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
                
                {/* Main Media Area - NO h-full to allow aspect ratio to dictate height */}
                <div className="flex-1 w-full min-w-0">
                     <div className="w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl relative group bg-black ring-1 ring-white/10">
                        {activeTab === 'live' ? (
                            <VideoPlayer 
                                streamUrl={webcam.streamUrl} 
                                poster={snapshotUrl} 
                                timeOfDay={timeOfDay}
                                webcamId={webcam.id}
                            />
                        ) : (
                            <TimelapsePlayer webcamId={webcam.id} />
                        )}
                    </div>
                </div>

                {/* Sidebar Info Panel */}
                <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0">
                    
                    {/* WEATHER GRID WIDGET */}
                    <div className={`p-5 rounded-2xl ${panelClass}`}>
                        <div className={`flex items-center justify-between mb-4 pb-2 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-100'}`}>
                            <h3 className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>
                                Temps Actual
                            </h3>
                            {weather?.isReal ? (
                                <span className="text-[10px] flex items-center gap-1 font-medium text-green-500">
                                    <i className="ph-bold ph-check-circle"></i> OPEN-METEO
                                </span>
                            ) : (
                                <span className={`text-[10px] flex items-center gap-1 font-medium ${textMuted}`}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                                    SIMULAT
                                </span>
                            )}
                        </div>
                        
                        {isWeatherLoading ? (
                            <div className="h-44 flex items-center justify-center">
                                <i className={`ph-bold ph-spinner animate-spin text-2xl ${textMuted}`}></i>
                            </div>
                        ) : weather ? (
                            <div className="grid grid-cols-2 gap-3">
                                {/* Temp */}
                                <div className={`rounded-xl p-3 flex flex-col justify-between h-20 relative overflow-hidden ${gridItemClass}`}>
                                    <div className="flex items-center gap-1.5 z-10">
                                        <i className="ph-fill ph-thermometer-simple text-orange-400 text-sm"></i>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${labelClass}`}>Temp</span>
                                    </div>
                                    <span className={`text-2xl font-bold tracking-tight z-10 ${textPrimary}`}>{weather.temp}°</span>
                                </div>

                                {/* Wind */}
                                <div className={`rounded-xl p-3 flex flex-col justify-between h-20 relative overflow-hidden ${gridItemClass}`}>
                                    <div className="flex items-center gap-1.5 z-10">
                                        <i className="ph-fill ph-wind text-blue-400 text-sm"></i>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${labelClass}`}>Vent</span>
                                    </div>
                                    <div className="flex items-baseline gap-0.5 z-10">
                                        <span className={`text-2xl font-bold tracking-tight ${textPrimary}`}>{weather.wind}</span>
                                        <span className={`text-[10px] font-medium uppercase ${textMuted} ml-1`}>km/h</span>
                                    </div>
                                </div>

                                {/* Humidity */}
                                <div className={`rounded-xl p-3 flex flex-col justify-between h-20 relative overflow-hidden ${gridItemClass}`}>
                                    <div className="flex items-center gap-1.5 z-10">
                                        <i className="ph-fill ph-drop text-blue-300 text-sm"></i>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${labelClass}`}>Humitat</span>
                                    </div>
                                    <span className={`text-2xl font-bold tracking-tight z-10 ${textPrimary}`}>{weather.humidity}<span className="text-sm">%</span></span>
                                </div>

                                {/* Pressure */}
                                <div className={`rounded-xl p-3 flex flex-col justify-between h-20 relative overflow-hidden ${gridItemClass}`}>
                                    <div className="flex items-center gap-1.5 z-10">
                                        <i className="ph-fill ph-gauge text-purple-400 text-sm"></i>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${labelClass}`}>Pressió</span>
                                    </div>
                                    <div className="flex items-baseline gap-0.5 z-10">
                                        <span className={`text-lg font-bold tracking-tight ${textPrimary}`}>{weather.pressure}</span>
                                        <span className={`text-[10px] font-medium uppercase ${textMuted} ml-1`}>hPa</span>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* About Widget */}
                    <div className={`p-5 rounded-2xl flex-1 ${panelClass}`}>
                        <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${textSecondary}`}>Informació</h3>
                        <p className={`text-sm leading-relaxed font-light ${isDarkMode ? 'text-white/70' : 'text-gray-600'}`}>
                            {webcam.description}
                        </p>
                    </div>

                    {/* Viewers Widget */}
                     <div className={`p-4 rounded-2xl flex items-center justify-between ${panelClass}`}>
                         <div className="flex items-center gap-2">
                            <i className={`ph-bold ph-users ${textMuted}`}></i>
                            <span className={`text-sm font-medium ${textSecondary}`}>Espectadors</span>
                         </div>
                         <span className="flex items-center gap-2 font-mono font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-lg border border-green-400/20">
                             <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                             </span>
                             {webcam.clients || 0}
                         </span>
                     </div>
                </div>
            </div>
        </div>
    );
};
