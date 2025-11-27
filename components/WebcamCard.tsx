import React from 'react';
import { Webcam } from '../types';
import { SNAPSHOT_BASE_URL } from '../constants';

interface WebcamCardProps {
    webcam: Webcam;
    isFavorite: boolean;
    onToggleFavorite: (e: React.MouseEvent) => void;
    onClick: () => void;
    isDarkMode: boolean;
}

const WebcamCard: React.FC<WebcamCardProps> = ({ webcam, isFavorite, onToggleFavorite, onClick, isDarkMode }) => {
    // Cache buster per evitar imatges velles
    const snapshotUrl = `${SNAPSHOT_BASE_URL}${webcam.id}-mini.jpg?r=${Math.floor(Date.now() / 60000)}`; 
    
    // Dades simulades per la demo
    const temp = (Math.random() * 15 - 2).toFixed(1); 
    const hum = Math.floor(Math.random() * 40 + 40);

    // Dynamic Styles based on Theme
    const containerStyle = isDarkMode 
        ? "bg-black/20 hover:bg-black/30 border-white/10" 
        : "bg-white border-gray-200 shadow-sm hover:shadow-md";

    // CANVI: Colors més foscos en mode clar per millorar la lectura
    const titleColor = isDarkMode ? "text-gray-100" : "text-gray-900";
    const subtitleColor = isDarkMode ? "text-gray-400" : "text-gray-600";
    const infoColor = isDarkMode ? "text-gray-300" : "text-gray-700";
    const badgeBg = isDarkMode ? "bg-white/10" : "bg-gray-100 border border-gray-200";
    const thermometerColor = isDarkMode ? "text-blue-300" : "text-blue-600";
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
                 
                 <div className={`flex items-center gap-3 text-xs ${infoColor} mt-auto`}>
                    <span className={`flex items-center gap-1 ${badgeBg} px-1.5 py-0.5 rounded`}>
                        <i className={`ph-bold ph-thermometer-simple ${thermometerColor}`}></i> {temp}°
                    </span>
                    <span className="flex items-center gap-1"><i className={`ph-fill ph-mountain ${mountainIconColor}`}></i> {webcam.altitude}m</span>
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
                        <span className="flex items-center gap-1">
                            <i className="ph-bold ph-thermometer-simple text-white/60"></i>
                            {temp}°
                        </span>
                        <span className="flex items-center gap-1">
                            <i className="ph-bold ph-drop text-white/60"></i>
                            {hum}%
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <i className="ph-fill ph-mountain text-white/60"></i>
                        <span>{webcam.altitude}m</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WebcamCard;