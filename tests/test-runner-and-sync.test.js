import { describe, it, expect } from 'vitest'
import { runJsTests } from '../src/lib/test-runner.ts'
import { diffLines } from '../src/components/palette/HistoryDrawer.tsx'

describe('Feature: In-Browser JavaScript Test Harness (test-runner.ts)', () => {
  it('runs passing test suites with assertions', async () => {
    const code = `
      describe('Math operations', () => {
        test('addition', () => {
          expect(1 + 2).toBe(3);
          expect(2 * 3).toEqual(6);
        });
        it('truthiness and arrays', () => {
          expect(true).toBeTruthy();
          expect([1, 2, 3]).toContain(2);
        });
      });
    `
    const result = await runJsTests(code)
    expect(result.rootError).toBeUndefined()
    expect(result.suites.length).toBe(1)
    expect(result.suites[0].name).toBe('Math operations')
    expect(result.suites[0].cases.length).toBe(2)
    expect(result.suites[0].cases[0].status).toBe('pass')
    expect(result.suites[0].cases[0].assertions).toBe(2)
    expect(result.suites[0].cases[1].status).toBe('pass')
    expect(result.suites[0].cases[1].assertions).toBe(2)
  })

  it('correctly catches and reports assertion failures and thrown errors', async () => {
    const code = `
      describe('Error testing', () => {
        test('failing assertion', () => {
          expect(10).toBe(20);
        });
        test('throwing function check', () => {
          const fn = () => { throw new Error('Boom'); };
          expect(fn).toThrow('Boom');
        });
      });
    `
    const result = await runJsTests(code)
    expect(result.suites.length).toBe(1)
    expect(result.suites[0].cases[0].status).toBe('fail')
    expect(result.suites[0].cases[0].error).toContain('expected 20, received 10')
    expect(result.suites[0].cases[1].status).toBe('pass')
  })

  it('captures console logs from within tests', async () => {
    const code = `
      describe('Logging test', () => {
        test('console outputs', () => {
          console.log('User log message');
          console.warn('User warning');
          expect(true).toBe(true);
        });
      });
    `
    const result = await runJsTests(code)
    expect(result.suites[0].cases[0].logs.length).toBe(2)
    expect(result.suites[0].cases[0].logs[0]).toContain('User log message')
    expect(result.suites[0].cases[0].logs[1]).toContain('[warn] User warning')
  })

  it('supports async tests and promises', async () => {
    const code = `
      describe('Async operations', () => {
        test('async delayed value', async () => {
          const val = await Promise.resolve(42);
          expect(val).toBe(42);
        });
      });
    `
    const result = await runJsTests(code)
    expect(result.suites[0].cases[0].status).toBe('pass')
    expect(result.suites[0].cases[0].assertions).toBe(1)
  })

  it('validates comprehensive matchers including .not, numbers, objects and lengths', async () => {
    const code = `
      describe('Matcher Suite', () => {
        test('advanced matchers', () => {
          expect(10).toBeGreaterThan(5);
          expect(5).toBeLessThan(10);
          expect(null).toBeNull();
          expect(undefined).toBeUndefined();
          expect('test').toBeDefined();
          expect([1, 2, 3]).toHaveLength(3);
          expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] });
          expect(5).not.toBe(10);
          expect([1, 2]).not.toContain(99);
        });
      });
    `
    const result = await runJsTests(code)
    expect(result.rootError).toBeUndefined()
    expect(result.suites[0].cases[0].status).toBe('pass')
    expect(result.suites[0].cases[0].assertions).toBe(9)
  })
})

describe('Feature: HistoryDrawer LCS Diff Algorithm', () => {
  it('computes diff operations between two text revisions', () => {
    const oldText = 'line1\nline2\nline3'
    const newText = 'line1\nline2 modified\nline3\nline4'
    const diff = diffLines(oldText, newText)
    expect(diff.length).toBeGreaterThan(0)
    const types = diff.map((d) => d.type)
    expect(types).toContain('ctx')
    expect(types).toContain('add')
    expect(types).toContain('del')
  })
})
