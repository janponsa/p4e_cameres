/**
 * @fileoverview IMAGE RADIO - Tune into any image in the world
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, CSSResultGroup, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

import {
  GoogleGenAI,
  GenerateContentResponse,
  type LiveMusicGenerationConfig,
  type LiveMusicServerMessage,
  type LiveMusicSession,
  Type,
} from '@google/genai';

import {decode, decodeAudioData, fileToBase64} from './utils';

// Types
interface ImagePrompt {
  id: string;
  imageUrl: string;
  displayTitle: string; // For UI display above description box
  musicPrompt: string;  // For Lyria and for scrolling description box
  weight: number; // Always 1.0 for equal weighting
  vibe: 'WAVE' | 'SHARP' | 'GEOMETRIC' | 'DIGITAL' | 'DREAMY' | 'FLUID' | 'ORGANIC' | 'SPARKLE' | 'RAIN' | 'OCEAN' | 'RADAR' | 'CELLULAR'; // AI-selected wave vibe
}

type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

// Icon definitions - Material Design
const ICONS = {
  play: svg`<path d="M320-200v-560l440 280-440 280Z"/>`,
  pause: svg`<path d="M560-200v-560h160v560H560Zm-320 0v-560h160v560H240Z"/>`,
  loading: svg`<path class="loader-icon" d="M 12,2 A 10,10 0 0 1 12,22 A 10,10 0 0 1 12,2" fill="none"/>`,
  reset: svg`<path d="M204-318q-22-38-33-78t-11-82q0-134 93-228t227-94h7l-64-64 56-56 160 160-160 160-56-56 64-64h-7q-100 0-170 70.5T240-478q0 26 6 51t18 49l-60 60ZM481-40 321-200l160-160 56 56-64 64h7q100 0 170-70.5T720-482q0-26-6-51t-18-49l60-60q22 38 33 78t11 82q0 134-93 228t-227 94h-7l64 64-56 56Z"/>`,
  download: svg`<path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>`,
  plus: svg`<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>`,
  grid: svg`<path d="M200-120h107v-187H120v107q0 33 23.5 56.5T200-120Zm187 0h186v-187H387v187Zm266 0h107q33 0 56.5-23.5T840-200v-107H653v187ZM120-387h187v-186H120v186Zm267 0h186v-186H387v186Zm266 0h187v-186H653v186ZM120-653h187v-187H200q-33 0-56.5 23.5T120-760v107Zm267 0h186v-187H387v187Zm266 0h187v-107q0-33-23.5-56.5T760-840H653v187Z"/>`,
  square: svg`<rect x="3" y="3" width="18" height="18" rx="0" ry="0"/>`,
  cross: svg`<path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>`
};

// AI Clients
const lyriaAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1alpha',
});
const imageAnalysisAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
const [lyriaModel, imageAnalysisModel] = ['lyria-realtime-exp', 'gemini-2.5-flash'];

// Audio recording utility
class AudioRecorder {
  private chunks: Float32Array[] = [];
  private isRecording = false;
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  start() {
    this.chunks = [];
    this.isRecording = true;
  }

  addChunk(audioBuffer: AudioBuffer) {
    if (!this.isRecording) return;
    
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
    const mono = new Float32Array(leftChannel.length);
    
    for (let i = 0; i < leftChannel.length; i++) {
      mono[i] = (leftChannel[i] + rightChannel[i]) / 2;
    }
    
    this.chunks.push(mono);
  }

  async stop(metadata?: { image?: Blob, title?: string, artist?: string }): Promise<Blob | null> {
    if (!this.isRecording || this.chunks.length === 0) return null;
    
    this.isRecording = false;
    
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedData = new Float32Array(totalLength);
    
    let offset = 0;
    for (const chunk of this.chunks) {
      combinedData.set(chunk, offset);
      offset += chunk.length;
    }
    
    return await this.encodeWAV(combinedData, metadata);
  }

  async getCurrentRecording(metadata?: { image?: Blob, title?: string, artist?: string }): Promise<Blob | null> {
    if (!this.isRecording || this.chunks.length === 0) return null;
    
    // Don't stop recording, just get current data
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedData = new Float32Array(totalLength);
    
    let offset = 0;
    for (const chunk of this.chunks) {
      combinedData.set(chunk, offset);
      offset += chunk.length;
    }
    
    return await this.encodeWAV(combinedData, metadata);
  }

  private async encodeWAV(samples: Float32Array, metadata?: { image?: Blob, title?: string, artist?: string }): Promise<Blob> {
    const sampleRate = this.sampleRate;
    const numChannels = 1; // mono
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    
    let metadataChunks: Uint8Array[] = [];
    let metadataSize = 0;
    
    if (metadata) {
      if (metadata.title || metadata.artist) {
        const infoChunks: Uint8Array[] = [];
        
        if (metadata.title) {
          const titleData = new TextEncoder().encode(metadata.title);
          const titleChunk = new Uint8Array(8 + titleData.length + (titleData.length % 2));
          const titleView = new DataView(titleChunk.buffer);
          titleView.setUint32(0, 0x49544954, false); // 'ITIT' (title)
          titleView.setUint32(4, titleData.length, true);
          titleChunk.set(titleData, 8);
          infoChunks.push(titleChunk);
        }
        
        if (metadata.artist) {
          const artistData = new TextEncoder().encode(metadata.artist);
          const artistChunk = new Uint8Array(8 + artistData.length + (artistData.length % 2));
          const artistView = new DataView(artistChunk.buffer);
          artistView.setUint32(0, 0x49415254, false); // 'IART' (artist)
          artistView.setUint32(4, artistData.length, true);
          artistChunk.set(artistData, 8);
          infoChunks.push(artistChunk);
        }
        
        if (infoChunks.length > 0) {
          const infoSize = infoChunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const listChunk = new Uint8Array(12 + infoSize);
          const listView = new DataView(listChunk.buffer);
          listView.setUint32(0, 0x4C495354, false); // 'LIST'
          listView.setUint32(4, 4 + infoSize, true);
          listView.setUint32(8, 0x494E464F, false); // 'INFO'
          
          let offset = 12;
          for (const chunk of infoChunks) {
            listChunk.set(chunk, offset);
            offset += chunk.length;
          }
          
          metadataChunks.push(listChunk);
          metadataSize += listChunk.length;
        }
      }
      
      if (metadata.image) {
        const imageData = new Uint8Array(await metadata.image.arrayBuffer());
        const apicChunk = new Uint8Array(8 + imageData.length + (imageData.length % 2));
        const apicView = new DataView(apicChunk.buffer);
        apicView.setUint32(0, 0x41504943, false); // 'APIC' (attached picture)
        apicView.setUint32(4, imageData.length, true);
        apicChunk.set(imageData, 8);
        
        metadataChunks.push(apicChunk);
        metadataSize += apicChunk.length;
      }
    }
    
    const dataSize = samples.length * 2;
    const totalSize = 36 + dataSize + metadataSize;
    
    const buffer = new ArrayBuffer(44 + dataSize + metadataSize);
    const view = new DataView(buffer);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, totalSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    let wavOffset = 44;
    for (let i = 0; i < samples.length; i++, wavOffset += 2) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(wavOffset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }
    
    for (const chunk of metadataChunks) {
      const uint8View = new Uint8Array(buffer, wavOffset);
      uint8View.set(chunk);
      wavOffset += chunk.length;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }
}

/** Throttles a callback to be called at most once per `delay` milliseconds. */
function throttle(func: (...args: unknown[]) => void, delay: number) {
  let lastCall = 0;
  let timeoutId: number | undefined;
  return (...args: unknown[]) => {
    const now = Date.now();
    const remaining = delay - (now - lastCall);
    clearTimeout(timeoutId);
    if (remaining <= 0) {
      func(...args);
      lastCall = now;
    } else {
      timeoutId = window.setTimeout(() => {
        func(...args);
        lastCall = Date.now();
      }, remaining);
    }
  };
}

@customElement('play-button')
class PlayButton extends LitElement {
  static styles: CSSResultGroup = css`
    :host {
      position: relative;
      width: 36px;
      height: 36px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .button {
      width: 100%;
      height: 100%;
      border-radius: 0;
      background: transparent;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: none;
    }
    .button:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .icon {
      width: 16px;
      height: 16px;
      fill: var(--button-icon, #fff);
      stroke: var(--button-icon, #fff);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .loader-icon {
      stroke: var(--button-icon, #fff);
      stroke-width: 1;
      stroke-linecap: round;
      animation: spin 1s linear infinite;
      transform-origin: center;
      fill: none;
    }
    @keyframes spin {
      0% {
        stroke-dasharray: 1, 200;
        stroke-dashoffset: 0;
        transform: rotate(0deg);
      }
      50% {
        stroke-dasharray: 89, 200;
        stroke-dashoffset: -35px;
      }
      100% {
        stroke-dasharray: 89, 200;
        stroke-dashoffset: -124px;
        transform: rotate(360deg);
      }
    }
  `;

