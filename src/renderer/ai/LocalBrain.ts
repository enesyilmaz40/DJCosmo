import { Track, DJPersonality, QuickCommand, AIDecision, TransitionType } from '../types';

/** Below this the analysed key is treated as unknown (not used for harmonic matching) */
const MIN_KEY_CONFIDENCE = 0.35;
/** Below this the beat grid is too unreliable for a long beat-matched overlap */
const MIN_GRID_CONFIDENCE = 0.6;

export interface RankedCandidate {
  track: Track;
  score: number; // lower is better
  bpmDiffPct: number;
  keyDistance: number | null; // Camelot steps after pitch shift (null = unknown key)
  effectiveCamelot?: string; // incoming key while it is pitched to the master tempo
}

const normKey = (t: Track) => `${(t.title || '').trim().toLowerCase()}__${(t.artist || '').trim().toLowerCase()}`;

export class LocalBrain {
  /** Camelot code shifted by a number of semitones (+1 semitone = +7 steps on the wheel) */
  public static shiftCamelot(code: string, semitones: number): string {
    const m = code.match(/^(\d+)([AB])$/);
    if (!m || semitones === 0) return code;
    const n = parseInt(m[1], 10);
    const shifted = ((((n - 1 + semitones * 7) % 12) + 12) % 12) + 1;
    return `${shifted}${m[2]}`;
  }

  /** Harmonic distance on the Camelot wheel: 0 perfect, 1 neighbour/relative, 2 energy boost, >2 clash */
  public static camelotDistance(c1: string, c2: string): number {
    const m1 = c1.match(/^(\d+)([AB])$/);
    const m2 = c2.match(/^(\d+)([AB])$/);
    if (!m1 || !m2) return 0;
    const raw = Math.abs(parseInt(m1[1], 10) - parseInt(m2[1], 10));
    const wheel = Math.min(raw, 12 - raw);
    if (m1[2] === m2[2]) return wheel;
    return wheel === 0 ? 1 : wheel + 1.5; // relative major/minor is fine, diagonal moves are not
  }

  private static usableKey(t: Track | null | undefined): string | undefined {
    const a = t?.analysis;
    if (!a?.camelotKey) return undefined;
    if (a.keyConfidence !== undefined && a.keyConfidence < MIN_KEY_CONFIDENCE) return undefined;
    return a.camelotKey;
  }

  /**
   * Scores every candidate against the playing track. The incoming track will be pitched to the
   * current tempo during the mix (no key-lock), so its key is compared AFTER that pitch shift.
   */
  public static rankCandidates(params: {
    candidates: Track[];
    currentTrack: Track | null;
    masterBpm?: number;
    targetEnergy: number;
  }): RankedCandidate[] {
    const { candidates, currentTrack, targetEnergy } = params;
    const currentBpm = params.masterBpm || currentTrack?.analysis?.bpm || 140;
    const currentKey = this.usableKey(currentTrack);

    const ranked = candidates.map(track => {
      const trackBpm = track.analysis?.bpm || 140;
      const rate = currentBpm / trackBpm;
      const bpmDiffPct = Math.abs(rate - 1) * 100;
      const semitoneShift = Math.round(12 * Math.log2(rate));
      const ownKey = this.usableKey(track);
      const effectiveCamelot = ownKey ? this.shiftCamelot(ownKey, semitoneShift) : undefined;

      let keyDistance: number | null = null;
      let harmonicPenalty = 1.5; // unknown key: neutral-ish, worse than a verified match
      if (currentKey && effectiveCamelot) {
        keyDistance = this.camelotDistance(currentKey, effectiveCamelot);
        harmonicPenalty = keyDistance === 0 ? 0 : keyDistance <= 1 ? 0.6 : keyDistance <= 2 ? 2.2 : 4 + keyDistance * 1.5;
      }

      // Tempo: up to ~3% is inaudible, beyond that pitch/feel changes quickly
      const bpmPenalty = bpmDiffPct <= 3 ? bpmDiffPct * 0.5 : 1.5 + (bpmDiffPct - 3) * 2.5;
      const energyPenalty = Math.abs((track.analysis?.rmsEnergy || 0.7) - targetEnergy) * 8;
      const gridPenalty = (track.analysis?.beatGridConfidence ?? 1) < MIN_GRID_CONFIDENCE ? 1.0 : 0;

      const score = bpmPenalty * 1.5 + harmonicPenalty * 2.0 + energyPenalty + gridPenalty;
      return { track, score, bpmDiffPct, keyDistance, effectiveCamelot };
    });

    ranked.sort((a, b) => a.score - b.score);
    return ranked;
  }

  /** Removes the current/other loaded track, duplicates (same song in another folder) and recent plays */
  public static filterCandidates(params: {
    library: Track[];
    currentTrack: Track | null;
    otherLoadedTrack?: Track | null;
    recentHistory: string[];
  }): Track[] {
    const { library, currentTrack, otherLoadedTrack, recentHistory } = params;
    const excludedIds = new Set<string>();
    const excludedKeys = new Set<string>();
    [currentTrack, otherLoadedTrack].forEach(t => {
      if (t) {
        excludedIds.add(t.id);
        excludedKeys.add(normKey(t));
      }
    });

    let candidates =
      library.length > 1 ? library.filter(t => !excludedIds.has(t.id) && !excludedKeys.has(normKey(t))) : [...library];
    if (candidates.length === 0) candidates = library.filter(t => !currentTrack || t.id !== currentTrack.id);
    if (candidates.length === 0) candidates = [...library];

    if (candidates.length > 2) {
      const recentKeys = new Set(
        recentHistory.map(id => library.find(t => t.id === id)).filter((t): t is Track => !!t).map(normKey)
      );
      const fresh = candidates.filter(t => !recentHistory.includes(t.id) && !recentKeys.has(normKey(t)));
      if (fresh.length > 0) candidates = fresh;
    }
    return candidates;
  }

