// A sign's design and what a franchisee may change in it (SPEC v2.6 §8).
// Pure: the Studio screens use it to show limits, and the server uses it to
// re-check a franchisee's design at submission — the browser decides nothing.

import { attributeLabel } from '../catalog/labels';

export interface SignDesign {
  /** The brand's logo in our storage. */
  logo: { path: string; fileName: string; contentType: string };
  /** Engine option values by field name (mounting_type, paint_finish, …). */
  options: Record<string, string>;
  dimension: { axis: 'height' | 'width'; inches: number };
  depthInches: number | null;
  /** Filled by the server when the design is priced; never cost, only our price. */
  mockupPath?: string | null;
  price?: number | null;
  turnaroundDays?: number | null;
  widthInches?: number | null;
  heightInches?: number | null;
  pricedAt?: string | null;
  /** The engine's side view, copied into our storage. */
  sideViewPath?: string | null;
  materials?: string[];
  mounting?: string | null;
}

export type DesignRule =
  | { mode: 'locked' }
  | { mode: 'choices'; values: string[] }
  | { mode: 'range'; min: number; max: number };

/** Keyed by option name, plus `size` (the given dimension) and `depth`. Unlisted means locked. */
export type DesignRules = Record<string, DesignRule>;

export const SIZE = 'size';
export const DEPTH = 'depth';

/**
 * What a new design starts with: every option locked (the brand control the
 * program exists for), and the size adjustable a quarter either way so a
 * franchisee can fit their frontage without a review.
 */
export function defaultRules(design: SignDesign): DesignRules {
  const inches = design.dimension.inches;
  return {
    [SIZE]: { mode: 'range', min: roundInches(inches * 0.75), max: roundInches(inches * 1.25) },
  };
}

function roundInches(value: number): number {
  return Math.round(value * 4) / 4;
}

export function ruleFor(rules: DesignRules, setting: string): DesignRule {
  return rules[setting] ?? { mode: 'locked' };
}

/**
 * Every way `proposed` departs from the brand's design beyond what the rules
 * allow, worded for corporate. Empty means the design is within its limits
 * and keeps its approval route (§7); anything listed makes it an exception.
 */
export function breaches(base: SignDesign, rules: DesignRules, proposed: SignDesign): string[] {
  const found: string[] = [];

  if (proposed.logo.path !== base.logo.path) found.push('The logo was changed.');

  const optionNames = new Set([...Object.keys(base.options), ...Object.keys(proposed.options)]);
  for (const name of optionNames) {
    const from = base.options[name];
    const to = proposed.options[name];
    if (to === from) continue;
    const rule = ruleFor(rules, name);
    if (rule.mode === 'choices' && to !== undefined && rule.values.includes(to)) continue;
    found.push(`${label(name)} changed from ${from ?? 'none'} to ${to ?? 'none'}.`);
  }

  const sizeRule = ruleFor(rules, SIZE);
  if (proposed.dimension.axis !== base.dimension.axis) {
    found.push(`Sized by ${proposed.dimension.axis} instead of ${base.dimension.axis}.`);
  } else if (proposed.dimension.inches !== base.dimension.inches && !within(sizeRule, proposed.dimension.inches)) {
    found.push(`${capital(base.dimension.axis)} ${proposed.dimension.inches}" is outside ${limits(sizeRule, base.dimension.inches)}.`);
  }

  const depthRule = ruleFor(rules, DEPTH);
  if (proposed.depthInches !== base.depthInches && !(proposed.depthInches !== null && within(depthRule, proposed.depthInches))) {
    found.push(`Depth ${proposed.depthInches ?? 'none'}" is outside ${limits(depthRule, base.depthInches)}.`);
  }

  return found;
}

function within(rule: DesignRule, value: number): boolean {
  return rule.mode === 'range' && value >= rule.min && value <= rule.max;
}

function limits(rule: DesignRule, base: number | null): string {
  return rule.mode === 'range' ? `${rule.min}–${rule.max}"` : `the brand's ${base ?? 'none'}"`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "paint_finish" → "Paint finish", "ul_mandatory" → "UL mandatory". */
export const label = attributeLabel;

/**
 * A design's spec line, as people read it: the size, then each chosen option
 * that says something on its own — a yes/no flag only when it is yes, and no
 * bare numbers (raceway and cabinet sizes are in the design, not the line).
 */
export function designSummary(design: SignDesign): string {
  const parts = [`${design.dimension.inches}" ${design.dimension.axis === 'height' ? 'high' : 'wide'}`];
  for (const [name, value] of Object.entries(design.options)) {
    if (/^no$/i.test(value) || /^[\d.]+$/.test(value)) continue;
    parts.push(/^yes$/i.test(value) ? (name === 'ul_mandatory' ? 'UL listed' : label(name)) : value);
  }
  return parts.join(' · ');
}

/** Check a rules object from the browser before it is stored. */
export function validRules(raw: unknown, design: SignDesign): DesignRules {
  if (!raw || typeof raw !== 'object') return {};
  const rules: DesignRules = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const rule = value as Partial<{ mode: string; values: unknown; min: unknown; max: unknown }>;
    if (rule?.mode === 'choices' && Array.isArray(rule.values)) {
      const values = rule.values.filter((v): v is string => typeof v === 'string');
      const current = design.options[name];
      if (current !== undefined && !values.includes(current)) values.unshift(current);
      if (values.length > 1) rules[name] = { mode: 'choices', values };
    } else if (rule?.mode === 'range') {
      const min = Number(rule.min);
      const max = Number(rule.max);
      const current = name === DEPTH ? design.depthInches : design.dimension.inches;
      if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && min <= max && current !== null && min <= current && current <= max) {
        rules[name] = { mode: 'range', min, max };
      } else {
        throw new RangeError(`${name === DEPTH ? 'Depth' : 'Size'} limits must include the design's own value.`);
      }
    }
  }
  return rules;
}
