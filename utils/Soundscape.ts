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
  data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(numChannels, data.length / 2 / numChannels, sampleRate);
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const dataFloat32 = new Float32Array(dataInt16.length);
  for (let i = 0; i < dataInt16.length; i++) dataFloat32[i] = dataInt16[i] / 32768.0;

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
const LYRIA_SAMPLE_RATE = 48000; 

// Aquest silenci és només per desbloquejar l'àudio en iOS/Safari
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==";

class SoundscapeEngine {
    private ai: GoogleGenAI;
    private session: any | null = null; 
    private ctx: AudioContext | null = null;
    
    private masterGain: GainNode | null = null; 
    private musicBus: GainNode | null = null;   
    private sfxBus: GainNode | null = null;     
    
    private isPlaying: boolean = false;
    private nextStartTime: number = 0;
    private bufferTime: number = 0.2; 
    
    // Estat actual
    private currentVisualPrompt: string = "";
    private currentWeatherData: WeatherData | null = null;
    private isGlobalMode: boolean = false; 
    private lastContextUpdate: number = 0;

    private musicVolume: number = 0.6;
    private sfxVolume: number = 0.5;

    private isConnecting: boolean = false;
    private reconnectTimer: any = null;

    private silentAudio: HTMLAudioElement | null = null;
    private keepAliveNode: ScriptProcessorNode | null = null;

    constructor() {
        this.ai = new GoogleGenAI({ 
            apiKey: process.env.API_KEY, 
            apiVersion: 'v1alpha' 
        });
    }