  @property({type: String}) playbackState: PlaybackState = 'stopped';

  render() {
    const isLoading = this.playbackState === 'loading';
    const isPlaying = this.playbackState === 'playing';
    const icon = isLoading ? ICONS.loading : isPlaying ? ICONS.pause : ICONS.play;
    
    return html`
      <div class="button" role="button" aria-label=${isLoading ? "Loading audio" : isPlaying ? "Pause audio" : "Play audio"} tabindex="0">
        <svg class="icon" viewBox="0 -960 960 960">${icon}</svg>
      </div>
    `;
  }
}

@customElement('icon-button')
class IconButton extends LitElement {
  static styles: CSSResultGroup = css`
    :host {
      display: inline-block;
    }
    .button {
      width: 36px;
      height: 36px;
      border-radius: 0;
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: none;
    }
    .button:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .icon {
      width: 16px;
      height: 16px;
      fill: var(--icon-button-icon, #fff);
      stroke: var(--icon-button-icon, #fff);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `;

  @property({type: String}) icon = '';
  @property({type: Boolean}) disabled = false;
  @property({type: String}) label = '';

  render() {
    return html`
      <button class="button" ?disabled=${this.disabled} aria-label=${this.label}>
        <svg class="icon" viewBox="0 -960 960 960">${ICONS[this.icon as keyof typeof ICONS] || ''}</svg>
      </button>
    `;
  }
}

@customElement('toast-message')
class ToastMessage extends LitElement {
  static styles: CSSResultGroup = css`
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translate(-50%, 0);
      color: #999;
      padding: 5px 10px;
      font-size: 1rem;
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      max-width: 80vw;
      text-align: center;
      font-family: 'Nanum Gothic Coding', monospace;
      transition: opacity 0.2s ease;
    }
    .toast.showing {
      opacity: 1;
      pointer-events: auto;
    }
    .toast.error {
      color: var(--brand-red);
    }

          @media (max-width: 600px) {
        :host {
          --edge-padding: 10px; 
        }
        .toast {
          bottom: 70px;
          padding: 4px 8px;
        }
      }
  `;

  @property({type: String}) message = '';
  @property({type: Boolean}) showing = false;
  @property({type: Boolean}) isError = false;
  private timeoutId?: number;
  private typewriterInterval?: number;

  show(
    message: string,
    duration = 3000,
    isError = false,
    typewriter = false,
  ) {
    this.message = message;
    this.showing = true;
    this.isError = isError;
    clearTimeout(this.timeoutId);
    if (this.typewriterInterval) clearInterval(this.typewriterInterval);

    if (typewriter) {
      this.animateTypewriter(message);
    } else {
      this.timeoutId = window.setTimeout(() => this.hide(), duration);
    }
  }

  hide() {
    this.showing = false;
    this.isError = false;
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = undefined;
    }
  }

  private animateTypewriter(text: string) {
    let i = 0;
    const typeSpeed = 100;
    const backspaceSpeed = 60;
    const pauseDuration = 1000;

    // Type out
    this.typewriterInterval = window.setInterval(() => {
      this.message = text.substring(0, i) + '█';
      i++;
      if (i > text.length) {
        clearInterval(this.typewriterInterval!);
        this.message = text; // Show without cursor briefly
        // Pause
        setTimeout(() => {
          // Backspace
          this.typewriterInterval = window.setInterval(() => {
            this.message = text.substring(0, i) + '█';
            i--;
            if (i < 0) {
              if (this.typewriterInterval) clearInterval(this.typewriterInterval);
              this.hide();
            }
          }, backspaceSpeed);
        }, pauseDuration);
      }
    }, typeSpeed);
  }

  render() {
    return html`<div class=${classMap({ 
      toast: true, 
      showing: this.showing,
      error: this.isError 
    })} role="alert">${this.message}</div>`;
  }
}

const DOTS_ANIMATION = {
	interval: 200,
	frames: [
		"Listening.",
		"Listening..",
		"Listening...",
		"Listening..",
		"Listening."
	]
};

