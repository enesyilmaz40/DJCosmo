import React from 'react';
import { TransitionType, TransitionState } from '../types';
import { Sliders, Activity, Shuffle } from 'lucide-react';

interface MixerProps {
  crossfader: number;
  onCrossfaderChange: (val: number) => void;
  masterVolume: number;
  onMasterVolumeChange: (vol: number) => void;
  autoDjEnabled: boolean;
  onToggleAutoDj: () => void;
  mixPointStyle?: 'full' | 'standard' | 'quick';
  onSelectMixPointStyle?: (style: 'full' | 'standard' | 'quick') => void;
  currentTransition: TransitionState | null;
  onTriggerTransition: (type: TransitionType) => void;
  selectedTransitionType: TransitionType;
  onSelectTransitionType: (type: TransitionType) => void;
  masterPeak: { left: number; right: number };
}

export const Mixer: React.FC<MixerProps> = ({
  crossfader,
  onCrossfaderChange,
  masterVolume,
  onMasterVolumeChange,
  autoDjEnabled,
  onToggleAutoDj,
  mixPointStyle = 'full',
  onSelectMixPointStyle,
  currentTransition,
  onTriggerTransition,
  selectedTransitionType,
  onSelectTransitionType,
  masterPeak,
}) => {
  return (
    <div className="w-80 bg-[#0d1017] border border-[#1b2332] rounded-xl p-4 flex flex-col justify-between shadow-2xl">
      {/* Top Section: Master Volume & VU Meter */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-[#1b2332] pb-2">
          <span className="text-xs font-black tracking-widest text-neutral-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#00ff66]" /> MASTER OUT
          </span>
          <span className="text-xs font-mono font-bold text-white">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>

        {/* Master VU Stereo Meters */}
        <div className="flex items-center justify-center gap-2 py-1">
          <div className="flex flex-col gap-0.5 items-center">
            <span className="text-[9px] text-neutral-500 font-mono">L</span>
            <div className="w-3 h-28 bg-[#090b0f] rounded overflow-hidden flex flex-col-reverse p-0.5 border border-[#1a212e]">
              <div
                className="w-full rounded-sm transition-all duration-75"
                style={{
                  height: `${Math.min(100, masterPeak.left * 100)}%`,
                  backgroundColor:
                    masterPeak.left > 0.85 ? '#ef4444' : masterPeak.left > 0.65 ? '#eab308' : '#00ff66',
                  boxShadow: masterPeak.left > 0.65 ? '0 0 8px currentColor' : 'none',
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-0.5 items-center">
            <span className="text-[9px] text-neutral-500 font-mono">R</span>
            <div className="w-3 h-28 bg-[#090b0f] rounded overflow-hidden flex flex-col-reverse p-0.5 border border-[#1a212e]">
              <div
                className="w-full rounded-sm transition-all duration-75"
                style={{
                  height: `${Math.min(100, masterPeak.right * 100)}%`,
                  backgroundColor:
                    masterPeak.right > 0.85 ? '#ef4444' : masterPeak.right > 0.65 ? '#eab308' : '#00ff66',
                  boxShadow: masterPeak.right > 0.65 ? '0 0 8px currentColor' : 'none',
                }}
              />
            </div>
          </div>

          {/* Master Volume Knob / Slider */}
          <div className="flex flex-col items-center justify-center ml-3">
            <span className="text-[10px] font-bold text-neutral-400 mb-1">LEVEL</span>
            <input
              type="range"
              min={0}
              max={1.2}
              step={0.01}
              value={masterVolume}
              onChange={e => onMasterVolumeChange(parseFloat(e.target.value))}
              className="h-24 -rotate-90 w-20 accent-[#00ff66] cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Auto DJ Mode & Transition Center */}
      <div className="bg-[#080a0e] border border-[#171d28] rounded-lg p-3 flex flex-col gap-2.5 my-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Activity className={`w-4 h-4 ${autoDjEnabled ? 'text-[#00ff66] animate-pulse' : 'text-neutral-500'}`} />
            <span className="text-xs font-black tracking-wider text-white">AUTO DJ</span>
          </div>

          <button
            onClick={onToggleAutoDj}
            className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${
              autoDjEnabled
                ? 'bg-[#00ff66] text-black shadow-[0_0_12px_rgba(0,255,102,0.4)]'
                : 'bg-[#18202d] text-neutral-400 border border-[#232d3f] hover:text-white'
            }`}
          >
            {autoDjEnabled ? 'ON / ACTIVE' : 'OFF / MANUAL'}
          </button>
        </div>

        {/* Transition Style Selector */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-neutral-400">TRANSITION MODE</span>
          <select
            value={selectedTransitionType}
            onChange={e => onSelectTransitionType(e.target.value as TransitionType)}
            className="w-full bg-[#121620] border border-[#20293a] text-xs font-mono text-white rounded px-2 py-1.5 outline-none focus:border-[#00ff66]"
          >
            <option value="bass_swap">BASS SWAP (Techno Hero)</option>
            <option value="echo_out">ECHO OUT (Dub Delay Tail)</option>
            <option value="16_bar">16-BAR TRANSITION</option>
            <option value="32_bar">32-BAR EXTENDED MIX</option>
            <option value="filter_transition">FILTER SWEEP</option>
            <option value="smooth_crossfade">SMOOTH CROSSFADE</option>
          </select>
        </div>

        {/* Track Playthrough Mix Point */}
        {onSelectMixPointStyle && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-neutral-400">MIX POINT (PLAYTHROUGH)</span>
            <select
              value={mixPointStyle}
              onChange={e => onSelectMixPointStyle(e.target.value as any)}
              className="w-full bg-[#121620] border border-[#20293a] text-xs font-mono text-[#00ff66] font-bold rounded px-2 py-1.5 outline-none focus:border-[#00ff66]"
            >
              <option value="full">FULL TRACK (Play 88% - Mix in Outro)</option>
              <option value="standard">CLUB STANDARD (Play 75% - Post-Drop)</option>
              <option value="quick">QUICK MIX (Play 55% - Fast Energy)</option>
            </select>
          </div>
        )}

        {/* Manual Mix Trigger Button */}
        <button
          onClick={() => onTriggerTransition(selectedTransitionType)}
          disabled={currentTransition?.isActive}
          className="w-full py-2 rounded font-black text-xs bg-[#00ff66]/15 hover:bg-[#00ff66]/25 text-[#00ff66] border border-[#00ff66]/40 flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
        >
          <Shuffle className="w-3.5 h-3.5" />
          {currentTransition?.isActive ? 'MIXING IN PROGRESS...' : 'TRIGGER MIX NOW'}
        </button>

        {/* Active Transition Status Bar */}
        {currentTransition?.isActive && (
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex justify-between text-[10px] font-mono text-neutral-300">
              <span className="text-[#00ff66] font-bold uppercase">
                {currentTransition.fromDeck} &rarr; {currentTransition.toDeck} ({currentTransition.type})
              </span>
              <span>{Math.round(currentTransition.progress * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#171d28] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00ff66] to-[#00e5ff] transition-all duration-75"
                style={{ width: `${currentTransition.progress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Crossfader Section */}
      <div className="flex flex-col gap-1.5 bg-[#080a0e] border border-[#171d28] rounded-lg p-3">
        <div className="flex justify-between text-[10px] font-bold">
          <span className="text-[#00ff66]">DECK A</span>
          <span className="text-neutral-500 font-mono">CROSSFADER</span>
          <span className="text-[#00e5ff]">DECK B</span>
        </div>

        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={crossfader}
          onChange={e => onCrossfaderChange(parseFloat(e.target.value))}
          className="w-full h-8 accent-white cursor-pointer"
        />

        <div className="flex justify-between text-[9px] font-mono text-neutral-500">
          <button
            onClick={() => onCrossfaderChange(-1)}
            className="hover:text-white transition-colors"
          >
            [100% A]
          </button>
          <button
            onClick={() => onCrossfaderChange(0)}
            className="hover:text-white transition-colors"
          >
            [CENTER]
          </button>
          <button
            onClick={() => onCrossfaderChange(1)}
            className="hover:text-white transition-colors"
          >
            [100% B]
          </button>
        </div>
      </div>
    </div>
  );
};

