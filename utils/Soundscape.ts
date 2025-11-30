
import { GoogleGenAI } from "@google/genai";
import { WeatherData } from "../types";

// --- UTILS PER DECODIFICAR AUDIO ---

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels, 
    sampleRate,
  );

  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const dataFloat32 = new Float32Array(dataInt16.length);
  
  for (let i = 0; i < dataInt16.length; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }

  if (numChannels === 1) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channelData = new Float32Array(dataFloat32.length / numChannels);
      for (let j = 0; j < channelData.length; j++) {
        channelData[j] = dataFloat32[j * numChannels + i];
      }
      buffer.copyToChannel(channelData, i);
    }
  }
  return buffer;
}

// --- CONFIGURACIÓ LYRIA ---

const LYRIA_MODEL = 'lyria-realtime-exp';
const SAMPLE_RATE = 48000; 

class SoundscapeEngine {
    private ai: GoogleGenAI;
    private session: any | null = null; 
    private ctx: AudioContext | null = null;
    
    // --- BUSOS DE MESCLA ---
    private masterGain: GainNode | null = null; // Volum General (Fade in/out)
    private musicBus: GainNode | null = null;   // Volum Música IA
    private sfxBus: GainNode | null = null;     // Volum Efectes Meteo
    
    // --- WEATHER FX LAYERS ---
    private windNode: AudioBufferSourceNode | null = null;
    private windGain: GainNode | null = null;
    private windFilter: BiquadFilterNode | null = null;

    private rainNode: AudioBufferSourceNode | null = null;
    private rainGain: GainNode | null = null;
    private rainFilter: BiquadFilterNode | null = null;

    private isPlaying: boolean = false;
    private nextStartTime: number = 0;
    private bufferTime: number = 0.2; 
    
    // Estat actual
    private currentVisualPrompt: string = "";
    private currentWeatherPrompt: string = "Calm atmosphere, safe environment";
    private lastContextUpdate: number = 0;

    // Volums per defecte
    private musicVolume: number = 0.6;
    private sfxVolume: number = 0.5;

    constructor() {
        this.ai = new GoogleGenAI({
            apiKey: process.env.API_KEY,
            apiVersion: 'v1alpha'
        });
    }

    private initAudio() {
        if (!this.ctx) {
            const AC = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AC({ sampleRate: SAMPLE_RATE });
            
            // Crear nodes de guany (Busos)
            this.masterGain = this.ctx.createGain();
            this.musicBus = this.ctx.createGain();
            this.sfxBus = this.ctx.createGain();

            // Connectar: Source -> Bus -> Master -> Destination
            this.masterGain.connect(this.ctx.destination);
            this.musicBus.connect(this.masterGain);
            this.sfxBus.connect(this.masterGain);

            // Valors inicials
            this.masterGain.gain.value = 0; // Comencem en silenci per fer fade-in
            this.musicBus.gain.value = this.musicVolume;
            this.sfxBus.gain.value = this.sfxVolume;

            // INICIALITZAR CAPES METEOROLÒGIQUES (SFX)
            this.initWeatherLayers();
        }
    }

