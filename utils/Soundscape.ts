import { GoogleGenAI } from "@google/genai";
import { WeatherData } from "../types";

// --- UTILS PER DECODIFICAR AUDIO (Lyria) ---

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
  const buffer = ctx.createBuffer(numChannels, data.length / 2 / numChannels, sampleRate);
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

// --- CONFIGURACIÓ ---
const LYRIA_MODEL = 'lyria-realtime-exp';
const LYRIA_SAMPLE_RATE = 48000; 
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==";

class SoundscapeEngine {
    private ai: GoogleGenAI;
    private session: any | null = null; 
    private ctx: AudioContext | null = null;
    
    // Busos
    private masterGain: GainNode | null = null; 
    private musicBus: GainNode | null = null;   
    private sfxBus: GainNode | null = null;     
    
    // FX Layers
    private windNode: AudioBufferSourceNode | null = null;
    private windGain: GainNode | null = null;
    private windFilter: BiquadFilterNode | null = null;
    private rainNode: AudioBufferSourceNode | null = null;
    private rainGain: GainNode | null = null;
    private rainFilter: BiquadFilterNode | null = null;

    private isPlaying: boolean = false;
    private nextStartTime: number = 0;
    private bufferTime: number = 0.2; 
    
    private currentVisualPrompt: string = "";
    private currentWeatherPrompt: string = "Calm atmosphere, safe environment";
    private lastContextUpdate: number = 0;

    private musicVolume: number = 0.6;
    private sfxVolume: number = 0.5;

    private isConnecting: boolean = false;
    private reconnectTimer: any = null;

    private silentAudio: HTMLAudioElement | null = null;

    constructor() {
        this.ai = new GoogleGenAI({ 
            apiKey: process.env.NEXT_PUBLIC_API_KEY || process.env.API_KEY, 
            apiVersion: 'v1alpha' 
        });
    }

    /**
     * PREPARE: Cridar OBLIGATÒRIAMENT en un 'click' event.
     */
    public async prepare() {
        console.log("[Soundscape] Preparing Audio Context...");
        
        // 1. Inicialitzar AudioContext
        if (!this.ctx) {
            // @ts-ignore
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
            this.setupMixer();
        }

        // 2. Despertar el context (Wait for it!)
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        // 3. NUCLEAR WAKE UP: Ara que el context està actiu, llancem l'ona.
        this.forceAudioHardwareWakeup();

        // 4. HTML5 Audio (Segon Pla)
        this.setupSilentElement();
        
        // 5. Media Session (Lock Screen)
        this.setupMediaSession();
    }