    public prepare() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.setupMixer();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(e => console.warn("AudioContext resume failed", e));
        }
        if (!this.silentAudio) {
            this.silentAudio = document.createElement('audio');
            this.silentAudio.src = SILENT_WAV;
            this.silentAudio.loop = true;
            this.silentAudio.preload = 'auto';
            this.silentAudio.volume = 1.0; 
            this.silentAudio.setAttribute('playsinline', '');
            this.silentAudio.setAttribute('webkit-playsinline', '');
            this.silentAudio.style.display = 'none';
            document.body.appendChild(this.silentAudio);
        }
        if (this.silentAudio.paused) {
            this.silentAudio.play().catch(() => {});
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

    public getVolumes() { return { music: this.musicVolume, sfx: this.sfxVolume }; }

    public setMusicVolume(val: number) {
        this.musicVolume = val;
        if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }

    public setSfxVolume(val: number) {
        this.sfxVolume = val;
        if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
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
                            this.session.play(); 
                            this.sendPrompts();
                        }
                        if (msg.serverContent?.audioChunks?.[0]?.data && this.ctx && this.musicBus) {
                            const chunk = msg.serverContent.audioChunks[0];
                            const audioBuffer = await decodeAudioData(decode(chunk.data), this.ctx, LYRIA_SAMPLE_RATE, 2);
                            this.scheduleChunk(audioBuffer);
                        }
                    },
                    onerror: (e: any) => { console.warn("[Soundscape] Error:", e); this.triggerReconnection(); },
                    onclose: (e: any) => { console.log("[Soundscape] Closed:", e); this.session = null; this.triggerReconnection(); }
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
        if (this.nextStartTime < now) this.nextStartTime = now + this.bufferTime;
        source.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
    }

    // --- MAIN CONTROL ---
    public play() {
        this.prepare(); 
        this.isPlaying = true;
        if (!this.session) this.connectLyria();
        else this.session.play();
        if (this.ctx && this.masterGain) this.masterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 1);
    }

    public pause() {
        this.isPlaying = false;
        if (this.ctx && this.masterGain) this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
        setTimeout(() => { this.session?.pause(); }, 600);
        if (this.silentAudio) this.silentAudio.pause();
    }

    public updateContext(weather: WeatherData, visualSummary: string, isGlobalMode: boolean = false) {
        this.currentWeatherData = weather;
        this.currentVisualPrompt = visualSummary;
        this.isGlobalMode = isGlobalMode;

        if (!this.isPlaying) return;
        const now = Date.now();
        // Permetem actualitzacions una mica més ràpides si és mode detall per ser reactius
        if (now - this.lastContextUpdate < 6000) return; 
        this.lastContextUpdate = now;
        
        setTimeout(() => this.sendPrompts(), 500);
    }

    // --- EL COR DEL SISTEMA: GENERACIÓ DE PROMPTS REALISTA ---

    private getNatureFoley(w: WeatherData): string {
        let foley = "";
        
        // 1. VENT (La base de la presència)
        // El vent dona la sensació d'espai físic.
        if (w.wind > 60) {
            foley += "Violent storm wind howling, microphone buffeting distortion, chaotic debris sounds, heavy sub-bass rumbling. ";
        } else if (w.wind > 30) {
            foley += "Strong mountain wind whistling through rocks, cold air pressure, turbulence texture. ";
        } else if (w.wind > 10) {
            foley += "Gentle constant breeze in pine trees, moving air texture, open valley acoustics. ";
        } else {
            foley += "Still air, absolute silence with microscopic nature details, vast empty space feeling. ";
        }

        // 2. PRECIPITACIÓ (La textura)
        // Definim com colpeja l'aigua.
        if (w.code !== undefined) {
            // Pluja
            if ((w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 82)) {
                if (w.rain > 5) {
                    foley += "Heavy rain pouring on concrete and leaves, water streams rushing, distinct droplets close to microphone, wet atmosphere. ";
                } else {
                    foley += "Light rain drizzle, soft wet pavement texture, individual drops hitting jacket, damp air sound. ";
                }
            } 
            // Tempesta
            else if (w.code >= 95) {
                foley += "Distant rolling thunder (low frequency), electric static in the air, sudden rain bursts, ominous atmosphere. ";
            } 
            // Neu (Silenci positiu)
            else if (w.code >= 71 && w.code <= 77) {
                foley += "Acoustic deadening (snow absorption), muffled footsteps, soft ice cracking, snowflake silence, freezing cold texture. ";
            } 
            // Boira
            else if (w.code === 45 || w.code === 48) {
                foley += "Thick fog droplets, flat acoustics, water condensation dripping, mysterious quietness. ";
            }
        }

        return foley;
    }

    private buildPrompt(w: WeatherData, visualSummary: string): string {
        const isDay = w.isDay !== undefined ? w.isDay : true;
        const natureFoley = this.getNatureFoley(w);
        
        // Aquesta és la clau per semblar Endel:
        // No demanem "Música", demanem "Soundscape" i "Field Recording".
        // Utilitzem termes de freqüència i color de soroll.
        
        const endelBase = isDay 
            ? "Organic brown noise, alpha waves (8-12Hz), subtle warm drone, focus-enhancing frequencies, flow state."
            : "Deep pink noise, delta waves (0.5-4Hz), womb-like resonance, sleep-inducing static, night crickets texture.";

        // --- MODE GLOBAL (TV) ---
        // Viatge aeri suau, però realista.
        if (this.isGlobalMode) {
            return `
                Context: High-altitude aerial recording of Catalonia nature.
                Audio Texture: ${endelBase}
                Environment: Wind blowing over mountains, distant river flow, vast spatial reverb.
                Musicality: Very subtle generative pads, no melody, no rhythm, seamless infinite texture, healing frequencies.
            `.replace(/\s+/g, ' ').trim();
        } 
        
        // --- MODE DETALL (IMMERSIVA) ---
        // Aquí volem que l'usuari senti que és AL LLOC.
        else {
            return `
                Type: High-fidelity 3D Binaural Field Recording.
                Location Acoustics: Open outdoor valley, natural reverb.
                Weather Reality: ${natureFoley}
                Visual Context: ${visualSummary} (translate visuals to sound textures).
                Underlying Layer: ${endelBase} Very low volume generative drone layer for emotional grounding.
                Constraints: No drums, no piano loops, no musical structure. Pure sonic texture and weather reality.
            `.replace(/\s+/g, ' ').trim();
        }
    }

    private sendPrompts() {
        if (!this.session) return;
        const weather = this.currentWeatherData || { temp: "15", wind: 5, humidity: 0, rain: 0, isReal: false };
        const masterPrompt = this.buildPrompt(weather, this.currentVisualPrompt);
        
        console.log(`[Soundscape] Mode: ${this.isGlobalMode ? 'TV' : 'DETAIL'} | Realism Level: MAX`);
        console.log("[Soundscape] Prompt:", masterPrompt);
        
        try {
            this.session.setWeightedPrompts({ weightedPrompts: [{ text: masterPrompt, weight: 1.0 }]});
        } catch (e) {
            console.warn("Failed to set prompts", e);
        }
    }
}

export const Soundscape = new SoundscapeEngine();