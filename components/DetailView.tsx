
import React, { useState, useEffect, useRef } from 'react';
import { Webcam, WeatherData } from '../types';
import VideoPlayer from './VideoPlayer';
import TimelapsePlayer from './TimelapsePlayer';
import { SNAPSHOT_BASE_URL } from '../constants';

// --- API KEYS ---
const WG_API_KEY = "e1f10a1e78da46f5b10a1e78da96f525";

declare global {
    interface Window {
        Chart: any;
    }
}

interface DetailViewProps {
    webcam: Webcam;
    onBack: () => void;
    timeOfDay: 'morning' | 'day' | 'evening' | 'night';
    isDarkMode: boolean;
}

// Helpers conversió
const fToC = (f: number) => (f - 32) * 5/9;
const mphToKmh = (m: number) => m * 1.60934;
const inToMm = (i: number) => i * 25.4;

// Helper condició text
const getWeatherConditionText = (code: number) => {
    if (code === 0) return "Serè";
    if (code >= 1 && code <= 3) return "Ennuvolat";
    if (code === 45 || code === 48) return "Boira";
    if (code >= 51 && code <= 67) return "Pluja";
    if (code >= 71 && code <= 77) return "Neu";
    if (code >= 80 && code <= 82) return "Ruixats";
    if (code >= 95) return "Tempesta";
    return "";
};

// Helper icona (Duplicat de WebcamCard per autonomia)
const getWeatherIcon = (code: number, isDay: boolean) => {
    if (code === 0) return { icon: isDay ? 'ph-sun' : 'ph-moon', color: isDay ? 'text-yellow-400' : 'text-blue-200' };
    if (code >= 1 && code <= 3) return { icon: isDay ? 'ph-cloud-sun' : 'ph-cloud-moon', color: 'text-gray-400' };
    if (code === 45 || code === 48) return { icon: 'ph-cloud-fog', color: 'text-gray-400' };
    if (code >= 51 && code <= 67) return { icon: 'ph-cloud-rain', color: 'text-blue-400' };
    if (code >= 71 && code <= 77) return { icon: 'ph-snowflake', color: 'text-white' };
    if (code >= 80 && code <= 82) return { icon: 'ph-drop', color: 'text-blue-300' };
    if (code >= 95 && code <= 99) return { icon: 'ph-cloud-lightning', color: 'text-purple-400' };
    return { icon: 'ph-cloud', color: 'text-gray-400' };
};

