
import React, { useState, useMemo, useEffect } from 'react';
import { ALL_WEBCAMS, SNAPSHOT_BASE_URL } from './constants';
import WebcamCard from './components/WebcamCard';
import { DetailView } from './components/DetailView';
import { SortOption, Webcam } from './types';

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

  // 2. Fetch Sessions & Verify Inactive Cams (Smart Filter)
  useEffect(() => {
    const fetchAndVerify = async () => {
        try {
            // A. Get Sessions (Live viewers)
            const response = await fetch(SESSIONS_API_URL);
            if (!response.ok) throw new Error('Error network');
            const data = await response.json();
            setSessionData(data);

            // B. Determine Active Cams
            const verifiedIds = new Set<string>();
            const promises: Promise<void>[] = [];

            // Get Today's date YYYY-MM-DD
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;

            ALL_WEBCAMS.forEach(cam => {
                // 1. Si està a sessions (té espectadors), és vàlida segur
                if (Object.prototype.hasOwnProperty.call(data, cam.id)) {
                    verifiedIds.add(cam.id);
                } else {
                    // 2. Si NO està a sessions (0 espectadors), comprovem l'última imatge del Timelapse
                    // Això és més fiable que snapshots/id.jpg
                    const p = fetch(`${TIMELAPSE_API_BASE}${cam.id}/dates`)
                        .then(r => r.json())
                        .then(async (dates: string[]) => {
                            // Si tenim dates i l'última és avui
                            if (Array.isArray(dates) && dates.length > 0 && dates[0] === todayStr) {
                                // Consultem imatges d'avui
                                const imgRes = await fetch(`${TIMELAPSE_API_BASE}${cam.id}/${todayStr}/images`);
                                const images = await imgRes.json();
                                if (Array.isArray(images) && images.length > 0) {
                                    // Agafem l'última imatge: image-YYYY-MM-DD_HH-MM-SS.jpg
                                    const lastImage = images[images.length - 1];
                                    try {
                                        // Extraiem l'hora del nom
                                        const timePart = lastImage.split('_')[1].split('.')[0]; // HH-MM-SS
                                        const [h, m, s] = timePart.split('-').map(Number);
                                        
                                        const imgDate = new Date();
                                        imgDate.setHours(h, m, s, 0);
                                        
                                        const diffMs = Date.now() - imgDate.getTime();
                                        // Si la imatge té menys de 20 minuts (1200000ms), està ONLINE
                                        if (diffMs < 1200000) {
                                            verifiedIds.add(cam.id);
                                        }
                                    } catch (e) {
                                        // Error parsejant, ignorem
                                    }
                                }
                            }
                        })
                        .catch(() => { 
                            // Fallback: Si falla tot, provem el mètode antic de snapshot per si de cas
                             return fetch(`${SNAPSHOT_BASE_URL}${cam.id}.jpg?t=${Date.now()}`, { method: 'HEAD' })
                                .then(res => {
                                    if (res.ok) {
                                        const lastMod = res.headers.get('Last-Modified');
                                        if (lastMod && (Date.now() - new Date(lastMod).getTime()) < 900000) {
                                            verifiedIds.add(cam.id);
                                        }
                                    }
                                }).catch(() => {});
                        });
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
    const interval = setInterval(fetchAndVerify, 60000); // Re-check every minute
    return () => clearInterval(interval);
  }, []);

  // 3. Load Favorites
  useEffect(() => {
    const saved = localStorage.getItem('p4e_nexus_favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  // 4. Merge Data (Only Verified Cams)
  const displayWebcams = useMemo(() => {
    return ALL_WEBCAMS
        .filter(cam => activeCameraIds.has(cam.id) || cam.id === 'montgarri') // Force Montgarri if needed or strictly verified
        .map(cam => ({
            ...cam,
            clients: sessionData[cam.id]?.clients || 0
        }));
  }, [activeCameraIds, sessionData]);

  // 5. Background Image Logic (Static per session)
  useEffect(() => {
      if (themeMode !== 'image' || displayWebcams.length === 0) return;

      setBgImage(current => {
          if (current) return current;
          const randomCam = displayWebcams[Math.floor(Math.random() * displayWebcams.length)];
          if (randomCam) {
              return `${SNAPSHOT_BASE_URL}${randomCam.id}.jpg?t=${Date.now()}`;
          }
          return '';
      });
  }, [themeMode, displayWebcams]);

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

  const handleRegionChange = (region: string) => {
      setFilterRegion(region);
      setSelectedWebcamId(null);
      setIsSidebarOpen(false);
  };

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-500 relative bg-gray-900`}>
      
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

                {/* SEARCH & MOBILE VIEW TOGGLE */}
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
                    
                    {/* MOBILE VIEW TOGGLE BUTTON (Hidden on Desktop) */}
                    {!selectedWebcamId && (
                        <button 
                            onClick={() => setMobileViewMode(prev => prev === 'list' ? 'grid' : 'list')}
                            className={`lg:hidden p-2 rounded-full backdrop-blur-md border transition-all ${bgPanel} ${textPrimary} shadow-sm active:scale-95`}
                            title={mobileViewMode === 'list' ? "Veure com a graella" : "Veure com a llista"}
                        >
                            <i className={`ph-bold text-lg ${mobileViewMode === 'list' ? 'ph-squares-four' : 'ph-list'}`}></i>
                        </button>
                    )}
                </div>
            </div>

            <div className="hidden lg:flex items-center gap-2">
               <div className="relative">
                 <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className={`appearance-none border text-xs font-medium rounded-full py-2 pl-4 pr-8 focus:outline-none focus:ring-1 backdrop-blur-md cursor-pointer transition-all
                        ${isDarkMode 
                            ? 'bg-black/20 border-white/10 text-white hover:bg-black/40 focus:ring-white/20' 
                            : 'bg-white/60 border-gray-200 text-gray-900 hover:bg-white focus:ring-blue-500/30'
                        }`}
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
        {/* CHANGED: px-3 for mobile padding */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-8 pb-20 lg:pb-8 custom-scrollbar scroll-smooth w-full">
          
          {selectedWebcam ? (
            <DetailView 
              webcam={selectedWebcam} 
              onBack={() => setSelectedWebcamId(null)}
              timeOfDay={timeOfDay}
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className="max-w-[2400px] mx-auto w-full">
              <div className="mb-6 mt-2 flex items-end justify-between px-1">
                 <div>
                    <h1 className={`text-xl sm:text-2xl lg:text-4xl font-bold tracking-tight drop-shadow-sm ${textPrimary}`}>
                        {filterRegion === 'Totes' ? 'Descobreix' : filterRegion}
                    </h1>
                 </div>
                 
                 {/* Mobile Sort Selector */}
                 <div className="lg:hidden">
                    <select 
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className={`border text-xs rounded-lg py-1.5 px-3 backdrop-blur-md ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-white/60 border-gray-200 text-gray-900'}`}
                    >
                      <option value="altitude_desc">Alçada</option>
                      <option value="viewers">Popularitat</option>
                      <option value="name">Nom</option>
                    </select>
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
                      isFavorite={favorites.includes(webcam.id)}
                      onToggleFavorite={(e) => toggleFavorite(e, webcam.id)}
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
