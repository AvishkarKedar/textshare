import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    // Keep dynamic import() as separate chunks so language modes still
    // lazy-load on demand instead of bloating one giant bundle.
    rollupOptions: {
      input: {
        main: 'index.html',
        notfound: '404.html',
        privacy: 'privacy.html',
        security: 'security.html',
        terms: 'terms.html'
      },
    },
  },
})
