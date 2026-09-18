import { describe, expect, it } from 'vitest'
import { buildStandaloneHtml, isValidPreviewMessage } from '../lib/preview.js'
import { runCode } from '../lib/runner.js'

describe('preview security', () => {
  it('renders runtime error text without innerHTML', () => {
    const html = buildStandaloneHtml('<p>preview</p>', { channelId: 'channel-1' })
    expect(html).toContain("textContent='⚠ '")
    expect(html).not.toContain('errBox.innerHTML')
    expect(html).toContain('channel-1')
  })

  it('accepts messages only from the current iframe and channel', () => {
    const source = {}
    const iframe = { contentWindow: source, dataset: { previewChannel: 'abc' } }
    expect(isValidPreviewMessage({ source, data: { type: 'preview-console', channel: 'abc', level: 'log', text: 'ok' } }, iframe)).toBe(true)
    expect(isValidPreviewMessage({ source: {}, data: { type: 'preview-console', channel: 'abc', level: 'log', text: 'spoof' } }, iframe)).toBe(false)
    expect(isValidPreviewMessage({ source, data: { type: 'preview-console', channel: 'wrong', level: 'log', text: 'spoof' } }, iframe)).toBe(false)
  })
})

describe('runner privacy', () => {
  it('does not contact a public runner without explicit consent', async () => {
    const previousFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => { calls++; throw new Error('unexpected') }
    try {
      const result = await runCode({ language: 'python', code: 'print(1)' })
      expect(calls).toBe(0)
      expect(result.ok).toBe(false)
      expect(result.stderr).toContain('Third-party execution is disabled')
    } finally { globalThis.fetch = previousFetch }
  })
})
