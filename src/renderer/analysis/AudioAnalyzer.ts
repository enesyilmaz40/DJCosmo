import { TrackAnalysis, CuePoints } from '../types';

/** Bump whenever the analysis algorithm changes so stored tracks get re-analysed automatically */
export const ANALYSIS_VERSION = 6;

const ENV_RATE = 1000; // Hz, kick-onset envelope rate (1 ms resolution)
const MAX_GRID_FIT_SEC = 600; // fit the beat grid on max 10 minutes (DJ mixes are not constant tempo anyway)

export class AudioAnalyzer {
  /**
   * Performs full DSP music analysis on an AudioBuffer
   */
  public static async analyzeAudioBuffer(buffer: AudioBuffer): Promise<TrackAnalysis> {
    const channelData = AudioAnalyzer.getMonoData(buffer);
    const sampleRate = buffer.sampleRate;
    const duration = buffer.duration;

    // 1. Full-band RMS and sub-bass (<130 Hz kick) energy profile in 500 ms chunks
    const chunkSize = Math.floor(sampleRate * 0.5);
    const numChunks = Math.floor(channelData.length / chunkSize);
    const energyProfile: number[] = [];
    const lowEnergyProfile: number[] = [];
    let overallPeak = 0;
    let sumSquaresTotal = 0;

    let lpKick = 0;
    const lpKickAlpha = Math.exp((-2 * Math.PI * 130) / (sampleRate / 4));

    for (let c = 0; c < numChunks; c++) {
      let sumSq = 0;
      let sumLowSq = 0;
      let chunkPeak = 0;
      const start = c * chunkSize;
      const end = start + chunkSize;

      for (let i = start; i < end; i += 4) {
        const sample = channelData[i];
        const val = Math.abs(sample);
        if (val > chunkPeak) chunkPeak = val;
        sumSq += val * val;

        lpKick = lpKickAlpha * lpKick + (1 - lpKickAlpha) * sample;
        sumLowSq += lpKick * lpKick;
      }

      if (chunkPeak > overallPeak) overallPeak = chunkPeak;
      const count = (end - start) / 4;
      energyProfile.push(Math.sqrt(sumSq / count));
      lowEnergyProfile.push(Math.sqrt(sumLowSq / count));
      sumSquaresTotal += sumSq;
    }

    const overallRms = Math.sqrt(sumSquaresTotal / (channelData.length / 4));
    const maxProfileVal = Math.max(...energyProfile, 0.01);
    const normalizedProfile = energyProfile.map(v => Math.min(1.0, v / maxProfileVal));
    const maxLowVal = Math.max(...lowEnergyProfile, 0.005);
    const normalizedLowProfile = lowEnergyProfile.map(v => Math.min(1.0, v / maxLowVal));
    const normalizedOverallRms = Math.min(1.0, overallRms / (maxProfileVal || 1));

    // 2. Beat grid: coarse tempo -> global tempo/phase fit -> bar (downbeat) and 8-bar phrase phase
    const grid = this.detectBeatGrid(channelData, sampleRate, normalizedLowProfile);

    // 3. Bar-quantized structure & cue points
    const cues = this.detectCues(normalizedProfile, normalizedLowProfile, duration, grid.bpm, grid.firstDownbeat);

    // 4. Musical key with confidence
    const { musicalKey, camelotKey, keyConfidence } = this.detectMusicalKey(channelData, sampleRate);

    return {
      bpm: Math.round(grid.bpm * 100) / 100,
      firstDownbeat: Math.round(grid.firstDownbeat * 1000) / 1000,
      rmsEnergy: Math.round(normalizedOverallRms * 100) / 100,
      peakLevel: Math.round(overallPeak * 100) / 100,
      energyProfile: normalizedProfile,
      cues,
      isConfident: grid.confidence >= 0.6,
      analyzedAt: new Date().toISOString(),
      analysisVersion: ANALYSIS_VERSION,
      musicalKey,
      camelotKey,
      keyConfidence: Math.round(keyConfidence * 100) / 100,
      beatGridConfidence: Math.round(grid.confidence * 100) / 100,
      phraseOffsetBars: grid.phraseOffsetBars,
    };
  }

