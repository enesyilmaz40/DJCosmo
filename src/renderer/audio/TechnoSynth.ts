import { Track } from '../types';

/**
 * Procedural Techno Track Generator
 * Renders high-octane Acid & Hard Techno audio loops into AudioBuffers
 * for instant testing and standalone performance without external files.
 */
export class TechnoSynth {
  /**
   * Generates a 60-second or 90-second techno track into an AudioBuffer
   */
  public static generateTechnoTrack(
    ctx: AudioContext,
    options: {
      id: string;
      title: string;
      artist: string;
      bpm: number;
      durationSec: number;
      style: 'acid' | 'hard' | 'industrial' | 'peak';
    }
  ): { track: Track; buffer: AudioBuffer } {
    const { id, title, artist, bpm, durationSec, style } = options;
    const sampleRate = ctx.sampleRate;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const secondsPerBeat = 60 / bpm;
    const samplesPerBeat = Math.floor(sampleRate * secondsPerBeat);
    const totalBeats = Math.floor(durationSec / secondsPerBeat);

    // Acid 303 note frequencies (pentatonic minor scale)
    const acidFrequencies = [
      65.41, 73.42, 77.78, 87.31, 98.0, 110.0, 130.81, 146.83, 155.56, 174.61
    ];

    for (let beat = 0; beat < totalBeats; beat++) {
      const beatStartSample = beat * samplesPerBeat;
      const bar = Math.floor(beat / 4);
      const beatInBar = beat % 4;

      // Structure: Intro (bars 0-4), Groove (bars 4-12), Breakdown (bars 12-16), Drop & Peak (bars 16+)
      const isBreakdown = bar >= 12 && bar < 16;
      const isIntro = bar < 4;

      // 1. Kick Drum (Every beat: 4-on-the-floor, muted during breakdown)
      if (!isBreakdown) {
        const kickDurationSamples = Math.floor(sampleRate * 0.28);
        for (let i = 0; i < kickDurationSamples; i++) {
          const sampleIndex = beatStartSample + i;
          if (sampleIndex >= totalSamples) break;
          const t = i / sampleRate;
          
          // Pitch envelope: drops from 150Hz to 45Hz
          const pitch = 45 + 110 * Math.exp(-t * 28);
          // Amplitude envelope
          const amp = Math.exp(-t * 12);
          // Hard clipping / distortion for techno punch
          let kickSample = Math.sin(2 * Math.PI * pitch * t) * amp;
          if (style === 'hard' || style === 'industrial') {
            kickSample = Math.tanh(kickSample * 2.2); // Saturation
          }
          left[sampleIndex] += kickSample * 0.7;
          right[sampleIndex] += kickSample * 0.7;
        }
      }

      // 2. Closed Hi-Hat (Offbeat: on the 16th notes or 8th notes)
      const offbeatSample = beatStartSample + Math.floor(samplesPerBeat * 0.5);
      const hatDuration = Math.floor(sampleRate * 0.05);
      for (let i = 0; i < hatDuration; i++) {
        const sampleIndex = offbeatSample + i;
        if (sampleIndex >= totalSamples) break;
        const t = i / sampleRate;
        const amp = Math.exp(-t * 60) * 0.25;
        // High frequency noise
        const noise = (Math.random() * 2 - 1) * amp;
        left[sampleIndex] += noise;
        right[sampleIndex] += noise;
      }

      // 3. Acid 303 Line / Techno Bass Synth (16th notes)
      const sixteenths = 4;
      for (let s = 0; s < sixteenths; s++) {
        const noteSampleStart = beatStartSample + Math.floor((samplesPerBeat / sixteenths) * s);
        const noteDuration = Math.floor(samplesPerBeat / sixteenths * 0.85);

        // Pick 303 note
        const noteIdx = (beat * 3 + s * 2 + bar) % acidFrequencies.length;
        const baseFreq = acidFrequencies[noteIdx];
        
        // Dynamic cutoff filter modulation
        const filterCutoff = 300 + 1200 * (0.5 + 0.5 * Math.sin(beat * 0.3 + s * 0.8));
        const accent = (s === 0 || s === 2) ? 1.4 : 0.9;

        for (let i = 0; i < noteDuration; i++) {
          const sampleIndex = noteSampleStart + i;
          if (sampleIndex >= totalSamples) break;
          const t = i / sampleRate;
          const amp = Math.exp(-t * 14) * 0.32 * accent;

          // Sawtooth oscillator with resonant filter approximation
          const saw = (2 * ((t * baseFreq) % 1) - 1);
          // Low-pass filter approximation
          const filtered = Math.tanh(saw * (filterCutoff / 400));

          // Stereo spread
          left[sampleIndex] += filtered * amp * 0.85;
          right[sampleIndex] += filtered * amp * 1.0;
        }
      }

      // 4. Claps / Snares (Beats 2 and 4, except in intro)
      if (!isIntro && (beatInBar === 1 || beatInBar === 3)) {
        const clapDuration = Math.floor(sampleRate * 0.12);
        for (let i = 0; i < clapDuration; i++) {
          const sampleIndex = beatStartSample + i;
          if (sampleIndex >= totalSamples) break;
          const t = i / sampleRate;
          const amp = Math.exp(-t * 22) * 0.28;
          const clapSample = (Math.random() * 2 - 1) * amp;
          left[sampleIndex] += clapSample;
          right[sampleIndex] += clapSample * 0.9;
        }
      }
    }

    // Normalize buffers to prevent overall master clipping
    let maxPeak = 0;
    for (let i = 0; i < totalSamples; i++) {
      const l = Math.abs(left[i]);
      const r = Math.abs(right[i]);
      if (l > maxPeak) maxPeak = l;
      if (r > maxPeak) maxPeak = r;
    }
    if (maxPeak > 0.95) {
      const factor = 0.95 / maxPeak;
      for (let i = 0; i < totalSamples; i++) {
        left[i] *= factor;
        right[i] *= factor;
      }
    }

    const track: Track = {
      id,
      filePath: `synth://${id}`,
      fileName: `${title}.wav`,
      title,
      artist,
      duration: durationSec,
      format: 'synth',
      folderName: 'Demo Pack (Acid / Hard)',
      folderPath: 'synth://demo',
      analysis: {
        bpm,
        firstDownbeat: 0.0,
        rmsEnergy: style === 'hard' || style === 'peak' ? 0.88 : 0.74,
        peakLevel: 0.95,
        energyProfile: [],
        cues: {
          introStart: 0,
          introEnd: secondsPerBeat * 16,
          breakdown: secondsPerBeat * 48,
          drop: secondsPerBeat * 64,
          outroStart: durationSec - secondsPerBeat * 16,
          mixInPoint: 0,
          mixOutPoint: durationSec - secondsPerBeat * 32,
        },
        isConfident: true,
        analyzedAt: new Date().toISOString(),
      },
    };

    return { track, buffer };
  }

