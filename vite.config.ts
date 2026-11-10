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
        rollupOptions: {
            output: {
                /**
                 * Vendor chunk splitting: libraries split into separate files.
                 * So when app code changes React/Supabase/UI are not downloaded again.
                 * The browser cache saves a lot on repeat visits.
                 */
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        // React ecosystem: change frequency none
                        if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                            return 'react-vendor'
                        }
                        // Supabase client: heavy but stable
                        if (id.includes('@supabase')) {
                            return 'supabase'
                        }
                        // UI libraries: Radix, Lucide icons
                        if (id.includes('@radix-ui') || id.includes('lucide-react')) {
                            return 'ui-vendor'
                        }
                    }
                },
            },
        },
    },
})
