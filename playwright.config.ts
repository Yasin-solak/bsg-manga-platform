import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    timeout: 45_000,
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ],
    expect: {
        timeout: 8_000,
    },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 120_000,
    },
})
