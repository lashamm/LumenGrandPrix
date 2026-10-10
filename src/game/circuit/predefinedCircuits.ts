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
  [16, 1.04],
  [32, 1.04],
  [60, 1.0],
  [80, 1.08],
  [104, 1.16],
  [128, 1.12],
  [152, 1.0],
  [176, 0.98],
  [196, 0.82],
  [212, 0.8],
  [234, 0.94],
  [258, 1.06],
  [280, 1.12],
  [300, 1.02],
  [318, 0.96],
  [334, 1.04],
  [350, 1.02],
].map(([angle, multiplier]) => ({ angle, radius: R * multiplier }));

/** Technical park: two hairpins, two chicanes, an S-bend. */
const KEIRIN_PARK: LayoutNode[] = [
  [0, 1.0],
  [14, 1.05],
  [30, 1.05],
  [46, 1.0],
  [60, 0.9],
  [74, 0.87],
  [90, 0.9],
  [106, 1.0],
  [118, 1.05],
  [130, 0.98],
  [142, 1.05],
  [154, 0.98],
  [170, 1.0],
  [186, 0.98],
  [200, 0.87],
  [216, 0.87],
  [232, 0.98],
  [250, 1.04],
  [266, 0.96],
  [282, 1.04],
  [298, 0.96],
  [318, 1.02],
  [338, 1.04],
  [352, 1.0],
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
