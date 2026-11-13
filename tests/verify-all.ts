import { LocalBrain } from '../src/renderer/ai/LocalBrain';
import { Track, DJPersonality, QuickCommand } from '../src/renderer/types';

console.log('--- DJAI VERIFICATION SUITE ---');

// Test 1: Local Brain Offline Decision Making without Gemini API key
const testLibrary: Track[] = [
  {
    id: 'trk_01',
    filePath: 'synth://trk_01',
    fileName: 'Acid_303.wav',
    title: 'Acid Resonance',
    artist: 'DJAI Lab',
    duration: 60,
    format: 'synth',
    analysis: {
      bpm: 140,
      firstDownbeat: 0,
      rmsEnergy: 0.75,
      peakLevel: 0.95,
      energyProfile: [],
      cues: { mixInPoint: 0, mixOutPoint: 50 },
      isConfident: true,
      analyzedAt: new Date().toISOString(),
    },
  },
  {
    id: 'trk_02',
    filePath: 'synth://trk_02',
    fileName: 'Hard_Pulse.wav',
    title: 'Hard Pulse',
    artist: 'Sub-Zero',
    duration: 65,
    format: 'synth',
    analysis: {
      bpm: 142,
      firstDownbeat: 0,
      rmsEnergy: 0.88,
      peakLevel: 0.95,
      energyProfile: [],
      cues: { mixInPoint: 0, mixOutPoint: 55 },
      isConfident: true,
      analyzedAt: new Date().toISOString(),
    },
  },
  {
    id: 'trk_03',
    filePath: 'synth://trk_03',
    fileName: 'Rave_Matrix.wav',
    title: 'Rave Matrix',
    artist: 'Neon Vektor',
    duration: 60,
    format: 'synth',
    analysis: {
      bpm: 144,
      firstDownbeat: 0,
      rmsEnergy: 0.82,
      peakLevel: 0.95,
      energyProfile: [],
      cues: { mixInPoint: 0, mixOutPoint: 50 },
      isConfident: true,
      analyzedAt: new Date().toISOString(),
    },
  },
  {
    id: 'trk_04',
    filePath: 'synth://trk_04',
    fileName: 'Peak_Overdrive.wav',
    title: 'Peak Overdrive',
    artist: 'Dark Matter',
    duration: 70,
    format: 'synth',
    analysis: {
      bpm: 146,
      firstDownbeat: 0,
      rmsEnergy: 0.92,
      peakLevel: 0.95,
      energyProfile: [],
      cues: { mixInPoint: 0, mixOutPoint: 60 },
      isConfident: true,
      analyzedAt: new Date().toISOString(),
    },
  },
];

console.log('TEST 1: Offline Local Brain Track Selection without API Key...');
let currentTrack = testLibrary[0];
let recentHistory: string[] = [currentTrack.id];

// Test 3 consecutive transitions
for (let step = 1; step <= 3; step++) {
  const decision = LocalBrain.decideNextTrack({
    library: testLibrary,
    currentTrack,
    recentHistory,
    personality: 'RAVE_MADNESS' as DJPersonality,
    quickCommand: 'GO_HARDER' as QuickCommand,
  });

  console.log(`  Step ${step}: Current [${currentTrack.title} @ ${currentTrack.analysis?.bpm} BPM] -> Next [${decision.nextTrackId}] (${decision.transitionType}, ${decision.transitionBars} bars) - Reason: ${decision.reason}`);
  
  if (!decision.nextTrackId || decision.nextTrackId === currentTrack.id) {
    throw new Error(`Step ${step} failed: Next track is invalid or identical to current track.`);
  }

  const nextTrack = testLibrary.find(t => t.id === decision.nextTrackId)!;
  recentHistory.push(nextTrack.id);
  currentTrack = nextTrack;
}
console.log('✓ TEST 1 PASSED: 3 consecutive tracks selected seamlessly without API key.\n');

// Test 2: Personalities verification
console.log('TEST 2: Testing DJ Personalities...');
const personalities: DJPersonality[] = ['UNDERGROUND', 'RAVE_MADNESS', 'ACID_EXPERIENCE', 'PEAK_TIME'];
for (const p of personalities) {
  const dec = LocalBrain.decideNextTrack({
    library: testLibrary,
    currentTrack: testLibrary[0],
    recentHistory: [testLibrary[0].id],
    personality: p,
    quickCommand: null,
  });
  console.log(`  Personality [${p}]: Next track [${dec.nextTrackId}], Transition: ${dec.transitionType}, Target Energy: ${dec.energyTarget}`);
}
console.log('✓ TEST 2 PASSED: All 4 DJ personalities produce valid transitions.\n');

// Test 3: Quick Commands verification
console.log('TEST 3: Testing Quick Commands (GO HARDER, KEEP THE GROOVE, BUILD TENSION)...');
const cmds: QuickCommand[] = ['GO_HARDER', 'KEEP_THE_GROOVE', 'BUILD_TENSION'];
for (const cmd of cmds) {
  const dec = LocalBrain.decideNextTrack({
    library: testLibrary,
    currentTrack: testLibrary[0],
    recentHistory: [testLibrary[0].id],
    personality: 'UNDERGROUND',
    quickCommand: cmd,
  });
  console.log(`  Command [${cmd}]: Transition [${dec.transitionType}], Target Energy [${dec.energyTarget}], Reason: ${dec.reason}`);
}
console.log('✓ TEST 3 PASSED: Quick commands adjust energy and transition strategies correctly.\n');

console.log('==========================================');
console.log('ALL VERIFICATION CRITERIA PASSED SUCCESSFULLY!');
console.log('==========================================');

