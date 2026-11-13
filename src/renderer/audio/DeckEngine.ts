export class DeckEngine {
  public readonly id: 'A' | 'B';
  private ctx: AudioContext;
  
  // Audio Nodes
  private sourceNode: AudioBufferSourceNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private trimGainNode: GainNode;
  private lowEqNode: BiquadFilterNode;
  private midEqNode: BiquadFilterNode;
  private highEqNode: BiquadFilterNode;
  private filterLowPassNode: BiquadFilterNode;
  private filterHighPassNode: BiquadFilterNode;
  private volumeGainNode: GainNode;
  private crossfaderGainNode: GainNode;
  public readonly analyserNode: AnalyserNode;

  // Echo / Delay FX Send Nodes
  private delayNode: DelayNode;
  private delayFeedbackNode: GainNode;
  private delayWetGainNode: GainNode;

  // Output destination node
  public readonly outputNode: GainNode;

  // Playback state tracking
  private _isPlaying: boolean = false;
  private startOffset: number = 0; // playback start position in seconds
  private startedAtAudioTime: number = 0; // audioContext.currentTime when started
  private _playbackRate: number = 1.0;
  private cuePoint: number = 0;

  constructor(id: 'A' | 'B', ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;

    // Initialize Web Audio Nodes
    this.trimGainNode = ctx.createGain();
    this.trimGainNode.gain.setValueAtTime(1.0, ctx.currentTime);

    // 3-Band Isolator EQ
    // Low Shelf: 220Hz (Pioneer DJM-style crossover to cleanly isolate kick punch)
    this.lowEqNode = ctx.createBiquadFilter();
    this.lowEqNode.type = 'lowshelf';
    this.lowEqNode.frequency.setValueAtTime(220, ctx.currentTime);
    this.lowEqNode.gain.setValueAtTime(0, ctx.currentTime);

    // Mid Peaking: 1000Hz, Q=1.0
    this.midEqNode = ctx.createBiquadFilter();
    this.midEqNode.type = 'peaking';
    this.midEqNode.frequency.setValueAtTime(1000, ctx.currentTime);
    this.midEqNode.Q.setValueAtTime(1.0, ctx.currentTime);
    this.midEqNode.gain.setValueAtTime(0, ctx.currentTime);

    // High Shelf: 8000Hz
    this.highEqNode = ctx.createBiquadFilter();
    this.highEqNode.type = 'highshelf';
    this.highEqNode.frequency.setValueAtTime(8000, ctx.currentTime);
    this.highEqNode.gain.setValueAtTime(0, ctx.currentTime);

    // DJ Filter (Dual LPF / HPF — Butterworth Q=0.707 for warm, natural analog sweeps without harsh cuts)
    this.filterLowPassNode = ctx.createBiquadFilter();
    this.filterLowPassNode.type = 'lowpass';
    this.filterLowPassNode.frequency.setValueAtTime(20000, ctx.currentTime);
    this.filterLowPassNode.Q.setValueAtTime(0.707, ctx.currentTime);

    this.filterHighPassNode = ctx.createBiquadFilter();
    this.filterHighPassNode.type = 'highpass';
    this.filterHighPassNode.frequency.setValueAtTime(20, ctx.currentTime);
    this.filterHighPassNode.Q.setValueAtTime(0.707, ctx.currentTime);

    // Volume & Crossfader
    this.volumeGainNode = ctx.createGain();
    this.volumeGainNode.gain.setValueAtTime(1.0, ctx.currentTime);

    this.crossfaderGainNode = ctx.createGain();
    this.crossfaderGainNode.gain.setValueAtTime(1.0, ctx.currentTime);

    // Echo / Delay FX Send (for Echo Out transitions)
    this.delayNode = ctx.createDelay(3.0);
    this.delayNode.delayTime.setValueAtTime(0.35, ctx.currentTime);
    this.delayFeedbackNode = ctx.createGain();
    this.delayFeedbackNode.gain.setValueAtTime(0.55, ctx.currentTime);
    this.delayWetGainNode = ctx.createGain();
    this.delayWetGainNode.gain.setValueAtTime(0.0, ctx.currentTime);

    // Connect Delay feedback loop
    this.filterHighPassNode.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedbackNode);
    this.delayFeedbackNode.connect(this.delayNode);
    this.delayNode.connect(this.delayWetGainNode);

    // Analyser for VU metering & waveform visualizer
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.8;

    // Deck Master Output
    this.outputNode = ctx.createGain();
    this.outputNode.gain.setValueAtTime(1.0, ctx.currentTime);

    // Connect node chain:
    // source -> trimGain -> lowEq -> midEq -> highEq -> filterLP -> filterHP -> volumeGain -> crossfaderGain -> analyser -> outputNode
    // And delayWetGainNode -> crossfaderGain
    this.trimGainNode.connect(this.lowEqNode);
    this.lowEqNode.connect(this.midEqNode);
    this.midEqNode.connect(this.highEqNode);
    this.highEqNode.connect(this.filterLowPassNode);
    this.filterLowPassNode.connect(this.filterHighPassNode);
    this.filterHighPassNode.connect(this.volumeGainNode);
    this.volumeGainNode.connect(this.crossfaderGainNode);
    this.delayWetGainNode.connect(this.crossfaderGainNode);
    this.crossfaderGainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.outputNode);
  }

  public setAudioBuffer(buffer: AudioBuffer | null, initialOffset: number = 0) {
    this.stop();
    this.audioBuffer = buffer;
    this.startOffset = initialOffset;
    this.cuePoint = initialOffset;
  }

  public getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  public get duration(): number {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  public get currentTime(): number {
    if (!this.audioBuffer) return 0;
    if (!this._isPlaying) return this.startOffset;

    const elapsed = (this.ctx.currentTime - this.startedAtAudioTime) * this._playbackRate;
    const current = this.startOffset + elapsed;
    if (current >= this.audioBuffer.duration) {
      return this.audioBuffer.duration;
    }
    return Math.max(0, current);
  }

  public play(when: number = 0, offset?: number) {
    if (!this.audioBuffer) return;
    if (this._isPlaying) {
      this.stop();
    }

    const seekTime = offset !== undefined ? offset : this.startOffset;
    const validOffset = Math.max(0, Math.min(seekTime, this.audioBuffer.duration));

    const source = this.ctx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.playbackRate.setValueAtTime(this._playbackRate, this.ctx.currentTime);
    source.connect(this.trimGainNode);

    const startTime = when > 0 ? when : this.ctx.currentTime;
    source.start(startTime, validOffset);

    this.sourceNode = source;
    this.startedAtAudioTime = startTime;
    this.startOffset = validOffset;
    this._isPlaying = true;

    source.onended = () => {
      if (this.sourceNode === source) {
        this._isPlaying = false;
        this.sourceNode = null;
      }
    };
  }

  public pause() {
    if (!this._isPlaying) return;
    this.startOffset = this.currentTime;
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this._isPlaying = false;
  }

  public stop() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this._isPlaying = false;
  }

  public cue() {
    if (this._isPlaying) {
      this.pause();
      this.startOffset = this.cuePoint;
    } else {
      this.startOffset = this.cuePoint;
      this.play();
    }
  }

  public setCuePoint(pos?: number) {
    this.cuePoint = pos !== undefined ? pos : this.currentTime;
  }

  public seek(positionSeconds: number) {
    const wasPlaying = this._isPlaying;
    this.stop();
    this.startOffset = Math.max(0, Math.min(positionSeconds, this.duration));
    if (wasPlaying) {
      this.play();
    }
  }

  public setVolume(vol: number) {
    const safeVol = Math.max(0, Math.min(1.0, vol));
    this.volumeGainNode.gain.cancelScheduledValues(this.ctx.currentTime);
    this.volumeGainNode.gain.setValueAtTime(safeVol, this.ctx.currentTime);
  }

  public setCrossfaderGain(gain: number) {
    const safeGain = Math.max(0, Math.min(1.0, gain));
    const now = this.ctx.currentTime;
    this.crossfaderGainNode.gain.cancelScheduledValues(now);
    this.crossfaderGainNode.gain.setTargetAtTime(safeGain, now, 0.03);
  }

  public setTrimGain(gain: number) {
    const safeGain = Math.max(0, Math.min(2.0, gain));
    this.trimGainNode.gain.cancelScheduledValues(this.ctx.currentTime);
    this.trimGainNode.gain.setValueAtTime(safeGain, this.ctx.currentTime);
  }

  public setPlaybackRate(rate: number) {
    const newRate = Math.max(0.7, Math.min(1.3, rate));
    const now = this.ctx.currentTime;
    // Re-anchor the position clock so currentTime stays exact after a rate change
    // (otherwise the whole elapsed time would be re-scaled with the new rate and the beat grid jumps)
    if (this._isPlaying && now > this.startedAtAudioTime) {
      this.startOffset = this.currentTime;
      this.startedAtAudioTime = now;
    }
    this._playbackRate = newRate;
    if (this.sourceNode) {
      this.sourceNode.playbackRate.cancelScheduledValues(now);
      this.sourceNode.playbackRate.setValueAtTime(this._playbackRate, now);
    }
  }

  private glideTimer: ReturnType<typeof setInterval> | null = null;

  /** Slowly glides the tempo to targetRate (stepwise, position-exact) so the pitch returns to the track's native key */
  public glideToRate(targetRate: number, durationSec: number) {
    this.stopGlide();
    const startRate = this._playbackRate;
    if (Math.abs(targetRate - startRate) < 0.0005) return;
    const stepMs = 200;
    const steps = Math.max(1, Math.round((durationSec * 1000) / stepMs));
    let i = 0;
    this.glideTimer = setInterval(() => {
      i++;
      if (!this._isPlaying) {
        this.stopGlide();
        return;
      }
      const t = i / steps;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t));
      this.setPlaybackRate(startRate + (targetRate - startRate) * eased);
      if (i >= steps) this.stopGlide();
    }, stepMs);
  }

  public stopGlide() {
    if (this.glideTimer) {
      clearInterval(this.glideTimer);
      this.glideTimer = null;
    }
  }

  public get playbackRate(): number {
    return this._playbackRate;
  }

  /**
   * DJ Jog Wheel Pitch Nudge (temporarily bends tempo by deltaMs to nudge kicks into lock)
   */
  public nudge(deltaMs: number) {
    if (!this._isPlaying || !this.sourceNode) return;
    const direction = deltaMs > 0 ? 1 : -1;
    const bend = 0.08 * direction; // ±8% temporary speed bump
    const now = this.ctx.currentTime;

    this.sourceNode.playbackRate.cancelScheduledValues(now);
    this.sourceNode.playbackRate.setValueAtTime(this._playbackRate + bend, now);
    this.sourceNode.playbackRate.setValueAtTime(this._playbackRate, now + 0.18);
  }

  /**
   * Quantize / Snap beat phase to target downbeat timing
   */
  public syncBeatPhase(targetCurrentTime: number, beatIntervalSec: number) {
    if (!this._isPlaying || !this.audioBuffer || beatIntervalSec <= 0) return;
    const current = this.currentTime;
    const myPhase = current % beatIntervalSec;
    const targetPhase = targetCurrentTime % beatIntervalSec;
    let diff = targetPhase - myPhase;
    if (diff > beatIntervalSec / 2) diff -= beatIntervalSec;
    if (diff < -beatIntervalSec / 2) diff += beatIntervalSec;

    if (Math.abs(diff) > 0.005 && Math.abs(diff) < beatIntervalSec) {
      this.seek(Math.max(0, current + diff));
    }
  }

  // EQ adjustments (-24dB to +6dB) with analog RC smoothing (setTargetAtTime) so transitions never click or cut abruptly
  public setLowEq(gainDb: number) {
    const safe = Math.max(-40, Math.min(6, gainDb));
    const now = this.ctx.currentTime;
    this.lowEqNode.gain.cancelScheduledValues(now);
    this.lowEqNode.gain.setTargetAtTime(safe, now, 0.04);
  }

  public setMidEq(gainDb: number) {
    const safe = Math.max(-40, Math.min(6, gainDb));
    const now = this.ctx.currentTime;
    this.midEqNode.gain.cancelScheduledValues(now);
    this.midEqNode.gain.setTargetAtTime(safe, now, 0.04);
  }

  public setHighEq(gainDb: number) {
    const safe = Math.max(-40, Math.min(6, gainDb));
    const now = this.ctx.currentTime;
    this.highEqNode.gain.cancelScheduledValues(now);
    this.highEqNode.gain.setTargetAtTime(safe, now, 0.04);
  }

  /**
   * Filter knob: -1.0 (LPF) to 0.0 (Neutral) to +1.0 (HPF)
   * Uses exponential smoothing so filter never snaps or cuts the song abruptly
   */
  public setFilter(val: number) {
    const safe = Math.max(-1.0, Math.min(1.0, val));
    const now = this.ctx.currentTime;
    this.filterLowPassNode.frequency.cancelScheduledValues(now);
    this.filterHighPassNode.frequency.cancelScheduledValues(now);

    if (safe < -0.01) {
      // Sweeping LPF down from 20000Hz down to 350Hz (warm muffled intro/outro, never completely dead)
      const freq = 20000 * Math.pow(350 / 20000, -safe);
      this.filterLowPassNode.frequency.setTargetAtTime(Math.max(350, freq), now, 0.04);
      this.filterHighPassNode.frequency.setTargetAtTime(20, now, 0.04);
    } else if (safe > 0.01) {
      // Sweeping HPF up from 20Hz up to 900Hz (musical DJ low-cut, never thin telephone sound)
      const freq = 20 * Math.pow(900 / 20, safe);
      this.filterHighPassNode.frequency.setTargetAtTime(Math.min(900, freq), now, 0.04);
      this.filterLowPassNode.frequency.setTargetAtTime(20000, now, 0.04);
    } else {
      // Neutral bypass
      this.filterLowPassNode.frequency.setTargetAtTime(20000, now, 0.04);
      this.filterHighPassNode.frequency.setTargetAtTime(20, now, 0.04);
    }
  }

  // Automation scheduling for seamless transitions
  public rampVolume(targetGain: number, durationSeconds: number, startTime?: number) {
    const t0 = startTime !== undefined ? startTime : this.ctx.currentTime;
    const current = this.volumeGainNode.gain.value;
    this.volumeGainNode.gain.cancelScheduledValues(t0);
    this.volumeGainNode.gain.setValueAtTime(current, t0);
    this.volumeGainNode.gain.linearRampToValueAtTime(targetGain, t0 + durationSeconds);
  }

  public scheduleLowEq(targetDb: number, atTime: number, rampDuration: number = 0.05, fromDb?: number) {
    const safe = Math.max(-24, Math.min(6, targetDb));
    const startVal = fromDb !== undefined ? Math.max(-24, Math.min(6, fromDb)) : this.lowEqNode.gain.value;
    this.lowEqNode.gain.cancelScheduledValues(atTime);
    this.lowEqNode.gain.setValueAtTime(startVal, atTime);
    this.lowEqNode.gain.linearRampToValueAtTime(safe, atTime + Math.max(0.01, rampDuration));
  }

  public scheduleMidEq(targetDb: number, atTime: number, rampDuration: number = 0.05, fromDb?: number) {
    const safe = Math.max(-24, Math.min(6, targetDb));
    const startVal = fromDb !== undefined ? Math.max(-24, Math.min(6, fromDb)) : this.midEqNode.gain.value;
    this.midEqNode.gain.cancelScheduledValues(atTime);
    this.midEqNode.gain.setValueAtTime(startVal, atTime);
    this.midEqNode.gain.linearRampToValueAtTime(safe, atTime + Math.max(0.01, rampDuration));
  }

  public scheduleHighEq(targetDb: number, atTime: number, rampDuration: number = 0.05, fromDb?: number) {
    const safe = Math.max(-24, Math.min(6, targetDb));
    const startVal = fromDb !== undefined ? Math.max(-24, Math.min(6, fromDb)) : this.highEqNode.gain.value;
    this.highEqNode.gain.cancelScheduledValues(atTime);
    this.highEqNode.gain.setValueAtTime(startVal, atTime);
    this.highEqNode.gain.linearRampToValueAtTime(safe, atTime + Math.max(0.01, rampDuration));
  }

  public rampLowEq(targetDb: number, durationSeconds: number, startTime?: number) {
    const t0 = startTime !== undefined ? startTime : this.ctx.currentTime;
    const current = this.lowEqNode.gain.value;
    this.lowEqNode.gain.cancelScheduledValues(t0);
    this.lowEqNode.gain.setValueAtTime(current, t0);
    this.lowEqNode.gain.linearRampToValueAtTime(targetDb, t0 + durationSeconds);
  }

  private filterValToHpfFreq(val: number): number {
    const safe = Math.max(0, Math.min(1.0, val));
    return safe <= 0.01 ? 20 : Math.min(2500, 20 * Math.pow(2500 / 20, safe));
  }

  private filterValToLpfFreq(val: number): number {
    const safe = Math.max(-1.0, Math.min(0, val));
    return safe >= -0.01 ? 20000 : Math.max(200, 20000 * Math.pow(200 / 20000, -safe));
  }

  public rampFilter(targetVal: number, durationSeconds: number, startTime?: number, fromVal?: number) {
    const t0 = startTime !== undefined ? Math.max(this.ctx.currentTime, startTime) : this.ctx.currentTime;
    const tEnd = t0 + Math.max(0.05, durationSeconds);
    const safeTarget = Math.max(-1.0, Math.min(1.0, targetVal));

    this.filterLowPassNode.frequency.cancelScheduledValues(t0);
    this.filterHighPassNode.frequency.cancelScheduledValues(t0);

    const startHpf = fromVal !== undefined ? this.filterValToHpfFreq(fromVal) : Math.max(20, this.filterHighPassNode.frequency.value);
    const startLpf = fromVal !== undefined ? this.filterValToLpfFreq(fromVal) : Math.max(200, Math.min(20000, this.filterLowPassNode.frequency.value));

    if (safeTarget > 0.01) {
      // Smooth HPF sweep up (cuts bass -> mids -> highs)
      const targetFreq = this.filterValToHpfFreq(safeTarget);
      this.filterHighPassNode.frequency.setValueAtTime(startHpf, t0);
      this.filterHighPassNode.frequency.exponentialRampToValueAtTime(targetFreq, tEnd);
      this.filterLowPassNode.frequency.setValueAtTime(20000, t0);
    } else if (safeTarget < -0.01) {
      // Smooth LPF sweep down
      const targetFreq = this.filterValToLpfFreq(safeTarget);
      this.filterLowPassNode.frequency.setValueAtTime(startLpf, t0);
      this.filterLowPassNode.frequency.exponentialRampToValueAtTime(targetFreq, tEnd);
      this.filterHighPassNode.frequency.setValueAtTime(20, t0);
    } else {
      // Sweep back to neutral (HPF -> 20Hz, LPF -> 20000Hz)
      this.filterLowPassNode.frequency.setValueAtTime(startLpf, t0);
      this.filterLowPassNode.frequency.exponentialRampToValueAtTime(20000, tEnd);
      this.filterHighPassNode.frequency.setValueAtTime(startHpf, t0);
      this.filterHighPassNode.frequency.exponentialRampToValueAtTime(20, tEnd);
    }
  }

  /** LPF/HPF cutoff frequencies for a filter knob value (same mapping as setFilter) */
  public static filterValToFreqs(val: number): { lpf: number; hpf: number } {
    const v = Math.max(-1.0, Math.min(1.0, val));
    if (v < -0.01) return { lpf: Math.max(350, 20000 * Math.pow(350 / 20000, -v)), hpf: 20 };
    if (v > 0.01) return { lpf: 20000, hpf: Math.min(900, 20 * Math.pow(900 / 20, v)) };
    return { lpf: 20000, hpf: 20 };
  }

  /**
   * Schedules a whole transition on the audio clock (sample-accurate, keeps running even when the
   * window is hidden/minimized and requestAnimationFrame is paused).
   */
  public scheduleTransitionCurves(
    curves: { low: Float32Array; mid: Float32Array; high: Float32Array; filter: Float32Array; xfade: Float32Array },
    startTime: number,
    duration: number
  ) {
    const now = this.ctx.currentTime;
    const t0 = Math.max(startTime, now + 0.005);
    const lpf = new Float32Array(curves.filter.length);
    const hpf = new Float32Array(curves.filter.length);
    for (let i = 0; i < curves.filter.length; i++) {
      const f = DeckEngine.filterValToFreqs(curves.filter[i]);
      lpf[i] = f.lpf;
      hpf[i] = f.hpf;
    }
    const apply = (param: AudioParam, curve: Float32Array) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(curve[0], now);
      param.setValueCurveAtTime(curve, t0, duration);
    };
    apply(this.lowEqNode.gain, curves.low);
    apply(this.midEqNode.gain, curves.mid);
    apply(this.highEqNode.gain, curves.high);
    apply(this.filterLowPassNode.frequency, lpf);
    apply(this.filterHighPassNode.frequency, hpf);
    apply(this.crossfaderGainNode.gain, curves.xfade);
  }

  /** Cancels any scheduled transition automation and returns the deck to a neutral state */
  public cancelAutomation() {
    const now = this.ctx.currentTime;
    const params = [
      this.lowEqNode.gain,
      this.midEqNode.gain,
      this.highEqNode.gain,
      this.filterLowPassNode.frequency,
      this.filterHighPassNode.frequency,
      this.crossfaderGainNode.gain,
      this.volumeGainNode.gain,
    ];
    params.forEach(p => {
      const v = p.value;
      p.cancelScheduledValues(now);
      p.setValueAtTime(v, now);
    });
  }

  public resetEcho() {
    const now = this.ctx.currentTime;
    this.delayWetGainNode.gain.cancelScheduledValues(now);
    this.delayWetGainNode.gain.setValueAtTime(0.0, now);
    this.delayFeedbackNode.gain.cancelScheduledValues(now);
    this.delayFeedbackNode.gain.setValueAtTime(0.0, now);
  }

  public triggerEchoOut(durationSeconds: number, bpm: number, startTime?: number) {
    const t0 = startTime !== undefined ? startTime : this.ctx.currentTime;
    const beatSec = 60 / (bpm || 140);
    const delayTime = beatSec * 0.75; // 3/4 dotted dub delay
    
    this.delayNode.delayTime.cancelScheduledValues(t0);
    this.delayNode.delayTime.setValueAtTime(delayTime, t0);
    
    this.delayFeedbackNode.gain.cancelScheduledValues(t0);
    this.delayFeedbackNode.gain.setValueAtTime(0.68, t0);

    this.delayWetGainNode.gain.cancelScheduledValues(t0);
    this.delayWetGainNode.gain.setValueAtTime(0.0, t0);
    this.delayWetGainNode.gain.linearRampToValueAtTime(0.9, t0 + 0.15);

    // Fade out direct volume quickly so only reverberant echo tail rings out
    this.volumeGainNode.gain.cancelScheduledValues(t0);
    this.volumeGainNode.gain.setValueAtTime(this.volumeGainNode.gain.value, t0);
    this.volumeGainNode.gain.linearRampToValueAtTime(0.0, t0 + Math.min(2.0, durationSeconds * 0.35));
  }

  public getEnergyPeak(): number {
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(data);
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128;
      if (v > max) max = v;
    }
    return max;
  }
}

