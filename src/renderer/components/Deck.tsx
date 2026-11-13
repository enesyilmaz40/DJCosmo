import React from 'react';
import { DeckState } from '../types';
import { Waveform } from './Waveform';
import { Play, Pause, Disc3, RefreshCw, Zap } from 'lucide-react';

interface DeckProps {
  state: DeckState;
  otherDeckBpm: number;
  onPlayPause: () => void;
  onCue: () => void;
  onSeek: (position: number) => void;
  onVolumeChange: (vol: number) => void;
  onTempoChange: (percent: number) => void;
  onSync: () => void;
  onNudge: (direction: number) => void;
  onLowEqChange: (db: number) => void;
  onMidEqChange: (db: number) => void;
  onHighEqChange: (db: number) => void;
  onFilterChange: (val: number) => void;
}

export const Deck: React.FC<DeckProps> = ({
  state,
  otherDeckBpm,
  onPlayPause,
  onCue,
  onSeek,
  onVolumeChange,
  onTempoChange,
  onSync,
  onNudge,
  onLowEqChange,
  onMidEqChange,
  onHighEqChange,
  onFilterChange,
}) => {
  const isDeckA = state.id === 'A';
  const themeColor = isDeckA ? '#00ff66' : '#00e5ff'; // Neon Acid Green for Deck A, Neon Cyan for Deck B

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const trackBpm = state.loadedTrack?.analysis?.bpm || 140;
  const effectiveBpm = Math.round(trackBpm * state.playbackRate * 10) / 10;

  // Real-time Beat Phase (1, 2, 3, 4)
  const secondsPerBeat = effectiveBpm > 0 ? 60 / effectiveBpm : 0.4;
  const downbeatOffset = state.loadedTrack?.analysis?.firstDownbeat || 0;
  const beatsElapsed = state.isPlaying && state.currentTime >= downbeatOffset
    ? Math.floor((state.currentTime - downbeatOffset) / secondsPerBeat)
    : 0;
  const currentBeatInBar = (beatsElapsed % 4) + 1;
  const currentBarInPhrase = (Math.floor(beatsElapsed / 4) % 16) + 1;

  return (
    <div className="flex-1 bg-[#10131a] border border-[#1b2230] rounded-xl p-4 flex flex-col gap-3 shadow-2xl relative overflow-hidden">
      {/* Deck Header */}
      <div className="flex items-center justify-between border-b border-[#1b2230] pb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm tracking-wider"
            style={{
              backgroundColor: isDeckA ? 'rgba(0, 255, 102, 0.15)' : 'rgba(0, 229, 255, 0.15)',
              color: themeColor,
              border: `1px solid ${themeColor}`,
            }}
          >
            {state.id}
          </div>
          <div>
            <div className="text-sm font-bold text-white truncate max-w-[220px]">
              {state.loadedTrack ? state.loadedTrack.title : 'No Track Loaded'}
            </div>
            <div className="text-xs text-neutral-400 truncate max-w-[220px]">
              {state.loadedTrack ? state.loadedTrack.artist : 'Select track from library'}
            </div>
          </div>
        </div>

        {/* BPM & Sync Section */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              {state.loadedTrack?.analysis?.musicalKey && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {state.loadedTrack.analysis.musicalKey}
                  {state.loadedTrack.analysis.camelotKey ? ` · ${state.loadedTrack.analysis.camelotKey}` : ''}
                </span>
              )}
              <div className="text-xl font-mono font-bold tracking-tight text-white">
                {effectiveBpm} <span className="text-xs font-normal text-neutral-400">BPM</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-neutral-400">
              {state.tempoPercent > 0 ? `+${state.tempoPercent.toFixed(1)}%` : `${state.tempoPercent.toFixed(1)}%`}
            </div>
          </div>

          {/* Nudge Jog Bend */}
          <div className="flex items-center gap-0.5 bg-[#141a24] p-0.5 rounded border border-[#222a3a]">
            <button
              onClick={() => onNudge(-1)}
              disabled={!state.isPlaying}
              className="px-1.5 py-1 text-[11px] font-mono font-bold rounded text-neutral-300 hover:text-white hover:bg-[#202b3d] active:bg-[#00ff66] active:text-black transition-all disabled:opacity-30"
              title="Nudge Backward (Slow down momentarily)"
            >
              &laquo;
            </button>
            <span className="text-[9px] font-mono text-neutral-500 uppercase px-0.5">NUDGE</span>
            <button
              onClick={() => onNudge(1)}
              disabled={!state.isPlaying}
              className="px-1.5 py-1 text-[11px] font-mono font-bold rounded text-neutral-300 hover:text-white hover:bg-[#202b3d] active:bg-[#00ff66] active:text-black transition-all disabled:opacity-30"
              title="Nudge Forward (Speed up momentarily)"
            >
              &raquo;
            </button>
          </div>

          {/* Real-time Beat Phase Display (Pioneer 4-beat bar grid) */}
          <div className="hidden sm:flex flex-col items-center justify-center bg-[#0d1017] px-2 py-1 rounded border border-[#1b2230]">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map(b => (
                <div
                  key={b}
                  className={`w-2 h-2 rounded-full transition-all ${
                    state.isPlaying && currentBeatInBar === b
                      ? 'shadow-[0_0_8px_currentColor] scale-125'
                      : 'opacity-25'
                  }`}
                  style={{
                    backgroundColor: state.isPlaying && currentBeatInBar === b ? themeColor : '#4b5563',
                    color: themeColor,
                  }}
                />
              ))}
            </div>
            <span className="text-[8px] font-mono font-bold text-neutral-400 mt-0.5">
              BAR {currentBarInPhrase.toString().padStart(2, '0')}/16
            </span>
          </div>

          <button
            onClick={onSync}
            disabled={!state.loadedTrack}
            className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1 transition-all ${
              state.isSynced
                ? 'bg-[#00ff66] text-black shadow-[0_0_12px_rgba(0,255,102,0.4)]'
                : 'bg-[#181d28] text-neutral-300 hover:bg-[#222a3a] border border-[#263145]'
            }`}
          >
            <RefreshCw className="w-3 h-3" />
            SYNC
          </button>
        </div>
      </div>

      {/* Waveform Scrubber */}
      <Waveform
        track={state.loadedTrack}
        currentTime={state.currentTime}
        duration={state.duration}
        isPlaying={state.isPlaying}
        onSeek={onSeek}
        accentColor={themeColor}
      />

      {/* Time Display */}
      <div className="flex justify-between items-center text-xs font-mono text-neutral-400 px-1">
        <span>{formatTime(state.currentTime)}</span>
        <span className="text-neutral-500">
          REMAINING: {formatTime(Math.max(0, state.duration - state.currentTime))}
        </span>
        <span>{formatTime(state.duration)}</span>
      </div>

      {/* Hot Cues Bar */}
      <div className="flex items-center gap-1.5 px-1 py-0.5 select-none">
        <span className="text-[9px] font-mono font-bold text-neutral-500 uppercase tracking-wider">HOT CUES:</span>
        <button
          onClick={() => onSeek(0)}
          disabled={!state.loadedTrack}
          className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#141b26] border border-[#232f42] text-neutral-300 hover:text-white hover:border-[#00ff66] transition-all disabled:opacity-30"
          title="Jump to Intro"
        >
          1: INTRO
        </button>
        {state.loadedTrack?.analysis?.cues?.drop !== undefined && (
          <button
            onClick={() => onSeek(state.loadedTrack!.analysis!.cues!.drop!)}
            disabled={!state.loadedTrack}
            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#1c1428] border border-[#a855f7]/40 text-[#c084fc] hover:text-white hover:border-[#a855f7] transition-all disabled:opacity-30"
            title={`Jump to Drop at ${formatTime(state.loadedTrack.analysis.cues.drop)}`}
          >
            2: DROP ({formatTime(state.loadedTrack.analysis.cues.drop)})
          </button>
        )}
        {state.loadedTrack?.analysis?.cues?.breakdown !== undefined && (
          <button
            onClick={() => onSeek(state.loadedTrack!.analysis!.cues!.breakdown!)}
            disabled={!state.loadedTrack}
            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#142328] border border-[#00e5ff]/40 text-[#00e5ff] hover:text-white hover:border-[#00e5ff] transition-all disabled:opacity-30"
            title={`Jump to Breakdown at ${formatTime(state.loadedTrack.analysis.cues.breakdown)}`}
          >
            3: BREAK ({formatTime(state.loadedTrack.analysis.cues.breakdown)})
          </button>
        )}
      </div>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-12 gap-3 pt-1">
        {/* Left Side: Play & Cue Big Buttons */}
        <div className="col-span-4 flex flex-col gap-2 justify-center">
          <button
            onClick={onPlayPause}
            disabled={!state.loadedTrack}
            className={`w-full py-4 rounded-lg font-black text-sm flex items-center justify-center gap-2 transition-all ${
              state.isPlaying
                ? 'bg-[#00ff66] text-black shadow-[0_0_20px_rgba(0,255,102,0.5)]'
                : 'bg-[#1c2433] text-neutral-200 hover:bg-[#253043] border border-[#2b3952]'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {state.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            {state.isPlaying ? 'PAUSE' : 'PLAY'}
          </button>

          <button
            onClick={onCue}
            disabled={!state.loadedTrack}
            className="w-full py-2.5 rounded-lg font-bold text-xs bg-[#ff6b00]/20 text-[#ff8c33] border border-[#ff6b00]/40 hover:bg-[#ff6b00]/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-30"
          >
            <Disc3 className="w-4 h-4" />
            CUE
          </button>
        </div>

        {/* Center: 3-Band EQ & DJ Filter */}
        <div className="col-span-5 flex items-center justify-between bg-[#0b0e14] border border-[#1b2332] rounded-lg p-2.5">
          {/* High EQ */}
          <div className="flex flex-col items-center gap-1 flex-1">
            <span className="text-[10px] font-bold text-neutral-400">HI</span>
            <input
              type="range"
              min={-24}
              max={6}
              step={0.5}
              value={state.highEq}
              onChange={e => onHighEqChange(parseFloat(e.target.value))}
              className="h-20 -rotate-90 w-16 accent-[#00ff66] cursor-pointer my-2"
            />
            <button
              onClick={() => onHighEqChange(state.highEq === -24 ? 0 : -24)}
              className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                state.highEq <= -20 ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-[#19202e] text-neutral-400'
              }`}
            >
              KILL
            </button>
          </div>

          {/* Mid EQ */}
          <div className="flex flex-col items-center gap-1 flex-1">
            <span className="text-[10px] font-bold text-neutral-400">MID</span>
            <input
              type="range"
              min={-24}
              max={6}
              step={0.5}
              value={state.midEq}
              onChange={e => onMidEqChange(parseFloat(e.target.value))}
              className="h-20 -rotate-90 w-16 accent-[#00ff66] cursor-pointer my-2"
            />
            <button
              onClick={() => onMidEqChange(state.midEq === -24 ? 0 : -24)}
              className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                state.midEq <= -20 ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-[#19202e] text-neutral-400'
              }`}
            >
              KILL
            </button>
          </div>

          {/* Low EQ (Bass Swap hero) */}
          <div className="flex flex-col items-center gap-1 flex-1">
            <span className="text-[10px] font-bold text-neutral-400">LOW</span>
            <input
              type="range"
              min={-24}
              max={6}
              step={0.5}
              value={state.lowEq}
              onChange={e => onLowEqChange(parseFloat(e.target.value))}
              className="h-20 -rotate-90 w-16 accent-[#00ff66] cursor-pointer my-2"
            />
            <button
              onClick={() => onLowEqChange(state.lowEq === -24 ? 0 : -24)}
              className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                state.lowEq <= -20 ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-[#19202e] text-neutral-400'
              }`}
            >
              KILL
            </button>
          </div>

          {/* Filter */}
          <div className="flex flex-col items-center gap-1 flex-1 border-l border-[#1f2838] pl-1">
            <span className="text-[10px] font-bold text-[#00e5ff]">FLTR</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={state.filter}
              onChange={e => onFilterChange(parseFloat(e.target.value))}
              className="h-20 -rotate-90 w-16 accent-[#00e5ff] cursor-pointer my-2"
            />
            <button
              onClick={() => onFilterChange(0)}
              className="text-[9px] px-1 py-0.5 rounded font-mono bg-[#19202e] text-neutral-400 hover:text-white"
            >
              RST
            </button>
          </div>
        </div>

        {/* Right Side: Volume & Pitch Fader */}
        <div className="col-span-3 flex items-center justify-around bg-[#0b0e14] border border-[#1b2332] rounded-lg p-2">
          {/* Deck Volume */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-neutral-400">VOL</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.volume}
              onChange={e => onVolumeChange(parseFloat(e.target.value))}
              className="h-24 -rotate-90 w-20 accent-white cursor-pointer my-2"
            />
            <span className="text-[10px] font-mono text-neutral-400">
              {Math.round(state.volume * 100)}%
            </span>
          </div>

          {/* Pitch / Tempo Fader */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-neutral-400">TEMPO</span>
            <input
              type="range"
              min={-8}
              max={8}
              step={0.1}
              value={state.tempoPercent}
              onChange={e => onTempoChange(parseFloat(e.target.value))}
              className="h-24 -rotate-90 w-20 accent-[#00ff66] cursor-pointer my-2"
            />
            <button
              onClick={() => onTempoChange(0)}
              className="text-[9px] px-1 py-0.5 rounded font-mono bg-[#19202e] text-neutral-400 hover:text-white"
            >
              0.0%
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

