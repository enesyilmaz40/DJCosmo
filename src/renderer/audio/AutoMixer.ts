import { AudioEngine } from './AudioEngine';
import { DeckEngine } from './DeckEngine';
import { TransitionType, TransitionState, CuePoints } from '../types';

/** Full bass kill used for the bass swap (low shelf @220 Hz). -24 dB still leaks an audible kick. */
const BASS_KILL_DB = -40;

/** One point of the mix choreography (progress 0..1, the bass swap always lands exactly at 0.5) */
export interface MixFrame {
  blend: number; // 0 = outgoing only, 1 = incoming only (UI crossfader)
  fromVol: number;
  fromLow: number;
  fromMid: number;
  fromHigh: number;
  fromFilter: number;
  toVol: number;
  toLow: number;
  toMid: number;
  toHigh: number;
  toFilter: number;
}

export class AutoMixer {
  private audioEngine: AudioEngine;
  private currentTransition: TransitionState | null = null;
  private animFrameId: number | null = null;
  private completionTimer: ReturnType<typeof setTimeout> | null = null;
  private echoTimer: ReturnType<typeof setTimeout> | null = null;
  private onTransitionProgress?: (state: TransitionState) => void;
  private onTransitionComplete?: (newActiveDeck: 'A' | 'B') => void;

  /** After a mix, glide the new track back to its native tempo (no key-lock -> pitched tracks are out of key) */
  public glideBackToNativeTempo = true;

  constructor(audioEngine: AudioEngine) {
    this.audioEngine = audioEngine;
  }

  public setCallbacks(
    onProgress: (state: TransitionState) => void,
    onComplete: (newActiveDeck: 'A' | 'B') => void
  ) {
    this.onTransitionProgress = onProgress;
    this.onTransitionComplete = onComplete;
  }

  public get isTransitioning(): boolean {
    return this.currentTransition !== null && this.currentTransition.isActive;
  }

  public getCurrentTransition(): TransitionState | null {
    return this.currentTransition;
  }

  private deck(id: 'A' | 'B'): DeckEngine {
    return id === 'A' ? this.audioEngine.deckA : this.audioEngine.deckB;
  }

