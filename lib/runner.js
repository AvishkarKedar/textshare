/**
 * Multi-language code execution.
 * Untrusted code is never evaluated in the application origin. It is sent only
 * to the configured relay runner, or to Piston after explicit caller consent.
 */

export function parseErrorPositions(stderr = '', language = '') {
  if (!stderr || typeof stderr !== 'string') return []
  const positions = []
  const lang = (language || '').toLowerCase().trim()
  for (const line of stderr.split('\n')) {
    let match = line.match(/File\s+["'].+?["'],\s+line\s+(\d+)(?:,\s+in\s+(.+))?/i)
    if (match) { positions.push({ line: Number(match[1]), column: 1, message: line.trim() }); continue }
    match = line.match(/(?:[a-zA-Z0-9_\-./]+):(\d+):(\d+):\s*(error|warning|fatal error):\s*(.+)/i)
    if (match) { positions.push({ line: Number(match[1]), column: Number(match[2]), type: match[3].toLowerCase(), message: match[4].trim() }); continue }
    match = line.match(/-->\s*(?:[a-zA-Z0-9_\-./]+):(\d+):(\d+)/i)
    if (match) { positions.push({ line: Number(match[1]), column: Number(match[2]), message: line.trim() }); continue }
    match = line.match(/(?:[a-zA-Z0-9_\-./]+):(\d+):(\d+):\s*(.+)/i)
    if (match && !line.includes('warning:')) { positions.push({ line: Number(match[1]), column: Number(match[2]), message: match[3].trim() }); continue }
    match = line.match(/(?::|\s+line\s+)(\d+):(\d+)/i)
    if (match && (lang.includes('js') || lang.includes('node'))) positions.push({ line: Number(match[1]), column: Number(match[2]), message: line.trim() })
  }
  return positions
}

function normalizeResult(result, language) {
  const normalized = {
    ok: Boolean(result?.ok),
    stdout: String(result?.stdout || ''),
    stderr: String(result?.stderr || ''),
    exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : (result?.ok ? 0 : 1),
    executionTime: result?.executionTime ?? null,
  }
  normalized.errorPositions = parseErrorPositions(normalized.stderr, language)
  return normalized
}

export async function runCode({ language, code, stdin = '', relayHost = '', allowThirdPartyExecution = false }) {
  const lang = (language || '').toLowerCase().trim()
  const runLang = ['node', 'javascript', 'js'].includes(lang) ? 'node' : (lang === 'c++' ? 'cpp' : lang)
  if (!runLang || typeof code !== 'string') return normalizeResult({ stderr: 'Language and code are required.' }, lang)

  if (relayHost) {
    try {
      const clean = relayHost.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
      const proto = location.protocol === 'https:' || !clean.includes('localhost') ? 'https:' : 'http:'
      const response = await fetch(`${proto}//${clean}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: runLang, code, stdin }),
      })
      if (response.ok) return normalizeResult(await response.json(), lang)
      if (response.status < 500 && response.status !== 429) {
        return normalizeResult({ stderr: `Runner rejected the request (HTTP ${response.status}).` }, lang)
      }
    } catch (error) {
      console.warn('Configured code runner unavailable:', error)
    }
  }

  if (allowThirdPartyExecution) {
    try {
      const response = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: runLang === 'node' ? 'javascript' : runLang, version: '*', files: [{ content: code }], stdin }),
      })
      if (response.ok) {
        const data = await response.json()
        return normalizeResult({
          ok: (data.run?.code ?? 1) === 0,
          stdout: data.run?.stdout,
          stderr: data.run?.stderr,
          exitCode: data.run?.code,
          executionTime: data.run?.duration,
        }, lang)
      }
    } catch (error) { console.warn('Third-party runner unavailable:', error) }
  }

  return normalizeResult({
    stderr: allowThirdPartyExecution
      ? `Failed to execute ${lang}. No execution provider is available.`
      : 'The private runner is unavailable. Third-party execution is disabled to protect your code and input.',
  }, lang)
}
