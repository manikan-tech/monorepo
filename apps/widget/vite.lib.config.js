import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* ─────────────────────────────────────────────────────────────────────────
   Library build — bundles src/widget/embed.jsx into a single IIFE file
   (dist-lib/manikan-widget.js) that a retailer embeds with one <script>
   tag. Kept as a separate config file from vite.config.js so the normal
   dev-demo build (`npm run dev` / `npm run build`) is completely unaffected.
   ───────────────────────────────────────────────────────────────────────── */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Library builds are meant to be consumed by a downstream bundler, so Vite
  // does NOT auto-replace process.env.NODE_ENV here the way it does for the
  // app build — but this bundle ships straight to a browser via <script>,
  // with no downstream bundler to do it. React's own code checks
  // process.env.NODE_ENV internally; without this it throws
  // "process is not defined" at runtime since browsers have no `process`.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/widget/embed.jsx',
      name: 'ManikanWidget',
      formats: ['iife'],
      fileName: () => 'manikan-widget.js',
    },
  },
})
