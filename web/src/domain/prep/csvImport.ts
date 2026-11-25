/** Port of SyllabusCsvImporter.kt. */
import { parseDifficulty, type TopicDifficulty } from "../exams";

export interface ParsedTopicRow { subject: string; unit: string; chapter: string; topicName: string; difficulty: TopicDifficulty }

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseSyllabus(raw: string, defaultSubject: string): ParsedTopicRow[] {
  const fallback = defaultSubject.trim() || "General";
  const rows: ParsedTopicRow[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith("subject,") && lower.includes("topic")) continue;
    const c = splitCsvLine(line);
    if (c.length >= 4) {
      if (c[3]) rows.push({ subject: c[0] || fallback, unit: c[1] || "General Unit", chapter: c[2] || "General Chapter", topicName: c[3], difficulty: parseDifficulty(c[4]) });
    } else if (c.length === 3) {
      if (c[2]) rows.push({ subject: c[0] || fallback, unit: "Core Unit", chapter: c[1] || "General Chapter", topicName: c[2], difficulty: "moderate" });
    } else if (c.length === 2) {
      if (c[1]) rows.push({ subject: c[0] || fallback, unit: "Core Unit", chapter: "Custom Chapter", topicName: c[1], difficulty: "moderate" });
    } else if (c[0]) {
      rows.push({ subject: fallback, unit: "Core Unit", chapter: "Custom Chapter", topicName: c[0], difficulty: "moderate" });
    }
  }
  return rows.map((r) => ({ ...r, subject: r.subject.slice(0, 60), unit: r.unit.slice(0, 80), chapter: r.chapter.slice(0, 80), topicName: r.topicName.slice(0, 120) }));
}
