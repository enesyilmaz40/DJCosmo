import React, { useRef, useEffect } from 'react';
import { Track } from '../types';

interface WaveformProps {
  track: Track | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (position: number) => void;
  accentColor?: string;
}

export const Waveform: React.FC<WaveformProps> = ({
  track,
  currentTime,
  duration,
  isPlaying,
  onSeek,
  accentColor = '#00ff66',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;

    // Clear canvas
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, width, height);

    if (!track || duration <= 0) {
      // Draw idle placeholder line
      ctx.strokeStyle = '#222734';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      return;
    }

    const energyProfile = track.analysis?.energyProfile || [];
    const barsCount = Math.max(energyProfile.length, 120);

    // 1. Draw Waveform Bars
    const barWidth = width / barsCount;
    for (let i = 0; i < barsCount; i++) {
      let energy = 0.5;
      if (energyProfile.length > 0) {
        const idx = Math.floor((i / barsCount) * energyProfile.length);
        energy = energyProfile[idx] || 0.3;
      } else {
        // Fallback procedural waveform shape
        energy = 0.3 + 0.5 * Math.abs(Math.sin(i * 0.15) * Math.cos(i * 0.05));
      }

      const barHeight = Math.max(4, energy * (height * 0.85));
      const x = i * barWidth;
      const y = midY - barHeight / 2;

      // Color coding: played vs unplayed
      const barTime = (i / barsCount) * duration;
      if (barTime <= currentTime) {
        ctx.fillStyle = accentColor;
      } else {
        ctx.fillStyle = '#2a3346';
      }

      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }

    // 2. Draw Beatgrid Markers (Techno Kick beats)
    const bpm = track.analysis?.bpm || 140;
    const firstBeat = track.analysis?.firstDownbeat || 0;
    const secondsPerBeat = 60 / bpm;
    const totalBeats = Math.floor(duration / secondsPerBeat);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let b = 0; b < totalBeats; b++) {
      const beatTime = firstBeat + b * secondsPerBeat;
      if (beatTime > duration) break;
      const x = (beatTime / duration) * width;
      const isBarDownbeat = b % 4 === 0;

      if (isBarDownbeat) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillRect(x, 0, 1.5, height);
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(x, midY - 6, 1, 12);
      }
    }

    // 3. Draw Cues (Breakdown, Drop, Outro)
    const cues = track.analysis?.cues;
    if (cues) {
      if (cues.breakdown !== undefined) {
        const x = (cues.breakdown / duration) * width;
        ctx.fillStyle = '#38bdf8'; // Blue for breakdown
        ctx.fillRect(x - 1, 0, 2, height);
      }
      if (cues.drop !== undefined) {
        const x = (cues.drop / duration) * width;
        ctx.fillStyle = '#f43f5e'; // Red/Pink for Drop
        ctx.fillRect(x - 1.5, 0, 3, height);
      }
    }

    // 4. Draw Playhead
    const playheadX = (currentTime / duration) * width;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.shadowBlur = 0; // reset
  }, [track, currentTime, duration, accentColor]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!track || duration <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="relative w-full h-24 bg-[#0a0c10] border border-[#1e2330] rounded-md overflow-hidden cursor-pointer select-none">
      <canvas
        ref={canvasRef}
        width={700}
        height={96}
        className="w-full h-full block"
        onClick={handleClick}
      />
    </div>
  );
};

