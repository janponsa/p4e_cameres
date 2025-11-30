
import React, { useState, useMemo, useEffect } from 'react';
import { ALL_WEBCAMS, SNAPSHOT_BASE_URL } from './constants';
import WebcamCard from './components/WebcamCard';
import { DetailView } from './components/DetailView';
import { SortOption, Webcam } from './types';
import { Soundscape } from './utils/Soundscape';
import Onboarding from './components/Onboarding';

// URL de l'API de sessions (només per visualitzar número clients)
const SESSIONS_API_URL = 'https://api.projecte4estacions.com/api/sessions';
const TIMELAPSE_API_BASE = 'https://cams.projecte4estacions.com/api/galeria/';

type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
type ThemeMode = 'light' | 'dark' | 'image';
type MobileViewMode = 'list' | 'grid';

function App() {
  const [selectedWebcamId, setSelectedWebcamId] = useState<string | null>(null);
  const [filterRegion, setFilterRegion] = useState<string>('Totes');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('altitude_desc'); 
  const [favorites, setFavorites] = useState<string[]>([]);
  
  // Sidebar states
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); 
  
  // Mobile View State
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('list');

  // Data States
  const [sessionData, setSessionData] = useState<Record<string, { clients: number }>>({});
  const [activeCameraIds, setActiveCameraIds] = useState<Set<string>>(new Set());
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  
  // Time state
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');

  // Soundscape State
  const [isAmbientOn, setIsAmbientOn] = useState(false);
  const [showMixer, setShowMixer] = useState(false); // Global Mixer Toggle
  const [musicVol, setMusicVol] = useState(0.6);
  const [sfxVol, setSfxVol] = useState(0.5);

  // Onboarding State
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Sync Volume state with Engine on mount & Check Onboarding
  useEffect(() => {
      const vols = Soundscape.getVolumes();
      setMusicVol(vols.music);
      setSfxVol(vols.sfx);

      // Check LocalStorage for Onboarding
      const hasSeenOnboarding = localStorage.getItem('p4e_nexus_onboarding_seen');
      if (!hasSeenOnboarding) {
          setShowOnboarding(true);
      }
  }, []);

  const handleOnboardingComplete = () => {
      // UNLOCK IOS AUDIO ON USER INTERACTION
      Soundscape.prepare(); 
      localStorage.setItem('p4e_nexus_onboarding_seen', 'true');
      setShowOnboarding(false);
  };

  const handleVolumeChange = (type: 'music' | 'sfx', val: number) => {
      if (type === 'music') {
          setMusicVol(val);
          Soundscape.setMusicVolume(val);
      } else {
          setSfxVol(val);
          Soundscape.setSfxVolume(val);
      }
  };

  // --- THEME LOGIC START ---
  const getAutomaticTheme = (): ThemeMode => {
      const hour = new Date().getHours();
      return (hour >= 7 && hour < 19) ? 'light' : 'dark';
  };

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
      const savedTheme = localStorage.getItem('p4e_nexus_theme');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'image') {
          return savedTheme;
      }
      return getAutomaticTheme();
  });

  const [bgImage, setBgImage] = useState<string>('');

  const handleThemeChange = (mode: ThemeMode) => {
      setThemeMode(mode);
      localStorage.setItem('p4e_nexus_theme', mode);
  };
  // --- THEME LOGIC END ---
  
  const isDarkMode = themeMode === 'dark' || themeMode === 'image';
  
  // 1. Calculate Time of Day
  useEffect(() => {
      const updateTime = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 10) setTimeOfDay('morning'); 
        else if (hour >= 17 && hour < 21) setTimeOfDay('evening');
        else if (hour >= 21 || hour < 6) setTimeOfDay('night');
        else setTimeOfDay('day');
      };
      updateTime();
      const interval = setInterval(updateTime, 60000);
      return () => clearInterval(interval);
  }, []);

  // 2. Fetch Sessions & Verify Cameras
  useEffect(() => {
    const fetchAndVerify = async () => {
        if (activeCameraIds.size === 0) setIsSessionLoading(true);

        try {
            const response = await fetch(SESSIONS_API_URL);
            if (!response.ok) throw new Error('Error network sessions');
            const data = await response.json();
            setSessionData(data);

            const verifiedIds = new Set<string>();
            const promises: Promise<void>[] = [];

            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;

            ALL_WEBCAMS.forEach(cam => {
                if (Object.prototype.hasOwnProperty.call(data, cam.id)) {
                    verifiedIds.add(cam.id);
                } else {
                    const p = fetch(`${TIMELAPSE_API_BASE}${cam.id}/dates`)
                        .then(r => {
                            if(!r.ok) return [];
                            return r.json();
                        })
                        .then(async (dates: string[]) => {
                            if (Array.isArray(dates) && dates.length > 0 && dates[0] === todayStr) {
                                const imgRes = await fetch(`${TIMELAPSE_API_BASE}${cam.id}/${todayStr}/images`);
                                if(!imgRes.ok) return;
                                const images = await imgRes.json();
                                
                                if (Array.isArray(images) && images.length > 0) {
                                    const lastImage = images[images.length - 1];
                                    try {
                                        const parts = lastImage.replace('.jpg', '').split('_');
                                        const timePart = parts.length > 1 ? parts[1] : null; 
                                        
                                        if (timePart) {
                                            const [h, m, s] = timePart.split('-').map(Number);
                                            const imgDate = new Date();
                                            imgDate.setHours(h, m, s, 0);
                                            const diffMs = Date.now() - imgDate.getTime();
                                            const TEN_MINUTES = 10 * 60 * 1000; 

                                            if (diffMs < TEN_MINUTES && diffMs > -(TEN_MINUTES)) {
                                                verifiedIds.add(cam.id);
                                            }
                                        }
                                    } catch (e) {}
                                }
                            }
                        })
                        .catch(() => { });
                    promises.push(p);
                }
            });

            await Promise.all(promises);
            setActiveCameraIds(verifiedIds);

        } catch (e) {
            console.error("Error carregant dades:", e);
        } finally {
            setIsSessionLoading(false);
        }
    };

    fetchAndVerify();
    const interval = setInterval(fetchAndVerify, 600000); 
    return () => clearInterval(interval);
  }, []);

  // 3. Load Favorites
  useEffect(() => {
    const saved = localStorage.getItem('p4e_nexus_favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  // 4. Merge Data
  const displayWebcams = useMemo(() => {
    return ALL_WEBCAMS
        .filter(cam => activeCameraIds.has(cam.id))
        .map(cam => ({
            ...cam,
            clients: sessionData[cam.id]?.clients || 0
        }));
  }, [activeCameraIds, sessionData]);

  // 5. Background Image Logic
  useEffect(() => {
      if (themeMode !== 'image' || isSessionLoading || displayWebcams.length === 0) return;

      setBgImage(current => {
          if (current) return current;
          const randomCam = displayWebcams[Math.floor(Math.random() * displayWebcams.length)];
          if (randomCam) {
              return `${SNAPSHOT_BASE_URL}${randomCam.id}.jpg?t=${Date.now()}`;
          }
          return '';
      });
  }, [themeMode, displayWebcams, isSessionLoading]);

  // 6. Soundscape Logic
  const toggleAmbientSound = () => {
      if (isAmbientOn) {
          Soundscape.pause();
          setIsAmbientOn(false);
      } else {
          Soundscape.play();
          setIsAmbientOn(true);
      }
  };

  // 7. Global Weather Logic
  useEffect(() => {
      if (!selectedWebcamId && isAmbientOn && !isSessionLoading) {
          const centerLat = 42.1;
          const centerLng = 1.8;
          
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${centerLat}&longitude=${centerLng}&current=weather_code,wind_speed_10m,is_day`)
            .then(res => res.json())
            .then(data => {
                if(data.current) {
                     const globalWeather = {
                         temp: "15",
                         humidity: 50,
                         wind: data.current.wind_speed_10m,
                         rain: 0,
                         code: data.current.weather_code,
                         isDay: data.current.is_day === 1,
                         isReal: false
                     };
                     Soundscape.updateContext(globalWeather, "Panoràmica general de Catalunya. Paisatge divers, muntanya i vall.");
                }
            })
            .catch(() => {});
      }
  }, [selectedWebcamId, isAmbientOn, isSessionLoading]);

  const saveFavorites = (newFavs: string[]) => {
    setFavorites(newFavs);
    localStorage.setItem('p4e_nexus_favorites', JSON.stringify(newFavs));
  };

  const toggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (favorites.includes(id)) {
      saveFavorites(favorites.filter(fid => fid !== id));
    } else {
      saveFavorites([...favorites, id]);
    }
  };

  const regions = useMemo(() => {
    const r = new Set(displayWebcams.map(w => w.region));
    return ['Totes', 'Preferides', ...Array.from(r).sort()];
  }, [displayWebcams]);

  const filteredWebcams = useMemo(() => {
    let result = displayWebcams;
    if (filterRegion === 'Preferides') result = result.filter(w => favorites.includes(w.id));
    else if (filterRegion !== 'Totes') result = result.filter(w => w.region === filterRegion);

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(w => w.name.toLowerCase().includes(lower) || w.region.toLowerCase().includes(lower));
    }

    return result.sort((a, b) => {
      switch (sortBy) {
        case 'altitude_desc': return b.altitude - a.altitude;
        case 'altitude_asc': return a.altitude - b.altitude;
        case 'name': return a.name.localeCompare(b.name);
        case 'region': return a.region.localeCompare(b.region);
        case 'viewers': return (b.clients || 0) - (a.clients || 0);
        default: return b.altitude - a.altitude;
      }
    });
  }, [filterRegion, searchTerm, sortBy, favorites, displayWebcams]);

  const selectedWebcam = useMemo(() => displayWebcams.find(w => w.id === selectedWebcamId), [selectedWebcamId, displayWebcams]);

  // Common styles
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-white/60' : 'text-gray-700'; 
  const bgPanel = isDarkMode ? 'bg-black/40 border-white/10' : 'bg-white/60 border-white/40 shadow-xl';
  const hoverBg = isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/5';
  const sidebarBg = isDarkMode ? 'bg-black/60 border-r border-white/10' : 'bg-white/70 border-r border-gray-200';
  
  // Specific styles for controls to ensure readability in image mode
  const controlBg = isDarkMode ? 'bg-black/40 border-white/20 text-white' : 'bg-white/80 border-gray-200 text-gray-800';
  const controlHover = isDarkMode ? 'hover:bg-black/60' : 'hover:bg-white';
  
  // Compact mobile button styles
  const mobileBtnClass = `p-1.5 rounded-lg transition-colors backdrop-blur-md ${isDarkMode ? 'text-white bg-black/20' : 'text-gray-800 bg-white/40'}`;
  const mobileBtnActive = isDarkMode ? 'bg-indigo-500/30 text-indigo-300 ring-1 ring-indigo-500/50' : 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200';

  const handleRegionChange = (region: string) => {
      setFilterRegion(region);
      setSelectedWebcamId(null);
      setIsSidebarOpen(false);
  };

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-500 relative bg-gray-900`}>
      
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}

      {/* --- BACKGROUND LAYER --- */}
      <div className={`absolute inset-0 z-0 overflow-hidden transition-colors duration-700
          ${themeMode === 'light' ? 'bg-[#f0f2f5]' : ''}
          ${themeMode === 'dark' ? 'bg-[#121212]' : ''}
      `}>
          {themeMode === 'image' && bgImage && (
             <>
                <img 
                    src={bgImage} 
                    alt="Background" 
                    className="w-full h-full object-cover scale-105 blur-md opacity-100 transition-opacity duration-1000"
                />
                <div className="absolute inset-0 bg-gray-900/60 transition-colors duration-500"></div>
             </>
          )}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      {/* --- SIDEBAR --- */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out flex flex-col backdrop-blur-xl overflow-hidden
          ${sidebarBg}
          ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full'} 
          lg:relative lg:translate-x-0 ${isSidebarCollapsed ? 'lg:w-0 lg:border-none lg:opacity-0' : 'lg:w-72 lg:opacity-100'}`}
      >
        <div className="p-5 flex items-center justify-between h-16 shrink-0">
             <h2 className={`font-bold text-lg tracking-tight ${textPrimary}`}>Regions</h2>
             <button onClick={() => setIsSidebarOpen(false)} className={`lg:hidden text-2xl ${textPrimary}`}><i className="ph-bold ph-x"></i></button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar w-72">
          {regions.map(region => (
            <button
              key={region}
              onClick={() => handleRegionChange(region)}
              className={`w-full text-left rounded-lg transition-all duration-200 flex items-center group relative px-3 py-2.5 justify-between
                ${filterRegion === region 
                  ? (isDarkMode ? 'bg-white text-black shadow-lg' : 'bg-blue-600 text-white shadow-md') 
                  : (`${textPrimary} ${hoverBg}`)
                }`}
            >
              <span className="flex items-center gap-3">
                 <i className={`ph-bold text-lg ${region === 'Preferides' ? 'ph-star' : 'ph-map-pin'} ${filterRegion === region ? 'opacity-100' : 'opacity-70'}`}></i>
                 <span className="truncate text-sm font-medium">{region}</span>
              </span>
            </button>
          ))}
        </div>

        {/* THEME SELECTOR */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
           <p className={`text-xs font-bold uppercase tracking-wider mb-3 px-1 ${textSecondary}`}>Aparença</p>
           <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl ${isDarkMode ? 'bg-white/10' : 'bg-gray-200/50'}`}>
               <button onClick={() => handleThemeChange('light')} className={`flex flex-col items-center justify-center py-2 rounded-lg transition-all ${themeMode === 'light' ? 'bg-white shadow-sm text-black scale-100' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white scale-95'}`}><i className="ph-fill ph-sun text-lg mb-0.5"></i><span className="text-[9px] font-bold">Blanc</span></button>
               <button onClick={() => handleThemeChange('dark')} className={`flex flex-col items-center justify-center py-2 rounded-lg transition-all ${themeMode === 'dark' ? 'bg-gray-800 shadow-sm text-white scale-100' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white scale-95'}`}><i className="ph-fill ph-moon text-lg mb-0.5"></i><span className="text-[9px] font-bold">Negre</span></button>
               <button onClick={() => handleThemeChange('image')} className={`flex flex-col items-center justify-center py-2 rounded-lg transition-all ${themeMode === 'image' ? 'bg-blue-600 shadow-sm text-white scale-100' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white scale-95'}`}><i className="ph-fill ph-image text-lg mb-0.5"></i><span className="text-[9px] font-bold">Imatge</span></button>
           </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col relative z-10 h-full overflow-hidden w-full">
        
        {/* Header (Main) */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 shrink-0 gap-3">
            <div className="flex items-center gap-3 lg:gap-4 flex-1 min-w-0">
                <button 
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className={`hidden lg:flex items-center justify-center p-2 rounded-lg transition-colors ${hoverBg} ${textPrimary}`}
                >
                    <i className="ph-bold ph-list text-2xl"></i>
                </button>

                <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                    className={`lg:hidden p-2 rounded-lg backdrop-blur-md border shrink-0 ${bgPanel} ${textPrimary}`}
                >
                    <i className="ph-bold ph-list text-xl"></i>
                </button>

                <img 
                    src={themeMode === 'light' ? "https://app.projecte4estacions.com/images/logo_p4e_2023_h_blau_200.png" : "https://www.projecte4estacions.com/uploads/1/1/9/0/119049478/published/logo-h-azul.png?1696675697"} 
                    alt="Logo" 
                    className={`h-5 sm:h-6 shrink-0 ${themeMode !== 'light' && 'brightness-0 invert'}`} 
                />

                {/* SEARCH */}
                <div className="flex items-center gap-2 flex-1 max-w-xs ml-auto lg:ml-4">
                    <div className="relative group w-full transition-all duration-300">
                        <i className={`ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 transition-colors text-xs sm:text-sm ${textSecondary}`}></i>
                        <input 
                            type="text" 
                            placeholder="Cercar..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full border text-xs sm:text-sm rounded-full pl-8 sm:pl-9 pr-4 py-1.5 sm:py-2 focus:outline-none focus:ring-1 transition-all backdrop-blur-md shadow-sm
                                ${isDarkMode 
                                    ? 'bg-white/10 border-white/10 text-white placeholder-white/40 focus:bg-black/40 focus:ring-white/30' 
                                    : 'bg-white/60 border-gray-200 text-gray-900 placeholder-gray-500 focus:bg-white focus:ring-blue-500/30'
                                }`}
                        />
                    </div>
                </div>
            </div>

            {/* DESKTOP CONTROLS */}
            <div className="hidden lg:flex items-center gap-3">
               
               {/* MIXER BUTTON DESKTOP */}
                <div className="relative">
                    <button
                        onClick={() => setShowMixer(!showMixer)}
                        className={`p-2 rounded-full transition-colors backdrop-blur-md border ${controlBg} ${controlHover}`}
                        title="Mesclador d'àudio"
                    >
                        <i className="ph-bold ph-faders text-lg"></i>
                    </button>
                    
                    {/* MIXER DROPDOWN */}
                    {showMixer && (
                        <div className={`absolute top-full right-0 mt-2 w-48 p-4 rounded-xl shadow-2xl z-50 border backdrop-blur-xl ${isDarkMode ? 'bg-slate-900/90 border-slate-700 text-white' : 'bg-white/90 border-gray-200 text-gray-900'}`}>
                            <div className="flex flex-col gap-4">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider opacity-70">
                                        <span>Música (IA)</span>
                                        <span>{Math.round(musicVol * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.01" 
                                        value={musicVol}
                                        onChange={(e) => handleVolumeChange('music', parseFloat(e.target.value))}
                                        className="w-full h-1 bg-gray-500/30 rounded-full appearance-none cursor-pointer accent-indigo-500"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider opacity-70">
                                        <span>Realitat (FX)</span>
                                        <span>{Math.round(sfxVol * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.01" 
                                        value={sfxVol}
                                        onChange={(e) => handleVolumeChange('sfx', parseFloat(e.target.value))}
                                        className="w-full h-1 bg-gray-500/30 rounded-full appearance-none cursor-pointer accent-emerald-500"
                                    />
                                </div>
                            </div>
                            <div className="fixed inset-0 z-[-1]" onClick={() => setShowMixer(false)}></div>
                        </div>
                    )}
                </div>

               {/* SOUNDSCAPE TOGGLE */}
               <button 
                 onClick={toggleAmbientSound}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 group backdrop-blur-md ${
                     isAmbientOn 
                     ? (isDarkMode ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-indigo-100 border-indigo-200 text-indigo-700')
                     : (isDarkMode ? 'bg-black/30 border-white/20 text-white/50 hover:text-white' : 'bg-white/60 border-gray-200 text-gray-500 hover:text-gray-900')
                 }`}
               >
                   <div className="relative flex items-center justify-center">
                        <i className={`ph-bold ph-wave-sine text-lg ${!isAmbientOn && 'opacity-50'}`}></i>
                        {isAmbientOn && (
                            <span className="absolute -inset-1 rounded-full bg-current opacity-20 animate-ping"></span>
                        )}
                   </div>
                   <span className="text-xs font-bold uppercase tracking-wider hidden xl:inline">
                       {isAmbientOn ? 'Atmosfera' : 'Silenci'}
                   </span>
               </button>

               <div className="relative">
                 <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className={`appearance-none border text-xs font-medium rounded-full py-2 pl-4 pr-8 focus:outline-none focus:ring-1 backdrop-blur-md cursor-pointer transition-all ${controlBg} ${controlHover}`}
                  >
                    <option value="altitude_desc">Alçada</option>
                    <option value="viewers">Popularitat</option>
                    <option value="name">Nom</option>
                  </select>
                  <i className={`ph-bold ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-xs ${textSecondary}`}></i>
               </div>
            </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-8 pb-20 lg:pb-8 custom-scrollbar scroll-smooth w-full">
          
          {selectedWebcam ? (
            <DetailView 
              webcam={selectedWebcam} 
              onBack={() => setSelectedWebcamId(null)}
              timeOfDay={timeOfDay}
              isDarkMode={isDarkMode}
              isFavorite={favorites.includes(selectedWebcam.id)}
              onToggleFavorite={(e) => toggleFavorite(e, selectedWebcam.id)}
            />
          ) : (
            <div className="max-w-[2400px] mx-auto w-full">
              <div className="mb-6 mt-2 flex items-end justify-between px-1">
                 <div>
                    <h1 className={`text-xl sm:text-2xl lg:text-4xl font-bold tracking-tight drop-shadow-sm ${textPrimary}`}>
                        {filterRegion === 'Totes' ? 'Descobreix' : filterRegion}
                    </h1>
                 </div>
                 
                 <div className="flex items-center gap-1.5 lg:hidden">
                    {/* MOBILE SOUND CONTROLS (Moved here, simplified) */}
                    <div className="flex items-center gap-1 mr-1.5 border-r pr-1.5 border-gray-500/10">
                         {/* Mixer Button Mobile */}
                         <div className="relative">
                             <button
                                onClick={() => setShowMixer(!showMixer)}
                                className={mobileBtnClass}
                            >
                                <i className="ph-bold ph-faders text-lg"></i>
                            </button>
                             {showMixer && (
                                <div className={`absolute top-full right-0 mt-2 w-48 p-4 rounded-xl shadow-2xl z-50 border backdrop-blur-xl ${isDarkMode ? 'bg-slate-900/95 border-slate-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'}`}>
                                    <div className="flex flex-col gap-4">
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider opacity-70">
                                                <span>Música</span>
                                                <span>{Math.round(musicVol * 100)}%</span>
                                            </div>
                                            <input 
                                                type="range" min="0" max="1" step="0.01" 
                                                value={musicVol}
                                                onChange={(e) => handleVolumeChange('music', parseFloat(e.target.value))}
                                                className="w-full h-1 bg-gray-500/30 rounded-full appearance-none cursor-pointer accent-indigo-500"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider opacity-70">
                                                <span>Realitat</span>
                                                <span>{Math.round(sfxVol * 100)}%</span>
                                            </div>
                                            <input 
                                                type="range" min="0" max="1" step="0.01" 
                                                value={sfxVol}
                                                onChange={(e) => handleVolumeChange('sfx', parseFloat(e.target.value))}
                                                className="w-full h-1 bg-gray-500/30 rounded-full appearance-none cursor-pointer accent-emerald-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="fixed inset-0 z-[-1]" onClick={() => setShowMixer(false)}></div>
                                </div>
                            )}
                         </div>

                         {/* Sound Toggle Mobile */}
                         <button 
                            onClick={toggleAmbientSound}
                            className={`${mobileBtnClass} ${isAmbientOn ? mobileBtnActive : ''}`}
                         >
                            <i className={`ph-bold ph-wave-sine text-lg ${!isAmbientOn && 'opacity-40'}`}></i>
                         </button>
                    </div>

                    {/* VIEW TOGGLE BUTTON (Mobile Only) */}
                    <button 
                        onClick={() => setMobileViewMode(prev => prev === 'list' ? 'grid' : 'list')}
                        className={mobileBtnClass}
                        title={mobileViewMode === 'list' ? "Veure com a graella" : "Veure com a llista"}
                    >
                        <i className={`ph-bold text-lg ${mobileViewMode === 'list' ? 'ph-squares-four' : 'ph-list'}`}></i>
                    </button>

                    {/* Mobile Sort Selector */}
                    <div className="relative">
                        <select 
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as SortOption)}
                          className={`appearance-none text-[11px] font-medium rounded-lg py-1.5 pl-2 pr-6 border-0 backdrop-blur-md ${isDarkMode ? 'bg-black/20 text-white' : 'bg-white/40 text-gray-800'}`}
                        >
                          <option value="altitude_desc">Alçada</option>
                          <option value="viewers">Popularitat</option>
                          <option value="name">Nom</option>
                        </select>
                        <i className={`ph-bold ph-caret-down absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[9px] opacity-60`}></i>
                    </div>
                 </div>
              </div>

              {isSessionLoading ? (
                  <div className="flex flex-col items-center justify-center h-64">
                      <i className={`ph-bold ph-spinner animate-spin text-4xl mb-4 ${textSecondary}`}></i>
                      <p className={`text-sm font-medium ${textSecondary}`}>Cercant càmeres actives...</p>
                  </div>
              ) : filteredWebcams.length === 0 ? (
                <div className={`flex flex-col items-center justify-center h-64 rounded-2xl p-8 text-center mx-4 ${isDarkMode ? 'bg-white/5 text-white/50' : 'bg-black/5 text-black/50'}`}>
                    <i className="ph-duotone ph-binoculars text-6xl mb-4 opacity-50"></i>
                    <p className="text-lg font-medium">No s'han trobat càmeres actives.</p>
                </div>
              ) : (
                <div className={`
                    grid gap-3 sm:gap-4 lg:gap-6
                    ${mobileViewMode === 'list' 
                        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' 
                        : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' /* Mobile Grid Mode */
                    }
                `}>
                  {filteredWebcams.map((webcam) => (
                    <WebcamCard 
                      key={webcam.id} 
                      webcam={webcam} 
                      onClick={() => setSelectedWebcamId(webcam.id)}
                      isDarkMode={isDarkMode}
                      mobileViewMode={mobileViewMode} // Pass view mode prop
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {isSidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}
    </div>
  );
}

export default App;
