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
const LYRIA_SAMPLE_RATE = 48000; // Freqüència de la IA

// Tiny silent MP3 to unlock iOS audio session (Using audio/mpeg for better Safari compatibility)
const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////wAAAP//OEAAAAAAAAAAAAAAAAAAAAAAAMqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//OEAAAAAAAAAAAAAAAAAAAAAAABiqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

class SoundscapeEngine {
    private ai: GoogleGenAI;
    private session: any | null = null; 
    private ctx: AudioContext | null = null;
    
    // --- BUSOS DE MESCLA ---
    private masterGain: GainNode | null = null; 
    private musicBus: GainNode | null = null;   
    private sfxBus: GainNode | null = null;     
    
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

    // Estat connexió
    private isConnecting: boolean = false;
    private reconnectTimer: any = null;

    // iOS Unlock
    private silentAudio: HTMLAudioElement | null = null;

    constructor() {
        // IMPORTANT: Lyria model requires v1alpha API version
        this.ai = new GoogleGenAI({ 
            apiKey: process.env.API_KEY, 
            apiVersion: 'v1alpha' 
        });
    }

    /**
     * Prepare AudioContext (iOS Unlock)
     * Has de cridar això al primer clic de l'usuari (ex: botó Entrar)
     */
    public prepare() {
        if (!this.ctx) {
            // No forcem sampleRate, deixem que el dispositiu decideixi per evitar glitches en iOS
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.setupMixer();
        }

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(e => console.warn("AudioContext resume failed", e));
        }

        // --- STRATEGY 1: HTML5 AUDIO LOOP (Existing) ---
        // Keeps the audio session active in the background
        if (!this.silentAudio) {
            this.silentAudio = new Audio();
            this.silentAudio.loop = true; 
            this.silentAudio.volume = 0.01; // Not 0, just in case iOS ignores 0 volume players
            this.silentAudio.crossOrigin = "anonymous";
            this.silentAudio.src = SILENT_MP3;
            
            const playPromise = this.silentAudio.play();
            if (playPromise !== undefined) {
                playPromise.catch((e) => {
                    console.warn("Silent audio unlock failed (non-fatal):", e);
                });
            }
        } else {
            if (this.silentAudio.paused) {
                this.silentAudio.play().catch(() => {});
            }
        }

