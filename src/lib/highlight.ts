import type { SyntaxToken } from "@/lib/store";

const JS_KEYWORDS = new Set([
  "function", "const", "let", "var", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "class", "extends",
  "super", "this", "typeof", "instanceof", "in", "of", "delete", "void",
  "await", "async", "yield", "import", "export", "from", "default", "as",
  "try", "catch", "finally", "throw", "null", "undefined", "true", "false",
  "static", "get", "set", "interface", "type", "enum", "implements", "public",
  "private", "protected", "readonly", "namespace", "module", "declare",
]);

const PY_KEYWORDS = new Set([
  "def", "return", "if", "elif", "else", "for", "while", "in", "not", "and",
  "or", "is", "import", "from", "as", "class", "lambda", "with", "try",
  "except", "finally", "raise", "pass", "break", "continue", "global",
  "nonlocal", "yield", "async", "await", "assert", "del", "True", "False",
  "None", "self", "print", "input",
]);

/**
 * Very lightweight syntax tokenizer. Splits a line into typed tokens for
 * highlighting. Not a full parser — just enough to make code readable.
 * Supports: comments, strings, numbers, keywords, function calls, operators.
 */
export function tokenizeLine(line: string, language: string): SyntaxToken[] {
  const lang = language.toLowerCase();
  const keywords = lang === "python" || lang === "py" ? PY_KEYWORDS : JS_KEYWORDS;
  const tokens: SyntaxToken[] = [];
  let i = 0;
  const n = line.length;

  function pushRaw(text: string) {
    if (text) tokens.push({ type: "plain", value: text });
  }

  while (i < n) {
    const ch = line[i];
    const rest = line.slice(i);

    // line comment
    if (lang === "python" || lang === "py" ? ch === "#" && (i === 0 || line[i - 1] !== "\\") : ch === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", value: rest });
      i = n;
      break;
    }
    // # heading in markdown
    if ((lang === "markdown" || lang === "md") && i === 0 && ch === "#") {
      const headingMatch = line.match(/^(#{1,6}\s+.*)$/);
      if (headingMatch) {
        tokens.push({ type: "keyword", value: headingMatch[1] });
        i = n;
        break;
      }
    }

    // strings: " ' ` (template)
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (line[j] === "\\") { j += 2; continue; }
        if (line[j] === quote) { j++; break; }
        j++;
      }
      tokens.push({ type: "string", value: line.slice(i, j) });
      i = j;
      continue;
    }

    // numbers
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(line[i + 1] || ""))) {
      const m = rest.match(/^[0-9][0-9_.eExXa-fA-F]*/);
      if (m) {
        tokens.push({ type: "number", value: m[0] });
        i += m[0].length;
        continue;
      }
    }

    // identifiers / keywords
    if (/[A-Za-z_$]/.test(ch)) {
      const m = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (m) {
        const word = m[0];
        // function call: identifier followed by (
        const afterWord = line.slice(i + word.length).match(/^\s*\(/);
        if (keywords.has(word)) {
          tokens.push({ type: "keyword", value: word });
        } else if (afterWord) {
          tokens.push({ type: "function", value: word });
        } else {
          pushRaw(word);
        }
        i += word.length;
        continue;
      }
    }

    // operators / punctuation
    if (/[+\-*/%=<>!&|^~?:]/.test(ch)) {
      const m = rest.match(/^[+\-*/%=<>!&|^~?:]+/);
      if (m) {
        tokens.push({ type: "operator", value: m[0] });
        i += m[0].length;
        continue;
      }
    }

    // plain char
    pushRaw(ch);
    i++;
  }
  return tokens;
}

export const TOKEN_COLORS: Record<SyntaxToken["type"], string> = {
  keyword: "var(--anon-accent)",
  string: "var(--anon-ok)",
  comment: "var(--anon-dim)",
  number: "var(--anon-warn)",
  function: "var(--anon-accent)",
  operator: "var(--anon-mut)",
  plain: "inherit",
};
