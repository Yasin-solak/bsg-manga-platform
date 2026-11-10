import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const repoHealthBaselinePath = path.join(rootDir, 'docs', 'reports', 'repo-health-baseline.json')

function loadLegacyAppConsoleAllowlist() {
  if (!existsSync(repoHealthBaselinePath)) return []
  try {
    const report = JSON.parse(readFileSync(repoHealthBaselinePath, 'utf8'))
    if (Array.isArray(report.appConsoleFiles)) {
      return report.appConsoleFiles
    }
  } catch {
    return []
  }
  return []
}

const LEGACY_APP_CONSOLE_ALLOWLIST = loadLegacyAppConsoleAllowlist()

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-ssr/**',
      '.ssr-temp/**',
      'node_modules/**',
      '.wrangler/**',
      '.tmp/**',
      'coverage/**',
      // Background sessions open full repo copies under .claude/worktrees/.
      // Gitignored so CI does not see them but local lint would produce thousands of false errors
      // (repo-health and deep-audit scanners have the same ignore).
      '.claude/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: [
      'scripts/browser-live-audit.mjs',
      'scripts/inspect-live-admin-browser.mjs',
      'scripts/live-auth-browser-audit.mjs',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // Service worker dosyalari: 'self' / clients / registration globalleri
    files: ['public/push-sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.eslint.json'],
        tsconfigRootDir: rootDir,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
        allowExportNames: [
          'badgeVariants',
          'buttonVariants',
          'navigationMenuTriggerStyle',
          'tabsListVariants',
          'getRelativeTime',
          'useSidebar',
          'useAuth',
        ],
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/services/logger.ts', ...LEGACY_APP_CONSOLE_ALLOWLIST],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // Multi-language addresses: these names must come from the language-aware wrapper,
    // otherwise a link on an English page falls to a Turkish address.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/i18n/router.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'react-router-dom',
          importNames: ['Link', 'NavLink', 'Navigate', 'useNavigate', 'useSearchParams'],
          message: "Dil farkindalikli surumu '@/i18n/router' icinden al.",
        }],
      }],
    },
  },
)
