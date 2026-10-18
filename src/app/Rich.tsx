/**
 * Hebrew text with formal bits inside ("מעל {a,b,c}", "L = { aⁿbᵐ | ... }", "acb"): every formal run is isolated
 * left to right, so braces and symbols are never mirrored or reordered (spec 2: formulas LTR inside RTL text).
 */
const FORMAL = /(L\s*=\s*\{[^}]*\}|\{[^}]*\}|\[[^\]]*\]|[A-Za-z0-9][A-Za-z0-9ⁿᵐ,()₪%+=≥|]*)/gu;

export function Rich({ text }: { text: string }) {
  const parts = text.split(FORMAL);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <bdi key={i} dir="ltr" class="formal-run">{p}</bdi> : p))}</>;
}
