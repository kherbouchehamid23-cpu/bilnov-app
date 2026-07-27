// Extraction des mentions @ dans un texte (SFD §8). Fonction PURE, testable.
export function extractMentions(text: string): string[] {
  if (!text) return [];
  const re = /(?:^|[^\w@])@([A-Za-z0-9_.\-]{2,40})/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return [...new Set(out)];
}
