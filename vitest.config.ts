import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '.next', '.claude/worktrees/**'],
    // LinkedIn publish tests exercise the real polling loop (POLL_INTERVAL_MS = 5000,
    // same bound as the existing TikTok poll) with a single real setTimeout tick, which
    // exceeds vitest's default 5000ms per-test timeout. Bump the default so poll-loop
    // tests have headroom without needing fake timers.
    testTimeout: 15000,
  },
})
