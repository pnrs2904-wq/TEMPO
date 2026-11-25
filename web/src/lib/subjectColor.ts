/**
 * Stable colour per subject, so a subject looks the same on the ring, in charts and in lists.
 * Slots come from a categorical palette validated for colour-blind separation in light and dark
 * mode (see globals.css --s1..--s8). Colour follows the subject's position in the student's own
 * list, never its rank in a chart. Subjects past the seventh share the eighth slot, and every
 * place that uses colour also prints the subject's name.
 */
export function subjectColor(subject: string, known: string[] = []): string {
  const key = subject.trim().toLowerCase();
  if (!key) return "var(--muted)";
  const idx = known.findIndex((k) => k.trim().toLowerCase() === key);
  return `var(--s${idx < 0 ? 8 : Math.min(idx, 7) + 1})`;
}