/** Main application component. */
@customElement('sound-explorer')
class SoundExplorer extends LitElement {
  static styles: CSSResultGroup = css`
    :host {
      /* Theme Variables */
      --app-bg: #000000;
      --app-text: #ffffff;
      --brand-green: #00D234;
      --brand-red: #ff3333;
      --brand-blue: #3388ff;
      --border-color-default: var(--brand-green); /* Default border is green */
      --accent-color: var(--brand-blue);
      --upload-hover-bg: rgba(0, 210, 52, 0.2);
      --upload-active-bg: rgba(34, 255, 0, 0.1);
      --button-bg: transparent;
      --button-border: #ffffff;
      --button-icon: #ffffff;
      --icon-button-bg: rgba(255, 255, 255, 0.2);
      --icon-button-hover-bg: rgba(255, 255, 255, 0.3);
      --icon-button-icon: #ffffff;
      --toast-bg: rgba(255, 255, 255, 0.1);
      --toast-text: #ffffff;
      --upload-area-bg: transparent;
      --description-border-color: var(--brand-green);
      --description-bg: rgba(34, 255, 0, 0.05);
      --content-font-size: 1rem;
      --edge-padding: 20px;
      --text-box-bg: rgba(255, 255, 255, 0.1);
      --scroll-speed: 30px; /* pixels per second */
    }

    /* Green selection boxes instead of default blue */
    ::selection {
      background-color: var(--brand-green);
      color: #000000;
    }
    
    ::-moz-selection {
      background-color: var(--brand-green);
      color: #000000;
    }
    
    .title-container {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      max-width: 100%; 
      margin: 0; 
      padding: 2rem var(--edge-padding);
      box-sizing: border-box;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 1;
    }

    .title {
      font-family: 'Nanum Gothic Coding', monospace;
      font-size: 1rem;
      font-weight: 400;
      color: #ffffff;
      opacity: 1;
      margin: 0;
      cursor: pointer;
    }

    .title-radio {
      color: var(--brand-green);
    }
    
    .about-indicator {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Nanum Gothic Coding', monospace;
      font-size: 1rem;
      color: #ffffff;
      opacity: 0;
      pointer-events: none;
    }
    
    .title:hover ~ .about-indicator,
    .title-radio:hover ~ .about-indicator {
      opacity: 1;
    }

    .subtitle-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin: 0 0 1rem 0; 
      width: 100%;
    }

    .sub-title {
        font-family: 'Nanum Gothic Coding', monospace;
        font-size: 1rem;
        font-weight: 400;
        color: #ffffff;
        opacity: 1;
        margin: 0;
    }
    
    .upload-areas {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: auto;
      max-width: 100vw;
      z-index: 1;
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 1rem;
      overflow-x: auto;
      scrollbar-width: none; /* Firefox */
      padding: 0 calc(50vw - 175px); /* Allows extreme items to center */
    }
    .upload-areas::-webkit-scrollbar {
        display: none; /* Safari and Chrome */
    }

    .upload-areas.center-single-empty {
      justify-content: center;
      padding: 0;
      margin-top: 0;
    }

    .upload-area-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: clamp(250px, 60vmin, 350px);
      position: relative;
      flex-shrink: 0;
    }

    .upload-area {
      border: 1px dashed var(--border-color-default); 
      text-align: center;
      cursor: pointer;
      width: 100%;
      aspect-ratio: 1;
      background-color: var(--upload-area-bg, transparent);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    .upload-area:hover {
      border: 1px solid var(--brand-green); 
      background-color: #00D234;
      color: #000000;
    }
    .upload-area:hover .upload-text {
      color: #000000;
    }
    .upload-area:hover svg {
      color: #000000;
      opacity: 1;
    }
    .upload-area.has-image {
      border: 1px solid var(--border-color-default);
    }
    .upload-area.has-image::before {
      content: '';
      position: absolute;
      top: -1px; left: -1px; right: -1px; bottom: -1px;
      border: 1px solid var(--border-color-default); 
      border-radius: 0; 
      pointer-events: none; 
    }
    .upload-area.has-image:hover::before {
      border-color: var(--brand-green);
    }
    :host([isSingleMode="true"]) .upload-area.has-image::before {
        border-color: var(--accent-color);
    }

    .image-preview {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background-color: var(--app-bg);
    }
    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 100%;
      width: 100%; 
      z-index: 1;
      padding: 1rem; 
      box-sizing: border-box;
    }
    
    .upload-content svg {
      width: 1.2rem;
      height: 1.2rem;
      opacity: 0.5;
    }
    .upload-areas.center-single-empty .upload-content svg { /* Larger plus icon for centered empty state */
      width: 4rem; 
      height: 4rem;
    }

    .side-text {
      position: fixed;
      left: var(--edge-padding);
      top: 20%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 0;
      font-size: 1rem;
      color: #ffffff;
      opacity: 1;
      line-height: 1;
    }

    .description-wrapper {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      background-color: transparent;
    }

    .image-description-container {
      position: relative;
      width: 100%;
      overflow: hidden;
      padding: 0;
    }

    .image-display-title {
      font-size: 1rem;
      font-weight: bold;
      color: #ffffff;
      text-align: left;
      margin: 6px 0 6px 0;
      padding: 0;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-transform: uppercase;
    }

    .image-description {
      font-size: 1rem;
      color: #ffffff;
      opacity: 1;
      white-space: nowrap;
      display: inline-block;
      padding-right: 3rem;
      animation: scroll 120s linear infinite;
    }

    .image-description::after {
      content: attr(data-text);
      padding-left: 3rem;
    }

    @keyframes scroll {
      from { transform: translateX(0); }
      to { transform: translateX(calc(-100% - 3rem)); }
    }

    .corner-button {
      position: absolute;
      width: 28px;
      height: 28px;
      background: transparent;
      color: var(--brand-green);
      border: 1px solid var(--brand-green);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      opacity: 0.8;
      font-size: 1.2rem;
      line-height: 1;
      transition: all 0.15s ease;
    }

    .corner-button:hover {
      opacity: 1;
      background-color: var(--brand-green);
      color: #000000;
      border-style: solid;
    }

    .remove-button {
      top: -1px;
      right: -1px;
    }

    .add-button {
      bottom: -1px;
      right: -1px;
    }

    .upload-text {
      font-size: 1rem;
      margin: 0;
      opacity: 1;
      font-weight: 500;
      color: #ffffff;
    }

    .controls-container {
      position: fixed;
      bottom: 20px;
      right: var(--edge-padding);
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0;
      line-height: 1;
    }

    .control-button {
      font-family: 'Nanum Gothic Coding', monospace;
      font-size: 1rem;
      color: #ffffff;
      opacity: 1;
      background-color: transparent;
      border: none;
      padding: 0 8px;
      margin: 0;
      cursor: pointer;
      text-transform: uppercase;
      text-align: center;
      white-space: nowrap;
      transition: all 0.15s ease;
      line-height: 1.5;
    }

    .control-button:before { content: '['; margin-right: 0; }
    .control-button:after { content: ']'; margin-left: 0; }

    .control-button:hover {
      color: var(--brand-green);
      opacity: 1;
    }

    .control-button.play {
      color: var(--brand-green);
    }

    .control-button.play:hover {
      opacity: 1;
    }

    .control-button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .empty-description-placeholder {
      font-size: 1rem;
      color: #ffffff;
      opacity: 1;
      text-align: left;
      padding: 8px;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .upload-hint {
      font-size: 1rem;
      opacity: 1;
      color: #ffffff;
    }

    .controls {
      position: absolute;
      top: calc(100% + 120px);
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 1rem 0;
    }
    
    .hidden-input { display: none; }
    
    .mode-toggle-button {
        width: 36px; height: 36px;
        border-radius: 0;
        background: var(--icon-button-bg); 
        border: 1px solid var(--button-border, #fff);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
    }
    .mode-toggle-button:hover { background: var(--icon-button-hover-bg); }
    .mode-toggle-icon {
        width: 18px; height: 18px;
        fill: none; stroke: var(--icon-button-icon, #fff);
        stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }

    .main-content {
      flex: 1; 
      display: flex;
      flex-direction: column;
      align-items: center; 
      width: 100%;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      min-height: 100vh;
      min-height: 100svh;
      position: relative;
    }
    
    @media (max-width: 800px) {
      .main-content {
        /* No specific styles needed here for now */
      }
    }

    .live-clock {
      position: fixed;
      bottom: 20px;
      left: var(--edge-padding); 
      font-family: 'Nanum Gothic Coding', monospace;
      font-size: 1rem;
      color: #ffffff;
      opacity: 1;
      background-color: transparent;
      padding: 5px 10px;
      border-radius: 0;
      z-index: 999;
    }

    .soundbars {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Nanum Gothic Coding', monospace;
      font-size: 1.2rem;
      color: #ffffff;
      opacity: 1;
      background-color: transparent;
      padding: 5px 10px;
      border-radius: 0;
      z-index: 999;
      letter-spacing: 2px;
    }

    .dot-matrix-visualizer {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: grid;
      grid-template-rows: repeat(3, 1fr);
      grid-template-columns: repeat(30, 1fr);
      gap: 2px;
      z-index: 998;
      padding: 4px;
      background-color: transparent;
      height: 16px;
    }

    .dot-matrix-led {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background-color: #222222;
      transition: background-color 0.08s ease;
    }

    .dot-matrix-led.active {
      background-color: var(--brand-green);
      box-shadow: 0 0 2px var(--brand-green);
    }

    @media (max-width: 600px) {
      :host {
        --edge-padding: 10px; 
      }
      .title-container {
        padding-top: 1rem; padding-bottom: 1rem;
      }
      
      .main-content {
        gap: 1rem;
        padding-top: 0.5rem;
      }
      .upload-areas {
        flex-direction: column;
        gap: 0.75rem;
        padding: 0;
        align-items: center;
      }
      .upload-area-container {
        width: clamp(200px, 70vmin, 300px);
      }
      .description-wrapper {
        padding-bottom: 0;
      }
      .upload-areas.center-single-empty .upload-area-container {
        width: clamp(200px, 70vmin, 300px);
      }
      .upload-areas.center-single-empty .upload-content svg {
        width: 3rem; 
        height: 3rem;
      }

      .controls {
        gap: 0.5rem;
        max-width: 250px;
      }
      .live-clock {
        font-size: 1rem;
        padding: 4px 8px;
        bottom: 10px;
      }
      .soundbars {
        font-size: 1rem;
        padding: 4px 8px;
        bottom: 10px;
        letter-spacing: 1px;
      }
      .dot-matrix-visualizer {
        bottom: 10px;
      }
    }

    .about-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(10px);
      z-index: 2000;
      padding: var(--edge-padding);
      box-sizing: border-box;
    }

    .about-content {
      top: 2rem;
      left: var(--edge-padding);
      right: var(--edge-padding);
      background: transparent;
      font-family: 'Nanum Gothic Coding', monospace;
      color: #ffffff;
      line-height: 1.6;
      font-size: 1rem;
      max-width: none;
      position: fixed;
    }

    .about-close {
      position: absolute;
      top: 0;
      right: 0;
      background: transparent;
      border: none;
      color: var(--brand-green);
      cursor: pointer;
      font-family: 'Nanum Gothic Coding', monospace;
      font-size: 1rem;
    }

    .about-close:hover {
      opacity: 0.7;
    }

    @media (max-width: 600px) {
      .about-content {
        top: 1rem;
      }
      
      .about-close {
        top: 1rem;
      }
    }
  `;

  @state() private playbackState: PlaybackState = 'stopped';
  @state() private imagePrompts: ImagePrompt[] = [];
  @state() private isAnalyzing = false;
  @state() private connectionError = true;
  @state() private isSingleMode = true;
  @state() private currentTitle = "Image Radio"; 
  @state() private currentTime: string = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  @state() private listeningDots = '.  ';
  @state() private showAddImageBox = false;
  @state() private visualizerLeds: boolean[] = new Array(90).fill(false);
  @state() private showAbout = false;

  private readonly maxImagesMulti = 20;
  private isProcessingImage = false;

  private session!: LiveMusicSession;
  private readonly sampleRate = 48000;
  private audioContext = new (window.AudioContext || (window as any).webkitAudioContext)(
    {sampleRate: this.sampleRate},
  );
  private outputNode: GainNode = this.audioContext.createGain();
  private nextStartTime = 0;
  private readonly bufferTime = 2;
  private audioRecorder = new AudioRecorder(this.sampleRate);
  private timeUpdateInterval?: number;
  private asciiAnimationInterval?: number;
  private visualizerAnimationInterval?: number;

  private readonly defaultMusicConfig: LiveMusicGenerationConfig = {
    temperature: 1.2,
    topK: 40,
    guidance: 4.0,
  };

  @query('#fileUploadInput') private fileUploadInput!: HTMLInputElement;
  @query('toast-message') private toastMessage!: ToastMessage;

  constructor() {
    super();
    this.outputNode.connect(this.audioContext.destination);
  }