        // --- STRATEGY 2: WEB AUDIO OSCILLATOR KICK (New) ---
        // Generates a brief, nearly silent sound directly on the AudioContext
        // to force the system to switch to "Playback" mode immediately (ignoring mute switch).
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.value = 50; // Low hum
            gain.gain.value = 0.001; // Barely audible
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1); // Stop after 100ms
        } catch (e) {
            console.warn("Oscillator unlock failed", e);
        }
    }

    private setupMixer() {
        if (!this.ctx) return;
        
        // Master
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.ctx.destination);

        // Music Bus
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicVolume;
        this.musicBus.connect(this.masterGain);

        // SFX Bus
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.sfxVolume;
        this.sfxBus.connect(this.masterGain);
    }

    public getVolumes() {
        return { music: this.musicVolume, sfx: this.sfxVolume };
    }

    public setMusicVolume(val: number) {
        this.musicVolume = val;
        if (this.musicBus && this.ctx) {
            this.musicBus.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
        }
    }

    public setSfxVolume(val: number) {
        this.sfxVolume = val;
        if (this.sfxBus && this.ctx) {
            this.sfxBus.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
        }
    }

    // --- LYRIA CONNECTION ---

    private async connectLyria() {
        if (this.isConnecting || this.session) return;
        this.isConnecting = true;

        try {
            console.log("[Soundscape] Connecting to Lyria (v1alpha)...");
            this.session = await this.ai.live.music.connect({
                model: LYRIA_MODEL,
                callbacks: {
                    onmessage: async (msg: any) => {
                        if (msg.setupComplete) {
                            console.log("[Soundscape] Session Ready");
                            this.isConnecting = false;
                            this.session.play(); // IMPORTANT!
                            this.sendPrompts();
                        }
                        if (msg.serverContent?.audioChunks?.[0]?.data && this.ctx && this.musicBus) {
                            const chunk = msg.serverContent.audioChunks[0];
                            const audioBuffer = await decodeAudioData(
                                decode(chunk.data),
                                this.ctx,
                                LYRIA_SAMPLE_RATE,
                                2
                            );
                            this.scheduleChunk(audioBuffer);
                        }
                    },
                    onerror: (e: any) => {
                        console.warn("[Soundscape] Error:", e);
                        this.triggerReconnection();
                    },
                    onclose: (e: any) => {
                        console.log("[Soundscape] Closed:", e);
                        this.session = null;
                        this.triggerReconnection();
                    }
                }
            });
        } catch (e) {
            console.error("[Soundscape] Connection failed", e);
            this.isConnecting = false;
            this.triggerReconnection();
        }
    }

    private triggerReconnection() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (!this.isPlaying) return; // Don't reconnect if paused by user

        this.reconnectTimer = setTimeout(() => {
            console.log("[Soundscape] Attempting auto-reconnect...");
            this.session = null;
            this.connectLyria();
        }, 2000);
    }

    private scheduleChunk(buffer: AudioBuffer) {
        if (!this.ctx || !this.musicBus) return;
        
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.musicBus);

        const now = this.ctx.currentTime;
        if (this.nextStartTime < now) this.nextStartTime = now + this.bufferTime;
        
        source.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
    }

    // --- PROCEDURAL WEATHER FX (Brown/Pink Noise) ---

    private createNoiseBuffer(): AudioBuffer | null {
        if (!this.ctx) return null;
        const bufferSize = this.ctx.sampleRate * 4; // 4 seconds loop
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }
        return buffer;
    }

    private startWindEngine(windSpeed: number) {
        if (!this.ctx || !this.sfxBus || this.windNode) return;

        const noise = this.createNoiseBuffer();
        if (!noise) return;

        this.windNode = this.ctx.createBufferSource();
        this.windNode.buffer = noise;
        this.windNode.loop = true;

        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.Q.value = 1;
        
        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0;

        this.windNode.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.sfxBus);

        this.windNode.start();
        this.updateWindParams(windSpeed);
    }

    private updateWindParams(kmh: number) {
        if (!this.ctx || !this.windFilter || !this.windGain) return;
        
        const t = this.ctx.currentTime;
        
        // Map Wind 0-100kmh to Filter Freq 100-800Hz
        const freq = Math.max(100, Math.min(800, 100 + (kmh * 7)));
        // Map Wind to Volume 0-0.6
        const vol = Math.max(0, Math.min(0.6, kmh / 120));

        this.windFilter.frequency.setTargetAtTime(freq, t, 2);
        this.windGain.gain.setTargetAtTime(vol, t, 2);
    }

    private startRainEngine(isRaining: boolean, intensity: number) {
        if (!this.ctx || !this.sfxBus) return;

        // Create if missing
        if (!this.rainNode) {
            const noise = this.createNoiseBuffer();
            if (!noise) return;
            
            this.rainNode = this.ctx.createBufferSource();
            this.rainNode.buffer = noise;
            this.rainNode.loop = true;

            this.rainFilter = this.ctx.createBiquadFilter();
            this.rainFilter.type = 'lowpass';
            this.rainFilter.frequency.value = 800; // Muffled rain

            this.rainGain = this.ctx.createGain();
            this.rainGain.gain.value = 0;

            this.rainNode.connect(this.rainFilter);
            this.rainFilter.connect(this.rainGain);
            this.rainGain.connect(this.sfxBus);
            this.rainNode.start();
        }

        const t = this.ctx.currentTime;
        const targetVol = isRaining ? Math.min(0.5, 0.1 + (intensity / 10)) : 0;
        this.rainGain?.gain.setTargetAtTime(targetVol, t, 2);
    }


    // --- MAIN CONTROL ---

    public play() {
        this.prepare(); // Ensure ctx is ready & silent audio is looping
        this.isPlaying = true;

        // Connect Lyria
        if (!this.session) {
            this.connectLyria();
        } else {
            this.session.play();
        }

        // Start FX Engines
        if (!this.windNode) this.startWindEngine(10);
        if (!this.rainNode) this.startRainEngine(false, 0);

        // Fade In Master
        if (this.ctx && this.masterGain) {
            this.masterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 1);
        }
    }

    public pause() {
        this.isPlaying = false;
        
        // Fade Out Master
        if (this.ctx && this.masterGain) {
            this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
        }

        // Pause Lyria Session after fade
        setTimeout(() => {
            this.session?.pause();
        }, 600);

        // PAUSE SILENT AUDIO TO SAVE BATTERY
        if (this.silentAudio) {
            this.silentAudio.pause();
        }
    }

    // --- CONTEXT & PROMPTS ---

    public updateContext(weather: WeatherData, visualSummary: string) {
        if (!this.isPlaying) return;

        // Rate Limit Updates (10s)
        const now = Date.now();
        if (now - this.lastContextUpdate < 10000) return;
        this.lastContextUpdate = now;

        // Perform Ducking (Fade down -> Update -> Fade up)
        this.performDucking();

        // 1. Determine Prompts
        this.currentVisualPrompt = visualSummary;
        this.currentWeatherPrompt = this.buildAtmospherePrompt(weather);

        // 2. Send to Lyria
        setTimeout(() => this.sendPrompts(), 1000); // Wait for ducking down

        // 3. Update Procedural FX
        this.updateWindParams(weather.wind);
        
        // WMO Codes for Rain: 51-67, 80-82, 95-99
        const isRaining = (weather.code !== undefined) && (
            (weather.code >= 51 && weather.code <= 67) || 
            (weather.code >= 80 && weather.code <= 82) || 
            (weather.code >= 95)
        );
        this.startRainEngine(isRaining, weather.rain);
    }

    private performDucking() {
        if (!this.ctx || !this.masterGain) return;
        const t = this.ctx.currentTime;
        // Dip volume to 20%
        this.masterGain.gain.setTargetAtTime(0.2, t, 0.5);
        // Return to 100% after 2.5s
        this.masterGain.gain.setTargetAtTime(1.0, t + 2.5, 1.5);
    }

    private buildAtmospherePrompt(w: WeatherData): string {
        const isDay = w.isDay !== undefined ? w.isDay : true;
        
        // ENDEL STYLE LOGIC: DAY vs NIGHT
        const baseVibe = isDay 
            ? "Focus mode, alpha waves, steady pulse, clarity, flow state, major key, organic texture" 
            : "Deep sleep mode, delta waves, 432Hz, no rhythm, floating, subconscious, warm blanket, minimal";

        let weatherVibe = "Calm air";
        if (w.wind > 40) weatherVibe = "Deep airflow texture, white noise layers";
        else if (w.wind > 20) weatherVibe = "Breezy texture, movement";

        // Rain Logic using WMO Codes
        if (w.code && w.code >= 51) {
            weatherVibe += ", wet acoustics, rainfall texture, cozy shelter";
        } else if (w.code && w.code >= 71) {
            weatherVibe += ", muffled silence, crystalline high frequencies, snow acoustics";
        }

        return `${baseVibe}. ${weatherVibe}. Safe, healing frequencies, spa atmosphere. No aggressive sounds.`;
    }

    private sendPrompts() {
        if (!this.session) return;
        
        // Weighting: 
        // Visual (Specific location) = 1.0
        // Weather/Circadian (Endel Vibe) = 1.2 (Higher priority for functional audio)
        // Genre (Safety) = 0.5

        const prompts = [
            { text: this.currentVisualPrompt, weight: 1.0 },
            { text: this.currentWeatherPrompt, weight: 1.2 },
            { text: "Ambient, Drone, Field Recordings, Functional Music, Non-musical, Minimalist", weight: 0.5 }
        ];

        console.log("[Soundscape] Sending Prompts:", prompts);
        
        try {
            this.session.setWeightedPrompts({ weightedPrompts: prompts });
        } catch (e) {
            console.warn("Failed to set prompts", e);
        }
    }
}

export const Soundscape = new SoundscapeEngine();