  /**
   * Beat-exact transition between decks.
   *
   * Timing model: every beat/bar calculation for the outgoing deck happens in TRACK time using the
   * track's NATIVE bpm, and is converted to wall-clock time by dividing by the deck's playback rate.
   * (The old code mixed both units, so any pitched deck landed on a random beat phase.)
   *
   * The whole EQ / filter / volume choreography is pre-scheduled on the AudioContext clock, so it is
   * sample-accurate and does not stall when the window is in the background.
   */
  public startTransition(params: {
    type: TransitionType;
    fromDeckId: 'A' | 'B';
    toDeckId: 'A' | 'B';
    bars: number;
    fromTrackBpm: number; // native (analysed) bpm of the outgoing track
    toTrackBpm: number; // native (analysed) bpm of the incoming track
    fromFirstDownbeat?: number;
    toFirstDownbeat?: number;
    fromCues?: CuePoints;
    toCues?: CuePoints;
    /** Outgoing track-time (on its bar grid) where the mix should start. Defaults to the next bar. */
    launchAtFromTrackTime?: number;
  }) {
    if (this.isTransitioning) return;

    const {
      type,
      fromDeckId,
      toDeckId,
      fromTrackBpm,
      toTrackBpm,
      fromFirstDownbeat = 0,
      toFirstDownbeat = 0,
      toCues,
      launchAtFromTrackTime,
    } = params;
    const bars = Math.max(2, Math.round(params.bars / 2) * 2);

    const fromDeck = this.deck(fromDeckId);
    const toDeck = this.deck(toDeckId);
    fromDeck.stopGlide();
    toDeck.stopGlide();

    const ctx = this.audioEngine.ctx;
    const now = ctx.currentTime;

    // 1. Tempo: outgoing deck defines the master tempo
    const fromRate = fromDeck.playbackRate;
    const safeFromBpm = fromTrackBpm > 0 ? fromTrackBpm : 140;
    const safeToBpm = toTrackBpm > 0 ? toTrackBpm : safeFromBpm;
    const masterBpm = safeFromBpm * fromRate;
    const fromNativeBar = 240 / safeFromBpm; // seconds of outgoing TRACK time per bar
    const wallBar = 240 / masterBpm; // seconds of WALL time per bar
    const durationSeconds = bars * wallBar;

    // 2. Launch on an outgoing bar downbeat (track-time grid -> wall-clock)
    const t = fromDeck.currentTime;
    let launchTrackTime: number;
    if (
      launchAtFromTrackTime !== undefined &&
      launchAtFromTrackTime - t > 0.03 * fromRate &&
      launchAtFromTrackTime - t < fromNativeBar * 8
    ) {
      launchTrackTime = launchAtFromTrackTime;
    } else if (t < fromFirstDownbeat) {
      launchTrackTime = fromFirstDownbeat;
    } else {
      const k = Math.ceil((t - fromFirstDownbeat) / fromNativeBar - 1e-6);
      launchTrackTime = fromFirstDownbeat + k * fromNativeBar;
      if ((launchTrackTime - t) / fromRate < 0.05) launchTrackTime += fromNativeBar;
    }
    const launchTime = now + (launchTrackTime - t) / fromRate;

    // 3. Incoming tempo + start offset on ITS bar grid.
    // Goal: the incoming kick-in / drop (introEnd) lands exactly on the bass swap (half-way).
    const toRate = masterBpm / safeToBpm;
    toDeck.setPlaybackRate(toRate);
    const toNativeBar = 240 / safeToBpm;
    const halfBars = bars / 2;
    let toStartOffset = toFirstDownbeat;
    if (toCues?.introEnd !== undefined) {
      const desired = toCues.introEnd - halfBars * toNativeBar;
      if (desired >= toFirstDownbeat) {
        const k = Math.round((desired - toFirstDownbeat) / toNativeBar);
        toStartOffset = toFirstDownbeat + k * toNativeBar;
      }
    }

    if (toDeck.isPlaying) {
      // Manually pre-started incoming deck: re-launch it on its own bar grid at the launch instant
      const projected = toDeck.currentTime + (launchTime - now) * toRate;
      const k = Math.max(0, Math.round((projected - toFirstDownbeat) / toNativeBar));
      toStartOffset = toFirstDownbeat + k * toNativeBar;
    }

    // 4. Pre-schedule the whole choreography on the audio clock
    this.scheduleChoreography(type, fromDeck, toDeck, launchTime, durationSeconds);
    toDeck.play(launchTime, toStartOffset);

    if (type === 'echo_out') {
      const swapTime = launchTime + durationSeconds / 2;
      const delayMs = Math.max(0, (swapTime - ctx.currentTime) * 1000 - 30);
      this.echoTimer = setTimeout(() => {
        fromDeck.triggerEchoOut(durationSeconds / 2, masterBpm, swapTime);
      }, delayMs);
    }

    this.currentTransition = {
      isActive: true,
      type,
      fromDeck: fromDeckId,
      toDeck: toDeckId,
      durationSeconds,
      startTime: launchTime,
      progress: 0.0,
      bars,
    };

    // Completion is driven by a timer (works in background); rAF only refreshes the UI
    const totalMs = (launchTime - ctx.currentTime + durationSeconds) * 1000 + 60;
    this.completionTimer = setTimeout(() => this.completeTransition(), totalMs);
    this.runTransitionLoop();
  }

