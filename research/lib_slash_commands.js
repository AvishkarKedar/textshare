/**
 * Slash Commands Management for AnonShare Chat and Palette
 * Supports /goal, /browser, /teamwork-preview, /boost, /generative_ui, /clear, /help, /shrug
 */

export const SLASH_COMMANDS = [
  {
    command: '/goal',
    syntax: '/goal [objective text]',
    description: 'Set or clear collaborative room goal',
    icon: '🎯'
  },
  {
    command: '/browser',
    syntax: '/browser [url]',
    description: 'Open in-browser documentation & web viewer',
    icon: '🌐'
  },
  {
    command: '/teamwork-preview',
    syntax: '/teamwork-preview',
    description: 'Multi-device collaborative live preview (desktop / tablet / mobile)',
    icon: '👥'
  },
  {
    command: '/boost',
    syntax: '/boost',
    description: 'Toggle developer turbo boost mode & live metrics HUD',
    icon: '⚡'
  },
  {
    command: '/generative_ui',
    syntax: '/generative_ui [prompt]',
    description: 'Generate interactive UI component into editor & preview',
    icon: '✨'
  },
  {
    command: '/voice',
    syntax: '/voice',
    description: 'Toggle walkie-talkie voice chat (connect / mute / disconnect)',
    icon: '🎤'
  },
  {
    command: '/run',
    syntax: '/run',
    description: 'Execute active code with interactive stdin runner',
    icon: '▶️'
  },
  {
    command: '/zen',
    syntax: '/zen',
    description: 'Toggle fullscreen Zen distraction-free editing mode',
    icon: '🧘'
  },
  {
    command: '/history',
    syntax: '/history',
    description: 'Open Time Machine revision history & diff viewer',
    icon: '⏱️'
  },
  {
    command: '/clear',
    syntax: '/clear',
    description: 'Clear local chat history',
    icon: '🧹'
  },
  {
    command: '/shrug',
    syntax: '/shrug',
    description: 'Send ¯\\_(ツ)_/¯ to chat',
    icon: '🤷'
  },
  {
    command: '/help',
    syntax: '/help',
    description: 'Show list of all available commands',
    icon: '❓'
  }
]

export function parseSlashCommand(input = '') {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) {
    return { isCommand: false }
  }

  const firstSpace = trimmed.indexOf(' ')
  const cmd = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase()
  const args = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim()

  return {
    isCommand: true,
    command: cmd,
    args,
    raw: trimmed
  }
}

export function filterSlashCommands(query = '') {
  const q = query.toLowerCase().trim()
  if (!q || q === '/') return SLASH_COMMANDS
  const cleanQ = q.startsWith('/') ? q : '/' + q
  return SLASH_COMMANDS.filter(c => c.command.startsWith(cleanQ) || c.description.toLowerCase().includes(q))
}
