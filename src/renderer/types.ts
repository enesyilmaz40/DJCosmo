// DJAI Core Types

export type DJPersonality = 'UNDERGROUND' | 'RAVE_MADNESS' | 'ACID_EXPERIENCE' | 'PEAK_TIME';

export type QuickCommand = 'GO_HARDER' | 'KEEP_THE_GROOVE' | 'BUILD_TENSION' | null;

export type TransitionType = 
  | 'smooth_crossfade'
  | '16_bar'
  | '32_bar'
  | 'bass_swap'
  | 'filter_transition'
  | 'echo_out';

export interface CuePoints {
  introStart?: number;
  introEnd?: number;
  breakdown?: number;
  drop?: number;
  outroStart?: number;
  mixInPoint?: number;
  mixOutPoint?: number;
}

export interface TrackAnalysis {
  bpm: number;
  firstDownbeat: number; // in seconds
  rmsEnergy: number; // 0.0 - 1.0
  peakLevel: number; // 0.0 - 1.0
  energyProfile: number[]; // normalized energy chunks for waveform display
  cues: CuePoints;
  isConfident: boolean;
  analyzedAt: string;
  analysisVersion?: number;
  musicalKey?: string; // e.g. "Fm", "Am", "Cm"
  camelotKey?: string; // e.g. "4A", "8A", "5A"
  keyConfidence?: number; // 0.0 - 1.0 (low = key is unreliable, ignored for harmonic mixing)
  beatGridConfidence?: number; // 0.0 - 1.0 (share of the track where kicks sit on the detected grid)
  phraseOffsetBars?: number; // 0..7: bars counted from firstDownbeat where (bar - offset) % 8 === 0 start an 8-bar phrase
}

export interface Track {
  id: string;
  filePath: string;
  fileName: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  fileSize?: number;
  format: 'mp3' | 'wav' | 'flac' | 'ogg' | 'synth';
  folderName?: string;
  folderPath?: string;
  mtimeMs?: number; // File date modified timestamp
  analysis?: TrackAnalysis;
  isCustomEdited?: boolean;
}

export interface DeckState {
  id: 'A' | 'B';
  loadedTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0.0 to 1.0
  gain: number; // 0.0 to 2.0 (trim)
  tempoPercent: number; // -10.0 to +10.0%
  playbackRate: number; // e.g. 1.0
  lowEq: number; // -24dB to +6dB (default 0)
  midEq: number; // -24dB to +6dB (default 0)
  highEq: number; // -24dB to +6dB (default 0)
  filter: number; // -1.0 (LPF 200Hz) to 0 (neutral/bypass) to +1.0 (HPF 2000Hz)
  isSynced: boolean;
  isCueActive: boolean;
  loopActive: boolean;
  loopBars: number; // 1, 2, 4, 8, 16
}

export interface AIDecision {
  nextTrackId: string;
  transitionType: TransitionType;
  transitionBars: number;
  energyTarget: number;
  reason: string;
  source: 'gemini' | 'local_fallback';
  timestamp: number;
}

export interface TransitionState {
  isActive: boolean;
  type: TransitionType;
  fromDeck: 'A' | 'B';
  toDeck: 'A' | 'B';
  durationSeconds: number;
  startTime: number;
  progress: number; // 0.0 to 1.0
  bars: number;
}

export interface DJSettings {
  geminiApiKey: string;
  masterVolume: number;
  selectedPersonality: DJPersonality;
  autoDjEnabled: boolean;
  bpmSyncRange: number; // max bpm adjustment allowed, default 8%
  preventSystemSleep: boolean;
  removedPaths?: string[]; // files the user removed from the library (never re-imported by folder sync)
}

