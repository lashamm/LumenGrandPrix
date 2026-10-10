import { buildCircuitFromPath } from './circuitGenerator';
import { generateCircuit } from './circuitGenerator';
import type { Circuit } from './types';

/**
 * The handcrafted course layouts.
 *
 * Each layout is an explicit list of `[x, y]` centreline control points in
 * metres, in lap order — a real circuit shape, not a radial profile. The
 * points are threaded by a closed centripetal Catmull-Rom spline
 * (`buildCircuitFromPath`) and then run through the exact same resample and
 * finish pipeline as a generated circuit, so rendering, curvature, physics
 * and the AI never see a difference. Because the shape is fixed, the preview
 * on the selection card is always the real, playable track.
 *
 * The start/finish sample is control point zero, placed mid-straight so the
 * grid launches onto a clean straight instead of out of a corner.
 */

export type TrackPoint = readonly [number, number];

type HandcraftedTrack = {
  id: string;
  name: string;
  /** Short marketing line for the selection card. */
  tagline: string;
  /** Longer description shown under the preview. */
  description: string;
  /** 1 = easiest, 3 = hardest. */
  difficulty: 1 | 2 | 3;
  /** Closed centreline control points, metres, in lap order. */
  points: readonly TrackPoint[];
};

/**
 * KURA RING — a long lap built around a technical inner loop: a flat-out
 * opening straight, a wide outer sweep and a tucked-in infield section that
 * forces two clean direction changes per lap.
 */
const KURA_RING: readonly TrackPoint[] = [
  [-447, -206],
  [-352, -206],
  [-257, -202],
  [-162, -202],
  [-71, -185],
  [-55, -95],
  [-35, -7],
  [55, 20],
  [115, -41],
  [175, -96],
  [260, -56],
  [354, -48],
  [417, 17],
  [422, 111],
  [513, 117],
  [506, 202],
  [414, 193],
  [334, 202],
  [300, 150],
  [249, 124],
  [197, 112],
  [103, 103],
  [9, 96],
  [-81, 115],
  [-128, 184],
  [-190, 126],
  [-199, 32],
  [-199, -63],
  [-232, -138],
  [-312, -121],
  [-343, -51],
  [-421, -29],
  [-467, -31],
  [-471, -126],
];

/**
 * AURELIA CIRCUIT — all flow, no hairpins. A chain of linked fast sweeps and
 * esses wrapped around a tucked inner line, so the car is almost never
 * straight and rhythm is everything.
 */
const AURELIA_CIRCUIT: readonly TrackPoint[] = [
  [-432, -287],
  [-345, -294],
  [-256, -285],
  [-167, -276],
  [-79, -263],
  [-26, -197],
  [-7, -110],
  [64, -64],
  [153, -61],
  [242, -52],
  [305, 6],
  [357, 75],
  [444, 92],
  [532, 109],
  [545, 169],
  [457, 176],
  [367, 172],
  [279, 179],
  [206, 187],
  [118, 179],
  [29, 172],
  [-61, 169],
  [-150, 166],
  [-234, 139],
  [-233, 74],
  [-144, 74],
  [-55, 75],
  [-41, 21],
  [-129, 10],
  [-218, 7],
  [-307, -1],
  [-388, -35],
  [-412, -118],
  [-412, -207],
];

/**
 * MERIDIAN PARK — the most technical lap of the roster: a dense, knitted
 * infield of linked corners and a pair of slow hairpins. Momentum and a clean
 * line are everything; one mistake costs three corners.
 */