export const DetailView: React.FC<DetailViewProps> = ({ webcam, onBack, timeOfDay, isDarkMode }) => {
    const [activeTab, setActiveTab] = useState<'live' | 'timelapse'>('live');
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);
    
    // Chart State
    const [showChartModal, setShowChartModal] = useState(false);
    const [chartConfig, setChartConfig] = useState<{type: 'temp' | 'wind' | 'hum', label: string, color: string, data: any} | null>(null);
    const chartInstanceRef = useRef<any>(null);
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);

    const snapshotUrl = `${SNAPSHOT_BASE_URL}${webcam.id}-mini.jpg?r=${Math.floor(Date.now() / 60000)}`;

    // --- FETCH WEATHER DATA LOGIC ---
    useEffect(() => {
        const fetchCombinedWeather = async () => {
            setIsWeatherLoading(true);
            
            // 1. ALWAYS Fetch OpenMeteo for Condition Text & Icon (and fallback data)
            let omData: any = null;
            if (webcam.lat && webcam.lng) {
                try {
                    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${webcam.lat}&longitude=${webcam.lng}&current=temperature_2m,relative_humidity_2m,wind_gusts_10m,precipitation,weather_code,is_day&timezone=auto`);
                    omData = await res.json();
                } catch(e) {}
            }

            let finalData: WeatherData | null = null;

            // 2. Try Specific Station (Meteocat / WG / WL) for Numbers
            if (webcam.meteoStationType && webcam.meteoStationId) {
                try {
                    if (webcam.meteoStationType === 'meteocat') {
                        const now = new Date();
                        const twoHoursAgo = new Date(now.getTime() - (120 * 60 * 1000));
                        const fmt = (d: Date) => d.toISOString().split('.')[0];
                        const query = `SELECT codi_variable, valor_lectura, data_lectura WHERE codi_estacio='${webcam.meteoStationId}' AND data_lectura >= '${fmt(twoHoursAgo)}' AND codi_variable IN ('32', '33', '56') ORDER BY data_lectura DESC LIMIT 10`;
                        const rainQuery = `SELECT sum(valor_lectura) as total_pluja WHERE codi_estacio='${webcam.meteoStationId}' AND codi_variable='35' AND data_lectura >= '${new Date().toISOString().split('T')[0]}T00:00:00'`;
                        
                        const [resMain, resRain] = await Promise.all([
                            fetch(`https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json?$query=${encodeURIComponent(query)}`),
                            fetch(`https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json?$query=${encodeURIComponent(rainQuery)}`)
                        ]);
                        
                        const dataMain = await resMain.json();
                        const dataRain = await resRain.json();

                        let t: string = "--";
                        let h: number = 0;
                        let w: number = 0;
                        let r: number = 0;
                        let time: string = "";

                        const tempObj = dataMain.find((d: any) => d.codi_variable === '32');
                        const humObj = dataMain.find((d: any) => d.codi_variable === '33');
                        const windObj = dataMain.find((d: any) => d.codi_variable === '56');
                        
                        if (tempObj) {
                            t = parseFloat(tempObj.valor_lectura).toFixed(1);
                            // METEOCAT UTC + 30 MIN Logic (using Z for UTC parsing)
                            const date = new Date(tempObj.data_lectura + 'Z'); 
                            date.setMinutes(date.getMinutes() + 30);
                            time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                        }
                        if (humObj) h = Math.round(parseFloat(humObj.valor_lectura));
                        if (windObj) w = Math.round(parseFloat(windObj.valor_lectura) * 3.6);
                        
                        if (dataRain && dataRain[0] && dataRain[0].total_pluja) {
                            r = parseFloat(dataRain[0].total_pluja);
                        }

                        if (t !== "--") {
                            finalData = { temp: t, humidity: h, wind: w, rain: r, isReal: true, source: 'SMC', time };
                        }

                    } else if (webcam.meteoStationType === 'wunderground') {
                        const res = await fetch(`https://api.weather.com/v2/pws/observations/current?stationId=${webcam.meteoStationId}&format=json&units=m&numericPrecision=decimal&apiKey=${WG_API_KEY}`);
                        const data = await res.json();
                        const obs = data.observations?.[0];
                        if (obs) {
                            const date = new Date(obs.obsTimeUtc);
                            finalData = {
                                temp: obs.metric.temp.toFixed(1),
                                humidity: obs.humidity,
                                wind: Math.round(obs.metric.windGust || obs.metric.windSpeed),
                                rain: obs.metric.precipTotal,
                                isReal: true,
                                source: 'WG',
                                time: `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
                            };
                        }

                    } else if (webcam.meteoStationType === 'weatherlink') {
                        const res = await fetch(`https://www.weatherlink.com/map/data/station/${webcam.meteoStationId}?aqiSchemeId=10&woodsmokeEnabled=false`);
                        const data = await res.json();
                        
                        if (data) {
                            let temp = "--";
                            if (data.temperature) temp = fToC(data.temperature).toFixed(1);
                            
                            let wind = 0;
                            if (data.windGust) wind = Math.round(mphToKmh(data.windGust));
                            else if (data.windSpeed) wind = Math.round(mphToKmh(data.windSpeed));

                            let rain = 0;
                            if (data.dailyRain) rain = inToMm(data.dailyRain);

                            let timeStr = "";
                            if (data.lastTimestamp) {
                                const date = new Date(data.lastTimestamp * 1000);
                                timeStr = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                            }

                            finalData = {
                                temp: temp,
                                humidity: Math.round(data.humidity || 0),
                                wind: wind,
                                rain: parseFloat(rain.toFixed(1)),
                                isReal: true,
                                source: 'DAVIS',
                                time: timeStr
                            };
                        }
                    }
                } catch (e) {
                    console.error("Error fetching station data", e);
                }
            }

            // 3. Construct Final Data (Hybrid or Fallback)
            if (finalData) {
                // Use real numbers, append OM condition text/icon if available
                if (omData && omData.current) {
                    finalData.conditionText = getWeatherConditionText(omData.current.weather_code);
                    finalData.code = omData.current.weather_code;
                    finalData.isDay = omData.current.is_day === 1;
                }
            } else if (omData && omData.current) {
                // Fallback entirely to OpenMeteo
                const date = new Date(omData.current.time);
                finalData = {
                    temp: omData.current.temperature_2m.toFixed(1),
                    humidity: omData.current.relative_humidity_2m,
                    wind: Math.round(omData.current.wind_gusts_10m),
                    rain: omData.current.precipitation,
                    isReal: false,
                    source: 'OpenMeteo',
                    time: `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`,
                    conditionText: getWeatherConditionText(omData.current.weather_code),
                    code: omData.current.weather_code,
                    isDay: omData.current.is_day === 1
                };
            }

            setWeather(finalData);
            setIsWeatherLoading(false);
        };

        fetchCombinedWeather();
    }, [webcam]);

    // --- CHART LOGIC ---
    const handleOpenChart = async (type: 'temp' | 'wind' | 'hum') => {
        if (!webcam.meteoStationType || webcam.meteoStationType === 'weatherlink') return;
        
        setShowChartModal(true);
        setChartConfig(null);

        try {
            let labels: string[] = [];
            let dataPoints: number[] = [];
            
            // CONFIGURACIÓ VISUAL SEGONS TIPUS
            let label = 'Temperatura';
            let color = '#fb923c'; // Taronja
            if (type === 'wind') { label = 'Vent (Ràfega)'; color = '#10b981'; } // Verd
            if (type === 'hum') { label = 'Humitat'; color = '#60a5fa'; } // Blau

            if (webcam.meteoStationType === 'meteocat') {
                const now = new Date();
                const start = new Date(now.getTime() - (24 * 60 * 60 * 1000));
                const fmt = (d: Date) => d.toISOString().split('.')[0];
                
                // Seleccionar variables segons el tipus demanat
                let vars = "'32'"; // Temp per defecte
                if (type === 'hum') vars = "'33'";
                if (type === 'wind') vars = "'30','46','48','56'"; // Vent variables

                const query = `SELECT data_lectura, valor_lectura WHERE codi_estacio='${webcam.meteoStationId}' AND data_lectura >= '${fmt(start)}' AND codi_variable IN (${vars}) ORDER BY data_lectura ASC`;
                const res = await fetch(`https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json?$query=${encodeURIComponent(query)}`);
                const data = await res.json();
                
                data.forEach((d: any) => {
                    const date = new Date(d.data_lectura); 
                    labels.push(`${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`);
                    let val = parseFloat(d.valor_lectura);
                    if (type === 'wind') val = val * 3.6; // m/s to km/h
                    dataPoints.push(val);
                });

            } else if (webcam.meteoStationType === 'wunderground') {
                // FETCH YESTERDAY AND TODAY TO ENSURE FULL 24H COVERAGE
                const getWGDateStr = (d: Date) => d.toISOString().slice(0,10).replace(/-/g,'');
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                const datesToFetch = [getWGDateStr(yesterday), getWGDateStr(today)];
                let allObservations: any[] = [];

                const promises = datesToFetch.map(dateStr => 
                    fetch(`https://api.weather.com/v2/pws/history/all?stationId=${webcam.meteoStationId}&format=json&units=m&date=${dateStr}&numericPrecision=decimal&apiKey=${WG_API_KEY}`)
                        .then(res => res.json())
                        .then(data => data.observations || [])
                        .catch(() => [])
                );

                const results = await Promise.all(promises);
                allObservations = results.flat();
                
                if (allObservations.length > 0) {
                    // FILTER LAST 24 HOURS
                    const nowMs = today.getTime();
                    const cutoffMs = nowMs - (24 * 60 * 60 * 1000);
                    const recentObs = allObservations.filter((o: any) => {
                        const obsTime = new Date(o.obsTimeUtc).getTime();
                        return obsTime >= cutoffMs && obsTime <= nowMs;
                    });

                    // WUNDERGROUND BUCKETING LOGIC (30 min groups)
                    const buckets: {[key: string]: {sum: number, count: number, max: number}} = {};
                    
                    recentObs.forEach((obs: any) => {
                        const date = new Date(obs.obsTimeUtc);
                        const minutes = date.getMinutes();
                        const roundedMinutes = minutes < 30 ? 0 : 30;
                        date.setMinutes(roundedMinutes, 0, 0);
                        
                        const key = date.toISOString();
                        if (!buckets[key]) buckets[key] = { sum: 0, count: 0, max: 0 };
                        
                        let val = 0;
                        if (type === 'temp') val = obs.metric.tempAvg || obs.metric.tempHigh || 0;
                        if (type === 'hum') val = obs.humidityAvg || obs.humidityHigh || 0;
                        if (type === 'wind') val = obs.metric.windspeedHigh || obs.metric.windspeedAvg || 0;

                        buckets[key].sum += val;
                        buckets[key].count++;
                        if (val > buckets[key].max) buckets[key].max = val;
                    });

                    Object.keys(buckets).sort().forEach(ts => {
                        const b = buckets[ts];
                        if (b.count > 0) {
                            const date = new Date(ts);
                            labels.push(`${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`);
                            
                            if (type === 'wind') dataPoints.push(parseFloat(b.max.toFixed(1)));
                            else dataPoints.push(parseFloat((b.sum / b.count).toFixed(1))); 
                        }
                    });
                }
            }

            setChartConfig({ type, label, color, data: { labels, dataPoints } });

        } catch (e) {
            console.error("Chart data error", e);
            setShowChartModal(false);
        }
    };

    // Render Chart
    useEffect(() => {
        if (showChartModal && chartConfig && chartCanvasRef.current && window.Chart) {
            if (chartInstanceRef.current) chartInstanceRef.current.destroy();

            const ctx = chartCanvasRef.current.getContext('2d');
            
            // Create Gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, chartConfig.color + (chartConfig.type === 'wind' ? 'BB' : '66')); 
            gradient.addColorStop(1, chartConfig.color + '05'); // Fade to almost transparent

            chartInstanceRef.current = new window.Chart(ctx, {
                type: chartConfig.type === 'wind' ? 'bar' : 'line',
                data: {
                    labels: chartConfig.data.labels,
                    datasets: [{
                        label: chartConfig.label,
                        data: chartConfig.data.dataPoints,
                        borderColor: chartConfig.color,
                        backgroundColor: gradient, // Use Gradient
                        fill: true,
                        tension: 0.4, // Smooth lines
                        pointRadius: 0, // Clean look (no dots)
                        pointHoverRadius: 4,
                        borderWidth: chartConfig.type === 'wind' ? 0 : 2,
                        borderRadius: 4, // Rounded bars
                        barPercentage: 0.6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.95)',
                            titleColor: isDarkMode ? '#fff' : '#111',
                            bodyColor: isDarkMode ? '#ccc' : '#444',
                            borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            borderWidth: 1,
                            padding: 10,
                            displayColors: false,
                            bodyFont: { size: 13, weight: 'bold' },
                            callbacks: {
                                title: (items: any) => `Hora: ${items[0].label}`,
                                label: (context: any) => `${context.parsed.y} ${chartConfig.type === 'temp' ? '°C' : chartConfig.type === 'hum' ? '%' : 'km/h'}`
                            }
                        }
                    },
                    scales: {
                        y: { 
                            beginAtZero: chartConfig.type === 'hum' || chartConfig.type === 'wind',
                            grid: { 
                                color: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderDash: [4, 4]
                            },
                            ticks: {
                                color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                                font: { size: 10 }
                            }
                        },
                        x: { 
                            ticks: { 
                                maxTicksLimit: 6,
                                color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                                font: { size: 10 }
                            },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }, [showChartModal, chartConfig, isDarkMode]);


    // Styles...
    const panelClass = isDarkMode ? 'bg-black/40 border border-white/10 backdrop-blur-xl shadow-lg' : 'bg-white border border-gray-200 shadow-lg';
    const gridItemClass = isDarkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100 border border-gray-100';
    const labelClass = isDarkMode ? 'text-white/50' : 'text-gray-500';
    const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
    const textSecondary = isDarkMode ? 'text-white/80' : 'text-gray-600';
    const textMuted = isDarkMode ? 'text-white/50' : 'text-gray-500';

    const btnBackClass = isDarkMode ? 'text-white/90 hover:text-white bg-black/30 hover:bg-black/50 border border-white/10' : 'text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 shadow-sm';
    const btnShareClass = isDarkMode ? 'text-white/90 hover:text-white hover:bg-white/10' : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50';
    const segmentContainerClass = isDarkMode ? 'bg-black/30 border border-white/10' : 'bg-gray-100 border border-gray-200';
    const segmentActive = isDarkMode ? 'bg-white text-black shadow-sm' : 'bg-white text-gray-900 shadow-sm border border-gray-200';
    const segmentInactive = isDarkMode ? 'text-white/70 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50';

    const weatherIcon = (weather?.code !== undefined && weather?.isDay !== undefined) ? getWeatherIcon(weather.code, weather.isDay) : null;

    return (
        <div className="animate-fade-in w-full flex flex-col items-start pb-10">
            {/* Header */}
            <div className="w-full flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button onClick={onBack} className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md transition-colors ${btnBackClass}`}>
                            <i className="ph-bold ph-arrow-left text-xs group-hover:-translate-x-0.5 transition-transform"></i>
                            <span className="font-medium text-xs">Tornar</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                         <button className={`p-2 rounded-full transition-colors ${btnShareClass}`}><i className="ph-bold ph-share-network text-lg"></i></button>
                        <div className={`p-1 rounded-lg inline-flex backdrop-blur-md shadow-sm ${segmentContainerClass}`}>
                            <button onClick={() => setActiveTab('live')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ${activeTab === 'live' ? segmentActive : segmentInactive}`}>Directe</button>
                            <button onClick={() => setActiveTab('timelapse')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ${activeTab === 'timelapse' ? segmentActive : segmentInactive}`}>Timelapse</button>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <h1 className={`text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight drop-shadow-sm leading-none ${textPrimary}`}>{webcam.name}</h1>
                    <div className={`flex items-center gap-2 text-xs sm:text-sm font-medium ${textSecondary}`}>
                        <span>{webcam.region}</span>
                        <span className="text-white/30">•</span>
                        <span>{webcam.altitude}m</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
                <div className="flex-1 w-full min-w-0">
                     <div className="w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl relative group bg-black ring-1 ring-white/10">
                        {activeTab === 'live' ? (
                            <VideoPlayer streamUrl={webcam.streamUrl} poster={snapshotUrl} timeOfDay={timeOfDay} webcamId={webcam.id} />
                        ) : (
                            <TimelapsePlayer webcamId={webcam.id} />
                        )}
                    </div>
                </div>

                <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0">
                    
                    {/* WEATHER GRID WIDGET */}
                    <div className={`p-5 rounded-2xl ${panelClass}`}>
                        <div className={`flex items-center justify-between mb-4 pb-2 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-100'}`}>
                            <div className="flex items-center gap-2">
                                <h3 className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>Temps Actual</h3>
                                {weather?.conditionText && (
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-700'}`}>
                                        {weatherIcon && <i className={`ph-fill ${weatherIcon.icon} ${weatherIcon.color}`}></i>}
                                        <span className="text-[10px] font-medium">{weather.conditionText}</span>
                                    </div>
                                )}
                            </div>
                            
                            {weather?.isReal ? (
                                <div className="flex flex-col items-end">
                                    <span className={`text-[10px] font-bold flex items-center gap-1 ${weather.source === 'SMC' ? 'text-blue-500' : weather.source === 'WG' ? 'text-orange-500' : 'text-green-500'}`}>
                                        {weather.source === 'SMC' && <i className="ph-bold ph-globe"></i>}
                                        {weather.source}
                                    </span>
                                    {/* Observation Time */}
                                    <span className={`text-[9px] ${textMuted}`}>
                                        {weather.time ? `Dades: ${weather.time}` : 'En directe'}
                                        {webcam.meteoStationName && ` · ${webcam.meteoStationName}`}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[10px] font-bold flex items-center gap-1 text-green-500">
                                    <i className="ph-bold ph-check-circle"></i> OPEN-METEO
                                </span>
                            )}
                        </div>
                        
                        {isWeatherLoading ? (
                            <div className="h-44 flex items-center justify-center"><i className={`ph-bold ph-spinner animate-spin text-2xl ${textMuted}`}></i></div>
                        ) : weather ? (
                            <div className="grid grid-cols-2 gap-3">
                                {/* Temp (Clickable for chart) */}
                                <div 
                                    onClick={() => handleOpenChart('temp')}
                                    className={`rounded-xl p-3 flex flex-col justify-between h-20 relative overflow-hidden transition-all ${gridItemClass} ${webcam.meteoStationType && webcam.meteoStationType !== 'weatherlink' ? 'cursor-pointer hover:ring-1 ring-orange-400/50' : ''}`}
                                >
                                    <div className="flex items-center gap-1.5 z-10">
                                        <i className="ph-fill ph-thermometer-simple text-orange-400 text-sm"></i>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${labelClass}`}>Temp</span>
                                    </div>
                                    <span className={`text-2xl font-bold tracking-tight z-10 ${textPrimary}`}>{weather.temp}°</span>
                                    {webcam.meteoStationType && webcam.meteoStationType !== 'weatherlink' && <i className="ph-bold ph-chart-line absolute bottom-2 right-2 text-orange-400/20 text-xl"></i>}
                                </div>

                                {/* Rain (Daily) */}
                                <div className={`rounded-xl p-3 flex flex-col justify-between h-20 relative overflow-hidden ${gridItemClass}`}>
                                    <div className="flex items-center gap-1.5 z-10">
                                        <i className="ph-fill ph-drop text-blue-400 text-sm"></i>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${labelClass}`}>Pluja 24h</span>
                                    </div>
                                    <div className="flex items-baseline gap-0.5 z-10">
                                        <span className={`text-2xl font-bold tracking-tight ${textPrimary}`}>{weather.rain}</span>
                                        <span className={`text-[10px] font-medium uppercase ${textMuted} ml-1`}>mm</span>
                                    </div>
                                </div>

                                {/* Wind Gust (Clickable for chart) */}
                                <div 
                                    onClick={() => handleOpenChart('wind')}
                                    className={`rounded-xl p-3 flex flex-col justify-between h-20 relative overflow-hidden transition-all ${gridItemClass} ${webcam.meteoStationType && webcam.meteoStationType !== 'weatherlink' ? 'cursor-pointer hover:ring-1 ring-green-400/50' : ''}`}
                                >
                                    <div className="flex items-center gap-1.5 z-10">
                                        <i className="ph-fill ph-wind text-green-400 text-sm"></i>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${labelClass}`}>Ràfega</span>
                                    </div>
                                    <div className="flex items-baseline gap-0.5 z-10">
                                        <span className={`text-2xl font-bold tracking-tight ${textPrimary}`}>{weather.wind}</span>
                                        <span className={`text-[10px] font-medium uppercase ${textMuted} ml-1`}>km/h</span>
                                    </div>
                                    {webcam.meteoStationType && webcam.meteoStationType !== 'weatherlink' && <i className="ph-bold ph-chart-bar absolute bottom-2 right-2 text-green-400/20 text-xl"></i>}
                                </div>

                                {/* Humidity (Clickable for chart) */}
                                <div 
                                    onClick={() => handleOpenChart('hum')}
                                    className={`rounded-xl p-3 flex flex-col justify-between h-20 relative overflow-hidden transition-all ${gridItemClass} ${webcam.meteoStationType && webcam.meteoStationType !== 'weatherlink' ? 'cursor-pointer hover:ring-1 ring-blue-400/50' : ''}`}
                                >
                                    <div className="flex items-center gap-1.5 z-10">
                                        <i className="ph-fill ph-drop-half text-blue-300 text-sm"></i>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${labelClass}`}>Humitat</span>
                                    </div>
                                    <span className={`text-2xl font-bold tracking-tight z-10 ${textPrimary}`}>{weather.humidity}<span className="text-sm">%</span></span>
                                    {webcam.meteoStationType && webcam.meteoStationType !== 'weatherlink' && <i className="ph-bold ph-chart-line absolute bottom-2 right-2 text-blue-400/20 text-xl"></i>}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className={`p-5 rounded-2xl flex-1 ${panelClass}`}>
                        <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${textSecondary}`}>Informació</h3>
                        <p className={`text-sm leading-relaxed font-light ${isDarkMode ? 'text-white/70' : 'text-gray-600'}`}>{webcam.description}</p>
                    </div>
                </div>
            </div>

            {/* CHART MODAL */}
            {showChartModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowChartModal(false)}>
                    <div className={`w-full max-w-3xl rounded-2xl p-6 relative shadow-2xl ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold">Històric 24h</h3>
                                {chartConfig && (
                                    <span className={`text-xs font-bold px-2 py-1 rounded uppercase bg-opacity-20`} style={{backgroundColor: chartConfig.color + '30', color: chartConfig.color}}>
                                        {chartConfig.label}
                                    </span>
                                )}
                            </div>
                            <button onClick={() => setShowChartModal(false)} className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}><i className="ph-bold ph-x text-xl"></i></button>
                        </div>
                        <div className="h-64 sm:h-80 w-full relative">
                            {chartConfig ? <canvas ref={chartCanvasRef}></canvas> : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <i className="ph-bold ph-spinner animate-spin text-3xl text-blue-500"></i>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
