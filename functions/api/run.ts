// Cloudflare Pages Function: /api/run

interface RunBody {
  language: string;
  source: string;
  stdin?: string;
}

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  language: string;
}

const MAX_DURATION_MS = 5000;
const MAX_OUTPUT_CHARS = 20_000;

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a === null) return "null";
      if (a === undefined) return "undefined";
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a, null, a && typeof a === "object" ? 2 : 0);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

async function runJavaScript(source: string, stdin: string): Promise<RunResult> {
  const start = Date.now();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const fakeConsole = {
    log: (...args: unknown[]) => stdoutChunks.push(formatArgs(args)),
    info: (...args: unknown[]) => stdoutChunks.push(formatArgs(args)),
    debug: (...args: unknown[]) => stdoutChunks.push(formatArgs(args)),
    warn: (...args: unknown[]) => stderrChunks.push(formatArgs(args)),
    error: (...args: unknown[]) => stderrChunks.push(formatArgs(args)),
  };

  const stdinLines = stdin.split("\n");
  let stdinIdx = 0;
  const readline = () => stdinLines[stdinIdx++] ?? "";

  let exitCode = 0;
  let timedOut = false;

  const sandboxedGlobals = {
    console: fakeConsole,
    readline,
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    Symbol,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
  };

  const wrappedSource = `
    "use strict";
    const process = undefined;
    const require = undefined;
    const global = undefined;
    const globalThis = undefined;
    const fetch = undefined;
    const XMLHttpRequest = undefined;
    const WebSocket = undefined;
    ${source}
  `;

  try {
    await Promise.race([
      (async () => {
        try {
          const fn = new Function(...Object.keys(sandboxedGlobals), wrappedSource);
          const result = fn(...Object.values(sandboxedGlobals));
          if (result && typeof result.then === "function") {
            await result;
          }
        } catch (e: any) {
          exitCode = 1;
          stderrChunks.push(String(e instanceof Error ? e.stack || e.message : e));
        }
      })(),
      new Promise((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve(undefined);
        }, MAX_DURATION_MS),
      ),
    ]);

    await new Promise((r) => setTimeout(r, 10));

    if (timedOut) {
      exitCode = 124;
      stderrChunks.push(`[anonshare] execution timed out after ${MAX_DURATION_MS}ms`);
    }
  } catch (e: any) {
    exitCode = 1;
    stderrChunks.push(String(e instanceof Error ? e.message : e));
  }

  const stdout = stdoutChunks.join("\n").slice(0, MAX_OUTPUT_CHARS);
  const stderr = stderrChunks.join("\n").slice(0, MAX_OUTPUT_CHARS);

  return {
    ok: exitCode === 0,
    stdout,
    stderr,
    exitCode,
    durationMs: Date.now() - start,
    language: "javascript",
  };
}

function evalPyExpr(expr: string, vars: Record<string, unknown>): unknown {
  const e = expr.trim();
  const fM = e.match(/^f["'](.*)["']$/);
  if (fM) {
    return fM[1].replace(/\{([^}]+)\}/g, (_, inner) => String(evalPyExpr(inner, vars)));
  }
  if (/^["'].*["']$/.test(e)) return e.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);
  if (e === "True") return true;
  if (e === "False") return false;
  if (e === "None") return null;
  if (/^\w+$/.test(e)) return vars[e];
  const jsExpr = e.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null").replace(/\bnot\b/g, "!");
  const fn = new Function(...Object.keys(vars), `return (${jsExpr});`);
  return fn(...Object.values(vars));
}

async function runPythonLite(source: string, stdin: string): Promise<RunResult> {
  const start = Date.now();
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode = 0;

  const lines = source.split("\n");
  const vars: Record<string, unknown> = {};
  const stdinLines = stdin.split("\n");
  let stdinIdx = 0;
  const input = () => stdinLines[stdinIdx++] ?? "";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    try {
      const printM = line.match(/^print\((.*)\)$/);
      if (printM) {
        const val = evalPyExpr(printM[1], vars);
        stdout.push(String(val));
        continue;
      }
      const inputM = line.match(/^(\w+)\s*=\s*input\((.*)\)$/);
      if (inputM) {
        const prompt = evalPyExpr(inputM[2], vars);
        if (prompt) stdout.push(String(prompt));
        vars[inputM[1]] = input();
        continue;
      }
      const assignM = line.match(/^(\w+)\s*=\s*(.+)$/);
      if (assignM) {
        vars[assignM[1]] = evalPyExpr(assignM[2], vars);
        continue;
      }
      if (line.startsWith("if ") && line.endsWith(":")) {
        const cond = evalPyExpr(line.slice(3, -1), vars);
        if (!cond) {
          i++;
          while (i < lines.length && (lines[i].startsWith("    ") || lines[i].startsWith("\t") || lines[i].trim() === "")) i++;
          i--;
        }
        continue;
      }
      const val = evalPyExpr(line, vars);
      if (val !== undefined) stdout.push(String(val));
    } catch (e: any) {
      stderr.push(`Line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      exitCode = 1;
      break;
    }
  }

  return {
    ok: exitCode === 0,
    stdout: stdout.join("\n").slice(0, MAX_OUTPUT_CHARS),
    stderr: stderr.join("\n").slice(0, MAX_OUTPUT_CHARS),
    exitCode,
    durationMs: Date.now() - start,
    language: "python",
  };
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  let body: RunBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, stderr: "invalid JSON body", stdout: "", exitCode: 1, durationMs: 0, language: "?" }, { status: 400 });
  }

  const { language, source, stdin = "" } = body;
  if (!source || typeof source !== "string") {
    return Response.json({ ok: false, stderr: "missing source", stdout: "", exitCode: 1, durationMs: 0, language }, { status: 400 });
  }

  if (source.length > 64_000) {
    return Response.json({ ok: false, stderr: "source too large (max 64KB)", stdout: "", exitCode: 1, durationMs: 0, language }, { status: 413 });
  }

  let result: RunResult;
  try {
    if (language === "javascript" || language === "typescript" || language === "js") {
      result = await runJavaScript(source, stdin);
    } else if (language === "python" || language === "py") {
      result = await runPythonLite(source, stdin);
    } else {
      return Response.json({
        ok: false,
        stderr: `language "${language}" not supported in demo runner. Try javascript or python. (production relays proxy to Piston for 15 languages.)`,
        stdout: "",
        exitCode: 1,
        durationMs: 0,
        language,
      }, { status: 400 });
    }
  } catch (e: any) {
    result = {
      ok: false,
      stdout: "",
      stderr: `internal error: ${e instanceof Error ? e.message : String(e)}`,
      exitCode: 1,
      durationMs: 0,
      language,
    };
  }

  return Response.json(result);
}

export async function onRequestGet(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "anonshare-run",
    languages: ["javascript", "python (lite)"],
    maxDurationMs: MAX_DURATION_MS,
    note: "demo runner. production relays proxy to a sandboxed Piston instance.",
  });
}