  private scheduleChoreography(
    type: TransitionType,
    fromDeck: DeckEngine,
    toDeck: DeckEngine,
    startTime: number,
    duration: number
  ) {
    // 100 points per second -> 10 ms resolution; the bass swap is spread over ~40 ms (no click)
    const n = Math.max(64, Math.ceil(duration * 100));
    const swapWidth = Math.min(0.02, 0.04 / duration);
    const mk = () => ({
      low: new Float32Array(n),
      mid: new Float32Array(n),
      high: new Float32Array(n),
      filter: new Float32Array(n),
      xfade: new Float32Array(n),
    });
    const from = mk();
    const to = mk();
    for (let i = 0; i < n; i++) {
      const f = AutoMixer.computeMixFrame(i / (n - 1), type, swapWidth);
      from.low[i] = f.fromLow;
      from.mid[i] = f.fromMid;
      from.high[i] = f.fromHigh;
      from.filter[i] = f.fromFilter;
      from.xfade[i] = f.fromVol;
      to.low[i] = f.toLow;
      to.mid[i] = f.toMid;
      to.high[i] = f.toHigh;
      to.filter[i] = f.toFilter;
      to.xfade[i] = f.toVol;
    }
    fromDeck.resetEcho();
    toDeck.resetEcho();
    fromDeck.setVolume(1.0);
    toDeck.setVolume(1.0);
    fromDeck.scheduleTransitionCurves(from, startTime, duration);
    toDeck.scheduleTransitionCurves(to, startTime, duration);
  }

  private static smoothStep(x: number, edge0: number, edge1: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }

  /**
   * Mix choreography (progress 0..1). Club-style structure:
   *  - 1st half: incoming track enters with its bass KILLED, mids/highs tucked, volume fading in.
   *    Only one kick/bassline is ever audible.
   *  - 0.5 (an exact bar downbeat): BASS SWAP - outgoing bass killed, incoming bass on, in ~40 ms.
   *  - 2nd half: outgoing mids/highs fade, then its volume fades out by the end.
   */
  public static computeMixFrame(progress: number, type: TransitionType, swapWidth = 0.004): MixFrame {
    const p = Math.max(0, Math.min(1, progress));
    const S = AutoMixer.smoothStep;
    const swap = S(p, 0.5 - swapWidth, 0.5 + swapWidth);
    const r1 = (v: number) => Math.round(v * 10) / 10;

    let frame: MixFrame;

    if (type === 'smooth_crossfade') {
      // Longer, softer bass handover (1/8 of the mix) and a plain equal-ish volume crossfade
      const bassIn = S(p, 0.44, 0.56);
      const toVol = S(p, 0.0, 0.5);
      const fromVol = 1 - S(p, 0.5, 1.0);
      frame = {
        blend: 0,
        fromVol,
        fromLow: BASS_KILL_DB * bassIn,
        fromMid: -10 * S(p, 0.5, 0.9),
        fromHigh: -12 * S(p, 0.55, 0.95),
        fromFilter: 0,
        toVol,
        toLow: BASS_KILL_DB * (1 - bassIn),
        toMid: -8 * (1 - S(p, 0.05, 0.5)),
        toHigh: -6 * (1 - S(p, 0.0, 0.35)),
        toFilter: 0,
      };
    } else if (type === 'echo_out') {
      // Incoming builds without bass; at the swap the outgoing track is thrown into a dub echo
      frame = {
        blend: 0,
        // dry signal is cut by triggerEchoOut at the swap; the crossfader only closes the echo tail at the end
        fromVol: 1 - S(p, 0.8, 1.0),
        fromLow: BASS_KILL_DB * swap,
        fromMid: 0,
        fromHigh: 0,
        fromFilter: 0,
        toVol: S(p, 0.0, 0.3),
        toLow: BASS_KILL_DB * (1 - swap),
        toMid: -6 * (1 - S(p, 0.1, 0.5)),
        toHigh: -4 * (1 - S(p, 0.0, 0.3)),
        toFilter: 0,
      };
    } else {
      // bass_swap, 16_bar, 32_bar, filter_transition
      const isFilter = type === 'filter_transition';
      frame = {
        blend: 0,
        fromVol: 1 - S(p, 0.72, 1.0),
        fromLow: BASS_KILL_DB * swap,
        fromMid: -14 * S(p, 0.5, 0.82),
        fromHigh: -18 * S(p, 0.56, 0.92),
        fromFilter: isFilter ? 0.62 * S(p, 0.52, 0.95) : 0,
        toVol: S(p, 0.0, 0.25),
        toLow: BASS_KILL_DB * (1 - swap),
        toMid: -10 * (1 - S(p, 0.1, 0.5)),
        toHigh: -6 * (1 - S(p, 0.0, 0.3)),
        toFilter: isFilter ? -0.55 * (1 - S(p, 0.0, 0.48)) : 0,
      };
    }

    frame.blend = Math.max(0, Math.min(1, (frame.toVol + (1 - frame.fromVol)) / 2));
    frame.fromLow = r1(frame.fromLow);
    frame.fromMid = r1(frame.fromMid);
    frame.fromHigh = r1(frame.fromHigh);
    frame.toLow = r1(frame.toLow);
    frame.toMid = r1(frame.toMid);
    frame.toHigh = r1(frame.toHigh);
    return frame;
  }

