/**
 * Multi-language Code Execution Runner for AnonShare
 * Supports in-browser sandboxed JavaScript/TypeScript and remote execution for Python, C, C++, Go, Rust, Java, etc.
 */

// In-browser Web Worker execution for JavaScript / TypeScript
function runJsInWorker(code, stdin = '') {
  return new Promise(resolve => {
    const startTime = performance.now()
    const workerScript = `
      self.onmessage = function(e) {
        var logs = [];
        var errs = [];
        var origLog = console.log;
        var origErr = console.error;
        var origWarn = console.warn;
        
        console.log = function() {
          var args = Array.prototype.slice.call(arguments);
          logs.push(args.map(function(x) {
            return typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x);
          }).join(' '));
        };
        console.error = function() {
          var args = Array.prototype.slice.call(arguments);
          errs.push(args.map(function(x) {
            return typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x);
          }).join(' '));
        };
        console.warn = console.log;

        try {
          var input = e.data.stdin || '';
          var fn = new Function('stdin', e.data.code);
          var res = fn(input);
          if (res !== undefined && logs.length === 0) {
            logs.push(typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res));
          }
          self.postMessage({ ok: true, stdout: logs.join('\\n'), stderr: errs.join('\\n'), exitCode: 0 });
        } catch (err) {
          self.postMessage({ ok: false, stdout: logs.join('\\n'), stderr: (errs.length ? errs.join('\\n') + '\\n' : '') + String(err.stack || err), exitCode: 1 });
        }
      };
    `
    const blob = new Blob([workerScript], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    const worker = new Worker(workerUrl)

    const timer = setTimeout(() => {
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
      resolve({
        ok: false,
        stdout: '',
        stderr: 'Execution timed out (5s limit in browser sandbox).',
        exitCode: 124,
        executionTime: Math.round(performance.now() - startTime),
      })
    }, 5000)

    worker.onmessage = e => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
      resolve({
        ...e.data,
        executionTime: Math.round(performance.now() - startTime),
      })
    }

    worker.onerror = e => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
      resolve({
        ok: false,
        stdout: '',
        stderr: e.message || 'Worker runtime error',
        exitCode: 1,
        executionTime: Math.round(performance.now() - startTime),
      })
    }

    worker.postMessage({ code, stdin })
  })
}

export function parseErrorPositions(stderr = '', language = '') {
  if (!stderr || typeof stderr !== 'string') return []
  const positions = []
  const lines = stderr.split('\n')
  const lang = (language || '').toLowerCase().trim()

  for (const line of lines) {
    // Python: File "...", line 12
    const pyMatch = line.match(/File\s+["'].+?["'],\s+line\s+(\d+)(?:,\s+in\s+(.+))?/i)
    if (pyMatch) {
      positions.push({
        line: parseInt(pyMatch[1], 10),
        column: 1,
        message: line.trim()
      })
      continue
    }

    // GCC / Clang (C / C++): file.c:12:5: error: message
    const gccMatch = line.match(/(?:[a-zA-Z0-9_\-\.\/]+):(\d+):(\d+):\s*(error|warning|fatal error):\s*(.+)/i)
    if (gccMatch) {
      positions.push({
        line: parseInt(gccMatch[1], 10),
        column: parseInt(gccMatch[2], 10),
        type: gccMatch[3].toLowerCase(),
        message: gccMatch[4].trim()
      })
      continue
    }

    // Rust: --> src/main.rs:12:5
    const rustMatch = line.match(/-->\s*(?:[a-zA-Z0-9_\-\.\/]+):(\d+):(\d+)/i)
    if (rustMatch) {
      positions.push({
        line: parseInt(rustMatch[1], 10),
        column: parseInt(rustMatch[2], 10),
        message: line.trim()
      })
      continue
    }

    // Go: main.go:12:5: message
    const goMatch = line.match(/(?:[a-zA-Z0-9_\-\.\/]+):(\d+):(\d+):\s*(.+)/i)
    if (goMatch && !line.includes('warning:')) {
      positions.push({
        line: parseInt(goMatch[1], 10),
        column: parseInt(goMatch[2], 10),
        message: goMatch[3].trim()
      })
      continue
    }

    // JavaScript / Node: evalmachine.<anonymous>:12:5 or line 12:5
    const jsMatch = line.match(/(?::|\s+line\s+)(\d+):(\d+)/i)
    if (jsMatch && (lang.includes('js') || lang.includes('node'))) {
      positions.push({
        line: parseInt(jsMatch[1], 10),
        column: parseInt(jsMatch[2], 10),
        message: line.trim()
      })
      continue
    }
  }

  return positions
}

export async function runCode({ language, code, stdin = '', relayHost = '' }) {
  const lang = (language || '').toLowerCase().trim()
  let result = null

  // 1. In-browser client execution for JavaScript
  if (lang === 'javascript' || lang === 'js') {
    result = await runJsInWorker(code, stdin)
  }

  // 2. Relay / VPS Execution Endpoint
  if (!result && relayHost) {
    try {
      const clean = relayHost.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
      const proto = location.protocol === 'https:' || !clean.includes('localhost') ? 'https:' : 'http:'
      const res = await fetch(`${proto}//${clean}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, code, stdin }),
      })
      if (res.ok) {
        result = await res.json()
      }
    } catch (e) {
      // Fallback to public Piston
    }
  }

  // 3. Fallback directly to public sandboxed Piston API
  if (!result) {
    try {
      const res = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: lang === 'c++' ? 'cpp' : lang,
          version: '*',
          files: [{ content: code }],
          stdin,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        result = {
          ok: (data.run?.code ?? 1) === 0,
          stdout: data.run?.stdout || '',
          stderr: data.run?.stderr || '',
          exitCode: data.run?.code ?? 0,
          executionTime: data.run?.duration || null,
        }
      }
    } catch (err) {}
  }

  if (!result) {
    result = {
      ok: false,
      stdout: '',
      stderr: `Failed to execute ${lang}. Please ensure the relay runner is running.`,
      exitCode: 1,
    }
  }

  result.errorPositions = parseErrorPositions(result.stderr, lang)
  return result
}

