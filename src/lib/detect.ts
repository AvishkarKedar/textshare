/**
 * Lightweight language detector. Sniffs code patterns to guess the language.
 * Not a full parser — just enough to prompt "switch to detected language?"
 */

export interface DetectionResult {
  language: string;
  label: string;
  confidence: number; // 0-1
}

const PATTERNS: { lang: string; label: string; regex: RegExp; weight: number }[] = [
  // JavaScript / TypeScript
  { lang: "javascript", label: "JavaScript", regex: /\b(function|const|let|var|=>|console\.log|require\(|module\.exports)\b/, weight: 0.7 },
  { lang: "typescript", label: "TypeScript", regex: /\b(interface\s+\w+|:\s*(string|number|boolean|any|void)\b|as\s+\w+|<\w+>)/, weight: 0.8 },
  // Python
  { lang: "python", label: "Python", regex: /\b(def\s+\w+\(|import\s+\w+|from\s+\w+\s+import|print\(|if __name__|elif|self\.)/, weight: 0.8 },
  // Go
  { lang: "go", label: "Go", regex: /\b(func\s+\w+|package\s+\w+|import\s+\(|fmt\.Println)/, weight: 0.85 },
  // Rust
  { lang: "rust", label: "Rust", regex: /\b(fn\s+\w+|let mut|impl\s+\w+|pub\s+fn|use\s+std::)/, weight: 0.85 },
  // Java
  { lang: "java", label: "Java", regex: /\b(public\s+class|public\s+static\s+void\s+main|System\.out\.println|import\s+java\.)/, weight: 0.85 },
  // C / C++
  { lang: "c", label: "C/C++", regex: /#\s*include\s*<|#include.*\.h|printf\s*\(|int\s+main\s*\(/, weight: 0.75 },
  // Ruby
  { lang: "ruby", label: "Ruby", regex: /\b(def\s+\w+|puts\s|require\s+['"]|end\s*$|do\s*\|)/, weight: 0.8 },
  // Shell / Bash
  { lang: "bash", label: "Bash", regex: /^#!\/(bin\/(bash|sh)|usr\/bin\/env)|\becho\s+-e|\bif\s*\[|\bthen\s*$/m, weight: 0.7 },
  // HTML
  { lang: "html", label: "HTML", regex: /<!doctype\s+html|<html|<head|<body|<\/div>/i, weight: 0.9 },
  // CSS
  { lang: "css", label: "CSS", regex: /\.\w+\s*\{|\#[a-f0-9]{3,8}\b|@media|@import/, weight: 0.7 },
  // JSON
  { lang: "json", label: "JSON", regex: /^\s*[\[{]\s*$|":\s*[\[{"]|,(\s*)"[\w]+"/m, weight: 0.75 },
  // Markdown
  { lang: "markdown", label: "Markdown", regex: /^#{1,6}\s+\S|^>\s|^\s*[-*]\s+\S/m, weight: 0.7 },
  // YAML
  { lang: "yaml", label: "YAML", regex: /^\s*\w+:\s/m, weight: 0.6 },
];

export function detectLanguage(source: string): DetectionResult {
  if (!source || source.trim().length < 5) {
    return { language: "text", label: "Text", confidence: 0 };
  }
  const scores: Record<string, number> = {};
  for (const p of PATTERNS) {
    const m = source.match(p.regex);
    if (m) {
      scores[p.lang] = (scores[p.lang] || 0) + p.weight;
    }
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    return { language: "text", label: "Text", confidence: 0 };
  }
  const [lang, score] = sorted[0];
  const meta = PATTERNS.find((p) => p.lang === lang)!;
  return { language: lang, label: meta.label, confidence: Math.min(1, score) };
}

/** Map a detected language to a file extension for the "switch" suggestion. */
export function langToExt(lang: string): string {
  const map: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    python: "py",
    go: "go",
    rust: "rs",
    java: "java",
    c: "c",
    ruby: "rb",
    bash: "sh",
    html: "html",
    css: "css",
    json: "json",
    markdown: "md",
    yaml: "yaml",
    text: "txt",
  };
  return map[lang] || "txt";
}