  /**
   * Generates a default pack of 4 techno tracks with different BPMs & styles
   */
  public static generateDemoPack(ctx: AudioContext): { tracks: Track[]; buffers: Map<string, AudioBuffer> } {
    const list = [
      {
        id: 'synth_01',
        title: 'Acid Resonance 303',
        artist: 'DJAI Lab',
        bpm: 140,
        durationSec: 60,
        style: 'acid' as const,
      },
      {
        id: 'synth_02',
        title: 'Industrial Core Matrix',
        artist: 'Sub-Zero',
        bpm: 142,
        durationSec: 65,
        style: 'industrial' as const,
      },
      {
        id: 'synth_03',
        title: 'Rave Pulse Protocol',
        artist: 'Neon Vektor',
        bpm: 144,
        durationSec: 60,
        style: 'hard' as const,
      },
      {
        id: 'synth_04',
        title: 'Peak Pressure Overdrive',
        artist: 'Dark Matter',
        bpm: 146,
        durationSec: 70,
        style: 'peak' as const,
      },
    ];

    const tracks: Track[] = [];
    const buffers = new Map<string, AudioBuffer>();

    for (const item of list) {
      const { track, buffer } = this.generateTechnoTrack(ctx, item);
      tracks.push(track);
      buffers.set(track.id, buffer);
    }

    return { tracks, buffers };
  }
}