    private initWeatherLayers() {
        if (!this.ctx || !this.sfxBus) return;
        
        // 1. GENERAR BUFFER DE SOROLL ROSA (PINK NOISE)
        const bufferSize = this.ctx.sampleRate * 5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
        
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + white * 0.5362) * 0.11;
        }

        // 2. CONFIGURAR CANAL DE VENT
        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.frequency.value = 200; 
        
        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0;

        this.windNode = this.ctx.createBufferSource();
        this.windNode.buffer = buffer;
        this.windNode.loop = true;
        
        this.windNode.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.sfxBus); // Connectem al bus d'efectes
        this.windNode.start();

        // 3. CONFIGURAR CANAL DE PLUJA
        this.rainFilter = this.ctx.createBiquadFilter();
        this.rainFilter.type = 'lowpass';
        this.rainFilter.frequency.value = 800;
        
        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0;

        this.rainNode = this.ctx.createBufferSource();
        this.rainNode.buffer = buffer;
        this.rainNode.loop = true;

        this.rainNode.connect(this.rainFilter);
        this.rainFilter.connect(this.rainGain);
        this.rainGain.connect(this.sfxBus); // Connectem al bus d'efectes
        this.rainNode.start();
    }

    private updateWeatherSFX(weather: WeatherData) {
        if (!this.ctx || !this.windGain || !this.rainGain || !this.windFilter) return;
        const now = this.ctx.currentTime;

        // --- LÒGICA VENT ---
        let targetWindGain = 0;
        let targetWindFreq = 150;
        
        // El vent comença a sonar a partir de 5km/h
        if (weather.wind > 5) {
            const windFactor = Math.min((weather.wind - 5) / 80, 1); 
            targetWindGain = 0.05 + (windFactor * 0.4); // Max 0.45 gain
            targetWindFreq = 100 + (windFactor * 500); // Freqüència puja amb velocitat (xiulit)
        }
        
        // --- LÒGICA PLUJA ---
        // Prioritzem el codi WMO per saber si plou ACTUALMENT
        // Codis pluja: 51-67, 80-82. Tempesta: 95-99. Neu: 71-77
        let targetRainGain = 0;
        let isRainingCurrent = false;

        if (weather.code !== undefined) {
             if ((weather.code >= 51 && weather.code <= 67) || (weather.code >= 80 && weather.code <= 99)) {
                 isRainingCurrent = true;
             }
        } else if (weather.rain > 1.0) {
            // Fallback si no tenim codi però hi ha acumulació significativa
            isRainingCurrent = true;
        }
        
        if (isRainingCurrent) {
            targetRainGain = 0.15; // Pluja base
            if (weather.wind > 30 || (weather.code && weather.code >= 95)) {
                targetRainGain = 0.35; // Tempesta
            }
        }

        // Transicions suaus de 3 segons
        this.windGain.gain.setTargetAtTime(targetWindGain, now, 3);
        this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 3);
        this.rainGain.gain.setTargetAtTime(targetRainGain, now, 3);
    }

    // --- CONTROLS DE VOLUM USUARI ---
    
    public setMusicVolume(val: number) {
        this.musicVolume = Math.max(0, Math.min(1, val));
        if (this.musicBus && this.ctx) {
            this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.1);
        }
    }

    public setSfxVolume(val: number) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
        if (this.sfxBus && this.ctx) {
            this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.1);
        }
    }
    
    public getVolumes() {
        return { music: this.musicVolume, sfx: this.sfxVolume };
    }

    public async play() {
        if (this.isPlaying) return;
        
        this.initAudio();
        if (this.ctx?.state === 'suspended') {
            await this.ctx.resume();
        }

        // Fade In suau MASTER
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
            this.masterGain.gain.linearRampToValueAtTime(0.8, this.ctx.currentTime + 2);
        }

        this.isPlaying = true;
        console.log("🎵 Soundscape: Iniciant motor d'àudio + Weather FX...");

        try {
            if (!this.session) {
                await this.connectSession();
            } else {
                this.session.play();
            }
        } catch (e) {
            console.error("❌ Error connectant a Lyria:", e);
            this.isPlaying = false;
        }
    }

    public pause() {
        this.isPlaying = false;
        
        // Fade Out Master
        if (this.masterGain && this.ctx) {
             const now = this.ctx.currentTime;
             this.masterGain.gain.cancelScheduledValues(now);
             this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
             this.masterGain.gain.linearRampToValueAtTime(0, now + 1.5);
             
             setTimeout(() => {
                 if (!this.isPlaying && this.session) {
                     this.session.pause();
                     if (this.ctx) this.ctx.suspend();
                     console.log("⏸️ Soundscape pausat.");
                 }
             }, 1600);
        } else {
            if (this.session) this.session.pause();
        }
    }

    private async connectSession() {
        if (this.session) return;

        this.session = await this.ai.live.music.connect({
            model: LYRIA_MODEL,
            callbacks: {
                onmessage: async (msg: any) => {
                    
                    if (msg.setupComplete) {
                        console.log("✅ Sessió Generativa Activa.");
                        
                        await this.session.setMusicGenerationConfig({
                            musicGenerationConfig: {
                                temperature: 1.0, 
                                topK: 40,
                                guidance: 3.0 // Menys "musical", més ambiental
                            }
                        });

                        this.sendPrompts();
                        
                        if (this.isPlaying) {
                            this.session.play();
                        }
                    }

                    if (msg.serverContent?.audioChunks?.[0]?.data) {
                        if (!this.isPlaying || !this.ctx || !this.musicBus) return;

                        const rawData = msg.serverContent.audioChunks[0].data;
                        const audioBuffer = await decodeAudioData(
                            decode(rawData),
                            this.ctx,
                            SAMPLE_RATE,
                            2
                        );

                        this.scheduleBuffer(audioBuffer);
                    }
                },
                onerror: (err: any) => {
                    console.error("⚠️ Lyria Error:", err);
                    this.triggerReconnection();
                },
                onclose: () => {
                    console.log("🔌 Lyria desconnectat");
                    this.session = null;
                    this.triggerReconnection();
                }
            }
        });
    }

    private isConnecting = false;
    private triggerReconnection() {
        if (this.isConnecting || !this.isPlaying) return;
        this.isConnecting = true;
        
        console.log("🔄 Intentant reconnectar Soundscape...");
        setTimeout(async () => {
            try {
                this.session = null;
                await this.connectSession();
            } catch(e) { console.error("Reconnexió fallida", e); }
            finally { this.isConnecting = false; }
        }, 2000);
    }

    private scheduleBuffer(buffer: AudioBuffer) {
        if (!this.ctx || !this.musicBus) return;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.musicBus); // Connectem al Bus de Música

        const now = this.ctx.currentTime;
        
        if (this.nextStartTime < now) {
            this.nextStartTime = now + this.bufferTime;
        }

        src.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
    }

    // --- INTERACTIVITAT ---

    public async updateContext(weather: WeatherData, aiSummary: string) {
        const now = Date.now();
        if (now - this.lastContextUpdate < 2000) return;
        this.lastContextUpdate = now;

        // 1. Prompt Visual
        if (aiSummary && aiSummary.length > 0) {
             this.currentVisualPrompt = `Atmosphere: ${aiSummary}. Safe, relaxing, functional audio.`;
        } else {
             // Default safe prompt
             this.currentVisualPrompt = "Atmosphere: Calm nature, relaxing mountains. Safe environment.";
        }

        // 2. Prompt Meteo (ENDEL STYLE - EXTREME CIRCADIAN SPLIT)
        let weatherVibe = "Safe, calm, functional audio";
        
        const isRaining = weather.code && ((weather.code >= 51 && weather.code <= 67) || (weather.code >= 80 && weather.code <= 99));
        const isSnowing = weather.code && (weather.code >= 71 && weather.code <= 77);
        const isStorm = weather.code && (weather.code >= 95);
        const isFog = weather.code === 45 || weather.code === 48;

        // --- LAYER 1: WEATHER TEXTURE ---
        if (weather.wind > 40) weatherVibe += ", Deep airflow texture, brown noise drone"; 
        if (isStorm) weatherVibe += ", Warm sub-bass drone, cozy shelter"; 
        else if (isRaining) weatherVibe += ", Pink noise texture, wet acoustics, flowing water";
        else if (isSnowing) weatherVibe += ", Muffled silence, soft texture, cotton-like";
        else if (isFog) weatherVibe += ", Soft pads, mysterious, blurred texture";
        else weatherVibe += ", Clear tone, sine waves, open space";

        // --- LAYER 2: CIRCADIAN RHYTHM (DAY vs NIGHT) ---
        if (!weather.isDay) {
            // NIGHT: DEEP SLEEP / DELTA
            weatherVibe += ", SLEEP MODE: 432Hz tuning, Delta waves, deep relaxation, floating, no rhythm, subconscious, dream state, very slow attack";
        } else {
            // DAY: FOCUS / FLOW / ALPHA
            weatherVibe += ", FOCUS MODE: Alpha waves, flow state, clarity, subtle pulse, productive atmosphere, bright presence, nature connection";
        }

        this.currentWeatherPrompt = weatherVibe;

        // 3. ACTUALITZAR CAPES FISIQUES (SFX)
        this.updateWeatherSFX(weather);

        if (this.isPlaying && this.session) {
            // Ducking effect: Lower volume momentarily when changing context
            if (this.musicBus && this.ctx) {
                const ct = this.ctx.currentTime;
                this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.3, ct, 0.5);
                setTimeout(() => {
                    if (this.musicBus && this.ctx) {
                         this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 1.5);
                    }
                }, 1000);
            }
            this.sendPrompts();
        }
    }

    private async sendPrompts() {
        if (!this.session) return;

        // Weight balancing: Weather > Visual > Genre
        const weightedPrompts = [
            { text: this.currentVisualPrompt, weight: 1.0 },
            { text: `Texture & Mode: ${this.currentWeatherPrompt}`, weight: 1.5 }, // Important: Mode (Sleep/Focus)
            { text: "Genre: Functional Audio, Ambient, Drone, No Melody, Minimalist, Binaural Beats", weight: 0.8 }
        ];

        console.log("🎨 Generant Paisatge Sonor (Circadian):", {
            Visual: this.currentVisualPrompt,
            Meteo: this.currentWeatherPrompt
        });

        try {
            await this.session.setWeightedPrompts({ weightedPrompts });
        } catch (e) {
            console.error("Error actualitzant prompts:", e);
        }
    }
}

export const Soundscape = new SoundscapeEngine();
