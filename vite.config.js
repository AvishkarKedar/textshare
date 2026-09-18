import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    // Keep dynamic import() as separate chunks so language modes still
    // lazy-load on demand instead of bloating one giant bundle.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: 'index.html',
        notfound: '404.html',
        privacy: 'privacy.html',
        security: 'security.html',
        terms: 'terms.html'
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('codemirror') || id.includes('crelt') || id.includes('w3c-keyname')) {
              return 'vendor-editor'
            }
            if (id.includes('yjs') || id.includes('y-') || id.includes('lib0')) {
              return 'vendor-crdt'
            }
          }
        }
      }
    },
  },
})