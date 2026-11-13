import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Track,
  DeckState,
  DJPersonality,
  QuickCommand,
  TransitionType,
  TransitionState,
  AIDecision,
  DJSettings,
} from './types';
import { AudioEngine } from './audio/AudioEngine';
import { AutoMixer } from './audio/AutoMixer';
import { TechnoSynth } from './audio/TechnoSynth';
import { AudioAnalyzer, ANALYSIS_VERSION } from './analysis/AudioAnalyzer';
import { GeminiBrain } from './ai/GeminiBrain';
import { LocalBrain } from './ai/LocalBrain';

import { Header } from './components/Header';
import { Deck } from './components/Deck';
import { Mixer } from './components/Mixer';
import { Library, getTrackFolderName } from './components/Library';
import { SettingsModal } from './components/SettingsModal';
import { TrackEditModal } from './components/TrackEditModal';

export const App: React.FC = () => {
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const autoMixerRef = useRef<AutoMixer | null>(null);

  // Library & Settings state
  const [library, setLibrary] = useState<Track[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [recentHistory, setRecentHistory] = useState<string[]>([]);
  const [settings, setSettings] = useState<DJSettings>({
    geminiApiKey: '',
    masterVolume: 1.0,
    selectedPersonality: 'UNDERGROUND',
    autoDjEnabled: false,
    bpmSyncRange: 8,
    preventSystemSleep: true,
  });

  // UI Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Analysis status
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{
    current: number;
    total: number;
    trackTitle: string;
  } | null>(null);

  // AI & DJ State
  const [personality, setPersonality] = useState<DJPersonality>('UNDERGROUND');
  const [activeQuickCommand, setActiveQuickCommand] = useState<QuickCommand>(null);
  const [lastDecision, setLastDecision] = useState<AIDecision | null>(null);
  const [autoDjActive, setAutoDjActive] = useState<boolean>(false);
  const [activeDeckId, setActiveDeckId] = useState<'A' | 'B'>('A');

  // Mixer State
  const [crossfader, setCrossfader] = useState<number>(0.0);
  const [masterVolume, setMasterVolume] = useState<number>(0.9);
  const [selectedTransitionType, setSelectedTransitionType] = useState<TransitionType>('bass_swap');
  const [mixPointStyle, setMixPointStyle] = useState<'full' | 'standard' | 'quick'>('full');
  const [currentTransition, setCurrentTransition] = useState<TransitionState | null>(null);
  const [masterPeak, setMasterPeak] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  // Deck States
  const [deckA, setDeckA] = useState<DeckState>({
    id: 'A',
    loadedTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    gain: 1.0,
    tempoPercent: 0,
    playbackRate: 1.0,
    lowEq: 0,
    midEq: 0,
    highEq: 0,
    filter: 0,
    isSynced: false,
    isCueActive: false,
    loopActive: false,
    loopBars: 4,
  });

  const [deckB, setDeckB] = useState<DeckState>({
    id: 'B',
    loadedTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    gain: 1.0,
    tempoPercent: 0,
    playbackRate: 1.0,
    lowEq: 0,
    midEq: 0,
    highEq: 0,
    filter: 0,
    isSynced: false,
    isCueActive: false,
    loopActive: false,
    loopBars: 4,
  });

  const isPreparingNextTrackRef = useRef(false);
  const pendingDecisionRef = useRef<{ trackId: string; transitionType: TransitionType; bars: number } | null>(null);

  // Refs for stable state access inside audio loops (prevents timer resets)
  const stateRef = useRef({
    deckA,
    deckB,
    autoDjActive,
    activeDeckId,
    library,
    selectedFolder,
    recentHistory,
    personality,
    activeQuickCommand,
    settings,
    selectedTransitionType,
    mixPointStyle,
  });

  // Keep stateRef synchronised on every render
  useEffect(() => {
    stateRef.current = {
      deckA,
      deckB,
      autoDjActive,
      activeDeckId,
      library,
      selectedFolder,
      recentHistory,
      personality,
      activeQuickCommand,
      settings,
      selectedTransitionType,
      mixPointStyle,
    };
  });

  // Initialize Audio Engine & Load initial data
  useEffect(() => {
    const engine = AudioEngine.getInstance();
    audioEngineRef.current = engine;

    const mixer = new AutoMixer(engine);
    autoMixerRef.current = mixer;

    mixer.setCallbacks(
      prog => {
        setCurrentTransition({ ...prog });
        const frame = AutoMixer.computeMixFrame(prog.progress, prog.type);
        const startX = prog.fromDeck === 'A' ? -1.0 : 1.0;
        const targetX = prog.toDeck === 'A' ? -1.0 : 1.0;
        const currentX = startX + (targetX - startX) * frame.blend;
        setCrossfader(Math.round(currentX * 100) / 100);

        // Live Real-DJ Visual EQ & Filter Choreography on UI Decks (mirrors continuous cosine curves)
        const fromSetter = prog.fromDeck === 'A' ? setDeckA : setDeckB;
        const toSetter = prog.toDeck === 'A' ? setDeckA : setDeckB;

        toSetter(prev => ({
          ...prev,
          lowEq: frame.toLow,
          midEq: frame.toMid,
          highEq: frame.toHigh,
          filter: frame.toFilter,
        }));
        fromSetter(prev => ({
          ...prev,
          lowEq: frame.fromLow,
          midEq: frame.fromMid,
          highEq: frame.fromHigh,
          filter: frame.fromFilter,
        }));
      },
      newActive => {
        setActiveDeckId(newActive);
        setCurrentTransition(null);
        setCrossfader(newActive === 'A' ? -1.0 : 1.0);

        // Reset visual EQ states for both decks (new deck glides back to its native tempo)
        setDeckA(prev => ({ ...prev, lowEq: 0, midEq: 0, highEq: 0, filter: 0, tempoPercent: 0, playbackRate: 1.0, isSynced: false }));
        setDeckB(prev => ({ ...prev, lowEq: 0, midEq: 0, highEq: 0, filter: 0, tempoPercent: 0, playbackRate: 1.0, isSynced: false }));

        // Auto DJ: Eject the outgoing track from the finished deck so Auto DJ immediately preloads the NEXT track!
        const finishedDeckId = newActive === 'A' ? 'B' : 'A';
        const finishedSetter = finishedDeckId === 'A' ? setDeckA : setDeckB;
        finishedSetter(prev => ({
          ...prev,
          loadedTrack: null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          lowEq: 0,
          midEq: 0,
          highEq: 0,
          filter: 0,
        }));
      }
    );

    const initApp = async () => {
      try {
        if (window.djaiAPI) {
          const loadedSettings = await window.djaiAPI.getSettings();
          if (loadedSettings && Object.keys(loadedSettings).length > 0) {
            setSettings(prev => ({ ...prev, ...loadedSettings }));
            if (loadedSettings.selectedPersonality) {
              setPersonality(loadedSettings.selectedPersonality);
            }
          }

          const savedLib = await window.djaiAPI.getLibrary();
          if (savedLib && savedLib.length > 0) {
            // Deduplicate by filePath and auto-enrich tracks
            const seenPaths = new Set<string>();
            const enriched: Track[] = [];

            for (const t of savedLib) {
              const key = t.filePath || t.id;
              if (seenPaths.has(key)) continue;
              seenPaths.add(key);

              let folderName = t.folderName;
              if (!folderName) {
                if (t.format === 'synth' || t.filePath.startsWith('synth://')) {
                  folderName = 'Demo Pack (Acid / Hard)';
                } else if (t.filePath) {
                  const parts = t.filePath.split(/[/\\]/);
                  folderName = parts.length > 1 ? parts[parts.length - 2] : 'music';
                } else {
                  folderName = 'music';
                }
              }
              let title = t.title;
              let artist = t.artist;
              if (t.title.includes(' - ') && (!t.artist || t.artist === 'Local Library')) {
                const parts = t.title.split(' - ');
                title = parts[0].trim();
                artist = parts.slice(1).join(' - ').trim();
              }
              enriched.push({ ...t, folderName, title, artist });
            }

            setLibrary(enriched);
            await window.djaiAPI.saveLibrary(enriched);

            // Register watchers for all existing folder paths
            enriched.forEach((t: Track) => {
              if (t.folderPath && !t.folderPath.startsWith('synth://')) {
                window.djaiAPI.watchFolder(t.folderPath);
              }
            });

            // Auto-upgrade any tracks with Estimated status, fractional BPMs, or missing v5 Key/Note analysis in music2
            const needsUpgrade = enriched.filter(
              t =>
                t.format !== 'synth' &&
                !t.isCustomEdited &&
                t.filePath &&
                t.analysis?.analysisVersion !== ANALYSIS_VERSION
            );

            if (needsUpgrade.length > 0) {
              setIsAnalyzing(true);
              const updatedMap = new Map<string, Track>();
              for (let i = 0; i < needsUpgrade.length; i++) {
                const trk = needsUpgrade[i];
                setAnalysisProgress({
                  current: i + 1,
                  total: needsUpgrade.length,
                  trackTitle: `${trk.title} (v${ANALYSIS_VERSION} grid + key)`,
                });
                try {
                  const bytes = await window.djaiAPI.readAudioFile(trk.filePath);
                  const buf = await engine.decodeAudio(trk.id, bytes);
                  const freshAnalysis = await AudioAnalyzer.analyzeAudioBuffer(buf);
                  updatedMap.set(trk.id, { ...trk, duration: buf.duration, analysis: freshAnalysis });
                } catch (e) {
                  console.warn('Startup auto-upgrade skipped for:', trk.title, e);
                }
              }
              if (updatedMap.size > 0) {
                const upgradedLib = enriched.map(t => updatedMap.get(t.id) || t);
                setLibrary(upgradedLib);
                await window.djaiAPI.saveLibrary(upgradedLib);
              }
              setIsAnalyzing(false);
              setAnalysisProgress(null);
            }
            return;
          }
        }

        // If library is empty, generate initial high-octane techno pack!
        const { tracks, buffers } = TechnoSynth.generateDemoPack(engine.ctx);
        buffers.forEach((buf, id) => engine.setCachedBuffer(id, buf));
        setLibrary(tracks);
        if (window.djaiAPI) {
          await window.djaiAPI.saveLibrary(tracks);
        }
      } catch (err) {
        console.warn('Initialization note:', err);
      }
    };

    initApp();
  }, []);

  // Listen for live filesystem changes in watched music folders (auto-sync when new files are dropped)
  useEffect(() => {
    if (!window.djaiAPI || !window.djaiAPI.onFolderUpdated) return;

    const cleanup = window.djaiAPI.onFolderUpdated(async data => {
      const { files } = data;
      const currentLibrary = stateRef.current.library;
      const existingPaths = new Set(currentLibrary.map(t => t.filePath));
      const removed = new Set(stateRef.current.settings.removedPaths || []);
      const newFiles = files.filter(f => !existingPaths.has(f) && !removed.has(f));

      if (newFiles.length > 0) {
        console.log('Detected new audio files in folder:', newFiles);
        await processAudioFiles(newFiles);
      }
    });

    return () => cleanup();
  }, []);

  // Real-time animation loop for time scrubbing and VU meters
  useEffect(() => {
    let animId: number;

    const loop = () => {
      const engine = audioEngineRef.current;
      if (engine) {
        // Update Deck A time & status
        const aPlaying = engine.deckA.isPlaying;
        const aTime = engine.deckA.currentTime;
        const aDur = engine.deckA.duration;

        setDeckA(prev => {
          if (prev.isPlaying !== aPlaying || Math.abs(prev.currentTime - aTime) > 0.05) {
            return { ...prev, isPlaying: aPlaying, currentTime: aTime, duration: aDur };
          }
          return prev;
        });

        // Update Deck B time & status
        const bPlaying = engine.deckB.isPlaying;
        const bTime = engine.deckB.currentTime;
        const bDur = engine.deckB.duration;

        setDeckB(prev => {
          if (prev.isPlaying !== bPlaying || Math.abs(prev.currentTime - bTime) > 0.05) {
            return { ...prev, isPlaying: bPlaying, currentTime: bTime, duration: bDur };
          }
          return prev;
        });

        // Update Master Meter
        if (aPlaying || bPlaying) {
          setMasterPeak(engine.getMasterPeakLevels());
        } else {
          setMasterPeak({ left: 0, right: 0 });
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Track loader helper
  const loadTrackToDeck = useCallback(
    async (deckId: 'A' | 'B', track: Track) => {
      const engine = audioEngineRef.current;
      if (!engine) return;

      try {
        await engine.resumeContext();
        let buffer = engine.getCachedBuffer(track.id);

        if (!buffer) {
          if (track.format === 'synth') {
            // Generate synthetic track buffer
            const generated = TechnoSynth.generateTechnoTrack(engine.ctx, {
              id: track.id,
              title: track.title,
              artist: track.artist,
              bpm: track.analysis?.bpm || 140,
              durationSec: track.duration,
              style: 'acid',
            });
            buffer = generated.buffer;
            engine.setCachedBuffer(track.id, buffer);
          } else if (window.djaiAPI && track.filePath) {
            // Read local audio file bytes via Electron IPC
            const bytes = await window.djaiAPI.readAudioFile(track.filePath);
            buffer = await engine.decodeAudio(track.id, bytes);
          }
        }

        if (buffer) {
          let activeTrack = track;
          // Auto-upgrade stale analysis on decoded buffer (guarantees exact v5 rhythm + harmonic key lock)
          if (track.format !== 'synth' && !track.isCustomEdited && track.analysis?.analysisVersion !== ANALYSIS_VERSION) {
            try {
              const freshAnalysis = await AudioAnalyzer.analyzeAudioBuffer(buffer);
              activeTrack = { ...track, duration: buffer.duration, analysis: freshAnalysis };
              setLibrary(prev => {
                const updated = prev.map(t => (t.id === track.id ? activeTrack : t));
                if (window.djaiAPI) window.djaiAPI.saveLibrary(updated);
                return updated;
              });
            } catch (err) {
              console.warn('Auto re-analysis skipped:', err);
            }
          }

          const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
          deckEngine.setAudioBuffer(buffer, 0);

          const setter = deckId === 'A' ? setDeckA : setDeckB;
          setter(prev => ({
            ...prev,
            loadedTrack: activeTrack,
            isPlaying: false,
            currentTime: 0,
            duration: buffer?.duration || activeTrack.duration,
            tempoPercent: 0,
            playbackRate: 1.0,
            lowEq: 0,
            midEq: 0,
            highEq: 0,
            filter: 0,
          }));

          setRecentHistory(prev => [activeTrack.id, ...prev.filter(id => id !== activeTrack.id)].slice(0, 20));
          const trkFolder = getTrackFolderName(activeTrack);
          if (trkFolder && !stateRef.current.selectedFolder) {
            setSelectedFolder(trkFolder);
          }
        }
      } catch (err: any) {
        setErrorMessage(`Failed to load track "${track.title}": ${err.message}`);
      }
    },
    []
  );

  // Helper to determine the candidate pool of tracks for Auto DJ (honors active crate / folder)
  const getCandidateLibrary = useCallback((state: typeof stateRef.current, currentTrack: Track | null): Track[] => {
    // 1. If user explicitly clicked a folder/crate (e.g. 'music2'), restrict selection exclusively to that crate
    if (state.selectedFolder) {
      const folderTracks = state.library.filter(t => getTrackFolderName(t) === state.selectedFolder);
      if (folderTracks.length > 0) {
        return folderTracks;
      }
    }

    // 2. If no folder is explicitly chosen, prefer staying within the folder of the currently playing track
    if (currentTrack) {
      const currentFolder = getTrackFolderName(currentTrack);
      const sameFolderTracks = state.library.filter(t => getTrackFolderName(t) === currentFolder);
      if (sameFolderTracks.length >= 2) {
        return sameFolderTracks;
      }
    }

    return state.library;
  }, []);

  // Instant Personality Change with live AI re-evaluation
  const handleSelectPersonality = async (p: DJPersonality) => {
    setPersonality(p);
    const state = stateRef.current;
    const currentDeck = state.activeDeckId === 'A' ? state.deckA : state.deckB;
    const otherDeck = state.activeDeckId === 'A' ? state.deckB : state.deckA;
    const candidateLibrary = getCandidateLibrary(state, currentDeck.loadedTrack);

    if (candidateLibrary.length > 0) {
      try {
        const decision = await GeminiBrain.decideNextTrack({
          apiKey: state.settings.geminiApiKey,
          library: candidateLibrary,
          currentTrack: currentDeck.loadedTrack,
          otherLoadedTrack: otherDeck.loadedTrack,
          recentHistory: state.recentHistory,
          personality: p,
          quickCommand: state.activeQuickCommand,
        });
        setLastDecision(decision);
        setSelectedTransitionType(decision.transitionType);
      } catch (e) {
        console.error('Personality evaluation error:', e);
      }
    }
  };

  // Instant Quick Command Handler with live AI evaluation
  const handleTriggerQuickCommand = async (cmd: QuickCommand) => {
    const newCmd = activeQuickCommand === cmd ? null : cmd;
    setActiveQuickCommand(newCmd);

    const state = stateRef.current;
    const currentDeck = state.activeDeckId === 'A' ? state.deckA : state.deckB;
    const otherDeck = state.activeDeckId === 'A' ? state.deckB : state.deckA;
    const candidateLibrary = getCandidateLibrary(state, currentDeck.loadedTrack);

    if (candidateLibrary.length > 0) {
      try {
        const decision = await GeminiBrain.decideNextTrack({
          apiKey: state.settings.geminiApiKey,
          library: candidateLibrary,
          currentTrack: currentDeck.loadedTrack,
          otherLoadedTrack: otherDeck.loadedTrack,
          recentHistory: state.recentHistory,
          personality: state.personality,
          quickCommand: newCmd,
        });

        setLastDecision(decision);
        setSelectedTransitionType(decision.transitionType);

        // Preload newly chosen track into idle deck if needed
        const idleDeckId = state.activeDeckId === 'A' ? 'B' : 'A';
        const nextTrack = state.library.find(t => t.id === decision.nextTrackId);
        if (nextTrack) {
          await loadTrackToDeck(idleDeckId, nextTrack);
        }
      } catch (err) {
        console.error('Quick command evaluation failed:', err);
      }
    }
  };

  // Deck Controls Handlers
  const handlePlayPause = async (deckId: 'A' | 'B') => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    await engine.resumeContext();

    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    if (deckEngine.isPlaying) {
      deckEngine.pause();
    } else {
      deckEngine.play();
      setActiveDeckId(deckId);
    }
  };

  const handleCue = (deckId: 'A' | 'B') => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.cue();
  };

  const handleSeek = (deckId: 'A' | 'B', pos: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.seek(pos);
  };

  const handleVolumeChange = (deckId: 'A' | 'B', vol: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.setVolume(vol);
    const setter = deckId === 'A' ? setDeckA : setDeckB;
    setter(prev => ({ ...prev, volume: vol }));
  };

  const handleTempoChange = (deckId: 'A' | 'B', percent: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const rate = 1.0 + percent / 100;
    deckEngine.setPlaybackRate(rate);
    const setter = deckId === 'A' ? setDeckA : setDeckB;
    setter(prev => ({ ...prev, tempoPercent: percent, playbackRate: rate, isSynced: false }));
  };

  const handleSync = (deckId: 'A' | 'B') => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    const sourceDeck = deckId === 'A' ? engine.deckB : engine.deckA;
    const targetDeck = deckId === 'A' ? engine.deckA : engine.deckB;
    const sourceTrack = deckId === 'A' ? deckB.loadedTrack : deckA.loadedTrack;
    const targetTrack = deckId === 'A' ? deckA.loadedTrack : deckB.loadedTrack;

    if (!sourceTrack || !targetTrack) return;

    const sourceEffectiveBpm = (sourceTrack.analysis?.bpm || 140) * sourceDeck.playbackRate;
    const targetBaseBpm = targetTrack.analysis?.bpm || 140;

    const neededRate = sourceEffectiveBpm / targetBaseBpm;
    const percent = (neededRate - 1.0) * 100;

    targetDeck.setPlaybackRate(neededRate);

    // If both decks are playing, lock beat phase on both analysed beat grids
    if (sourceDeck.isPlaying && targetDeck.isPlaying) {
      const srcBeat = 60 / (sourceTrack.analysis?.bpm || 140);
      const tgtBeat = 60 / targetBaseBpm;
      const frac = (x: number) => x - Math.floor(x);
      const srcPhase = frac((sourceDeck.currentTime - (sourceTrack.analysis?.firstDownbeat || 0)) / srcBeat);
      const tgtPhase = frac((targetDeck.currentTime - (targetTrack.analysis?.firstDownbeat || 0)) / tgtBeat);
      let diff = srcPhase - tgtPhase;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      if (Math.abs(diff * tgtBeat) > 0.003) {
        targetDeck.seek(Math.max(0, targetDeck.currentTime + diff * tgtBeat));
      }
    }

    const setter = deckId === 'A' ? setDeckA : setDeckB;
    setter(prev => ({ ...prev, tempoPercent: percent, playbackRate: neededRate, isSynced: true }));
  };

  const handleNudge = (deckId: 'A' | 'B', direction: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.nudge(direction * 25);
  };

  const handleLowEqChange = (deckId: 'A' | 'B', db: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.setLowEq(db);
    const setter = deckId === 'A' ? setDeckA : setDeckB;
    setter(prev => ({ ...prev, lowEq: db }));
  };

  const handleMidEqChange = (deckId: 'A' | 'B', db: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.setMidEq(db);
    const setter = deckId === 'A' ? setDeckA : setDeckB;
    setter(prev => ({ ...prev, midEq: db }));
  };

  const handleHighEqChange = (deckId: 'A' | 'B', db: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.setHighEq(db);
    const setter = deckId === 'A' ? setDeckA : setDeckB;
    setter(prev => ({ ...prev, highEq: db }));
  };

  const handleFilterChange = (deckId: 'A' | 'B', val: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.setFilter(val);
    const setter = deckId === 'A' ? setDeckA : setDeckB;
    setter(prev => ({ ...prev, filter: val }));
  };

  const handleCrossfaderChange = (val: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    engine.updateCrossfader(val);
    setCrossfader(val);
  };

  const handleMasterVolumeChange = (vol: number) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    engine.setMasterVolume(vol);
    setMasterVolume(vol);
  };

  // Trigger Transition (Manual or Automatic)
  const triggerTransition = useCallback(
    (type: TransitionType, customBars?: number, launchAtFromTrackTime?: number) => {
      const mixer = autoMixerRef.current;
      if (!mixer || mixer.isTransitioning) return;

      const state = stateRef.current;
      const fromDeckId = state.activeDeckId;
      const toDeckId = fromDeckId === 'A' ? 'B' : 'A';

      const fromDeck = fromDeckId === 'A' ? state.deckA : state.deckB;
      const toDeck = toDeckId === 'A' ? state.deckA : state.deckB;

      const fromTrack = fromDeck.loadedTrack;
      const toTrack = toDeck.loadedTrack;

      if (!fromTrack || !toTrack) {
        setErrorMessage('Both Deck A and Deck B must have a track loaded to mix.');
        return;
      }

      const fromEngineDeck = fromDeckId === 'A' ? audioEngineRef.current!.deckA : audioEngineRef.current!.deckB;
      const fromBpm = fromTrack.analysis?.bpm || 140;
      const masterBpm = fromBpm * fromEngineDeck.playbackRate;
      const toBpm = toTrack.analysis?.bpm || 140;
      const fromDuration = fromDeck.duration || 60;
      // Use smooth 16-bar (~24s) transitions by default so melodies and rhythms weave naturally without sudden cuts
      const defaultBars = type === '32_bar' ? 32 : 16;
      let bars = customBars || defaultBars;

      // Smart duration adaptation: if track is nearing end, adapt bars so outgoing deck doesn't run dry
      const fromCurrent = fromDeck.currentTime || 0;
      // remaining WALL-clock time of the outgoing track (track time / playback rate)
      const remainingSec = Math.max(0, fromDuration - fromCurrent) / (fromEngineDeck.playbackRate || 1);
      const secondsPerBar = (60 / masterBpm) * 4;

      if (remainingSec > 3 && bars * secondsPerBar > remainingSec - 1) {
        if (remainingSec >= 16 * secondsPerBar) bars = 16;
        else if (remainingSec >= 8 * secondsPerBar) bars = 8;
        else if (remainingSec >= 4 * secondsPerBar) bars = 4;
      }

      const toSetter = toDeckId === 'A' ? setDeckA : setDeckB;
      const neededRate = masterBpm / (toBpm || masterBpm);
      const percent = (neededRate - 1.0) * 100;
      toSetter(prev => ({ ...prev, tempoPercent: percent, playbackRate: neededRate, isSynced: true }));

      mixer.startTransition({
        type,
        fromDeckId,
        toDeckId,
        bars,
        fromTrackBpm: fromBpm,
        toTrackBpm: toBpm,
        fromFirstDownbeat: fromTrack.analysis?.firstDownbeat || 0,
        toFirstDownbeat: toTrack.analysis?.firstDownbeat || 0,
        fromCues: fromTrack.analysis?.cues,
        toCues: toTrack.analysis?.cues,
        launchAtFromTrackTime,
      });
    },
    []
  );

  // Live Master Recording Timer
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const handleToggleRecord = async () => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    if (!isRecording) {
      await engine.resumeContext();
      engine.startRecording();
      setIsRecording(true);
    } else {
      const blob = await engine.stopRecording();
      setIsRecording(false);
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `DJCOSMO_Live_Set_${timestamp}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);
      }
    }
  };

  // Pro DJ Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const state = stateRef.current;
      const activeDeck = state.activeDeckId;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause(activeDeck);
      } else if (e.code === 'KeyC') {
        handleCue(activeDeck);
      } else if (e.code === 'KeyS') {
        handleSync(activeDeck);
      } else if (e.code === 'Digit1') {
        setActiveDeckId('A');
      } else if (e.code === 'Digit2') {
        setActiveDeckId('B');
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleNudge(activeDeck, -1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNudge(activeDeck, 1);
      } else if (e.code === 'KeyM' || e.code === 'Enter') {
        triggerTransition(state.selectedTransitionType || 'bass_swap');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleCue, handleSync, handleNudge, triggerTransition]);

  // Rock-Solid Autonomous Auto DJ Engine Loop (reads stateRef, never starved by re-renders)
  useEffect(() => {
    if (!autoDjActive) return;

    const interval = setInterval(async () => {
      const mixer = autoMixerRef.current;
      if (!mixer || mixer.isTransitioning) return;

      const state = stateRef.current;
      const currentDeckState = state.activeDeckId === 'A' ? state.deckA : state.deckB;
      const otherDeckId = state.activeDeckId === 'A' ? 'B' : 'A';
      const otherDeckState = otherDeckId === 'A' ? state.deckA : state.deckB;

      const candidateLibrary = getCandidateLibrary(state, currentDeckState.loadedTrack);

      // Rule 0 (Bootstrap): If both decks are completely empty, kick off the set!
      if (
        !state.deckA.loadedTrack &&
        !state.deckB.loadedTrack &&
        candidateLibrary.length > 0 &&
        !isPreparingNextTrackRef.current
      ) {
        isPreparingNextTrackRef.current = true;
        try {
          const decision = await GeminiBrain.decideNextTrack({
            apiKey: state.settings.geminiApiKey,
            library: candidateLibrary,
            currentTrack: null,
            otherLoadedTrack: null,
            recentHistory: state.recentHistory,
            personality: state.personality,
            quickCommand: state.activeQuickCommand,
          });
          setLastDecision(decision);
          const firstTrack = state.library.find(t => t.id === decision.nextTrackId) || candidateLibrary[0];
          if (firstTrack) {
            await loadTrackToDeck('A', firstTrack);
            setTimeout(() => {
              handlePlayPause('A');
            }, 300);
          }
        } catch (e) {
          console.error('Auto DJ bootstrap error:', e);
        } finally {
          isPreparingNextTrackRef.current = false;
        }
        return;
      }

      // Rule 1: If nothing is playing on active deck, start playback (only if track hasn't finished).
      // Read the engine directly: React deck state is refreshed by requestAnimationFrame, which pauses
      // while the window is minimized - a stale "not playing" would toggle a playing deck to pause.
      const liveEngine = audioEngineRef.current;
      const liveActiveDeck = liveEngine ? (state.activeDeckId === 'A' ? liveEngine.deckA : liveEngine.deckB) : null;
      if (liveActiveDeck && !liveActiveDeck.isPlaying && currentDeckState.loadedTrack) {
        const duration = liveActiveDeck.duration || 60;
        const currentTime = liveActiveDeck.currentTime;
        if (currentTime < duration - 1.5) {
          handlePlayPause(state.activeDeckId);
          return;
        }
      }

      // If active track is playing or loaded
      if (currentDeckState.loadedTrack) {
        const duration = currentDeckState.duration || 60;
        const currentTime = currentDeckState.currentTime;

        const candidateLibrary = getCandidateLibrary(state, currentDeckState.loadedTrack);

        // Rule 2: Preload next track into idle deck in advance (if idle deck is empty)
        if (!otherDeckState.loadedTrack && !isPreparingNextTrackRef.current && candidateLibrary.length > 0) {
          isPreparingNextTrackRef.current = true;
          try {
            const decision = await GeminiBrain.decideNextTrack({
              apiKey: state.settings.geminiApiKey,
              library: candidateLibrary,
              currentTrack: currentDeckState.loadedTrack,
              otherLoadedTrack: otherDeckState.loadedTrack,
              recentHistory: state.recentHistory,
              personality: state.personality,
              quickCommand: state.activeQuickCommand,
              masterBpm: (currentDeckState.loadedTrack.analysis?.bpm || 140) * currentDeckState.playbackRate,
            });

            setLastDecision(decision);
            // The decision's transition is tailored to this track pair (grid/key/tempo aware);
            // it is shown in the Mixer and can still be overridden there before the mix starts.
            setSelectedTransitionType(decision.transitionType);
            pendingDecisionRef.current = {
              trackId: decision.nextTrackId,
              transitionType: decision.transitionType,
              bars: decision.transitionBars,
            };

            const nextTrack = state.library.find(t => t.id === decision.nextTrackId);
            if (nextTrack) {
              await loadTrackToDeck(otherDeckId, nextTrack);
            }
          } catch (e) {
            console.error('Auto DJ preparation error:', e);
          } finally {
            isPreparingNextTrackRef.current = false;
          }
        }

        // Rule 3: Phrase-locked mix-out scheduling.
        // All positions here are TRACK time of the outgoing track (its native bpm grid);
        // engine values are read directly so this keeps working while the window is in the background.
        const engine = audioEngineRef.current;
        const fromEngineDeck = engine ? (state.activeDeckId === 'A' ? engine.deckA : engine.deckB) : null;
        const liveTime = fromEngineDeck ? fromEngineDeck.currentTime : currentTime;
        const liveRemaining = Math.max(0, duration - liveTime);
        const analysis = currentDeckState.loadedTrack.analysis;
        const nextTrack = otherDeckState.loadedTrack;
        const pending = pendingDecisionRef.current;
        const decisionMatches = pending && nextTrack && pending.trackId === nextTrack.id;

        const transType: TransitionType = state.selectedTransitionType || 'bass_swap';
        const requestedBars =
          decisionMatches && pending.bars ? pending.bars : transType === '32_bar' ? 32 : transType === 'echo_out' ? 8 : 16;
        const nativeBar = 240 / (analysis?.bpm || 140); // track seconds per bar
        const firstDownbeat = analysis?.firstDownbeat || 0;
        const phraseOffset = analysis?.phraseOffsetBars || 0;
        const cues = analysis?.cues;

        // Shrink the mix if the track is too short (outgoing audio must never run dry)
        let effectiveBars = requestedBars;
        while (effectiveBars > 4 && liveRemaining < effectiveBars * nativeBar + 4) effectiveBars /= 2;
        const requiredTrackSec = effectiveBars * nativeBar;
        const halfMixSec = (effectiveBars / 2) * nativeBar;

        // Where should the bass swap (the moment the new track takes over) land?
        let swapAnchor: number;
        if (state.mixPointStyle === 'quick') {
          swapAnchor =
            cues?.breakdown && cues.breakdown >= duration * 0.42 && cues.breakdown <= duration * 0.65
              ? cues.breakdown
              : duration * 0.55;
        } else if (state.mixPointStyle === 'standard') {
          swapAnchor =
            cues?.drop && cues.drop + 16 * nativeBar >= duration * 0.62 && cues.drop + 16 * nativeBar <= duration * 0.84
              ? cues.drop + 16 * nativeBar
              : duration * 0.78;
        } else {
          swapAnchor = cues?.outroStart && cues.outroStart >= duration * 0.72 ? cues.outroStart : duration * 0.9;
        }

        // Snap the swap onto an 8-bar phrase start of the outgoing track, and the mix start onto a bar
        const phraseLen = 8 * nativeBar;
        const phraseOrigin = firstDownbeat + phraseOffset * nativeBar;
        let swapAt = phraseOrigin + Math.round((swapAnchor - phraseOrigin) / phraseLen) * phraseLen;
        const latestSwap = duration - halfMixSec - 1;
        while (swapAt > latestSwap && swapAt - phraseLen > firstDownbeat + halfMixSec) swapAt -= phraseLen;
        let targetMixStart = swapAt - halfMixSec;
        targetMixStart = firstDownbeat + Math.round((targetMixStart - firstDownbeat) / nativeBar) * nativeBar;
        targetMixStart = Math.min(targetMixStart, duration - requiredTrackSec - 1);

        // Arm ~1.5 s ahead and hand the exact grid position to the mixer (it schedules on the audio clock)
        const lookahead = 1.5 * (fromEngineDeck?.playbackRate || 1);
        const emergency = liveRemaining <= requiredTrackSec + 1;
        const shouldTransition = (liveTime >= targetMixStart - lookahead || emergency) && liveTime > 15;

        if (shouldTransition && nextTrack && !mixer.isTransitioning) {
          const launchAt = !emergency && targetMixStart > liveTime ? targetMixStart : undefined;
          triggerTransition(transType, effectiveBars, launchAt);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [autoDjActive, triggerTransition, loadTrackToDeck]);

  // File import and analysis handlers
  const processAudioFiles = async (filePaths: string[]) => {
    if (!window.djaiAPI || filePaths.length === 0) return;
    const engine = audioEngineRef.current;
    if (!engine) return;

    setIsAnalyzing(true);
    const currentLibrary = stateRef.current.library;
    const existingPaths = new Set(currentLibrary.map(t => t.filePath));
    const newTracks: Track[] = [...currentLibrary];

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      if (existingPaths.has(filePath)) continue;
      existingPaths.add(filePath);

      try {
        const meta = await window.djaiAPI.getFileMeta(filePath);
        if (!meta) continue;

        setAnalysisProgress({
          current: i + 1,
          total: filePaths.length,
          trackTitle: meta.fileName,
        });

        // Read file bytes
        const bytes = await window.djaiAPI.readAudioFile(filePath);
        const buffer = await engine.decodeAudio(filePath, bytes);

        // Run real DSP analysis
        const analysis = await AudioAnalyzer.analyzeAudioBuffer(buffer);

        const rawName = meta.fileName.replace(/\.[^/.]+$/, '');
        let title = rawName;
        let artist = meta.folderName || 'Local Library';
        if (rawName.includes(' - ')) {
          const parts = rawName.split(' - ');
          title = parts[0].trim();
          artist = parts.slice(1).join(' - ').trim();
        }

        const track: Track = {
          id: `trk_${Date.now()}_${i}`,
          filePath,
          fileName: meta.fileName,
          title,
          artist,
          duration: buffer.duration,
          fileSize: meta.fileSize,
          format: meta.format as any,
          folderName: meta.folderName || 'music',
          folderPath: meta.folderPath || '',
          mtimeMs: meta.mtimeMs || Date.now(),
          analysis,
        };

        newTracks.push(track);
      } catch (err: any) {
        console.error('Error processing audio file:', filePath, err);
        setErrorMessage(`Unsupported or corrupted audio file: ${filePath}`);
      }
    }

    setLibrary(newTracks);
    await window.djaiAPI.saveLibrary(newTracks);
    setIsAnalyzing(false);
    setAnalysisProgress(null);
  };

  // Persist the list of files the user removed so folder sync / watchers never re-import them
  const saveRemovedPaths = async (paths: string[]) => {
    const next: DJSettings = { ...stateRef.current.settings, removedPaths: paths };
    stateRef.current.settings = next;
    setSettings(next);
    if (window.djaiAPI) await window.djaiAPI.saveSettings(next);
  };

  // Explicit user import (file/folder dialog) un-removes those files
  const importUserSelectedPaths = async (paths: string[]) => {
    const removed = stateRef.current.settings.removedPaths || [];
    if (removed.length > 0) {
      const selected = new Set(paths);
      const remaining = removed.filter(p => !selected.has(p));
      if (remaining.length !== removed.length) await saveRemovedPaths(remaining);
    }
    await processAudioFiles(paths);
  };

  const handleRemoveTracks = async (tracksToRemove: Track[]) => {
    if (tracksToRemove.length === 0) return;
    const ids = new Set(tracksToRemove.map(t => t.id));
    const nextLib = stateRef.current.library.filter(t => !ids.has(t.id));
    stateRef.current.library = nextLib;
    setLibrary(nextLib);
    setRecentHistory(prev => prev.filter(id => !ids.has(id)));
    if (window.djaiAPI) await window.djaiAPI.saveLibrary(nextLib);

    const filePaths = tracksToRemove
      .map(t => t.filePath)
      .filter(p => p && !p.startsWith('synth://'));
    if (filePaths.length > 0) {
      const removed = new Set(stateRef.current.settings.removedPaths || []);
      filePaths.forEach(p => removed.add(p));
      await saveRemovedPaths(Array.from(removed));
    }
  };

  const handleOpenFiles = async () => {
    if (!window.djaiAPI) return;
    const paths = await window.djaiAPI.openFiles();
    if (paths && paths.length > 0) {
      await importUserSelectedPaths(paths);
    }
  };

  const handleOpenFolder = async () => {
    if (!window.djaiAPI) return;
    const paths = await window.djaiAPI.openDirectory();
    if (paths && paths.length > 0) {
      await importUserSelectedPaths(paths);
    }
  };

  const handleGenerateDemoPack = () => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    const { tracks, buffers } = TechnoSynth.generateDemoPack(engine.ctx);
    buffers.forEach((buf, id) => engine.setCachedBuffer(id, buf));

    setLibrary(prev => {
      const updated = [...tracks, ...prev.filter(t => !tracks.some(nt => nt.id === t.id))];
      if (window.djaiAPI) {
        window.djaiAPI.saveLibrary(updated);
      }
      return updated;
    });
  };

  const handleRescanFolders = async () => {
    if (!window.djaiAPI) return;
    const engine = audioEngineRef.current;
    try {
      const results = await window.djaiAPI.rescanFolders();
      const currentLibrary = stateRef.current.library;
      const existingPaths = new Set(currentLibrary.map(t => t.filePath));
      const removed = new Set(stateRef.current.settings.removedPaths || []);
      const allNewFiles: string[] = [];

      results.forEach(r => {
        r.files.forEach(f => {
          if (!existingPaths.has(f) && !removed.has(f)) {
            allNewFiles.push(f);
          }
        });
      });

      if (allNewFiles.length > 0) {
        await processAudioFiles(allNewFiles);
      }

      // Also upgrade any existing tracks in the active folder (or library) that have outdated (<v5) or Estimated analysis
      if (engine) {
        const activeFolder = stateRef.current.selectedFolder;
        const tracksToUpgrade = stateRef.current.library.filter(
          t =>
            t.format !== 'synth' &&
            !t.isCustomEdited &&
            t.filePath &&
            (!activeFolder || getTrackFolderName(t) === activeFolder) &&
            t.analysis?.analysisVersion !== ANALYSIS_VERSION
        );

        if (tracksToUpgrade.length > 0) {
          setIsAnalyzing(true);
          const updatedMap = new Map<string, Track>();

          for (let i = 0; i < tracksToUpgrade.length; i++) {
            const trk = tracksToUpgrade[i];
            setAnalysisProgress({
              current: i + 1,
              total: tracksToUpgrade.length,
              trackTitle: `${trk.title} (v3 DSP Lock)`,
            });
            try {
              const bytes = await window.djaiAPI.readAudioFile(trk.filePath);
              const buffer = await engine.decodeAudio(trk.id, bytes);
              const freshAnalysis = await AudioAnalyzer.analyzeAudioBuffer(buffer);
              updatedMap.set(trk.id, { ...trk, duration: buffer.duration, analysis: freshAnalysis });
            } catch (err) {
              console.warn('Upgrade skipped for track:', trk.title, err);
            }
          }

          if (updatedMap.size > 0) {
            setLibrary(prev => {
              const nextLib = prev.map(t => updatedMap.get(t.id) || t);
              window.djaiAPI.saveLibrary(nextLib);
              return nextLib;
            });
          }
          setIsAnalyzing(false);
          setAnalysisProgress(null);
        }
      }
    } catch (e) {
      console.error('Error rescanning folders:', e);
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  const handleSaveTrackEdit = (updatedTrack: Track) => {
    setLibrary(prev => {
      const updated = prev.map(t => (t.id === updatedTrack.id ? updatedTrack : t));
      if (window.djaiAPI) {
        window.djaiAPI.saveLibrary(updated);
      }
      return updated;
    });

    if (deckA.loadedTrack?.id === updatedTrack.id) {
      setDeckA(prev => ({ ...prev, loadedTrack: updatedTrack }));
    }
    if (deckB.loadedTrack?.id === updatedTrack.id) {
      setDeckB(prev => ({ ...prev, loadedTrack: updatedTrack }));
    }
  };

  const handleSaveSettings = async (newSettings: DJSettings) => {
    setSettings(newSettings);
    if (window.djaiAPI) {
      await window.djaiAPI.saveSettings(newSettings);
      await window.djaiAPI.setSleepBlocker(newSettings.preventSystemSleep);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#07090d] text-white select-none overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        personality={personality}
        onSelectPersonality={handleSelectPersonality}
        activeQuickCommand={activeQuickCommand}
        onTriggerQuickCommand={handleTriggerQuickCommand}
        lastDecision={lastDecision}
        hasGeminiKey={Boolean(settings.geminiApiKey && settings.geminiApiKey.length > 10)}
        selectedFolder={selectedFolder}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onToggleRecord={handleToggleRecord}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main DJ Surface */}
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Top Decks & Center Mixer */}
        <div className="flex gap-4 items-stretch h-[370px]">
          {/* Deck A */}
          <Deck
            state={deckA}
            otherDeckBpm={deckB.loadedTrack?.analysis?.bpm || 140}
            onPlayPause={() => handlePlayPause('A')}
            onCue={() => handleCue('A')}
            onSeek={pos => handleSeek('A', pos)}
            onVolumeChange={vol => handleVolumeChange('A', vol)}
            onTempoChange={pct => handleTempoChange('A', pct)}
            onSync={() => handleSync('A')}
            onNudge={dir => handleNudge('A', dir)}
            onLowEqChange={db => handleLowEqChange('A', db)}
            onMidEqChange={db => handleMidEqChange('A', db)}
            onHighEqChange={db => handleHighEqChange('A', db)}
            onFilterChange={val => handleFilterChange('A', val)}
          />

          {/* Central Mixer */}
          <Mixer
            crossfader={crossfader}
            onCrossfaderChange={handleCrossfaderChange}
            masterVolume={masterVolume}
            onMasterVolumeChange={handleMasterVolumeChange}
            autoDjEnabled={autoDjActive}
            onToggleAutoDj={() => setAutoDjActive(!autoDjActive)}
            mixPointStyle={mixPointStyle}
            onSelectMixPointStyle={setMixPointStyle}
            currentTransition={currentTransition}
            onTriggerTransition={triggerTransition}
            selectedTransitionType={selectedTransitionType}
            onSelectTransitionType={setSelectedTransitionType}
            masterPeak={masterPeak}
          />

          {/* Deck B */}
          <Deck
            state={deckB}
            otherDeckBpm={deckA.loadedTrack?.analysis?.bpm || 140}
            onPlayPause={() => handlePlayPause('B')}
            onCue={() => handleCue('B')}
            onSeek={pos => handleSeek('B', pos)}
            onVolumeChange={vol => handleVolumeChange('B', vol)}
            onTempoChange={pct => handleTempoChange('B', pct)}
            onSync={() => handleSync('B')}
            onNudge={dir => handleNudge('B', dir)}
            onLowEqChange={db => handleLowEqChange('B', db)}
            onMidEqChange={db => handleMidEqChange('B', db)}
            onHighEqChange={db => handleHighEqChange('B', db)}
            onFilterChange={val => handleFilterChange('B', val)}
          />
        </div>

        {/* Bottom: Music Library */}
        <Library
          tracks={library}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
          onOpenFolder={handleOpenFolder}
          onOpenFiles={handleOpenFiles}
          onGenerateDemoPack={handleGenerateDemoPack}
          onRescanFolders={handleRescanFolders}
          onLoadToDeck={loadTrackToDeck}
          onEditTrack={setEditingTrack}
          onRemoveTracks={handleRemoveTracks}
          isAnalyzing={isAnalyzing}
          analysisProgress={analysisProgress}
          errorMessage={errorMessage}
          onDismissError={() => setErrorMessage(null)}
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />

      {/* Track Edit Modal */}
      <TrackEditModal
        track={editingTrack}
        isOpen={Boolean(editingTrack)}
        onClose={() => setEditingTrack(null)}
        onSave={handleSaveTrackEdit}
      />
    </div>
  );
};