    private forceAudioHardwareWakeup() {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.frequency.value = 440; 
            gain.gain.value = 0.0001; 
            osc.start(this.ctx.currentTime);
            osc.stop(this.ctx.currentTime + 0.1);
        } catch (e) {
            console.warn("Wakeup failed", e);
        }
    }

    private setupSilentElement() {
        if (!this.silentAudio) {
            this.silentAudio = new Audio();
            this.silentAudio.src = SILENT_WAV;
            this.silentAudio.loop = true;
            this.silentAudio.volume = 1.0;
            this.silentAudio.setAttribute('playsinline', 'true');
            this.silentAudio.setAttribute('webkit-playsinline', 'true');
            this.silentAudio.style.display = 'none';
            document.body.appendChild(this.silentAudio);
        }
        
        // Forçar play dins del gest de l'usuari
        if (this.silentAudio.paused) {
            this.silentAudio.play().catch(() => {});
        }
    }

    private setupMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Atmosfera',
                artist: 'P4E Nexus',
                album: 'Live Soundscape',
                artwork: [{ src: 'https://app.projecte4estacions.com/images/logo_p4e_2023_h_blau_200.png', sizes: '200x200', type: 'image/png' }]
            });
            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
            navigator.mediaSession.playbackState = 'playing';
        }
    }

    private setupMixer() {
        if (!this.ctx) return;
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.ctx.destination);

        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicVolume;
        this.musicBus.connect(this.masterGain);

        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.sfxVolume;
        this.sfxBus.connect(this.masterGain);
    }

    private async connectLyria() {
        if (this.isConnecting || this.session) return;
        this.isConnecting = true;

        try {
            console.log("[Soundscape] Connecting...");
            this.session = await this.ai.live.music.connect({
                model: LYRIA_MODEL,
                callbacks: {
                    onmessage: async (msg: any) => {
                        if (msg.setupComplete) {
                            console.log("[Soundscape] Live");
                            this.isConnecting = false;
                            this.session.play(); 
                            this.sendPrompts();
                        }
                        if (msg.serverContent?.audioChunks?.[0]?.data && this.ctx && this.musicBus) {
                            if(this.ctx.state === 'suspended') await this.ctx.resume();
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
                        console.warn("Lyria Error", e);
                        this.triggerReconnection();
                    },
                    onclose: () => {
                        this.session = null;
                        this.triggerReconnection();
                    }
                }
            });
        } catch (e) {
            console.error("Connection failed", e);
            this.isConnecting = false;
            this.triggerReconnection();
        }
    }

    private triggerReconnection() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (!this.isPlaying) return; 
        this.reconnectTimer = setTimeout(() => {
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
        if (this.nextStartTime < now) this.nextStartTime = now + 0.05;
        
        source.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
    }

    private createNoiseBuffer(): AudioBuffer | null {
        if (!this.ctx) return null;
        const bufferSize = this.ctx.sampleRate * 4; 
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
        const freq = Math.max(100, Math.min(800, 100 + (kmh * 7)));
        const vol = Math.max(0, Math.min(0.6, kmh / 120));
        this.windFilter.frequency.setTargetAtTime(freq, t, 2);
        this.windGain.gain.setTargetAtTime(vol, t, 2);
    }

    private startRainEngine(isRaining: boolean, intensity: number) {
        if (!this.ctx || !this.sfxBus) return;
        if (!this.rainNode) {
            const noise = this.createNoiseBuffer();
            if (!noise) return;
            this.rainNode = this.ctx.createBufferSource();
            this.rainNode.buffer = noise;
            this.rainNode.loop = true;
            this.rainFilter = this.ctx.createBiquadFilter();
            this.rainFilter.type = 'lowpass';
            this.rainFilter.frequency.value = 800; 
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

    public play() {
        this.prepare(); 
        this.isPlaying = true;

        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

        if (!this.session) {
            this.connectLyria();
        } else {
            this.session.play();
        }

        if (!this.windNode) this.startWindEngine(10);
        if (!this.rainNode) this.startRainEngine(false, 0);

        if (this.ctx && this.masterGain) {
            this.masterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 1);
        }
    }

    public pause() {
        this.isPlaying = false;
        
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

        if (this.ctx && this.masterGain) {
            this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
        }

        setTimeout(() => {
            this.session?.pause();
        }, 600);
        
    }

    public updateContext(weather: WeatherData, visualSummary: string) {
        if (!this.isPlaying) return;

        const now = Date.now();
        if (now - this.lastContextUpdate < 10000) return;
        this.lastContextUpdate = now;

        this.performDucking();
        this.currentVisualPrompt = visualSummary;
        this.currentWeatherPrompt = this.buildAtmospherePrompt(weather);
        setTimeout(() => this.sendPrompts(), 1000);
        this.updateWindParams(weather.wind);
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
        this.masterGain.gain.setTargetAtTime(0.2, t, 0.5);
        this.masterGain.gain.setTargetAtTime(1.0, t + 2.5, 1.5);
    }

    private buildAtmospherePrompt(w: WeatherData): string {
        const isDay = w.isDay !== undefined ? w.isDay : true;
        const baseVibe = isDay 
            ? "Focus mode, alpha waves, steady pulse, clarity, flow state, major key, organic texture" 
            : "Deep sleep mode, delta waves, 432Hz, no rhythm, floating, subconscious, warm blanket, minimal";

        let weatherVibe = "Calm air";
        if (w.wind > 40) weatherVibe = "Deep airflow texture, white noise layers";
        else if (w.wind > 20) weatherVibe = "Breezy texture, movement";

        if (w.code && w.code >= 51) {
            weatherVibe += ", wet acoustics, rainfall texture, cozy shelter";
        } else if (w.code && w.code >= 71) {
            weatherVibe += ", muffled silence, crystalline high frequencies, snow acoustics";
        }

        return `${baseVibe}. ${weatherVibe}. Safe, healing frequencies, spa atmosphere. No aggressive sounds.`;
    }

    private sendPrompts() {
        if (!this.session) return;
        const prompts = [
            { text: this.currentVisualPrompt, weight: 1.0 },
            { text: this.currentWeatherPrompt, weight: 1.2 },
            { text: "Ambient, Drone, Field Recordings, Functional Music, Non-musical, Minimalist", weight: 0.5 }
        ];
        try {
            this.session.setWeightedPrompts({ weightedPrompts: prompts });
        } catch (e) {
            console.warn("Failed to set prompts", e);
        }
    }

    public getVolumes() { return { music: this.musicVolume, sfx: this.sfxVolume }; }
    public setMusicVolume(val: number) {
        this.musicVolume = val;
        if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }
    public setSfxVolume(val: number) {
        this.sfxVolume = val;
        if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }
}

export const Soundscape = new SoundscapeEngine();
