import React from 'react';
import { DJPersonality, QuickCommand, AIDecision } from '../types';
import { Sparkles, Flame, Waves, Disc, Settings as SettingsIcon, Cpu, Folder, Keyboard } from 'lucide-react';

interface HeaderProps {
  personality: DJPersonality;
  onSelectPersonality: (p: DJPersonality) => void;
  activeQuickCommand: QuickCommand;
  onTriggerQuickCommand: (cmd: QuickCommand) => void;
  lastDecision: AIDecision | null;
  hasGeminiKey: boolean;
  selectedFolder?: string | null;
  isRecording?: boolean;
  recordingDuration?: number;
  onToggleRecord?: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  personality,
  onSelectPersonality,
  activeQuickCommand,
  onTriggerQuickCommand,
  lastDecision,
  hasGeminiKey,
  selectedFolder,
  isRecording = false,
  recordingDuration = 0,
  onToggleRecord,
  onOpenSettings,
}) => {
  const [showKeys, setShowKeys] = React.useState(false);

  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  const personalities: { id: DJPersonality; label: string; desc: string }[] = [
    { id: 'UNDERGROUND', label: 'UNDERGROUND', desc: 'Dark Hypnotic 32-Bar' },
    { id: 'RAVE_MADNESS', label: 'RAVE MADNESS', desc: 'Hard Techno Bass Swap' },
    { id: 'ACID_EXPERIENCE', label: 'ACID EXPERIENCE', desc: '303 Filter Sweeps' },
    { id: 'PEAK_TIME', label: 'PEAK TIME', desc: 'Drop-Driven Energy' },
  ];

  return (
    <header className="bg-[#0b0e14] border-b border-[#1b2332] px-6 py-2.5 flex flex-col gap-2">
      {/* Top Line */}
      <div className="flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#00ff66]/10 border border-[#00ff66]/40 flex items-center justify-center text-[#00ff66] shadow-[0_0_12px_rgba(0,255,102,0.3)]">
              <Disc className="w-5 h-5 animate-[spin_6s_linear_infinite]" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tighter text-white">DJCOSMO</span>
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-[#172030] text-[#00ff66] font-mono font-bold tracking-wider border border-[#00ff66]/30">
                AUTONOMOUS AI DJ
              </span>
            </div>
          </div>

          {/* AI Status Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#121620] border border-[#1e2738]">
            <Cpu className={`w-3.5 h-3.5 ${hasGeminiKey ? 'text-[#00ff66]' : 'text-amber-400'}`} />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-300">
              {hasGeminiKey ? 'GEMINI 2.5 LIVE BRAIN' : 'OFFLINE RULE BRAIN'}
            </span>
          </div>

          {/* Active Crate Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#121620] border border-[#1e2738]">
            <Folder className="w-3.5 h-3.5 text-[#00e5ff]" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-300">
              CRATE: <span className="text-[#00e5ff] font-black">{selectedFolder || 'ALL TRACKS'}</span>
            </span>
          </div>
        </div>

        {/* Quick Commands (Live Audience Interactions) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-neutral-500 tracking-wider">CROWD COMMANDS:</span>
          <button
            onClick={() => onTriggerQuickCommand(activeQuickCommand === 'GO_HARDER' ? null : 'GO_HARDER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
              activeQuickCommand === 'GO_HARDER'
                ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse'
                : 'bg-[#151a24] text-red-400 border border-red-500/30 hover:bg-red-500/20'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            GO HARDER
          </button>

          <button
            onClick={() => onTriggerQuickCommand(activeQuickCommand === 'KEEP_THE_GROOVE' ? null : 'KEEP_THE_GROOVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
              activeQuickCommand === 'KEEP_THE_GROOVE'
                ? 'bg-[#00ff66] text-black shadow-[0_0_15px_rgba(0,255,102,0.6)]'
                : 'bg-[#151a24] text-[#00ff66] border border-[#00ff66]/30 hover:bg-[#00ff66]/20'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            KEEP THE GROOVE
          </button>

          <button
            onClick={() => onTriggerQuickCommand(activeQuickCommand === 'BUILD_TENSION' ? null : 'BUILD_TENSION')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
              activeQuickCommand === 'BUILD_TENSION'
                ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                : 'bg-[#151a24] text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            BUILD TENSION
          </button>

          {/* Live Recording Button */}
          {onToggleRecord && (
            <button
              onClick={onToggleRecord}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                isRecording
                  ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.8)] animate-pulse'
                  : 'bg-[#151a24] text-red-400 border border-red-500/30 hover:bg-red-500/20'
              }`}
              title={isRecording ? 'Click to Stop and Save Live Set' : 'Record Master Output'}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
              <span>{isRecording ? `REC ${formatRecTime(recordingDuration)}` : 'REC'}</span>
            </button>
          )}

          {/* Keyboard Shortcuts Trigger */}
          <button
            onClick={() => setShowKeys(!showKeys)}
            className={`p-2 rounded-lg border transition-all ${
              showKeys
                ? 'bg-[#00ff66] text-black border-[#00ff66]'
                : 'bg-[#151a24] text-neutral-400 border-[#20293a] hover:text-white'
            }`}
            title="Keyboard Shortcuts"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-[#151a24] text-neutral-300 border border-[#20293a] hover:text-white hover:border-[#00ff66] transition-all ml-1"
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Overlay Drawer */}
      {showKeys && (
        <div className="bg-[#121622] border border-[#232e42] rounded-lg p-2.5 flex items-center justify-between text-xs font-mono shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-4 text-neutral-300">
            <span className="font-bold text-[#00ff66] flex items-center gap-1">
              <Keyboard className="w-3.5 h-3.5" /> PRO HOTKEYS:
            </span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#1c2434] text-white border border-[#2b374d]">SPACE</kbd> Play/Pause</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#1c2434] text-white border border-[#2b374d]">C</kbd> Cue Point</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#1c2434] text-white border border-[#2b374d]">S</kbd> Sync BPM</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#1c2434] text-white border border-[#2b374d]">M / ENTER</kbd> Trigger Mix Now</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#1c2434] text-white border border-[#2b374d]">1 / 2</kbd> Focus Deck A / B</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#1c2434] text-white border border-[#2b374d]">← / →</kbd> Jog Nudge</span>
          </div>
          <button onClick={() => setShowKeys(false)} className="text-[10px] text-neutral-400 hover:text-white underline">
            Close
          </button>
        </div>
      )}

      {/* Bottom Line: Personalities Bar & AI Reasoning Bar */}
      <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#141a26]">
        {/* DJ Personalities */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-neutral-500 mr-1">PERSONALITY:</span>
          {personalities.map(p => {
            const isSelected = personality === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelectPersonality(p.id)}
                className={`px-3 py-1 rounded text-[11px] font-black tracking-wider transition-all ${
                  isSelected
                    ? 'bg-[#00ff66] text-black shadow-[0_0_10px_rgba(0,255,102,0.3)]'
                    : 'bg-[#121620] text-neutral-400 hover:text-white hover:bg-[#19202c] border border-[#1d2636]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* AI Thought / Reasoning ticker */}
        <div className="flex-1 max-w-xl bg-[#090b0f] border border-[#171d29] rounded px-3 py-1 text-xs font-mono text-neutral-400 truncate flex items-center gap-2">
          <span className="text-[#00ff66] font-bold flex-shrink-0">[AI DECISION]:</span>
          <span className="truncate text-white">
            {lastDecision
              ? `${lastDecision.reason} (Next: ${lastDecision.nextTrackId}, ${lastDecision.transitionType}, ${lastDecision.transitionBars} bars)`
              : 'AI Engine ready. Autonomous transitions will initiate based on live musical energy.'}
          </span>
        </div>
      </div>
    </header>
  );
};