const MERIDIAN_PARK: readonly TrackPoint[] = [
  [63, -410],
  [102, -388],
  [117, -345],
  [129, -300],
  [169, -280],
  [216, -274],
  [258, -256],
  [283, -217],
  [259, -183],
  [227, -150],
  [243, -109],
  [283, -84],
  [321, -57],
  [342, -16],
  [353, 29],
  [355, 76],
  [342, 117],
  [295, 119],
  [253, 102],
  [218, 73],
  [187, 104],
  [210, 141],
  [248, 167],
  [272, 206],
  [264, 251],
  [225, 274],
  [180, 266],
  [155, 227],
  [119, 205],
  [93, 240],
  [94, 287],
  [83, 330],
  [40, 333],
  [29, 289],
  [12, 258],
  [-34, 263],
  [-63, 265],
  [-110, 265],
  [-157, 267],
  [-204, 263],
  [-249, 253],
  [-292, 234],
  [-332, 210],
  [-369, 182],
  [-399, 146],
  [-425, 107],
  [-443, 64],
  [-447, 18],
  [-429, -22],
  [-390, -45],
  [-377, -90],
  [-370, -136],
  [-365, -182],
  [-352, -227],
  [-317, -254],
  [-271, -249],
  [-226, -246],
  [-186, -270],
  [-143, -285],
  [-96, -284],
  [-49, -282],
  [-4, -291],
  [23, -328],
  [38, -372],
];

/**
 * KESTREL VALLEY — the club-day introduction: one long, flat-out right-hand
 * side and a single broad hairpin-free corner complex. Wide, forgiving and
 * easy to read, with room to learn the throttle before the technical tracks.
 */
const KESTREL_VALLEY: readonly TrackPoint[] = [
  [-353, -362],
  [-172, -345],
  [-28, -275],
  [155, -269],
  [272, -176],
  [333, -21],
  [335, 110],
  [357, 271],
  [323, 279],
  [165, 256],
  [101, 261],
  [-82, 248],
  [-263, 226],
  [-345, 94],
  [-372, -68],
  [-425, -227],
];

export const HANDCRAFTED_TRACKS: readonly HandcraftedTrack[] = [
  {
    id: 'kestrel',
    name: 'KESTREL VALLEY',
    tagline: 'A friendly first lap.',
    description:
      'Wide, forgiving corners, one long flat-out side and gentle radius changes. Learn the circuit feel here before the technical tracks.',
    difficulty: 1,
    points: KESTREL_VALLEY,
  },
  {
    id: 'aurelia',
    name: 'AURELIA CIRCUIT',
    tagline: 'Ride the sweepers.',
    description:
      'All flow, no hairpins: a chain of linked fast sweeps and esses with a tucked-in inner section where the car is almost never straight.',
    difficulty: 2,
    points: AURELIA_CIRCUIT,
  },
  {
    id: 'kura',
    name: 'KURA RING',
    tagline: 'Long lap, deep infield.',
    description:
      'A long lap built around a technical inner loop: a flat-out opening straight, a wide outer sweep and a tucked infield that forces two clean direction changes.',
    difficulty: 2,
    points: KURA_RING,
  },
  {
    id: 'meridian',
    name: 'MERIDIAN PARK',
    tagline: 'Stop, turn, repeat.',
    description:
      'A dense, knitted infield of linked corners and a pair of slow hairpins. Momentum and a clean line are everything; one mistake costs three corners.',
    difficulty: 3,
    points: MERIDIAN_PARK,
  },
];

export const HANDCRAFTED_TRACK_IDS: readonly string[] = HANDCRAFTED_TRACKS.map((track) => track.id);

const CIRCUIT_CACHE = new Map<string, Circuit>();

/** Builds (and caches) the circuit for a handcrafted track id. */
export function buildHandcraftedCircuit(id: string): Circuit | null {
  const cached = CIRCUIT_CACHE.get(id);
  if (cached) return cached;
  const track = HANDCRAFTED_TRACKS.find((entry) => entry.id === id);
  if (!track) return null;
  const built = buildCircuitFromPath(track.points, track.name);
  if (!built) return null;
  const circuit = { ...built, name: track.name, seed: 0 };
  CIRCUIT_CACHE.set(id, circuit);
  return circuit;
}

/** Resolves the race circuit from a setup: handcrafted id first, then random seed. */
export function resolveCircuit(id: string | null, seed: number): Circuit {
  if (id) {
    const handcrafted = buildHandcraftedCircuit(id);
    if (handcrafted) return handcrafted;
  }
  return generateCircuit(seed);
}
