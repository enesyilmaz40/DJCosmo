import React, { useState } from 'react';
import { DJSettings } from '../types';
import { X, Key, ShieldCheck, Moon, SlidersHorizontal, Save } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DJSettings;
  onSaveSettings: (settings: DJSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  if (!isOpen) return null;

  const [apiKey, setApiKey] = useState(settings.geminiApiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [syncRange, setSyncRange] = useState(settings.bpmSyncRange || 8);
  const [preventSleep, setPreventSleep] = useState(settings.preventSystemSleep ?? true);

  const handleSave = () => {
    onSaveSettings({
      ...settings,
      geminiApiKey: apiKey.trim(),
      bpmSyncRange: Number(syncRange),
      preventSystemSleep: preventSleep,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0e121a] border border-[#20293a] rounded-xl p-5 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#20293a] pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#00ff66]" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              DJAI Settings & Credentials
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-[#1a2130]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gemini API Key */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-[#00ff66]" /> Google Gemini API Key
            </label>
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-[10px] text-neutral-400 hover:text-white"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            type={showKey ? 'text' : 'password'}
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="bg-[#090b0f] border border-[#263145] rounded px-3 py-2 text-white font-mono text-xs outline-none focus:border-[#00ff66]"
          />
          <span className="text-[10px] text-neutral-500 leading-tight">
            Encrypted and saved locally on your device. Never logged or exposed. If omitted, the autonomous rule engine operates offline.
          </span>
        </div>

        {/* BPM Sync Range */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-[#1a212e]">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-neutral-300">Tempo Sync Tolerance Range</span>
            <span className="font-mono text-[#00ff66] font-bold">±{syncRange}%</span>
          </div>
          <input
            type="range"
            min={4}
            max={16}
            step={1}
            value={syncRange}
            onChange={e => setSyncRange(parseInt(e.target.value))}
            className="w-full accent-[#00ff66] cursor-pointer"
          />
          <span className="text-[10px] text-neutral-500">
            Limits pitch stretching to preserve authentic techno sound without extreme warping.
          </span>
        </div>

        {/* Prevent System Sleep */}
        <div className="flex items-center justify-between pt-2 border-t border-[#1a212e]">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-blue-400" /> Prevent System Sleep (Party Mode)
            </span>
            <span className="text-[10px] text-neutral-500">
              Blocks macOS / Windows screen sleep during live DJ sessions.
            </span>
          </div>
          <input
            type="checkbox"
            checked={preventSleep}
            onChange={e => setPreventSleep(e.target.checked)}
            className="w-4 h-4 accent-[#00ff66] cursor-pointer"
          />
        </div>

        {/* Security badge */}
        <div className="flex items-center gap-2 bg-[#090d14] border border-[#162030] rounded-lg p-2.5 text-[11px] text-neutral-400">
          <ShieldCheck className="w-4 h-4 text-[#00ff66] flex-shrink-0" />
          <span>Local audio files never leave your computer. Only numerical metadata is processed.</span>
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
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

