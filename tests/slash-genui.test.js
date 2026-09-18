import { describe, it, expect } from 'vitest'
import { UI_TEMPLATES, generateUiFromPrompt } from '../lib/generative-ui.js'
import { parseSlashCommand, filterSlashCommands, SLASH_COMMANDS } from '../lib/slash-commands.js'

describe('Slash Commands Parser', () => {
  it('identifies non-commands correctly', () => {
    expect(parseSlashCommand('hello room').isCommand).toBe(false)
    expect(parseSlashCommand('').isCommand).toBe(false)
  })

  it('parses commands with and without arguments', () => {
    const goalCmd = parseSlashCommand('/goal Finish Lab 3')
    expect(goalCmd.isCommand).toBe(true)
    expect(goalCmd.command).toBe('/goal')
    expect(goalCmd.args).toBe('Finish Lab 3')

    const boostCmd = parseSlashCommand('/boost')
    expect(boostCmd.isCommand).toBe(true)
    expect(boostCmd.command).toBe('/boost')
    expect(boostCmd.args).toBe('')

    const genCmd = parseSlashCommand('/generative_ui interactive calculator')
    expect(genCmd.isCommand).toBe(true)
    expect(genCmd.command).toBe('/generative_ui')
    expect(genCmd.args).toBe('interactive calculator')
  })

  it('filters slash commands for autocomplete', () => {
    const all = filterSlashCommands('/')
    expect(all.length).toBe(SLASH_COMMANDS.length)

    const gCommands = filterSlashCommands('/g')
    expect(gCommands.some(c => c.command === '/goal')).toBe(true)
    expect(gCommands.some(c => c.command === '/generative_ui')).toBe(true)

    const browserCmd = filterSlashCommands('/browser')
    expect(browserCmd.length).toBe(1)
    expect(browserCmd[0].command).toBe('/browser')
  })
})

describe('Generative UI Synthesizer', () => {
  it('has essential templates defined', () => {
    expect(UI_TEMPLATES.some(t => t.id === 'auth-card')).toBe(true)
    expect(UI_TEMPLATES.some(t => t.id === 'calculator')).toBe(true)
    expect(UI_TEMPLATES.some(t => t.id === 'todo-app')).toBe(true)
    expect(UI_TEMPLATES.some(t => t.id === 'hero-section')).toBe(true)
  })

  it('generates specific components matching prompt keywords', () => {
    const calcHtml = generateUiFromPrompt('build me a calculator')
    expect(calcHtml).toContain('Calculator')
    expect(calcHtml).toContain('calc-btn')

    const loginHtml = generateUiFromPrompt('user login and signup card')
    expect(loginHtml).toContain('Welcome Back')
    expect(loginHtml).toContain('auth-card')

    const todoHtml = generateUiFromPrompt('interactive todo checklist')
    expect(todoHtml).toContain('todo-list')
  })

  it('synthesizes custom arbitrary component for novel prompts', () => {
    const customHtml = generateUiFromPrompt('quantum particle visualizer')
    expect(customHtml).toContain('Quantum particle visualizer')
    expect(customHtml).toContain('Generated Component')
  })
})
