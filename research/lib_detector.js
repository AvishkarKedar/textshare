/**
 * Auto-Language Detector for AnonShare
 * Heuristically inspects shebangs, imports, keywords, and structural tokens.
 */

export function detectLanguage(text) {
  if (!text || typeof text !== 'string') return null
  const trimmed = text.trim()
  if (trimmed.length < 5) return null

  const firstLine = trimmed.split('\n')[0].trim()

  // 1. Shebang Checks
  if (firstLine.startsWith('#!')) {
    if (/python/i.test(firstLine)) return 'python'
    if (/node|js/i.test(firstLine)) return 'javascript'
    if (/bash|sh|zsh/i.test(firstLine)) return 'bash'
    if (/perl/i.test(firstLine)) return 'perl'
    if (/ruby/i.test(firstLine)) return 'ruby'
  }

  // 2. HTML / XML / Markdown
  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed)) {
    return 'html'
  }
  if (/^#+\s+\w+/m.test(trimmed) && /\[.+?\]\(.+?\)/.test(trimmed)) {
    return 'markdown'
  }

  // 3. JSON
  if (/^[\{\[][\s\S]*[\}\]]$/.test(trimmed)) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch (e) {}
  }

  // 4. C and C++
  if (/#include\s*<iostream>|std::cout|std::endl|using\s+namespace\s+std;/i.test(trimmed)) {
    return 'cpp'
  }
  if (/#include\s*<[a-z0-9_\.]+\.h>|int\s+main\s*\(\s*(void|int\s+argc)?\s*\)/i.test(trimmed)) {
    return 'c'
  }

  // 5. Golang
  if (/^package\s+[a-z_][a-z0-9_]*/m.test(trimmed) && /func\s+main\s*\(/m.test(trimmed)) {
    return 'go'
  }

  // 6. Rust
  if (/fn\s+main\s*\(\s*\)|println!\s*\(|let\s+mut\s+|impl\s+[A-Z]/m.test(trimmed)) {
    return 'rust'
  }

  // 7. Python
  if (/def\s+[a-z_][a-z0-9_]*\s*\(|from\s+[a-z_][a-z0-9_]*\s+import\s+|if\s+__name__\s*==\s*['"]__main__['"]:|elif\s+|print\s*\(/m.test(trimmed)) {
    return 'python'
  }

  // 8. JavaScript / TypeScript
  if (/console\.log\s*\(|const\s+[a-zA-Z0-9_$]+\s*=|let\s+[a-zA-Z0-9_$]+\s*=|export\s+default|function\s+[a-zA-Z0-9_$]*\s*\(|=>\s*\{/m.test(trimmed)) {
    return 'javascript'
  }

  // 9. CSS
  if (/@media\s*\(|:root\s*\{|[a-z0-9_-]+\s*\{\s*display:\s*|\}\s*#[a-z0-9_-]+\s*\{/i.test(trimmed)) {
    return 'css'
  }

  // 10. Bash
  if (/echo\s+['"][^'"]+['"]|if\s+\[\s*.+?\s*\];\s*then|chmod\s+\+x/m.test(trimmed)) {
    return 'bash'
  }

  return null
}
