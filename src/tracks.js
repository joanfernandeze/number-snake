// One track per board (spec 2026-10-03 §3), as data. A track is a root (MIDI note), a scale
// (semitones from the root), a waveform per voice and four 16-step patterns. A pattern step is a
// scale degree — 0 the root, scale.length the root an octave up, negatives below — or null for a
// rest; the hat pattern is 0/1. Endless and the Daily play on the open board, so they play `open`.

const SCALES = {
  majorPent: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

const _ = null;

export const TRACKS = {
  // Bright and plain: the board most players see first.
  open: {
    root: 60, scale: SCALES.majorPent, waves: { bass: 'triangle', arp: 'square', lead: 'sine' },
    bass: [0, _, _, _, 0, _, 3, _, 2, _, _, _, 2, _, 4, _],
    arp:  [0, 2, 3, 5, 0, 2, 3, 5, 2, 3, 5, 7, 2, 3, 5, 7],
    lead: [5, _, _, 7, _, _, 6, _, 5, _, _, _, 3, _, _, _],
    hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  // Open and floating: long bass notes, the raised fourth in the arpeggio.
  pillars: {
    root: 65, scale: SCALES.lydian, waves: { bass: 'triangle', arp: 'triangle', lead: 'sine' },
    bass: [0, _, _, _, _, _, _, _, 4, _, _, _, _, _, _, _],
    arp:  [0, 2, 4, 7, 3, 4, 7, 9, 0, 2, 4, 7, 3, 4, 7, 9],
    lead: [_, _, 0, _, 2, _, 3, _, 2, _, _, _, 0, _, _, _],
    hat:  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  // A driving bass for the long corridors.
  lanes: {
    root: 62, scale: SCALES.dorian, waves: { bass: 'sawtooth', arp: 'square', lead: 'triangle' },
    bass: [0, 0, _, 0, 0, _, 0, _, 3, 3, _, 3, 4, _, 4, _],
    arp:  [0, 2, 4, 2, 0, 2, 4, 5, 3, 5, 7, 5, 4, 6, 8, 6],
    lead: [7, _, _, _, 9, _, 8, _, 10, _, _, 9, 7, _, _, _],
    hat:  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1],
  },
  // Serious: minor, slow-moving bass.
  chambers: {
    root: 57, scale: SCALES.minor, waves: { bass: 'triangle', arp: 'square', lead: 'sine' },
    bass: [0, _, _, _, 0, _, _, _, 5, _, _, _, 4, _, _, _],
    arp:  [0, 2, 4, 2, 0, 2, 4, 2, 5, 7, 9, 7, 4, 6, 8, 6],
    lead: [7, _, _, _, _, _, 6, _, 5, _, _, _, 4, _, _, _],
    hat:  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
  },
  // Tense: the flat second leaning on the root.
  ring: {
    root: 64, scale: SCALES.phrygian, waves: { bass: 'sawtooth', arp: 'square', lead: 'triangle' },
    bass: [0, _, 1, _, 0, _, 1, _, 0, _, 1, _, 0, _, -1, _],
    arp:  [0, 1, 4, 1, 0, 1, 4, 1, 0, 1, 4, 6, 7, 6, 4, 1],
    lead: [7, _, 8, _, _, _, 7, _, _, _, _, _, 6, _, 5, _],
    hat:  [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
  },
  // Playful: the gates open act.
  door: {
    root: 55, scale: SCALES.mixolydian, waves: { bass: 'triangle', arp: 'square', lead: 'triangle' },
    bass: [0, _, _, 4, _, _, 0, _, 6, _, _, 3, _, _, 4, _],
    arp:  [0, 4, 7, 4, 3, 4, 7, 4, 6, 8, 10, 8, 4, 7, 9, 7],
    lead: [_, 7, _, 9, 10, _, 9, _, _, 7, _, 6, 7, _, _, _],
    hat:  [1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0],
  },
  // Syncopated: off-beat arpeggio and hats, a different root and rhythm from the lanes.
  locks: {
    root: 59, scale: SCALES.dorian, waves: { bass: 'triangle', arp: 'square', lead: 'sine' },
    bass: [0, _, _, 0, _, _, 0, _, _, 3, _, _, 4, _, _, _],
    arp:  [_, 2, 4, _, 2, 4, _, 7, _, 5, 7, _, 5, 7, _, 9],
    lead: [7, _, _, 8, _, 9, _, _, 10, _, _, 9, _, 7, _, _],
    hat:  [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
  },
  // Question and answer: the lead climbs, then comes back down.
  halves: {
    root: 62, scale: SCALES.major, waves: { bass: 'triangle', arp: 'square', lead: 'triangle' },
    bass: [0, _, _, _, 4, _, _, _, 5, _, _, _, 4, _, _, _],
    arp:  [0, 2, 4, 2, 4, 6, 4, 2, 5, 7, 9, 7, 4, 7, 8, 7],
    lead: [7, _, 8, _, 9, _, _, _, 9, _, 8, _, 7, _, _, _],
    hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  // Mysterious: melodic minor, sparse lead.
  rooms: {
    root: 58, scale: SCALES.melodicMinor, waves: { bass: 'triangle', arp: 'triangle', lead: 'sine' },
    bass: [0, _, _, _, _, _, _, _, 3, _, _, _, 4, _, _, _],
    arp:  [0, 2, 6, 2, 4, 6, 9, 6, 3, 5, 7, 5, 4, 6, 8, 6],
    lead: [_, _, 9, _, _, _, 6, _, _, _, 8, _, 7, _, _, _],
    hat:  [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
  },
  // The finale: harmonic minor, the busiest track.
  vault: {
    root: 60, scale: SCALES.harmonicMinor, waves: { bass: 'sawtooth', arp: 'square', lead: 'triangle' },
    bass: [0, _, 0, _, 0, _, 0, _, 5, _, 5, _, 4, _, 4, _],
    arp:  [0, 2, 4, 6, 4, 2, 0, 2, 5, 7, 9, 7, 4, 6, 8, 10],
    lead: [7, _, _, 8, 9, _, _, _, 10, _, 9, _, 6, _, 7, _],
    hat:  [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
  },
};

// The track a board plays; anything unknown plays the open board's.
export function trackFor(boardKey) {
  return TRACKS[boardKey] || TRACKS.open;
}