  public static computeCrossfaderBlend(progress: number, type: TransitionType): number {
    return AutoMixer.computeMixFrame(progress, type).blend;
  }

  private runTransitionLoop = () => {
    if (!this.currentTransition || !this.currentTransition.isActive) return;

    const now = this.audioEngine.ctx.currentTime;
    const elapsed = Math.max(0, now - this.currentTransition.startTime);
    this.currentTransition.progress = Math.min(1.0, elapsed / this.currentTransition.durationSeconds);

    if (this.onTransitionProgress) {
      this.onTransitionProgress({ ...this.currentTransition });
    }

    if (this.currentTransition.progress >= 1.0) {
      this.completeTransition();
    } else {
      this.animFrameId = requestAnimationFrame(this.runTransitionLoop);
    }
  };

  private clearTimers() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }
    if (this.echoTimer) {
      clearTimeout(this.echoTimer);
      this.echoTimer = null;
    }
  }

  private completeTransition() {
    if (!this.currentTransition) return;
    this.clearTimers();

    const fromDeck = this.deck(this.currentTransition.fromDeck);
    const toDeck = this.deck(this.currentTransition.toDeck);
    const newActiveDeck = this.currentTransition.toDeck;

    fromDeck.stop();
    fromDeck.cancelAutomation();
    fromDeck.resetEcho();
    fromDeck.setLowEq(0);
    fromDeck.setMidEq(0);
    fromDeck.setHighEq(0);
    fromDeck.setFilter(0);
    fromDeck.setVolume(1.0);
    fromDeck.setPlaybackRate(1.0);

    toDeck.cancelAutomation();
    toDeck.resetEcho();
    toDeck.setLowEq(0);
    toDeck.setMidEq(0);
    toDeck.setHighEq(0);
    toDeck.setFilter(0);
    toDeck.setVolume(1.0);

    this.audioEngine.updateCrossfader(newActiveDeck === 'A' ? -1.0 : 1.0);

    // Bring the new track back to its native tempo (and therefore its real key) over ~16 bars
    const rate = toDeck.playbackRate;
    if (this.glideBackToNativeTempo && Math.abs(rate - 1) > 0.001 && Math.abs(rate - 1) <= 0.1) {
      toDeck.glideToRate(1.0, 16 * (this.currentTransition.durationSeconds / this.currentTransition.bars));
    }

    const completedState = { ...this.currentTransition, isActive: false, progress: 1.0 };
    this.currentTransition = null;

    if (this.onTransitionProgress) {
      this.onTransitionProgress(completedState);
    }
    if (this.onTransitionComplete) {
      this.onTransitionComplete(newActiveDeck);
    }
  }

  public cancelTransition() {
    const tr = this.currentTransition;
    this.clearTimers();
    if (tr) {
      this.deck(tr.fromDeck).cancelAutomation();
      this.deck(tr.toDeck).cancelAutomation();
    }
    this.currentTransition = null;
  }
}
