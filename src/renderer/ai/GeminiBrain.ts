import { Track, DJPersonality, QuickCommand, AIDecision, TransitionType } from '../types';
import { LocalBrain } from './LocalBrain';

export class GeminiBrain {
  /**
   * Prompts Gemini AI to make intelligent DJ track selection and transition decisions
   */
  public static async decideNextTrack(params: {
    apiKey: string;
    library: Track[];
    currentTrack: Track | null;
    otherLoadedTrack?: Track | null;
    recentHistory: string[];
    personality: DJPersonality;
    quickCommand: QuickCommand;
    masterBpm?: number;
  }): Promise<AIDecision> {
    const { apiKey, library, currentTrack, otherLoadedTrack, recentHistory, personality, quickCommand } = params;
    const fallback = () =>
      LocalBrain.decideNextTrack({
        library,
        currentTrack,
        otherLoadedTrack,
        recentHistory,
        personality,
        quickCommand,
        masterBpm: params.masterBpm,
      });

    // If no API key or empty library, immediately use local fallback
    if (!apiKey || apiKey.trim() === '' || library.length === 0) {
      return fallback();
    }

    try {
      // Prepare compact metadata payload (NO audio files sent)
      const currentInfo = currentTrack
        ? {
            id: currentTrack.id,
            title: currentTrack.title,
            artist: currentTrack.artist,
            bpm: currentTrack.analysis?.bpm || 140,
            energy: currentTrack.analysis?.rmsEnergy || 0.7,
            key: currentTrack.analysis?.camelotKey,
            duration: currentTrack.duration,
          }
        : null;

      // Only musically compatible tracks are offered: the local ranker already scored tempo,
      // pitch-shifted key and energy, Gemini picks among the best 8 for the set's story.
      const profile = LocalBrain.personalityProfile(personality, quickCommand, currentTrack?.analysis?.rmsEnergy || 0.7);
      const ranked = LocalBrain.rankCandidates({
        candidates: LocalBrain.filterCandidates({ library, currentTrack, otherLoadedTrack, recentHistory }),
        currentTrack,
        masterBpm: params.masterBpm,
        targetEnergy: profile.targetEnergy,
      }).slice(0, 8);

      const candidates = ranked.map(r => ({
        id: r.track.id,
        title: r.track.title,
        artist: r.track.artist,
        bpm: r.track.analysis?.bpm || 140,
        energy: r.track.analysis?.rmsEnergy || 0.7,
        key: r.track.analysis?.camelotKey,
        keyDistanceAfterPitch: r.keyDistance,
        tempoDiffPercent: Math.round(r.bpmDiffPct * 10) / 10,
        compatibilityRank: ranked.indexOf(r) + 1,
        duration: Math.round(r.track.duration),
      }));

      if (candidates.length === 0) {
        return fallback();
      }

      const prompt = `You are DJAI, a world-renowned Autonomous Techno DJ performing a live set.
Your style: Acid Techno, Hard Techno, Underground Rave, Industrial Techno.

Current Personality: ${personality}
${
  personality === 'UNDERGROUND'
    ? 'Dark Acid Techno, hypnotic and extended 32-bar transitions, deep driving energy.'
    : personality === 'RAVE_MADNESS'
    ? 'Hard Techno, high energy, aggressive 16-bar bass swaps and punchy kicks.'
    : personality === 'ACID_EXPERIENCE'
    ? 'Resonant 303 acid lines, progressive filter builds and sweeping transitions.'
    : 'Peak Time: maximum festival energy, drop-oriented mixing, high dancefloor pressure.'
}

Live Crowd Quick Command: ${quickCommand || 'None (Maintain musical flow)'}
Currently Playing: ${JSON.stringify(currentInfo)}
Recent History IDs: ${JSON.stringify(recentHistory)}
Available Candidate Tracks:
${JSON.stringify(candidates, null, 2)}

TASK: Select the optimal next track and transition technique.
Candidates are pre-filtered for tempo and harmonic (Camelot key, after pitch shift) compatibility.
Strongly prefer a low compatibilityRank / keyDistanceAfterPitch <= 1 unless the set's energy story clearly needs otherwise.
Allowed transitionTypes: "bass_swap", "16_bar", "32_bar", "filter_transition", "smooth_crossfade"
Allowed transitionBars: 16, 32

Respond with ONLY a raw valid JSON object in this exact schema (no markdown, no backticks):
{
  "nextTrackId": "<id of candidate track>",
  "transitionType": "bass_swap",
  "transitionBars": 16,
  "energyTarget": 0.85,
  "reason": "Detailed DJ explanation"
}`;

      // Gemini 2.5 Flash / Flash Lite model endpoint
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey.trim()
      )}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        console.warn(`Gemini API HTTP ${response.status}, falling back to local brain`);
        return fallback();
      }

      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      // Parse JSON
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      // Validate selected track ID exists in library
      const matchedTrack = ranked.map(r => r.track).find(t => t.id === parsed.nextTrackId);
      if (!matchedTrack) {
        console.warn('Gemini returned unknown track ID, falling back to local brain');
        return fallback();
      }

      const validTransitions: TransitionType[] = [
        'bass_swap',
        '16_bar',
        '32_bar',
        'filter_transition',
        'smooth_crossfade',
      ];
      const transitionType: TransitionType = validTransitions.includes(parsed.transitionType)
        ? parsed.transitionType
        : 'bass_swap';

      const pick = ranked.find(r => r.track.id === matchedTrack.id);
      const adapted = LocalBrain.adaptTransition(
        transitionType,
        parsed.transitionBars === 32 ? 32 : 16,
        currentTrack,
        matchedTrack,
        pick ? pick.keyDistance : null,
        pick ? pick.bpmDiffPct : 0
      );

      return {
        nextTrackId: matchedTrack.id,
        transitionType: adapted.transition,
        transitionBars: adapted.bars,
        energyTarget: typeof parsed.energyTarget === 'number' ? parsed.energyTarget : 0.8,
        reason: parsed.reason || 'Gemini AI techno flow match',
        source: 'gemini',
        timestamp: Date.now(),
      };
    } catch (err) {
      console.warn('Gemini call failed or timed out:', err);
      // Safe fallback: never stop the music!
      return fallback();
    }
  }
}

