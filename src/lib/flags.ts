/**
 * Feature flags — the single source of truth for temporarily hidden features.
 *
 * COMPILER_ENABLED — controls every code-execution (compiler/runner) surface:
 *   - Run button in the top bar, ⌘↵ / Ctrl+Enter keyboard shortcut
 *   - /run slash command + "Run code" command-palette entry
 *   - terminal drawer (run output + stdin box) and its toggles
 *   - /learn panel (runnable starter files) and its palette entry
 *   - stdin readiness indicator in the status bar
 *   - runner FAQ category, threat-model runner row, terms/privacy runner sections
 *   - landing-page copy that advertises running code
 *
 * Set to true to restore everything in one commit. The underlying relay/edge
 * execution path (functions/api/run.ts) is untouched — only UI surfaces are
 * gated, so nothing else needs to change when the flag flips back.
 */
export const COMPILER_ENABLED = false;
