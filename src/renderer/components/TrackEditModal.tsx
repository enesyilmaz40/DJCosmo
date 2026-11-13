import React, { useState } from 'react';
import { Track } from '../types';
import { X, Save, Edit3 } from 'lucide-react';

interface TrackEditModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

export const TrackEditModal: React.FC<TrackEditModalProps> = ({
  track,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen || !track) return null;

  const [bpm, setBpm] = useState<number>(track.analysis?.bpm || 140);
  const [firstDownbeat, setFirstDownbeat] = useState<number>(track.analysis?.firstDownbeat || 0);
  const [breakdown, setBreakdown] = useState<number>(track.analysis?.cues.breakdown || 0);
  const [drop, setDrop] = useState<number>(track.analysis?.cues.drop || 0);
  const [mixInPoint, setMixInPoint] = useState<number>(track.analysis?.cues.mixInPoint || 0);
  const [mixOutPoint, setMixOutPoint] = useState<number>(
    track.analysis?.cues.mixOutPoint || Math.max(0, track.duration - 30)
  );

  const handleSave = () => {
    const updated: Track = {
      ...track,
      isCustomEdited: true,
      analysis: {
        ...(track.analysis || {
          rmsEnergy: 0.8,
          peakLevel: 0.95,
          energyProfile: [],
          analyzedAt: new Date().toISOString(),
        }),
        bpm: Number(bpm),
        firstDownbeat: Number(firstDownbeat),
        isConfident: true,
        cues: {
          ...(track.analysis?.cues || {}),
          breakdown: breakdown > 0 ? Number(breakdown) : undefined,
          drop: drop > 0 ? Number(drop) : undefined,
          mixInPoint: Number(mixInPoint),
          mixOutPoint: Number(mixOutPoint),
        },
      },
    };
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0e121a] border border-[#20293a] rounded-xl p-5 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#20293a] pb-3">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-[#00ff66]" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Edit Track Grid & Cue Points
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-[#1a2130]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Track Title */}
        <div className="text-xs text-neutral-300 font-bold bg-[#141a26] p-2.5 rounded-lg border border-[#232d40]">
          {track.title} <span className="text-neutral-500 font-normal">({track.artist})</span>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">BPM (Beats Per Minute)</label>
            <input
              type="number"
              step="0.1"
              value={bpm}
              onChange={e => setBpm(parseFloat(e.target.value) || 0)}
              className="bg-[#090b0f] border border-[#263145] rounded px-3 py-2 text-white font-mono outline-none focus:border-[#00ff66]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">First Downbeat (Seconds)</label>
            <input
              type="number"
              step="0.01"
              value={firstDownbeat}
              onChange={e => setFirstDownbeat(parseFloat(e.target.value) || 0)}
              className="bg-[#090b0f] border border-[#263145] rounded px-3 py-2 text-white font-mono outline-none focus:border-[#00ff66]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Breakdown Cue (Seconds)</label>
            <input
              type="number"
              step="0.5"
              value={breakdown}
              onChange={e => setBreakdown(parseFloat(e.target.value) || 0)}
              className="bg-[#090b0f] border border-[#263145] rounded px-3 py-2 text-white font-mono outline-none focus:border-[#00ff66]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Drop Cue (Seconds)</label>
            <input
              type="number"
              step="0.5"
              value={drop}
              onChange={e => setDrop(parseFloat(e.target.value) || 0)}
              className="bg-[#090b0f] border border-[#263145] rounded px-3 py-2 text-white font-mono outline-none focus:border-[#00ff66]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Mix In Point (Seconds)</label>
            <input
              type="number"
              step="0.5"
              value={mixInPoint}
              onChange={e => setMixInPoint(parseFloat(e.target.value) || 0)}
              className="bg-[#090b0f] border border-[#263145] rounded px-3 py-2 text-white font-mono outline-none focus:border-[#00ff66]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-neutral-400">Mix Out Point (Seconds)</label>
            <input
              type="number"
              step="0.5"
              value={mixOutPoint}
              onChange={e => setMixOutPoint(parseFloat(e.target.value) || 0)}
              className="bg-[#090b0f] border border-[#263145] rounded px-3 py-2 text-white font-mono outline-none focus:border-[#00ff66]"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[#20293a]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold text-neutral-400 hover:text-white hover:bg-[#1a2130] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-lg text-xs font-black bg-[#00ff66] text-black hover:bg-[#15ff75] transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,255,102,0.3)]"
          >
            <Save className="w-3.5 h-3.5" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

