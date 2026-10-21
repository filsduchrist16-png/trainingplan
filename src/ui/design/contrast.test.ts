import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readTokens } from './contrast';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const AA_TEXT = 4.5;
const AA_LARGE_OR_UI = 3;

describe.each([
  ['sombre', "[data-theme='dark']"],
  ['clair', "[data-theme='light']"],
])('thème %s', (_name, selector) => {
  const t = readTokens(css, selector);

  it.each(['bg', 'surface', 'surface-2'])('texte principal et secondaire lisibles sur --%s (AA)', (bg) => {
    expect(contrastRatio(t.text!, t[bg]!)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(t['text-muted']!, t[bg]!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(['accent', 'ok', 'warn', 'danger'])('--%s lisible comme texte sur fond et surface (AA)', (c) => {
    expect(contrastRatio(t[c]!, t.bg!)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(t[c]!, t.surface!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('texte sur bouton accent (AA)', () => {
    expect(contrastRatio(t['accent-ink']!, t.accent!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(['z1', 'z2', 'z3', 'z4', 'z5'])('couleur de zone --%s visible comme élément graphique', (z) => {
    expect(contrastRatio(t[z]!, t.surface!)).toBeGreaterThanOrEqual(AA_LARGE_OR_UI);
  });
});
