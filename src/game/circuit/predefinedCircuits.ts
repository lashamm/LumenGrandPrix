import { CIRCUIT } from '../config';
import type { LayoutNode } from './types';

/**
 * Predefined fallback circuits.
 *
 * Each is an explicit node list (angle in degrees around the base
 * circle, radius multiplier). They run through the exact same
 * closed-spline pipeline as generated circuits, so rendering,
 * curvature and lap logic never see a difference. They exist so
 * that a race is always playable even if every random attempt
 * fails validation.
 */

interface PredefinedCircuit {
  name: string;
  nodes: LayoutNode[];
}

const R = CIRCUIT.baseRadiusM;

/** Classic GP layout: long straights, one hairpin, one chicane. */
const LUMEN_LOOP: LayoutNode[] = [
  [0, 1.0],
  [18, 1.1],
  [36, 1.1],
  [62, 1.0],
  [88, 1.16],
  [118, 1.28],
  [148, 1.13],
  [176, 1.0],
  [192, 1.3],
  [206, 1.5],
  [220, 1.5],
  [234, 1.28],
  [262, 1.0],
  [274, 1.12],
  [286, 0.94],
  [298, 1.1],
  [310, 0.97],
  [330, 1.08],
  [346, 1.08],
].map(([angle, multiplier]) => ({ angle, radius: R * multiplier }));

/** Technical park: two hairpins, two chicanes, an S-bend. */
const KEIRIN_PARK: LayoutNode[] = [
  [0, 1.0],
  [14, 1.08],
  [28, 1.08],
  [40, 1.0],
  [50, 1.28],
  [60, 1.45],
  [70, 1.45],
  [80, 1.26],
  [92, 1.0],
  [100, 1.13],
  [108, 0.93],
  [116, 1.12],
  [124, 0.96],
  [136, 1.0],
  [146, 1.14],
  [156, 1.0],
  [166, 0.88],
  [178, 1.0],
  [190, 1.3],
  [204, 1.48],
  [218, 1.48],
  [232, 1.28],
  [252, 1.0],
  [262, 1.12],
  [272, 0.94],
  [282, 1.1],
  [292, 0.97],
  [308, 1.0],
  [322, 1.15],
  [336, 1.15],
  [350, 1.02],
].map(([angle, multiplier]) => ({ angle, radius: R * multiplier }));

/** Fast speedway: sweeping corners, no tight turns. */
const SOLANA_SPEEDWAY: LayoutNode[] = [
  [0, 1.0],
  [30, 1.02],
  [60, 1.12],
  [95, 1.22],
  [130, 1.24],
  [165, 1.1],
  [195, 1.0],
  [225, 1.13],
  [260, 1.2],
  [295, 1.12],
  [325, 1.02],
  [350, 1.0],
].map(([angle, multiplier]) => ({ angle, radius: R * multiplier }));

export const PREDEFINED_CIRCUITS: readonly PredefinedCircuit[] = [
  { name: 'LUMEN LOOP', nodes: LUMEN_LOOP },
  { name: 'KEIRIN PARK', nodes: KEIRIN_PARK },
  { name: 'SOLANA SPEEDWAY', nodes: SOLANA_SPEEDWAY },
];
