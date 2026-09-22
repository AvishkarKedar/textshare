// Real, in-browser test execution engine for JavaScript.
// Actually RUNS describe()/test()/it() blocks with a minimal `expect`
// assertion library and reports real pass/fail, real durations, real
// assertion counts, and real console output. No simulation.

export interface HarnessSuite {
  name: string;
  cases: HarnessCase[];
}

export interface HarnessCase {
  name: string;
  status: "pass" | "fail" | "skip";
  durationMs: number;
  error?: string;
  assertions: number;
  logs: string[];
}

export interface HarnessResult {
  suites: HarnessSuite[];
  rootError?: string;
  rootLogs: string[];
}

const TEST_TIMEOUT_MS = 5000;

/** Runs the source for real and returns actual results. */
export async function runJsTests(source: string): Promise<HarnessResult> {
  interface RegisteredTest {
    name: string;
    fn: (() => void | Promise<void>) | null;
    suite: string;
  }
  const registered: RegisteredTest[] = [];
  let currentSuite = "<root>";
  let assertionCount = 0;

  // ---- capture console output produced by user code (real output) ----
  const logBuffer: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  const intercept = (orig: (...args: unknown[]) => void, prefix: string) => {
    return (...args: unknown[]) => {
      logBuffer.push(prefix + args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" "));
      orig(...args);
    };
  };
  console.log = intercept(origLog, "");
  console.warn = intercept(origWarn, "[warn] ");
  console.error = intercept(origErr, "[error] ");

  // ---- the real harness API injected into user code ----
  function describe(name: string, fn: () => void): void {
    const prev = currentSuite;
    currentSuite = name;
    try {
      fn();
    } finally {
      currentSuite = prev;
    }
  }

  function test(name: string, fn?: () => void | Promise<void>): void {
    registered.push({ name, fn: fn ?? null, suite: currentSuite });
  }
  const it = test;

  function expect(actual: unknown) {
    return buildMatchers(actual, () => assertionCount, (n) => (assertionCount = n));
  }

  function buildMatchers(actual: unknown, get: () => number, set: (n: number) => void) {
    const count = () => set(get() + 1);
    const make = (positive: boolean) => ({
      toBe(expected: unknown) {
        count();
        if (positive !== Object.is(actual, expected)) {
          fail(positive, `expected ${fmt(expected)}, received ${fmt(actual)}`);
        }
      },
      toEqual(expected: unknown) {
        count();
        if (positive !== deepEqual(actual, expected)) {
          fail(positive, `expected deep ${fmt(expected)}, received ${fmt(actual)}`);
        }
      },
      toBeTruthy() {
        count();
        if (positive !== Boolean(actual)) {
          fail(positive, `expected ${positive ? "" : "not "}truthy, received ${fmt(actual)}`);
        }
      },
      toBeFalsy() {
        count();
        if (positive !== !Boolean(actual)) {
          fail(positive, `expected ${positive ? "" : "not "}falsy, received ${fmt(actual)}`);
        }
      },
      toBeNull() {
        count();
        if (positive !== (actual === null)) {
          fail(positive, `expected ${positive ? "" : "not "}null, received ${fmt(actual)}`);
        }
      },
      toBeUndefined() {
        count();
        if (positive !== (actual === undefined)) {
          fail(positive, `expected ${positive ? "" : "not "}undefined, received ${fmt(actual)}`);
        }
      },
      toBeDefined() {
        count();
        if (positive !== (actual !== undefined)) {
          fail(positive, `expected ${positive ? "" : "not "}defined, received ${fmt(actual)}`);
        }
      },
      toBeGreaterThan(n: number) {
        count();
        if (positive !== ((actual as number) > n)) {
          fail(positive, `expected ${fmt(actual)} ${positive ? ">" : "<="} ${n}`);
        }
      },
      toBeLessThan(n: number) {
        count();
        if (positive !== ((actual as number) < n)) {
          fail(positive, `expected ${fmt(actual)} ${positive ? "<" : ">="} ${n}`);
        }
      },
      toContain(item: unknown) {
        count();
        let contains = false;
        if (typeof actual === "string") contains = actual.includes(String(item));
        else if (Array.isArray(actual)) contains = actual.some((x) => deepEqual(x, item));
        if (positive !== contains) {
          fail(positive, `expected ${fmt(actual)} ${positive ? "to contain" : "not to contain"} ${fmt(item)}`);
        }
      },
      toThrow(msg?: string) {
        count();
        if (typeof actual !== "function") {
          throw new Error("expect(fn).toThrow() — received a non-function");
        }
        let threw = false;
        let thrown = "";
        try {
          actual();
        } catch (e) {
          threw = true;
          thrown = e instanceof Error ? e.message : String(e);
        }
        if (positive !== threw || (msg !== undefined && !thrown.includes(msg))) {
          fail(
            positive,
            msg !== undefined
              ? `expected throw containing "${msg}", got "${thrown}"`
              : `expected a throw, got none`
          );
        }
      },
      toHaveLength(n: number) {
        count();
        const len = (actual as { length?: number })?.length;
        if (positive !== (len === n)) {
          fail(positive, `expected length ${n}, received ${fmt(len)}`);
        }
      },
    });
    const m = make(true);
    Object.defineProperty(m, "not", { get: () => make(false), enumerable: true });
    return m;
  }

  function fail(positive: boolean, message: string): never {
    throw new Error(positive ? message : `NOT condition failed: ${message}`);
  }

  // ---- phase 1: execute the user's code to register suites/tests ----
  let rootError: string | undefined;
  const registrationLogMark = logBuffer.length;
  try {
    const userFn = new Function(
      "describe",
      "test",
      "it",
      "expect",
      "beforeEach",
      "afterEach",
      `"use strict";\n${source}`
    );
    userFn(describe, test, it, expect, () => {}, () => {});
  } catch (e) {
    rootError = e instanceof Error ? e.message : String(e);
  }
  const rootLogs = logBuffer.slice(registrationLogMark);

  // ---- phase 2: execute each registered test for real ----
  const bySuite = new Map<string, HarnessCase[]>();
  for (const t of registered) {
    assertionCount = 0;
    let status: HarnessCase["status"] = "skip";
    let error: string | undefined;
    let durationMs = 0;
    let logs: string[] = [];

    if (t.fn) {
      const mark = logBuffer.length;
      const started = performance.now();
      try {
        const result = t.fn();
        if (result && typeof (result as Promise<void>).then === "function") {
          await withTimeout(result as Promise<void>, TEST_TIMEOUT_MS);
        }
        status = "pass";
      } catch (e) {
        status = "fail";
        error = e instanceof Error ? e.message : String(e);
      }
      durationMs = Math.round((performance.now() - started) * 100) / 100;
      logs = logBuffer.slice(mark);
    }

    const c: HarnessCase = { name: t.name, status, durationMs, error, assertions: assertionCount, logs };
    const bucket = bySuite.get(t.suite) ?? [];
    bucket.push(c);
    bySuite.set(t.suite, bucket);
  }

  // restore the real console
  console.log = origLog;
  console.warn = origWarn;
  console.error = origErr;

  const suites: HarnessSuite[] = [...bySuite.entries()].map(([name, cases]) => ({ name, cases }));
  return { suites, rootError, rootLogs };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`test timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function fmt(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "object") return safeStringify(v);
  return String(v);
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
