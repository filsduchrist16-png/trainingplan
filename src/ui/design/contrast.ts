/** Ratio de contraste WCAG 2.x entre deux couleurs hexadécimales (#rrggbb). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Couleur invalide: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Extrait les variables `--nom: #hex` d'un bloc CSS dont le sélecteur contient `selector`. */
export function readTokens(css: string, selector: string): Record<string, string> {
  const block = css.split('}').find((chunk) => chunk.split('{')[0]?.includes(selector));
  if (!block) throw new Error(`Bloc introuvable: ${selector}`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) tokens[name!] = value!;
  return tokens;
}
