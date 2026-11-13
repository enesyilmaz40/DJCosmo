import { DeckEngine } from './DeckEngine';
import { Track } from '../types';

export class AudioEngine {
  private static instance: AudioEngine | null = null;
  public ctx: AudioContext;
  
  public deckA: DeckEngine;
  public deckB: DeckEngine;

  private masterGain: GainNode;
  private masterLimiter: DynamicsCompressorNode;
  public masterAnalyser: AnalyserNode;

  private _crossfader: number = 0.0; // -1.0 (Deck A 100%) to +1.0 (Deck B 100%)
  private _masterVolume: number = 0.9;

  // Cache decoded audio buffers by track id/filepath
  private audioBufferCache: Map<string, AudioBuffer> = new Map();

  private constructor() {
    // Cross-browser AudioContext with 44100 or 48000Hz standard sample rate
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass({ latencyHint: 'interactive' });

    // Master Limiter / Compressor to avoid any clipping distortion
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime); // -1dB threshold
    this.masterLimiter.knee.setValueAtTime(3.0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(20.0, this.ctx.currentTime); // brickwall limiter ratio
    this.masterLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime); // fast attack 3ms
    this.masterLimiter.release.setValueAtTime(0.15, this.ctx.currentTime); // 150ms release

    // Master Volume
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this._masterVolume, this.ctx.currentTime);

    // Master Analyser for overall VU metering
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterAnalyser.smoothingTimeConstant = 0.85;

    // Connect: Decks -> MasterGain -> MasterLimiter -> MasterAnalyser -> Destination
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    // Instantiate Decks
    this.deckA = new DeckEngine('A', this.ctx);
    this.deckB = new DeckEngine('B', this.ctx);

    this.deckA.outputNode.connect(this.masterGain);
    this.deckB.outputNode.connect(this.masterGain);

    this.updateCrossfader(0.0);
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public async resumeContext(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public setMasterVolume(vol: number) {
    this._masterVolume = Math.max(0, Math.min(1.5, vol));
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(this._masterVolume, this.ctx.currentTime);
  }

  public get masterVolume(): number {
    return this._masterVolume;
  }

  /**
   * Sets crossfader position between -1.0 (Full Deck A) and +1.0 (Full Deck B)
   * Uses Equal Power Crossfade Curve:
   * Deck A Gain = cos((x + 1) * PI / 4)
   * Deck B Gain = sin((x + 1) * PI / 4)
   */
  public updateCrossfader(position: number) {
    this._crossfader = Math.max(-1.0, Math.min(1.0, position));
    
    // Normalized 0 to 1
    const norm = (this._crossfader + 1) / 2;
    const gainA = Math.cos(norm * 0.5 * Math.PI);
    const gainB = Math.sin(norm * 0.5 * Math.PI);

    this.deckA.setCrossfaderGain(gainA);
    this.deckB.setCrossfaderGain(gainB);
  }

  public get crossfader(): number {
    return this._crossfader;
  }

  /**
   * Decode an ArrayBuffer into Web Audio AudioBuffer
   */
  public async decodeAudio(trackId: string, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    if (this.audioBufferCache.has(trackId)) {
      return this.audioBufferCache.get(trackId)!;
    }
    // Note: slice array buffer copy because decodeAudioData detaches the buffer in some browsers
    const copy = arrayBuffer.slice(0);
    const audioBuffer = await this.ctx.decodeAudioData(copy);
    this.audioBufferCache.set(trackId, audioBuffer);
    return audioBuffer;
  }

  public setCachedBuffer(trackId: string, buffer: AudioBuffer) {
    this.audioBufferCache.set(trackId, buffer);
  }

  public getCachedBuffer(trackId: string): AudioBuffer | undefined {
    return this.audioBufferCache.get(trackId);
  }

  public getMasterPeakLevels(): { left: number; right: number } {
    const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return { left: peak, right: Math.min(1.0, peak * 0.98) };
  }

  // --- Live Set Master Recording ---
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  public isRecording: boolean = false;

  public startRecording() {
    if (this.isRecording) return;
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.masterAnalyser.connect(this.recordDest);
    }
    this.recordedChunks = [];
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      this.mediaRecorder = new MediaRecorder(this.recordDest.stream, { mimeType });
      this.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.start(1000);
      this.isRecording = true;
    } catch (err) {
      console.error('Recording start error:', err);
    }
  }

  public stopRecording(): Promise<Blob> {
    return new Promise(resolve => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(new Blob([], { type: 'audio/webm' }));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.recordedChunks = [];
        this.isRecording = false;
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }
}