  public static personalityProfile(
    personality: DJPersonality,
    quickCommand: QuickCommand,
    currentEnergy: number
  ): { targetEnergy: number; transition: TransitionType; bars: number } {
    let targetEnergy = 0.75;
    let transition: TransitionType = 'bass_swap';
    let bars = 16;

    switch (personality) {
      case 'UNDERGROUND':
        targetEnergy = Math.max(0.5, currentEnergy - 0.05);
        transition = 'bass_swap';
        bars = 32;
        break;
      case 'RAVE_MADNESS':
        targetEnergy = Math.min(1.0, currentEnergy + 0.1);
        transition = 'bass_swap';
        bars = 16;
        break;
      case 'ACID_EXPERIENCE':
        targetEnergy = currentEnergy;
        transition = 'filter_transition';
        bars = 16;
        break;
      case 'PEAK_TIME':
        targetEnergy = 0.95;
        transition = 'bass_swap';
        bars = 16;
        break;
    }

    if (quickCommand === 'GO_HARDER') {
      targetEnergy = Math.min(1.0, targetEnergy + 0.2);
      transition = 'bass_swap';
      bars = 16;
    } else if (quickCommand === 'KEEP_THE_GROOVE') {
      targetEnergy = currentEnergy;
      transition = 'smooth_crossfade';
      bars = 32;
    } else if (quickCommand === 'BUILD_TENSION') {
      transition = 'filter_transition';
      bars = 16;
    }
    return { targetEnergy, transition, bars };
  }

  /**
   * Picks a transition that the two tracks can actually carry: a long beat-matched overlap needs a
   * reliable beat grid on both decks and compatible keys; otherwise a short echo-out is cleaner.
   */
  public static adaptTransition(
    preferred: TransitionType,
    bars: number,
    currentTrack: Track | null,
    nextTrack: Track,
    keyDistance: number | null,
    bpmDiffPct: number
  ): { transition: TransitionType; bars: number; note?: string } {
    const gridOk = (t: Track | null) => !t || (t.analysis?.beatGridConfidence ?? 1) >= MIN_GRID_CONFIDENCE;
    if (!gridOk(currentTrack) || !gridOk(nextTrack)) {
      return { transition: 'echo_out', bars: 8, note: 'beat grid uncertain -> short echo out' };
    }
    if (bpmDiffPct > 6) {
      return { transition: 'echo_out', bars: 8, note: 'tempo gap too large -> echo out' };
    }
    if (keyDistance !== null && keyDistance > 2) {
      // keys clash: keep the overlap short so melodies barely meet
      return { transition: preferred === 'smooth_crossfade' ? 'bass_swap' : preferred, bars: 8, note: 'key clash -> short 8-bar mix' };
    }
    return { transition: preferred, bars };
  }

  /**
   * Deterministic rule-based Techno DJ selector
   * Used when offline, API key not set, or Gemini quota exceeded.
   */
  public static decideNextTrack(params: {
    library: Track[];
    currentTrack: Track | null;
    otherLoadedTrack?: Track | null;
    recentHistory: string[];
    personality: DJPersonality;
    quickCommand: QuickCommand;
    masterBpm?: number;
  }): AIDecision {
    const { library, currentTrack, otherLoadedTrack, recentHistory, personality, quickCommand } = params;

    if (library.length === 0) {
      throw new Error('Music library is empty.');
    }

    const candidates = this.filterCandidates({ library, currentTrack, otherLoadedTrack, recentHistory });
    const currentEnergy = currentTrack?.analysis?.rmsEnergy || 0.7;
    const profile = this.personalityProfile(personality, quickCommand, currentEnergy);

    const ranked = this.rankCandidates({
      candidates,
      currentTrack,
      masterBpm: params.masterBpm,
      targetEnergy: profile.targetEnergy,
    });
    const best = ranked[0];
    const chosen = best.track;
    const adapted = this.adaptTransition(
      profile.transition,
      profile.bars,
      currentTrack,
      chosen,
      best.keyDistance,
      best.bpmDiffPct
    );

    const keyInfo = chosen.analysis?.camelotKey
      ? ` [${chosen.analysis.musicalKey} / ${chosen.analysis.camelotKey}${
          best.effectiveCamelot && best.effectiveCamelot !== chosen.analysis.camelotKey ? ` -> ${best.effectiveCamelot} pitched` : ''
        }]`
      : '';
    let reason = `Rule-based ${personality}: ${chosen.analysis?.bpm || 140} BPM${keyInfo}, tempo diff ${best.bpmDiffPct.toFixed(1)}%`;
    reason += best.keyDistance === null ? ', key unknown' : `, key distance ${best.keyDistance}`;
    if (adapted.note) reason += ` (${adapted.note})`;
    if (quickCommand) reason += ` Quick command '${quickCommand}' applied.`;

    return {
      nextTrackId: chosen.id,
      transitionType: adapted.transition,
      transitionBars: adapted.bars,
      energyTarget: Math.round(profile.targetEnergy * 100) / 100,
      reason,
      source: 'local_fallback',
      timestamp: Date.now(),
    };
  }
}