  /** Mono mix of all channels (the old code only looked at the left channel) */
  private static getMonoData(buffer: AudioBuffer): Float32Array {
    const chCount = (buffer as any).numberOfChannels || 1;
    if (chCount <= 1) return buffer.getChannelData(0);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) mono[i] = 0.5 * (left[i] + right[i]);
    return mono;
  }

  // ---------------------------------------------------------------------------------------------
  // BEAT GRID
  // ---------------------------------------------------------------------------------------------

  /** Kick-onset envelope (1 kHz): 2-pole 95 Hz low-pass -> RMS -> half-wave rectified derivative */
  private static kickOnsets(channelData: Float32Array, sampleRate: number) {
    const decimation = Math.max(1, Math.round(sampleRate / ENV_RATE));
    const envRate = sampleRate / decimation;
    const envLength = Math.floor(channelData.length / decimation);
    const env = new Float32Array(envLength);
    let lp1 = 0;
    let lp2 = 0;
    const a = Math.exp((-2 * Math.PI * 95) / sampleRate);
    for (let i = 0; i < envLength; i++) {
      let sumSq = 0;
      const base = i * decimation;
      for (let j = 0; j < decimation; j++) {
        lp1 = a * lp1 + (1 - a) * channelData[base + j];
        lp2 = a * lp2 + (1 - a) * lp1;
        sumSq += lp2 * lp2;
      }
      env[i] = Math.sqrt(sumSq / decimation);
    }
    const onsets = new Float32Array(envLength);
    for (let i = 1; i < envLength; i++) {
      const d = env[i] - env[i - 1];
      onsets[i] = d > 0 ? d : 0;
    }
    return { onsets, env, envRate };
  }

  /**
   * Folds the onset signal with period P (in envelope samples) and returns the phase histogram.
   * A correct tempo stacks every kick of the track into one sharp peak; a tempo that is off by
   * even 0.05 BPM smears the peak over a 10-minute window, so this is a very precise tempo test.
   */
  private static foldScore(onsets: Float32Array, from: number, to: number, period: number) {
    const bins = Math.ceil(period);
    const hist = new Float64Array(bins + 2);
    for (let i = from; i < to; i++) {
      const v = onsets[i];
      if (v === 0) continue;
      const ph = i - period * Math.floor(i / period);
      hist[Math.min(bins - 1, Math.floor(ph))] += v;
    }
    let best = -1;
    let bestPhase = 0;
    let total = 0;
    for (let b = 0; b < bins; b++) {
      total += hist[b];
      // +/- 2 ms tolerance
      const s =
        hist[b] +
        0.7 * (hist[(b + 1) % bins] + hist[(b - 1 + bins) % bins]) +
        0.3 * (hist[(b + 2) % bins] + hist[(b - 2 + bins) % bins]);
      if (s > best) {
        best = s;
        bestPhase = b;
      }
    }
    // refine phase by centroid of the peak
    let num = 0;
    let den = 0;
    for (let d = -2; d <= 2; d++) {
      const v = hist[(bestPhase + d + bins) % bins];
      num += d * v;
      den += v;
    }
    const phase = bestPhase + (den > 0 ? num / den : 0);
    return { score: total > 0 ? best / total : 0, phase: (phase + period) % period };
  }

  /** Band-limited RMS envelope at the onset envelope rate (2-pole HP + 2-pole LP) */
  private static bandEnvelope(channelData: Float32Array, sampleRate: number, lo: number, hi: number, N: number) {
    const dec = Math.max(1, Math.round(sampleRate / ENV_RATE));
    const ah = Math.exp((-2 * Math.PI * lo) / sampleRate);
    const al = Math.exp((-2 * Math.PI * hi) / sampleRate);
    let h1 = 0;
    let h2 = 0;
    let l1 = 0;
    let l2 = 0;
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      const base = i * dec;
      for (let j = 0; j < dec; j++) {
        const v = channelData[base + j];
        h1 = ah * h1 + (1 - ah) * v;
        const hp1 = v - h1;
        h2 = ah * h2 + (1 - ah) * hp1;
        const hp = hp1 - h2;
        l1 = al * l1 + (1 - al) * hp;
        l2 = al * l2 + (1 - al) * l1;
        s += l2 * l2;
      }
      out[i] = Math.sqrt(s / dec);
    }
    return out;
  }

  private static findKickAttackPhase(
    channelData: Float32Array,
    sampleRate: number,
    envRate: number,
    N: number,
    fitEnd: number,
    beatLen: number,
    fallbackPhase: number
  ): { phase: number; confidence: number } {
    const punch = this.bandEnvelope(channelData, sampleRate, 40, 250, N);
    const click = this.bandEnvelope(channelData, sampleRate, 1500, 5000, N);
    const eps = 1e-5;
    const lp = new Float32Array(N);
    for (let i = 0; i < N; i++) lp[i] = Math.log(punch[i] + eps);
    // prefix sums for window means of log punch
    const pre = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) pre[i + 1] = pre[i] + lp[i];
    const mean = (a: number, b: number) => (pre[b] - pre[a]) / Math.max(1, b - a);
    const ms = (v: number) => Math.round((v * envRate) / 1000);

    const bins = Math.ceil(beatLen);
    const clickH = new Float64Array(bins);
    const riseH = new Float64Array(bins);
    const lag = ms(4);
    const attack = new Float32Array(N); // per-sample kick-attack strength (for the local consistency check)
    for (let i = Math.max(lag, ms(30)); i < N - ms(90); i++) {
      const cf = Math.max(0, Math.log(click[i] + eps) - Math.log(click[i - lag] + eps));
      const rise = Math.max(0, mean(i + ms(15), i + ms(80)) - mean(i - ms(30), i - ms(3)));
      attack[i] = cf * (0.25 + rise);
      if (i < fitEnd) {
        const b = Math.min(bins - 1, Math.floor(i - beatLen * Math.floor(i / beatLen)));
        clickH[b] += cf;
        riseH[b] += rise;
      }
    }
    const smooth = (h: Float64Array) => {
      const o = new Float64Array(bins);
      for (let b = 0; b < bins; b++) {
        o[b] =
          h[b] +
          0.6 * (h[(b + 1) % bins] + h[(b - 1 + bins) % bins]) +
          0.25 * (h[(b + 2) % bins] + h[(b - 2 + bins) % bins]);
      }
      const mx = Math.max(...o) || 1;
      return o.map(v => v / mx);
    };
    const c = smooth(clickH);
    const r = smooth(riseH);
    // peakiness of the click histogram: if the track has no clear click transient, rely on the rise
    const cMean = c.reduce((s, v) => s + v, 0) / bins;
    const clickWeight = cMean < 0.75 ? 1 : 0.3;
    let best = -1;
    let bestB = -1;
    for (let b = 0; b < bins; b++) {
      const score = (clickWeight * c[b] + (1 - clickWeight) * 0.5) * (0.25 + r[b]);
      if (score > best) {
        best = score;
        bestB = b;
      }
    }
    const phase = bestB >= 0 ? bestB : fallbackPhase;

    // Confidence: in 16-beat windows across the track, does the local best kick phase agree with
    // the global grid (+/- 20 ms)? Windows without kicks (breakdowns) are skipped.
    const win = 16;
    const totalBeats = Math.floor((N - phase) / beatLen);
    const half = Math.floor(beatLen / 2);
    const tolerance = ms(20);
    const windowScores: { off: number; score: number }[] = [];
    for (let w0 = 0; w0 + win <= totalBeats; w0 += win) {
      let bestOff = 0;
      let bestScore = -1;
      for (let off = -half; off < half; off += 2) {
        let sc = 0;
        for (let k = w0; k < w0 + win; k++) {
          const i = Math.round(phase + k * beatLen + off);
          if (i > 2 && i < N - 2) sc += Math.max(attack[i - 2], attack[i - 1], attack[i], attack[i + 1], attack[i + 2]);
        }
        if (sc > bestScore) {
          bestScore = sc;
          bestOff = off;
        }
      }
      windowScores.push({ off: bestOff, score: bestScore });
    }
    const maxScore = Math.max(0, ...windowScores.map(w => w.score));
    const active = windowScores.filter(w => w.score > maxScore * 0.35);
    const agreeing = active.filter(w => Math.abs(w.off) <= tolerance).length;
    const confidence = active.length >= 3 ? agreeing / active.length : 0;
    return { phase, confidence };
  }

  private static detectBeatGrid(
    channelData: Float32Array,
    sampleRate: number,
    normalizedLowProfile: number[]
  ): { bpm: number; firstDownbeat: number; confidence: number; phraseOffsetBars: number } {
    const { onsets: rawOnsets, env, envRate } = this.kickOnsets(channelData, sampleRate);
    const N = rawOnsets.length;

    // Sharp kick peaks only: non-maximum suppression (+/- 40 ms) and squaring.
    // Without this the rolling 16th-note bassline of hard techno (a bass hit ~94 ms after every kick)
    // carries more onset "mass" than the kick itself and the grid locks one 16th late.
    const onsets = new Float32Array(N);
    const nms = Math.round(envRate * 0.04);
    for (let i = 1; i < N - 1; i++) {
      const v = rawOnsets[i];
      if (v <= 0 || v < rawOnsets[i - 1] || v < rawOnsets[i + 1]) continue;
      let isMax = true;
      for (let j = Math.max(0, i - nms); j <= Math.min(N - 1, i + nms); j++) {
        if (rawOnsets[j] > v) {
          isMax = false;
          break;
        }
      }
      if (isMax) onsets[i] = v * v;
    }
    const fitEnd = Math.min(N, Math.floor(envRate * MAX_GRID_FIT_SEC));

    // --- A. Coarse tempo from autocorrelation of the strongest 40 s kick groove ------------------
    let bestChunkStart = 0;
    const windowChunks = 80;
    if (normalizedLowProfile.length > windowChunks + 10) {
      let bestSum = -1;
      const maxStart = Math.min(normalizedLowProfile.length - windowChunks - 4, MAX_GRID_FIT_SEC * 2 - windowChunks);
      for (let c = 6; c <= maxStart; c += 2) {
        let s = 0;
        for (let k = 0; k < windowChunks; k++) s += normalizedLowProfile[c + k];
        if (s > bestSum) {
          bestSum = s;
          bestChunkStart = c;
        }
      }
    }
    const acStart = Math.min(Math.max(0, N - Math.floor(envRate * 42)), Math.floor(envRate * bestChunkStart * 0.5));
    const acEnd = Math.min(N, acStart + Math.floor(envRate * 42));
    const minBpm = 122;
    const maxBpm = 175;
    const minLag = Math.floor((envRate * 60) / maxBpm);
    const maxLag = Math.ceil((envRate * 60) / minBpm);
    const rawCorr = new Float64Array(maxLag * 2 + 4);
    for (let lag = minLag; lag <= maxLag * 2; lag++) {
      let corr = 0;
      let count = 0;
      for (let i = acStart; i < acEnd - lag; i += 2) {
        corr += rawOnsets[i] * rawOnsets[i + lag];
        count++;
      }
      rawCorr[lag] = count > 0 ? corr / count : 0;
    }
    // Top 3 separated autocorrelation peaks are tempo candidates; the global fold decides
    const acScore = new Float64Array(maxLag + 2);
    for (let lag = minLag; lag <= maxLag; lag++) acScore[lag] = 0.62 * rawCorr[lag] + 0.38 * rawCorr[lag * 2];
    const candidates: number[] = [];
    const used = new Uint8Array(maxLag + 2);
    for (let c = 0; c < 3; c++) {
      let bl = -1;
      for (let lag = minLag; lag <= maxLag; lag++) {
        if (!used[lag] && (bl < 0 || acScore[lag] > acScore[bl])) bl = lag;
      }
      if (bl < 0) break;
      candidates.push((envRate * 60) / bl);
      for (let lag = Math.max(minLag, bl - 8); lag <= Math.min(maxLag, bl + 8); lag++) used[lag] = 1;
    }

    // --- B. Global tempo fit: fold the whole track at candidate tempos ---------------------------
    let bestBpm = candidates[0] || 140;
    let bestFit = { score: -1, phase: 0 };
    for (const coarseBpm of candidates) {
      for (let b = coarseBpm - 1.6; b <= coarseBpm + 1.6; b += 0.02) {
        const fit = this.foldScore(onsets, 0, fitEnd, (envRate * 60) / b);
        if (fit.score > bestFit.score) {
          bestFit = fit;
          bestBpm = b;
        }
      }
    }
    for (let b = bestBpm - 0.03; b <= bestBpm + 0.03; b += 0.002) {
      const fit = this.foldScore(onsets, 0, fitEnd, (envRate * 60) / b);
      if (fit.score > bestFit.score) {
        bestFit = fit;
        bestBpm = b;
      }
    }
    // Produced tracks are almost always on an integer (or .5) BPM: prefer it when it fits as well
    for (const snap of [Math.round(bestBpm), Math.round(bestBpm * 2) / 2]) {
      if (Math.abs(snap - bestBpm) > 0.12) continue;
      const fit = this.foldScore(onsets, 0, fitEnd, (envRate * 60) / snap);
      if (fit.score >= bestFit.score * 0.985) {
        bestFit = fit;
        bestBpm = snap;
        break;
      }
    }

    const beatLen = (envRate * 60) / bestBpm; // envelope samples per beat
    // Phase: the kick ATTACK (click transient followed by a rise of the 40-250 Hz body).
    // The sub-band peak of long, distorted hard-techno kicks comes 60-130 ms after the attack,
    // and offbeat hi-hats have a click without a bass rise - this separates all three.
    const attackFit = this.findKickAttackPhase(channelData, sampleRate, envRate, N, fitEnd, beatLen, bestFit.phase);
    const beatPhase = attackFit.phase;

    // --- C. Per-beat features: kick strength, low and full-band energy --------------------------
    const numBeats = Math.floor((N - beatPhase) / beatLen);
    const kick = new Float64Array(numBeats);
    const lowE = new Float64Array(numBeats);
    const kickBody = Math.round(envRate * 0.15); // kick body follows the attack by up to ~150 ms
    for (let k = 0; k < numBeats; k++) {
      const c = Math.round(beatPhase + k * beatLen);
      let localMax = 0;
      for (let i = Math.max(0, c - 5); i <= Math.min(N - 1, c + kickBody); i++) if (onsets[i] > localMax) localMax = onsets[i];
      kick[k] = localMax;
      let e = 0;
      const end = Math.min(N, Math.round(beatPhase + (k + 1) * beatLen));
      for (let i = c; i < end; i++) e += env[i];
      lowE[k] = e / Math.max(1, end - c);
    }

    let maxKick = 0;
    for (let k = 0; k < numBeats; k++) if (kick[k] > maxKick) maxKick = kick[k];
    const confidence = attackFit.confidence;

    // --- D. Bar phase (which beat is "1"): structure changes happen on bar starts --------------
    const logE = Array.from(lowE, v => Math.log(v + 1e-6));
    const barScore = [0, 0, 0, 0];
    for (let k = 1; k < numBeats; k++) {
      const novelty = Math.max(0, Math.abs(logE[k] - logE[k - 1]) - 0.1);
      barScore[k % 4] += novelty;
    }
    // First kick of the track is usually a bar start: small prior
    let firstKickBeat = 0;
    for (let k = 0; k < numBeats; k++) {
      if (kick[k] > maxKick * 0.25) {
        firstKickBeat = k;
        break;
      }
    }
    const totalBarScore = barScore.reduce((s, v) => s + v, 0) || 1;
    barScore[firstKickBeat % 4] += totalBarScore * 0.12;
    let barResidue = 0;
    for (let r = 1; r < 4; r++) if (barScore[r] > barScore[barResidue]) barResidue = r;

    // --- E. 8-bar phrase phase: biggest energy changes happen on phrase starts ------------------
    const numBars = Math.floor((numBeats - barResidue) / 4);
    const barE: number[] = [];
    for (let b = 0; b < numBars; b++) {
      let s = 0;
      for (let j = 0; j < 4; j++) s += lowE[barResidue + b * 4 + j];
      barE.push(Math.log(s / 4 + 1e-6));
    }
    const phraseScore = new Array(8).fill(0);
    for (let b = 1; b < numBars; b++) {
      phraseScore[b % 8] += Math.max(0, Math.abs(barE[b] - barE[b - 1]) - 0.08);
    }
    let phraseOffsetBars = 0;
    for (let r = 1; r < 8; r++) if (phraseScore[r] > phraseScore[phraseOffsetBars]) phraseOffsetBars = r;

    const firstDownbeat = (beatPhase + barResidue * beatLen) / envRate;

    return {
      bpm: bestBpm > 0 ? bestBpm : 140,
      firstDownbeat,
      confidence,
      phraseOffsetBars,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // STRUCTURE / CUES
  // ---------------------------------------------------------------------------------------------

  /**
   * Detects structural markers: Intro, Outro, Breakdown, Drop using Sub-Bass Kick Profile (<130Hz)
   * Note: never invents values - unset when not detected.
   */
  private static detectCues(
    normalizedProfile: number[],
    normalizedLowProfile: number[],
    duration: number,
    bpm: number,
    firstDownbeat: number
  ): CuePoints {
    const cues: CuePoints = {};
    if (normalizedProfile.length < 10) return cues;

    const secondsPerChunk = 0.5;
    const secondsPerBar = (60 / (bpm || 140)) * 4;
    const snapToBar = (timeSec: number): number => {
      if (timeSec <= firstDownbeat) return Number(firstDownbeat.toFixed(3));
      const barIndex = Math.round((timeSec - firstDownbeat) / secondsPerBar);
      return Number(Math.max(firstDownbeat, Math.min(duration - 0.5, firstDownbeat + barIndex * secondsPerBar)).toFixed(3));
    };

    const avgEnergy = normalizedProfile.reduce((a, b) => a + b, 0) / normalizedProfile.length;
    const lowSrc = normalizedLowProfile.length === normalizedProfile.length ? normalizedLowProfile : normalizedProfile;
    const avgLow = lowSrc.reduce((a, b) => a + b, 0) / lowSrc.length;

    // 1. Intro End (first sustained main kick)
    for (let i = 0; i < Math.floor(lowSrc.length * 0.4); i++) {
      if (
        lowSrc[i] > avgLow * 0.72 &&
        i + 3 < lowSrc.length &&
        lowSrc[i + 1] > avgLow * 0.65 &&
        lowSrc[i + 2] > avgLow * 0.65
      ) {
        cues.introStart = 0;
        const rawIntroEnd = i * secondsPerChunk;
        cues.introEnd = rawIntroEnd > 2.0 ? snapToBar(rawIntroEnd) : Number(firstDownbeat.toFixed(3));
        break;
      }
    }

    // 2. Outro Start: last point in the final 35% where the kick is still fully present
    for (let i = lowSrc.length - 1; i > Math.floor(lowSrc.length * 0.65); i--) {
      if (lowSrc[i] > avgLow * 0.68 && normalizedProfile[i] > avgEnergy * 0.65) {
        cues.outroStart = snapToBar(i * secondsPerChunk);
        break;
      }
    }

    // 3. Breakdown (kick drops out >= 3.5 s) and the Drop where it slams back in
    let candidateBreakdown: number | null = null;
    let candidateDrop: number | null = null;
    let bestDropContrast = 0;
    const searchStart = Math.floor(lowSrc.length * 0.18);
    const searchEnd = Math.floor(lowSrc.length * 0.85);

    for (let i = searchStart; i < searchEnd; i++) {
      if (lowSrc[i] < avgLow * 0.52) {
        let dipLen = 0;
        let dipSum = 0;
        while (i + dipLen < searchEnd && lowSrc[i + dipLen] < avgLow * 0.6) {
          dipSum += lowSrc[i + dipLen];
          dipLen++;
        }
        const dipSeconds = dipLen * secondsPerChunk;
        if (dipSeconds >= 3.5 && dipSeconds <= 36) {
          const postDipIdx = i + dipLen;
          if (postDipIdx + 3 < lowSrc.length) {
            const postKickAvg =
              (lowSrc[postDipIdx] + lowSrc[postDipIdx + 1] + lowSrc[postDipIdx + 2] + lowSrc[postDipIdx + 3]) / 4;
            const dipAvg = dipSum / Math.max(1, dipLen);
            const contrast = postKickAvg - dipAvg;
            if (postKickAvg > avgLow * 0.78 && contrast > bestDropContrast) {
              bestDropContrast = contrast;
              candidateBreakdown = snapToBar(i * secondsPerChunk);
              candidateDrop = snapToBar(postDipIdx * secondsPerChunk);
            }
          }
        }
        i += Math.max(1, dipLen);
      }
    }
    if (candidateBreakdown !== null && candidateDrop !== null && candidateDrop > candidateBreakdown) {
      cues.breakdown = candidateBreakdown;
      cues.drop = candidateDrop;
    }

    cues.mixInPoint = firstDownbeat;
    cues.mixOutPoint = cues.outroStart
      ? snapToBar(Math.max(firstDownbeat, cues.outroStart - secondsPerBar * 8))
      : snapToBar(Math.max(firstDownbeat, duration - secondsPerBar * 12));

    return cues;
  }

  // ---------------------------------------------------------------------------------------------
  // KEY
  // ---------------------------------------------------------------------------------------------

  /** In-place radix-2 FFT */
  private static fft(re: Float64Array, im: Float64Array) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k;
          const b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
  }

  /**
   * Key detection: chroma from spectral peaks over the WHOLE track (one 0.74 s frame per second,
   * 65 Hz - 2.1 kHz, properly anti-aliased), matched to key profiles with correlation.
   * Confidence = margin to the runner-up key x agreement between the three thirds of the track.
   * (The old version used ~0.5 s of audio in total and changed its answer when shifted by 0.5 s.)
   */
  private static detectMusicalKey(
    channelData: Float32Array,
    sampleRate: number
  ): { musicalKey: string; camelotKey: string; keyConfidence: number } {
    const noteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const minorCamelot: Record<string, string> = {
      'G#m': '1A', Abm: '1A', Ebm: '2A', Bbm: '3A', Fm: '4A', Cm: '5A', Gm: '6A',
      Dm: '7A', Am: '8A', Em: '9A', Bm: '10A', 'F#m': '11A', 'C#m': '12A',
    };
    const majorCamelot: Record<string, string> = {
      B: '1B', 'F#': '2B', Db: '3B', 'C#': '3B', Ab: '4B', Eb: '5B', Bb: '6B',
      F: '7B', C: '8B', G: '9B', D: '10B', A: '11B', E: '12B',
    };
    const fallback = { musicalKey: 'Am', camelotKey: '8A', keyConfidence: 0 };

    // Anti-aliased decimation to ~11 kHz (2x cascaded 1-pole @ 4 kHz + 4-sample average)
    const dec = Math.max(1, Math.round(sampleRate / 11025));
    const sr = sampleRate / dec;
    const len = Math.floor(channelData.length / dec);
    if (len < sr * 10) return fallback;
    const x = new Float32Array(len);
    const a = Math.exp((-2 * Math.PI * 4000) / sampleRate);
    let l1 = 0;
    let l2 = 0;
    for (let i = 0, o = 0; o < len; o++) {
      let acc = 0;
      for (let j = 0; j < dec; j++, i++) {
        l1 = a * l1 + (1 - a) * channelData[i];
        l2 = a * l2 + (1 - a) * l1;
        acc += l2;
      }
      x[o] = acc / dec;
    }

    const FFT = 8192;
    const hann = new Float64Array(FFT);
    for (let i = 0; i < FFT; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1));
    const binHz = sr / FFT;
    const kMin = Math.ceil(63 / binHz);
    const kMax = Math.floor(2100 / binHz);
    const binPitch = new Int8Array(kMax + 1);
    const binWeight = new Float64Array(kMax + 1);
    for (let k = kMin; k <= kMax; k++) {
      const midi = 69 + 12 * Math.log2((k * binHz) / 440);
      const nearest = Math.round(midi);
      binPitch[k] = ((nearest % 12) + 12) % 12;
      // only bins close to a semitone centre count (rejects inharmonic noise between notes)
      binWeight[k] = Math.max(0, 1 - Math.abs(midi - nearest) * 2.5);
    }

    const start = Math.floor(len * 0.08);
    const end = Math.floor(len * 0.95) - FFT;
    const hop = Math.max(FFT, Math.floor(sr * 1.0));
    const thirds = [new Float64Array(12), new Float64Array(12), new Float64Array(12)];
    const total = new Float64Array(12);
    const re = new Float64Array(FFT);
    const im = new Float64Array(FFT);
    const mag = new Float64Array(kMax + 2);

    for (let pos = start; pos < end; pos += hop) {
      for (let i = 0; i < FFT; i++) {
        re[i] = x[pos + i] * hann[i];
        im[i] = 0;
      }
      this.fft(re, im);
      let frameEnergy = 0;
      for (let k = kMin - 1; k <= kMax + 1; k++) {
        mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        frameEnergy += mag[k];
      }
      if (frameEnergy < 1e-6) continue;
      const frameChroma = new Float64Array(12);
      for (let k = kMin; k <= kMax; k++) {
        // spectral peaks only
        if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) {
          frameChroma[binPitch[k]] += Math.sqrt(mag[k]) * binWeight[k];
        }
      }
      // per-frame normalization so loud sections do not dominate
      let fmax = 0;
      for (let p = 0; p < 12; p++) if (frameChroma[p] > fmax) fmax = frameChroma[p];
      if (fmax <= 0) continue;
      const third = Math.min(2, Math.floor(((pos - start) / Math.max(1, end - start)) * 3));
      for (let p = 0; p < 12; p++) {
        const v = frameChroma[p] / fmax;
        thirds[third][p] += v;
        total[p] += v;
      }
    }

    // Temperley (Kostka-Payne corpus) key profiles - sharper than Krumhansl-Kessler on non-classical music
    const majorProfile = [0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4];
    const minorProfile = [0.712, 0.084, 0.474, 0.618, 0.049, 0.46, 0.105, 0.747, 0.404, 0.067, 0.133, 0.33];

    const pearson = (c: Float64Array, prof: number[], root: number) => {
      let mc = 0;
      let mp = 0;
      for (let i = 0; i < 12; i++) {
        mc += c[(root + i) % 12];
        mp += prof[i];
      }
      mc /= 12;
      mp /= 12;
      let num = 0;
      let dc = 0;
      let dp = 0;
      for (let i = 0; i < 12; i++) {
        const u = c[(root + i) % 12] - mc;
        const v = prof[i] - mp;
        num += u * v;
        dc += u * u;
        dp += v * v;
      }
      return dc > 0 && dp > 0 ? num / Math.sqrt(dc * dp) : 0;
    };

    const rank = (c: Float64Array) => {
      const scores: { idx: number; score: number }[] = [];
      for (let root = 0; root < 12; root++) {
        scores.push({ idx: root, score: pearson(c, minorProfile, root) * 1.02 }); // minor bias for techno
        scores.push({ idx: 12 + root, score: pearson(c, majorProfile, root) });
      }
      scores.sort((p, q) => q.score - p.score);
      return scores;
    };

    const ranked = rank(total);
    const best = ranked[0];
    const second = ranked[1];
    const root = best.idx % 12;
    const isMinor = best.idx < 12;

    let musicalKey: string;
    let camelotKey: string;
    if (isMinor) {
      const name = noteNames[root] === 'Ab' ? 'G#m' : `${noteNames[root]}m`;
      musicalKey = name;
      camelotKey = minorCamelot[name] || '8A';
    } else {
      const name = noteNames[root] === 'C#' ? 'Db' : noteNames[root];
      musicalKey = name;
      camelotKey = majorCamelot[name] || '8B';
    }

    // Confidence: margin to the runner-up (relative/parallel keys excluded) + agreement of thirds
    const relativeIdx = isMinor ? 12 + ((root + 3) % 12) : (root + 9) % 12;
    const runnerUp = ranked.find(r => r.idx !== best.idx && r.idx !== relativeIdx) || second;
    const margin = Math.max(0, best.score - runnerUp.score);
    let agree = 0;
    for (const t of thirds) {
      const r = rank(t)[0].idx;
      if (r === best.idx || r === relativeIdx) agree++;
    }
    const keyConfidence = Math.max(
      0,
      Math.min(1, 0.5 * Math.min(1, margin / 0.12) + 0.5 * (agree / 3)) * Math.min(1, Math.max(0, best.score) / 0.5)
    );

    return { musicalKey, camelotKey, keyConfidence };
  }
}
