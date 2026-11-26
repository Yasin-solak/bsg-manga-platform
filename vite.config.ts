import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import path from 'path'
// @ts-expect-error Dev-only proxy scripti JS tutuluyor; build yuzeyine runtime kodu sizmiyor.
import { createDevUserAvatarUploadMiddleware } from './scripts/dev-user-avatar-upload-proxy.mjs'

/**
 * The version id is embedded AT BUILD TIME.
 *
 * For the operations panel to answer "which version is live" a source readable
 * at runtime is needed; the `package.json` version is
 * 0.0.0 and does not change across deploys. The Git commit does this reliably.
 *
 * With no Git (clean tarball, non-CI environment) the build does NOT BREAK: an unknown value
 * returns and the panel shows "unknown".
 */
function readGitCommit(): string {
    try {
        return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim()
    } catch {
        return 'bilinmiyor'
    }
}

// Both separators: module ids use "/" on Linux (CI) and can use "\" on Windows.
const REACT_RUNTIME_PACKAGE = /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/
const SUPABASE_PACKAGE = /[\\/]node_modules[\\/]@supabase[\\/]/
const UI_LIBRARY_PACKAGE = /[\\/]node_modules[\\/](@radix-ui|lucide-react|@phosphor-icons)[\\/]/
// Measured on the home page (2026-11-24): 0 gives 169 first-load files, 10 KB gives 97 for
// 18 KB more gzip, 50 KB gives back the whole saving.
const UI_CHUNK_MERGE_THRESHOLD_BYTES = 10 * 1024

// https://vite.dev/config/
export default defineConfig({
    server: { proxy: { '/api/community/files': { target: 'https://bsg-community-media.your-subdomain.workers.dev', changeOrigin: true } } },
    define: {
        __APP_COMMIT__: JSON.stringify(readGitCommit()),
        __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
        react(),
        tailwindcss(),
        {
            name: 'dev-user-avatar-upload-proxy',
            configureServer(server) {
                server.middlewares.use(createDevUserAvatarUploadMiddleware())
            },
        },
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@components': path.resolve(__dirname, './src/components'),
            '@pages': path.resolve(__dirname, './src/pages'),
            '@hooks': path.resolve(__dirname, './src/hooks'),
            '@services': path.resolve(__dirname, './src/services'),
            '@styles': path.resolve(__dirname, './src/styles'),
            '@utils': path.resolve(__dirname, './src/utils'),
            '@types': path.resolve(__dirname, './src/types'),
        },
    },
    build: {
        /* Vendor chunks can exceed 500 KB, remove the warning */
        chunkSizeWarningLimit: 600,
        rolldownOptions: {
            output: {
                /**
                 * Vendor chunk splitting: the React runtime and the Supabase client go into
                 * their own files, so an app change does not make browsers download them again.
                 *
                 * The package DIRECTORY is matched, not a substring: '@radix-ui/react-*',
                 * 'lucide-react' and '@phosphor-icons/react' all contain "react", and a substring
                 * test pulled every icon and Radix primitive used anywhere in the app (admin
                 * included) into the chunk the first page load has to download.
                 *
                 * UI libraries are split by which routes import them (entriesAware), so the first
                 * load only gets what the shell and the opened page use. Without the merge
                 * threshold every shared icon becomes its own sub-1 KB file.
                 */
                codeSplitting: {
                    groups: [
                        { name: 'react-vendor', test: REACT_RUNTIME_PACKAGE, priority: 30 },
                        { name: 'supabase', test: SUPABASE_PACKAGE, priority: 20 },
                        {
                            name: 'ui',
                            test: UI_LIBRARY_PACKAGE,
                            priority: 10,
                            entriesAware: true,
                            entriesAwareMergeThreshold: UI_CHUNK_MERGE_THRESHOLD_BYTES,
                        },
                    ],
                },
            },
        },
    },
})
