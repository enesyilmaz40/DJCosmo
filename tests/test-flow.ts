import { LocalBrain } from '../src/renderer/ai/LocalBrain';
import { Track } from '../src/renderer/types';

console.log('Testing Auto DJ decision logic & flow...');

const testTracks: Track[] = [
  {
    id: 'synth_01',
    filePath: 'synth://synth_01',
    fileName: 'Acid_303.wav',
    title: 'Acid Resonance 303',
    artist: 'DJAI Lab',
    duration: 60,
    format: 'synth',
    analysis: {
      bpm: 140,
      firstDownbeat: 0,
      rmsEnergy: 0.74,
      peakLevel: 0.95,
      energyProfile: [],
      cues: { mixInPoint: 0, mixOutPoint: 46.3 },
      isConfident: true,
      analyzedAt: new Date().toISOString(),
    },
  },
  {
    id: 'synth_02',
    filePath: 'synth://synth_02',
    fileName: 'Industrial_Core.wav',
    title: 'Industrial Core Matrix',
    artist: 'Sub-Zero',
    duration: 65,
    format: 'synth',
    analysis: {
      bpm: 142,
      firstDownbeat: 0,
      rmsEnergy: 0.74,
      peakLevel: 0.95,
      energyProfile: [],
      cues: { mixInPoint: 0, mixOutPoint: 51.3 },
      isConfident: true,
      analyzedAt: new Date().toISOString(),
    },
  },
];

// Test quick command
const decision = LocalBrain.decideNextTrack({
  library: testTracks,
  currentTrack: testTracks[0],
  recentHistory: [testTracks[0].id],
  personality: 'UNDERGROUND',
  quickCommand: 'GO_HARDER',
});

console.log('Decision on GO HARDER:', decision);
if (decision.nextTrackId !== 'synth_02') {
  throw new Error('Expected next track to be synth_02');
}
console.log('✓ Quick command correctly selects next track!');