  connectedCallback() {
    super.connectedCallback();
    this.updateTime(); 
    this.timeUpdateInterval = window.setInterval(() => this.updateTime(), 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
    if (this.visualizerAnimationInterval) {
      clearInterval(this.visualizerAnimationInterval);
    }
  }

  private updateTime() {
    this.currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }

  private startVisualizerLoadingAnimation() {
    if (this.visualizerAnimationInterval) {
      clearInterval(this.visualizerAnimationInterval);
    }
    
    let waveTime = 0;
    const animationSpeed = 80; // milliseconds
    
    this.visualizerAnimationInterval = window.setInterval(() => {
      const newLeds = new Array(90).fill(false);
      
      // Create three overlapping waves
      const centerCol = 15; // Center column
      const centerRow = 1; // Center row
      
      // Calculate three wave positions, spaced apart
      const waveRadius1 = waveTime * 0.4 % 30;
      const waveRadius2 = (waveTime * 0.4 + 10) % 30;
      const waveRadius3 = (waveTime * 0.4 + 20) % 30;
      
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 30; col++) {
          // Calculate distance from center
          const dx = col - centerCol;
          const dy = (row - centerRow) * 2; // Scale Y for our narrow grid
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Check if this point is on any of the three waves
          if (Math.abs(distance - waveRadius1) < 1.2 ||
              Math.abs(distance - waveRadius2) < 1.2 ||
              Math.abs(distance - waveRadius3) < 1.2) {
            newLeds[row * 30 + col] = true;
          }
        }
      }
      
      this.visualizerLeds = newLeds;
      waveTime += 1;
    }, animationSpeed);
  }

  private stopVisualizerAnimation() {
    if (this.visualizerAnimationInterval) {
      clearInterval(this.visualizerAnimationInterval);
      this.visualizerAnimationInterval = undefined;
    }
    // Clear all LEDs
    this.visualizerLeds = new Array(90).fill(false);
  }



  private flashVisualizerSuccess() {
    // Simple flash effect
    this.visualizerLeds = new Array(90).fill(true);
    
    // Hold for a moment then transition to music visualizer
    setTimeout(() => {
      if (this.playbackState === 'playing') {
        this.startVisualizerPlayingAnimation();
      } else {
        this.visualizerLeds = new Array(90).fill(false);
      }
    }, 1000); // Hold for 1 second
  }

  private startVisualizerPlayingAnimation() {
    if (this.visualizerAnimationInterval) {
      clearInterval(this.visualizerAnimationInterval);
    }
    
    let time = 0;
    const animationSpeed = 60; // milliseconds - smooth 60fps-like
    
    this.visualizerAnimationInterval = window.setInterval(() => {
      const newLeds = this.generateVibePattern(time);
      this.visualizerLeds = newLeds;
      time += 1;
    }, animationSpeed);
  }

  private generateVibePattern(time: number): boolean[] {
    const leds = new Array(90).fill(false);
    
    // Get the current vibe from the first image (or default to WAVE)
    const currentVibe = this.imagePrompts.length > 0 ? this.imagePrompts[0].vibe : 'WAVE';
    
    switch (currentVibe) {
      case 'WAVE': // Smooth sine wave
        for (let col = 0; col < 30; col++) {
          const waveValue = Math.sin((col * 0.6 + time * 0.3) * Math.PI / 6);
          let targetRow = 1;
          if (waveValue > 0.3) targetRow = 0;
          else if (waveValue < -0.3) targetRow = 2;
          leds[targetRow * 30 + col] = true;
        }
        break;
        
      case 'SHARP': // Sharp sawtooth wave
        for (let col = 0; col < 30; col++) {
          const sawValue = ((col + time * 0.4) % 10) / 10 * 2 - 1; // -1 to 1 sawtooth
          let targetRow = 1;
          if (sawValue > 0.3) targetRow = 0;
          else if (sawValue < -0.3) targetRow = 2;
          leds[targetRow * 30 + col] = true;
        }
        break;
        
      case 'GEOMETRIC': // Triangle wave
        for (let col = 0; col < 30; col++) {
          const triangleValue = Math.abs(((col + time * 0.3) % 20) / 10 - 1) * 2 - 1; // Triangle wave
          let targetRow = 1;
          if (triangleValue > 0.3) targetRow = 0;
          else if (triangleValue < -0.3) targetRow = 2;
          leds[targetRow * 30 + col] = true;
        }
        break;
        
      case 'DIGITAL': // Square wave (digital/pixelated)
        for (let col = 0; col < 30; col++) {
          const squareValue = Math.sin((col * 0.8 + time * 0.4) * Math.PI / 8) > 0 ? 1 : -1;
          let targetRow = 1;
          if (squareValue > 0) targetRow = 0;
          else targetRow = 2;
          leds[targetRow * 30 + col] = true;
        }
        break;
        
      case 'DREAMY': // Dreamy cloud-like patterns
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 30; col++) {
            // Create organic, cloud-like noise patterns
            const noise1 = Math.sin((col * 0.3 + time * 0.1) * Math.PI / 4);
            const noise2 = Math.sin((row * 0.8 + time * 0.15) * Math.PI / 3);
            const noise3 = Math.sin((col * 0.1 + row * 0.4 + time * 0.08) * Math.PI / 6);
            const combined = (noise1 + noise2 + noise3) / 3;
            
            if (combined > 0.2) {
              leds[row * 30 + col] = true;
            }
          }
        }
        break;
        
      case 'FLUID': // Dynamic flowing patterns inspired by the user's code
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 30; col++) {
            // Create flowing noise similar to the user's flow preset
            const noiseVal = Math.sin((col * 0.15 + row * 0.25 + time * 0.05) * Math.PI / 3) * 
                            Math.cos((row * 0.3 + time * 0.08) * Math.PI / 4);
            
            // Add some sparkle effect like cosmic dust
            const sparkle = (time + col * 3 + row * 7) % 60;
            const isSparkle = sparkle < 2 && Math.random() > 0.7;
            
            if (noiseVal > 0.3 || isSparkle) {
              leds[row * 30 + col] = true;
            }
          }
        }
        break;
        
      case 'ORGANIC': // Organic blob-like cellular patterns
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 30; col++) {
            // Create organic blob shapes using multiple sine waves
            const blob1 = Math.sin((col * 0.2 + time * 0.1) * Math.PI / 4) * Math.cos((row * 0.6 + time * 0.08) * Math.PI / 3);
            const blob2 = Math.sin((col * 0.15 + row * 0.4 + time * 0.12) * Math.PI / 5);
            const blob3 = Math.cos((col * 0.3 + time * 0.06) * Math.PI / 6) * Math.sin((row * 0.8 + time * 0.09) * Math.PI / 4);
            
            const combined = (blob1 + blob2 + blob3) / 3;
            
            // Create organic, cellular threshold
            if (combined > 0.25) {
              leds[row * 30 + col] = true;
            }
          }
        }
        break;
        
      case 'SPARKLE': // Cosmic dust sparkle effect
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 30; col++) {
            // Create twinkling stars/dust particles
            const dustLife = (time + col * 5 + row * 7) % 80;
            const isActiveDust = dustLife < 6 && Math.sin((col + row * 11 + time) * 0.1) > 0.6;
            
            // Some particles have longer life for variety
            const longDust = (time * 0.7 + col * 3 + row * 13) % 120;
            const isLongDust = longDust < 3 && Math.cos((col * 2 + row * 5 + time * 0.8) * 0.15) > 0.7;
            
            if (isActiveDust || isLongDust) {
              leds[row * 30 + col] = true;
            }
          }
        }
        break;
        
      case 'RAIN': // Digital rain effect
        for (let col = 0; col < 30; col++) {
          // Each column has its own rain stream
          const streamSpeed = 0.3 + (col % 3) * 0.1; // Varied speeds
          const streamOffset = (col * 7) % 20; // Stagger the streams
          const rainPos = (time * streamSpeed + streamOffset) % 8;
          
          for (let row = 0; row < 3; row++) {
            // Create falling rain effect
            const dropDistance = Math.abs(row - rainPos);
            if (dropDistance < 1.5) {
              // Brighter at the head, dimmer in the tail
              const intensity = dropDistance < 0.5 ? 1 : 0.6;
              if (Math.random() < intensity) {
                leds[row * 30 + col] = true;
              }
            }
          }
        }
        break;
        
      case 'OCEAN': // Ocean wave tidal flow
        const waveCenter = 15 + Math.sin(time * 0.2) * 8; // Slow wave movement
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 30; col++) {
            // Create tidal boundary with noise
            const tideBoundary = waveCenter + Math.sin((row * 0.3 + time * 0.15) * Math.PI / 3) * 4;
            const distanceFromTide = Math.abs(col - tideBoundary);
            
            // Create flowing water effect
            if (distanceFromTide < 3) {
              const flowNoise = Math.sin((col * 0.2 + time * 0.25) * Math.PI / 4);
              if (flowNoise > -0.2) {
                leds[row * 30 + col] = true;
              }
            }
          }
        }
        break;
        
      case 'RADAR': // Radar/sonar scanning effect
        const scannerAngle = (time * 0.4) % (Math.PI * 2);
        const centerCol = 15;
        const centerRow = 1;
        
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 30; col++) {
            // Calculate angle from center to this dot
            const dx = col - centerCol;
            const dy = (row - centerRow) * 2; // Scale Y for our narrow grid
            const dotAngle = Math.atan2(dy, dx);
            
            // Normalize angle to 0-2π
            const normalizedAngle = dotAngle < 0 ? dotAngle + Math.PI * 2 : dotAngle;
            
            // Check if this dot is within the scanner sweep
            const angleDiff = Math.abs(normalizedAngle - scannerAngle);
            const altAngleDiff = Math.abs(normalizedAngle - scannerAngle + Math.PI * 2);
            const minAngleDiff = Math.min(angleDiff, altAngleDiff, Math.abs(normalizedAngle - scannerAngle - Math.PI * 2));
            
            if (minAngleDiff < 0.8) { // Scanner beam width
              const distance = Math.sqrt(dx * dx + dy * dy);
              const fadeIntensity = Math.max(0, 1 - minAngleDiff / 0.8) * Math.max(0, 1 - distance / 8);
              if (fadeIntensity > 0.3) {
                leds[row * 30 + col] = true;
              }
            }
          }
        }
        break;
        
      case 'CELLULAR': // Conway's Game of Life inspired pattern
        // Simplified cellular automata pattern
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 30; col++) {
            // Create evolving cellular patterns
            const generation = Math.floor(time * 0.1);
            const cellSeed = (col + row * 30 + generation * 7) % 100;
            
            // Simple rules inspired by Game of Life
            const neighbors = Math.sin((col - 1 + row * 30 + generation * 3) * 0.1) + 
                             Math.sin((col + 1 + row * 30 + generation * 5) * 0.1) +
                             Math.sin((col + (row - 1) * 30 + generation * 7) * 0.1) +
                             Math.sin((col + (row + 1) * 30 + generation * 11) * 0.1);
            
            const isAlive = (neighbors > 0.5 && cellSeed > 60) || (neighbors > 1.5 && cellSeed > 40);
            
            if (isAlive) {
              leds[row * 30 + col] = true;
            }
          }
        }
        break;
    }
    
    return leds;
  }

  async firstUpdated() {
    await this.connectToSession();
    this.setupDragAndDrop();
    this.setupHorizontalScroll();
  }

  private setupDragAndDrop() {
    const setupArea = (area: Element) => {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        area.addEventListener(eventName, this.preventDefaults, false);
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        area.addEventListener(eventName, () => area.classList.add('dragover'), false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        area.addEventListener(eventName, () => area.classList.remove('dragover'), false);
      });

      area.addEventListener('drop', (e: any) => {
        const targetArea = e.currentTarget as HTMLElement;
        const promptId = targetArea.dataset.promptId;
        this.handleDrop(e, promptId);
      }, false);
    };

    (this as any).shadowRoot?.querySelectorAll('.upload-area').forEach(setupArea);
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      document.body.addEventListener(eventName, this.preventDefaults, false);
    });
  }

  private preventDefaults(e: Event) {
    e.preventDefault();
    e.stopPropagation();
  }

  private handleDrop(e: DragEvent, promptIdToReplace?: string) {
    const dt = e.dataTransfer;
    if (dt?.files && dt.files.length > 0) {
      this.handleImageFile(dt.files[0], promptIdToReplace);
      // No need to manually clear drag data - browser handles this automatically
    }
  }

  private async connectToSession() {
    if (this.session && !this.connectionError) return;

    this.playbackState = 'loading';
    try {
        this.session = await lyriaAI.live.music.connect({
        model: lyriaModel,
        callbacks: {
            onmessage: async (e: LiveMusicServerMessage) => {
              if (e.setupComplete) {
                  this.connectionError = false;
                  if (this.playbackState === 'loading') {
                      if (this.imagePrompts.length > 0) {
                          this.playAudioInternal();
                      } else {
                          this.playbackState = 'paused';
                      }
                  }
                  await this.session.setMusicGenerationConfig({ musicGenerationConfig: this.defaultMusicConfig });
              }
              if (e.filteredPrompt) {
                  this.toastMessage.show(`Music generation adjusted due to content guidelines.`, 3000, true);
              }
              if (e.serverContent?.audioChunks?.[0]?.data) {
                  if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;
                  
                  this.playbackState = 'playing';

                  const audioBuffer = await decodeAudioData(
                    decode(e.serverContent.audioChunks[0].data),
                    this.audioContext,
                    this.sampleRate,
                    2,
                  );
                  
                  this.audioRecorder.addChunk(audioBuffer);
                  
                  const source = this.audioContext.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(this.outputNode);
                  
                  const currentTime = this.audioContext.currentTime;
                  if (this.nextStartTime === 0) {
                      this.nextStartTime = currentTime + this.bufferTime;
                  }

                  if (this.nextStartTime < currentTime) {
                      console.warn('Audio underrun, resetting nextStartTime.');
                      this.playbackState = 'loading';
                      this.nextStartTime = currentTime + this.bufferTime;
                  }
                  
                  source.start(this.nextStartTime);
                  this.nextStartTime += audioBuffer.duration;
              }
            },
            onerror: (errEvent: ErrorEvent) => {
                console.error('Lyria session error:', errEvent.message || errEvent);
                this.connectionError = true;
                this.pauseAudio();
                this.toastMessage.show('Music service connection error. Audio paused.', 3000, true);
            },
            onclose: (closeEvent: CloseEvent) => {
                console.log('Lyria session closed.', closeEvent.reason);
                this.connectionError = true;
                this.pauseAudio();
                 if (!closeEvent.wasClean) {
                    this.toastMessage.show('Music service connection closed. Audio paused.', 3000, true);
                }
            },
        },
        });
    } catch (error: any) {
        console.error("Failed to connect to Lyria session:", error);
        this.toastMessage.show(`Failed to connect to music service: ${error.message}`, 3000, true);
        this.playbackState = 'stopped';
        this.connectionError = true;
    }
  }

  private setSessionPrompts = throttle(async () => {
    console.log("🎵 setSessionPrompts called", {
      connectionError: this.connectionError,
      sessionExists: !!this.session,
      playbackState: this.playbackState,
      imagePromptsCount: this.imagePrompts.length,
      imagePromptTitles: this.imagePrompts.map(p => p.displayTitle)
    });

    if (!this.session || this.connectionError) {
        console.warn("⚠️ Attempted to set prompts but session is not ready or in error state.");
        if (this.playbackState !== 'stopped' && this.playbackState !== 'paused') {
            this.toastMessage.show("Reconnecting to send prompts...", 3000, true);
            await this.connectToSession();
            if (this.connectionError) return;
        } else {
            return;
        }
    }

    if (this.imagePrompts.length > 0) {
      try {
        const weightedPrompts = this.imagePrompts.map(prompt => ({
          text: prompt.musicPrompt, 
          weight: prompt.weight 
        }));
        
        console.log("🚀 About to send prompts to Lyria:", weightedPrompts);
        await this.session.setWeightedPrompts({ weightedPrompts });
        console.log(`✅ Sent ${weightedPrompts.length} weighted prompts to Lyria:`, weightedPrompts);
      } catch (e: any) {
        console.error("❌ Error setting prompts:", e);
        this.toastMessage.show(e.message || 'Error setting prompts for music.', 3000, true);
        this.pauseAudio();
      }
    } else if (this.playbackState === 'playing' || this.playbackState === 'loading') {
      console.log("🛑 No image prompts, pausing audio");
      this.pauseAudio();
      this.toastMessage.show("Upload images to generate music.", 3000, true);
    }
  }, 250);

  private triggerImageUpload() {
    this.fileUploadInput.click();
  }

  private handleFileInputChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      this.handleImageFile(files[0]);
    }
    (e.target as HTMLInputElement).value = '';
  }

  private async handleImageFile(file: File, promptIdToReplace?: string) {
    // Prevent duplicate image processing
    if (this.isProcessingImage) {
      console.log("Already processing an image, skipping duplicate");
      return;
    }
    this.isProcessingImage = true;

    if (!file.type.startsWith('image/')) {
      this.toastMessage.show('Please select an image file.', 3000, true);
      this.isProcessingImage = false;
      return;
    }
    if (!this.isSingleMode && this.imagePrompts.length >= this.maxImagesMulti && !promptIdToReplace) {
      this.isProcessingImage = false;
      return;
    }

    this.isAnalyzing = true;
    const tempId = Date.now().toString();

    try {
      const base64Data = (await fileToBase64(file)).split(',')[1];
      const imagePart = {
        inlineData: { mimeType: file.type, data: base64Data },
      };
      const textPart = { text: `Analyze this image and look for:

1. Cultural context, time period, and genre - be bold and specific about cultural elements you observe (e.g. '90s grunge aesthetic, ancient Egyptian hieroglyphic style, futuristic cyberpunk cityscape, 70s disco glamour, traditional Japanese woodblock print style, Soviet brutalist architecture, Art Deco luxury, indigenous tribal patterns)
2. Any musical instruments visible or derivable from the image (describe their character too, like 'weathered Kalimba and Djembe with warm earth tones' or 'sleek Viola Ensemble with crystalline resonance').
3. Overall mood, atmosphere, emotional resonance and sonic vibe.
4. Anything else that sparks your imagination.

Create a short, evocative title (max 5 words) that bridges the visual elements with their sonic potential - find the poetic space between what is seen and what could be heard.

Then provide a creative sonic description (2-3 sentences) starting with your visual scene description. 

The following are just examples and reference material if helpful - don't feel constrained to use them:

Prompt Examples (use as inspiration only):
Instruments: 808 Hip Hop Beat, Accordion, Alphorn, Alto Saxophone, Aman Throat Singing, Angklung, Bagpipes, Balalaika Ensemble, Banjo, Bass Clarinet, Berimbau, Bongos, Bouzouki, Cello, Charango, Clavichord, Concertina, Conga Drums, Crumhorn, Didgeridoo, Djembe, Drumline, Dulcimer, Erhu, Fiddle, Flamenco Guitar, Gamelan Orchestra, Glass Harmonica, Glockenspiel, Guqin, Hang Drum, Harmonica, Harp, Harpsichord, Hurdy-gurdy, Jaw Harp, Kalimba, Kora, Koto, Lyre, Mandolin, Maracas, Marimba, Mbira, Melodica, Mellotron, Musical Saw, Nyckelhärpa, Ocarina, Oud, Persian Tar, Pipa, Recorder, Rhodes Piano, Santoor, Shakuhachi, Shamisen, Sitar, Slide Guitar, Spacey Synths, Steel Drum, Synth Pads, Tabla, Taiko Drums, Theremin, Trumpet, Tuba, Uilleann Pipes, Vibraphone, Viola da Gamba, Waterphone, Wooden Flute, Zither

Music Genre: Acid Jazz, Afrobeat, Alpine Folk, Andalusian Classical, Baroque, Bengal Baul, Bhangra, Bluegrass, Blues Rock, Bossa Nova, Breakbeat, Celtic Folk, Chillout, Conjunto, Cumbia, Deep House, Disco Funk, Drum & Bass, Electro Swing, Fado, Flamenco, Gagaku, Gamelan, Greek Rebetiko, Gregorian Chant, Hindustani Classical, Indie Electronic, Irish Folk, Jam Band, Jamaican Dub, Jazz Fusion, Javanese Court Music, Klezmer, Korean Pansori, Latin Jazz, Lo-Fi Hip Hop, Malian Desert Blues, Marching Band, Medieval Music, Merengue, Minimal Techno, Mongolian Folk, Neo-Soul, Nordic Folk, Orchestral Score, Persian Classical, Piano Ballad, Polka, Post-Punk, 60s Psychedelic Rock, Qawwali, R&B, Ragtime, Renaissance Music, Romanian Folk, Salsa, Scottish Pibroch, Sephardic Songs, Shanty, Shoegaze, Ska, Surf Rock, Tango, Trip Hop, Tuvan Throat Singing, Ukrainian Folk, Vintage Jazz, Waltz, Yodel

Mood/Description: Acoustic Resonance, Ambient, Ancient Echoes, Barnyard Chaos, Bittersweet Nostalgia, Bright Tones, Campfire Intimacy, Cathedral Reverb, Chill, Crackling Firewood, Crunchy Distortion, Danceable, Dancing Shadows, Dreamy, Dusty Vinyl Crackle, Earthy Textures, Ethereal Ambience, Experimental, Forest Whispers, Funky, Glitchy Effects, Haunting Melodies, Live Performance, Lo-fi, Melancholic Drones, Mystical Chanting, Pastoral Serenity, Percussive Rattles, Psychedelic, Raw Folk Energy, Rich Orchestration, Ritualistic Rhythms, Rustic Charm, Sacred Harmonies, Storytelling Cadence, Sunrise Warmth, Tight Groove, Tribal Ceremonies, Upbeat, Vintage Warmth, Virtuoso, Weathered Patina, Whimsical Flourishes, Wind-Swept Landscapes, Wooden Resonance

Feel free to invent your own creative descriptions beyond these examples! Experiment and be imaginative. Ask yourself: if this image was an album cover, what would the music be like?` };
      
      const response: GenerateContentResponse = await imageAnalysisAI.models.generateContent({
        model: imageAnalysisModel,
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              displayTitle: {
                type: Type.STRING,
                description:
                  'A short, evocative title (max 5 words) that bridges the visual elements with their sonic potential.',
              },
              musicPrompt: {
                type: Type.STRING,
                description:
                  'A creative sonic description (2-3 sentences) based on the image.',
              },
            },
            required: ['displayTitle', 'musicPrompt'],
          },
        },
      });
      
      if (!response.text) {
        throw new Error("Received an empty response from the image analysis service.");
      }
      
      // Available visualizer vibes for random selection
      const visualizerVibes: ('WAVE' | 'SHARP' | 'GEOMETRIC' | 'DIGITAL' | 'DREAMY' | 'FLUID' | 'ORGANIC' | 'SPARKLE' | 'RAIN' | 'OCEAN' | 'RADAR' | 'CELLULAR')[] = [
        'WAVE', 'SHARP', 'GEOMETRIC', 'DIGITAL', 'DREAMY', 'FLUID', 'ORGANIC', 'SPARKLE', 'RAIN', 'OCEAN', 'RADAR', 'CELLULAR'
      ];

      let parsedData: { displayTitle: string, musicPrompt: string };
      try {
        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
          jsonStr = match[2].trim();
        }
        parsedData = JSON.parse(jsonStr);
        if (!parsedData.displayTitle || !parsedData.musicPrompt) throw new Error("Missing fields in JSON response");
      } catch (e: any) {
        console.error("Failed to parse JSON response from Gemini:", e.message, response.text);
        this.toastMessage.show('Error processing image analysis. Using fallback text.', 3000, true);
        const fallbackText = response.text?.trim() || "Could not describe the image.";
        parsedData = { displayTitle: "Image Analysis", musicPrompt: fallbackText };
      }

      // Randomly select a visualizer vibe
      const randomVibe = visualizerVibes[Math.floor(Math.random() * visualizerVibes.length)];

      const newPrompt: ImagePrompt = {
        id: tempId,
        imageUrl: URL.createObjectURL(file),
        displayTitle: parsedData.displayTitle,
        musicPrompt: parsedData.musicPrompt,
        weight: 1.0,
        vibe: randomVibe
      };
      
      if (this.isSingleMode) {
        if (this.imagePrompts.length > 0 && this.imagePrompts[0].imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.imagePrompts[0].imageUrl);
        }
        this.imagePrompts = [newPrompt];
        if (this.session && !this.connectionError) {
            try {
                await this.session.resetContext();
                await this.session.setMusicGenerationConfig({ musicGenerationConfig: this.defaultMusicConfig });
            } catch (error: any) {
                console.warn('Error resetting context in single mode:', error);
                this.toastMessage.show('Error preparing for new image. Please try again.', 3000, true);
            }
        }
        this.showAddImageBox = false;
      } else {
         if (promptIdToReplace && this.imagePrompts.find(p => p.id === promptIdToReplace)) {
            const oldPrompt = this.imagePrompts.find(p => p.id === promptIdToReplace);
            if (oldPrompt && oldPrompt.imageUrl.startsWith('blob:')) {
                URL.revokeObjectURL(oldPrompt.imageUrl);
            }
            this.imagePrompts = this.imagePrompts.map(p => p.id === promptIdToReplace ? newPrompt : p);
        } else if (this.imagePrompts.length < this.maxImagesMulti) {
            this.imagePrompts = [...this.imagePrompts, newPrompt];
        } else {
            this.toastMessage.show('Cannot add more images.', 3000, true);
            this.isAnalyzing = false;
            if (newPrompt.imageUrl.startsWith('blob:')) URL.revokeObjectURL(newPrompt.imageUrl);
            return;
        }
        this.showAddImageBox = false;
      }
      
      // Visualizer stays beautiful green throughout
      
      if (this.playbackState === 'stopped' || this.playbackState === 'paused' || this.isSingleMode) {
        console.log("🎮 handleImageFile: calling playAudioInternal()", {
          playbackState: this.playbackState,
          isSingleMode: this.isSingleMode,
          reason: "stopped/paused/singleMode"
        });
        this.playAudioInternal();
      } else {
        console.log("🎮 handleImageFile: calling setSessionPrompts() directly", {
          playbackState: this.playbackState,
          isSingleMode: this.isSingleMode,
          reason: "already playing"
        });
        this.setSessionPrompts();
      }
      
      // Flash success and music will start automatically
      this.flashVisualizerSuccess();

    } catch (error: any) {
      console.error('Error analyzing image:', error);
      this.toastMessage.show(`Error analyzing image: ${error.message || 'Unknown error'}`, 3000, true);
    } finally {
      this.isAnalyzing = false;
      this.isProcessingImage = false;
      (this as any).requestUpdate();
      setTimeout(() => this.setupDragAndDrop(), 100);
    }
  }

  private async removeImage(imageId: string) {
    const imageToRemove = this.imagePrompts.find(prompt => prompt.id === imageId);
    if (imageToRemove && imageToRemove.imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageToRemove.imageUrl);
    }
    this.imagePrompts = this.imagePrompts.filter(prompt => prompt.id !== imageId);
    
    if (this.session && !this.connectionError) {
      try {
        await this.session.resetContext();
        await this.session.setMusicGenerationConfig({ musicGenerationConfig: this.defaultMusicConfig });
      } catch (error: any) {
        this.toastMessage.show(`Error resetting: ${error.message}`, 3000, true);
        this.connectionError = true;
        await this.connectToSession();
      }
    }
    
    // Visualizer stays beautiful green throughout
    
    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
      if (this.imagePrompts.length === 0) {
        this.pauseAudio();
      } else {
        console.log("🗑️ removeImage: calling setSessionPrompts()", {
          playbackState: this.playbackState,
          imagePromptsCount: this.imagePrompts.length
        });
        this.setSessionPrompts();
      }
    }
    
    // Image removed
  }

  private async handlePlayPause() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    if (this.playbackState === 'playing') {
      this.pauseAudio();
    } else {
      if (this.connectionError || !this.session) {
        this.playbackState = 'loading';
        this.toastMessage.show("Connecting to music service...", 3000, true);
        await this.connectToSession();
        if (this.connectionError) {
             this.toastMessage.show("Failed to connect. Please try again.", 3000, true);
             this.playbackState = 'stopped';
             return;
        }
      }
      this.playAudioInternal();
    }
  }
  
  private playAudioInternal() {
    if (this.imagePrompts.length === 0) {
      this.playbackState = 'stopped';
      return;
    }

    if (this.connectionError || !this.session) {
        this.playbackState = 'loading';
        this.connectToSession().then(() => {
            if (!this.connectionError) {
                this.playAudioInternal();
            } else {
                this.playbackState = 'stopped';
            }
        });
        return;
    }
    
    if (this.playbackState !== 'playing') {
      this.playbackState = 'loading';
    }
    
    this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
    
    this.audioRecorder.start();
    
    console.log("🎮 playAudioInternal: calling setSessionPrompts()", {
      playbackState: this.playbackState,
      imagePromptsCount: this.imagePrompts.length
    });
    this.setSessionPrompts();
    this.session?.play();

  }

  private pauseAudio() {
    this.session?.pause();
    this.playbackState = 'paused';
    if (this.audioContext.state === 'running') {
        this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    }
  }

  private async handleReset() {
    this.pauseAudio();

    this.imagePrompts.forEach(prompt => {
      if (prompt.imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prompt.imageUrl);
      }
    });
    this.imagePrompts = [];
    this.isAnalyzing = false;
    
    if (this.session && !this.connectionError) {
      try {
        await this.session.resetContext();
        await this.session.setMusicGenerationConfig({ musicGenerationConfig: this.defaultMusicConfig });
      } catch (error: any) {
        this.toastMessage.show(`Error resetting: ${error.message}`, 3000, true);
        this.connectionError = true;
        await this.connectToSession();
      }
    } else if (this.connectionError) {
        this.toastMessage.show("Reconnecting...", 3000, true);
        await this.connectToSession();
        if (!this.connectionError) {
            this.toastMessage.show("Reconnected.", 3000, true);
        } else {
            this.toastMessage.show("Failed to reconnect.", 3000, true);
        }
    }
    this.playbackState = 'stopped';
  }

  private async downloadRecording() {
    let metadata: { image?: Blob, title?: string, artist?: string } = {
      title: "AI Generated Music",
      artist: "Image Radio"
    };
    
    let filename = "music";
    
    if (this.imagePrompts.length > 0) {
      try {
        const firstPrompt = this.imagePrompts[0];
        const imageUrl = firstPrompt.imageUrl;
        const response = await fetch(imageUrl);
        const imageBlob = await response.blob();
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = imageUrl;
        });
        
        const maxSize = 300;
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
        } else {
          if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        
        const thumbnailBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
        });
        metadata.image = thumbnailBlob;
        
        // Generate filename from image titles
        if (this.imagePrompts.length === 1) {
          const title = firstPrompt.displayTitle || firstPrompt.musicPrompt || "Untitled";
          filename = title.substring(0, 50);
        } else {
          // Combine multiple titles with +
          const titles = this.imagePrompts
            .map(prompt => prompt.displayTitle || prompt.musicPrompt || "Untitled")
            .map(title => title.substring(0, 20)) // Shorter for combined names
            .join("+");
          filename = titles.substring(0, 80); // Reasonable total length
        }
        
        // Clean filename for filesystem
        filename = filename.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '_');
        
        if (firstPrompt.displayTitle) {
          metadata.title = `Music for: ${firstPrompt.displayTitle.substring(0, 50)}${firstPrompt.displayTitle.length > 50 ? '...' : ''}`;
        } else if (firstPrompt.musicPrompt) {
           metadata.title = `Music inspired by: ${firstPrompt.musicPrompt.substring(0, 50)}${firstPrompt.musicPrompt.length > 50 ? '...' : ''}`;
        }

      } catch (error) {
        console.warn('Failed to process image thumbnail for WAV metadata:', error);
      }
    }
    
    // Use getCurrentRecording instead of stop to keep recording active
    const audioBlob = await this.audioRecorder.getCurrentRecording(metadata);
    if (!audioBlob) {
      this.toastMessage.show("No recording available. Start playing music first!", 3000, true);
      return;
    }
    
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  }

  private toggleMode() {
    this.isSingleMode = !this.isSingleMode;
    this.currentTitle = this.isSingleMode ? "What Does It Sound Like?" : "What Do They Sound Like?";
    
    if (this.isSingleMode && this.imagePrompts.length > 1) {
        const firstPrompt = this.imagePrompts[0];
        this.imagePrompts.slice(1).forEach(prompt => {
            if (prompt.imageUrl.startsWith('blob:')) {
                URL.revokeObjectURL(prompt.imageUrl);
            }
        });
        this.imagePrompts = [firstPrompt];
        if (this.session && !this.connectionError) {
            this.session.resetContext();
            this.session.setMusicGenerationConfig({ musicGenerationConfig: this.defaultMusicConfig });
            this.setSessionPrompts(); 
        }
    }

    if (this.playbackState === 'playing' || this.playbackState === 'loading') {
        if (this.imagePrompts.length === 0 && !this.isSingleMode) {
            // No action
        } else if (this.imagePrompts.length === 0 && this.isSingleMode) {
            this.pauseAudio(); 
        }
        else {
            // Don't re-send prompts when just toggling mode - prompts haven't changed
            console.log("🔄 toggleMode: NOT calling setSessionPrompts() - prompts unchanged", {
              playbackState: this.playbackState,
              imagePromptsCount: this.imagePrompts.length
            });
            // this.setSessionPrompts(); // REMOVED - unnecessary duplicate
        }
    }
  }

  private setupHorizontalScroll() {
    const uploadAreas = (this as any).shadowRoot?.querySelector('.upload-areas');
    if (uploadAreas) {
      uploadAreas.addEventListener('wheel', (e: Event) => {
        const wheelEvent = e as WheelEvent;
        if (uploadAreas.scrollWidth > uploadAreas.clientWidth) {
          e.preventDefault();
          uploadAreas.scrollLeft += wheelEvent.deltaY;
        }
      }, { passive: false });
    }
  }

  render() {
    const hasImages = this.imagePrompts.length > 0;
    const isRecording = this.playbackState === 'playing';
    const canAddMoreImages = !this.isSingleMode && this.imagePrompts.length < this.maxImagesMulti;

    const renderUploadArea = (prompt?: ImagePrompt, isPlaceholder = false, index = 0, isLastInMulti = false) => {
      const isEmpty = !prompt;
      const isListening = this.isAnalyzing && ((this.isSingleMode && isEmpty) || (!this.isSingleMode && isEmpty && this.imagePrompts.length === index));
      const areaClass = classMap({
        'upload-area': true,
        'has-image': !!prompt,
        'listening': isListening,
      });
      const contentClass = classMap({ 'upload-content': true });

      const clickHandler = () => {
        if (isPlaceholder && !this.isSingleMode && this.imagePrompts.length >= this.maxImagesMulti) {
            this.toastMessage.show(`Maximum ${this.maxImagesMulti} images reached.`, 3000, true);
            return;
        }
        this.triggerImageUpload();
      };
      
      const dropHandler = (e: DragEvent) => {
        this.handleDrop(e, prompt?.id);
      };

      return html`
        <div class="upload-area-container">
          <div class=${areaClass}
               @click=${isEmpty ? clickHandler : undefined}
               @drop=${dropHandler} 
               data-prompt-id=${prompt?.id || ''}
               ondragover="this.classList.add('dragover')"
               ondragleave="this.classList.remove('dragover')"
               ondrop="this.classList.remove('dragover')">
            ${prompt ? html`
              <img src=${prompt.imageUrl} alt=${prompt.displayTitle || "Uploaded image"} class="image-preview" 
                   @click=${(e: Event) => {
                     e.stopPropagation();
                     this.handlePlayPause();
                   }} 
                   style="cursor: pointer;" />
              <button class="corner-button remove-button" @click=${(e: Event) => {
                e.stopPropagation();
                this.removeImage(prompt.id);
              }}>×</button>
              ${this.isSingleMode ? html`
                <button class="corner-button add-button" @click=${(e: Event) => {
                  e.stopPropagation();
                  this.toggleMode();
                  this.showAddImageBox = true;
                }}>+</button>
              ` : (isLastInMulti && this.imagePrompts.length < this.maxImagesMulti && !this.showAddImageBox ? html`
                <button class="corner-button add-button" @click=${(e: Event) => {
                  e.stopPropagation();
                  this.showAddImageBox = true;
                }}>+</button>
              ` : '')}
            ` : html`
              <div class=${contentClass}>
                <div class="upload-text">${isListening ? this.listeningDots : '+'}</div>
                <div class="upload-text">
                  ${isListening ? '' : 'Add Image'}
                </div>
              </div>
              ${!this.isSingleMode && (this.imagePrompts.length > 0 || this.showAddImageBox) ? html`
                <button class="corner-button remove-button" @click=${(e: Event) => {
                  e.stopPropagation();
                  if (this.imagePrompts.length > 0) {
                      this.showAddImageBox = false;
                  } else {
                      this.toggleMode();
                  }
                }}>×</button>
              ` : ''}
            `}
          </div>
          ${prompt ? html`
            <div class="description-wrapper">
              ${prompt.displayTitle ? html`<h3 class="image-display-title">${prompt.displayTitle}</h3>` : ''}
              ${prompt.musicPrompt ? html`
                <div class="image-description-container">
                  <div class="image-description" 
                       data-text="${prompt.musicPrompt}"
                  >${prompt.musicPrompt}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    };

    const uploadAreasToRender = [];
    if (this.isSingleMode) {
        uploadAreasToRender.push(renderUploadArea(this.imagePrompts[0], this.imagePrompts.length === 0, 0));
    } else {
        this.imagePrompts.forEach((prompt, index) => {
            const isLast = index === this.imagePrompts.length - 1;
            uploadAreasToRender.push(renderUploadArea(prompt, false, index, isLast));
        });
        if (this.imagePrompts.length === 0) {
            uploadAreasToRender.push(renderUploadArea(undefined, true, 0, true));
        } else if (this.showAddImageBox && this.imagePrompts.length < this.maxImagesMulti) {
            uploadAreasToRender.push(renderUploadArea(undefined, true, this.imagePrompts.length, true));
        }
    }
    
    return html`
      <div class="title-container">
          <h1 class="title" @click=${() => this.showAbout = true}>IMAGE</h1>
          <h1 class="title title-radio" @click=${() => this.showAbout = true}>RADIO</h1>
          <div class="about-indicator">[ ABOUT ]</div>
      </div>
      
      <div class="side-text">
        <div>SIGHT</div>
        <div>TO</div>
        <div>SOUND</div>
      </div>

      <div class="main-content">
        <div class="upload-areas ${classMap({'center-single-empty': this.isSingleMode && !hasImages})}">
          ${uploadAreasToRender}
        </div>
      </div>

      <input 
        type="file" 
        id="fileUploadInput"
        class="hidden-input"
        accept="image/*"
        @change=${this.handleFileInputChange}
      />
      <div class="live-clock" aria-label="Current time">${this.currentTime}</div>
      
      <div class="dot-matrix-visualizer">
        ${this.visualizerLeds.map((isActive, index) => html`
          <div class="dot-matrix-led ${isActive ? 'active' : ''}"></div>
        `)}
      </div>

      ${hasImages ? html`
        <div class="controls-container">
            <button 
              class="control-button"
              @click=${this.handleReset}>
              REFRESH
            </button>
            <button 
              class="control-button ${this.playbackState === 'playing' ? 'play' : ''}"
              @click=${this.handlePlayPause}>
              ${this.playbackState === 'playing' ? 'PAUSE' : 'PLAY'}
            </button>
            <button 
              class="control-button"
              ?disabled=${!isRecording && this.playbackState !== 'paused'}
              @click=${this.downloadRecording}>
              DOWNLOAD
            </button>
        </div>
      ` : ''}
      
      ${this.showAbout ? html`
        <div class="about-modal" @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.showAbout = false;
        }}>
          <div class="about-content">
            <button class="about-close" @click=${() => this.showAbout = false}>×</button>
            <div style="margin-bottom: 1rem;">
              <span style="color: #ffffff;">IMAGE</span> <span style="color: var(--brand-green);">RADIO</span>
            </div>
            Tune into any image in the world. Created using Google's Lyria RealTime music streaming model.<br/>
            By <a href="https://x.com/dev_valladares" target="_blank" style="color: var(--brand-green); text-decoration: none;">Dev Valladares</a><br/>
            04/30 Experiments with Gemini
          </div>
          <div class="live-clock" aria-label="Current time">${this.currentTime}</div>
        </div>
      ` : ''}
      
      <toast-message></toast-message>
    `;
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('isSingleMode')) {
      (this as any).toggleAttribute('isSingleMode', this.isSingleMode);
    }
    if (changedProperties.has('isAnalyzing')) {
      if (this.isAnalyzing) {
        let frameIndex = 0;
        this.listeningDots = DOTS_ANIMATION.frames[0];
        this.asciiAnimationInterval = window.setInterval(() => {
          frameIndex = (frameIndex + 1) % DOTS_ANIMATION.frames.length;
          this.listeningDots = DOTS_ANIMATION.frames[frameIndex];
        }, DOTS_ANIMATION.interval);
        // Start the visualizer scanning animation when analyzing image
        // But only if we're not already playing music
        if (this.playbackState !== 'playing') {
          this.startVisualizerLoadingAnimation();
        }
      } else {
        if (this.asciiAnimationInterval) {
          clearInterval(this.asciiAnimationInterval);
        }
        // Only stop the visualizer animation if we're not playing music
        if (this.playbackState !== 'playing') {
          this.stopVisualizerAnimation();
        }
      }
    }
    if (changedProperties.has('playbackState')) {
      if (this.playbackState === 'playing') {
        this.startVisualizerPlayingAnimation();
      } else if (this.playbackState === 'stopped' || this.playbackState === 'paused') {
        this.stopVisualizerAnimation();
      }
    }

  }
}

function main(container: HTMLElement) {
  const style = document.createElement('style');
  style.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      height: 100vh;
      height: 100svh;
      overflow-x: hidden;
      background-color: #000000;
    }
  `;
  document.head.appendChild(style);
  
  const app = new SoundExplorer();
  container.appendChild(app as unknown as Node);
}

main(document.body);

declare global {
  interface HTMLElementTagNameMap {
    'sound-explorer': SoundExplorer;
    'play-button': PlayButton;
    'icon-button': IconButton;
    'toast-message': ToastMessage;
  }
}
