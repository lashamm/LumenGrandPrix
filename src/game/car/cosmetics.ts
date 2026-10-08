import type { BodyType, HexColor } from '../types';

/**
 * Small shared helpers for car presentation.
 *
 * The player's car itself lives in `customization.ts`; this module only holds
 * facts that more than one screen needs to agree on — how a body type is
 * spelled, and what counts as a colour.
 */

export const BODY_TYPE_LABEL: Record<BodyType, string> = {
  coupe: 'COUPE',
  sedan: 'SEDAN',
  hatchback: 'HATCHBACK',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && HEX.test(value);
}
