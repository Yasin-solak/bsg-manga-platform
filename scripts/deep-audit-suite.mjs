import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const reportDir = path.join(rootDir, 'docs', 'reports')
const aggregateJsonPath = path.join(reportDir, 'deep-audit-baseline.json')
const failOnRegression = process.argv.includes('--fail-on-regression')

const IGNORE_DIRS = new Set([
  '.git',
  '.wrangler',
  // Claude Code arka-plan oturumlari .claude/worktrees/ altina tam repo
  // kopyasi acar; taramaya girerse metrikler ciftlenip strict gate patlar.
  '.claude',
  'coverage',
  'dist',
  'node_modules',
])

const TEXT_FILE_REGEX = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|sql|html|yml|yaml)$/i
const APP_FILE_REGEX = /(^|\/)src\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/i
const SERVICE_FILE_REGEX = /(^|\/)src\/(services|data)\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/i
const TEST_FILE_REGEX = /(^|\/)(tests|src\/__tests__)\/.*\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i
const UI_FILE_REGEX = /(^|\/)src\/(components|pages|contexts)\/.*\.(ts|tsx)$/i
const LOCAL_STORAGE_PATTERN = /\b(localStorage|sessionStorage|document\.cookie)\b/
const COOKIE_FLAG_PATTERN = /\b(HttpOnly|Secure|SameSite)\b/
const SUPABASE_AUTH_PATTERN = /\bsupabase\.auth\b/
const SUPABASE_QUERY_PATTERN = /\bsupabase\.(from|rpc|auth|channel)\b/g
const FETCH_PATTERN = /\bfetch\s*\(/g
const RETRY_PATTERN = /\b(retry|Retry-After|backoff|retryTimeout|runWithRetry)\b/i
const TIMEOUT_PATTERN = /\b(AbortController|timeout|Timeout|signal\s*:|clearTimeout|setTimeout|withServiceTimeout)\b/
const RATE_LIMIT_PATTERN = /\b(429|rate.?limit|Retry-After|X-RateLimit)\b/i
const IDEMPOTENCY_PATTERN = /\b(idempot|upsert|on_conflict|conflict|duplicate|single\(\))\b/i
const SELECT_STAR_PATTERN = /\.select\(\s*['"`]\*['"`]\s*\)/g
const ZOD_PATTERN = /\bfrom ['"]zod['"]|\bz\./
const JSONB_PATTERN = /\bjsonb\b|JSON\.stringify|jsonb_set/i
const VALIDATION_PATTERN = /\b(parse|safeParse|reportUserFacingError|toUserFacingErrorMessage|buildUserFacingErrorPayload)\b/
const IMPORT_PATTERN = /import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
const COMMENT_PATTERN = /(^|\s)(\/\/|\/\*|\*)/gm
const TUTORIAL_COMMENT_PATTERN = /\b(orchestrator|dashboard|quick action|hizli erisim|ana sayfa|main page|happy path)\b/i
const ASYNC_AWAIT_PATTERN = /\basync\b[\s\S]{0,120}\bawait\b/g
const CATCH_PATTERN = /\bcatch\s*\([^)]*\)\s*\{/
const WEBHOOK_PATTERN = /\bwebhook\b/i
const OAUTH_PATTERN = /\b(oauth|callback|redirect url|redirect_uri|state parametresi)\b/i
const EXTERNAL_URL_PATTERN = /https?:\/\/[^\s'")]+/g
const CHANGELOG_PATTERN = /^changelog(\.|$)/i
const RELEASE_DOC_PATTERN = /(release|rollback|hotfix|version)/i
const FLAKY_TEST_PATTERN = /\b(waitForTimeout|setTimeout|sleep|retry)\b/
const CRITICAL_SURFACE_PATTERN = /(auth|session|hover|fansub|store|profile)/i
const MULTI_TENANT_PATTERN = /\b(tenant_id|tenant|multitenant|multi-tenant)\b/i
const AUDIT_NOISE_PATH_PATTERN = /(^|\/)(docs|\.agent)\//i
const AUDIT_LOG_FILE_PATTERN = /(consolhata|halatarconsol|abidennotlar|Dikkat edilecekler)\.md$/i

function normalizeRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

function listFiles(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath))
      continue
    }
    files.push(fullPath)
  }

  return files
}

function safeRead(filePath) {
  return readFileSync(filePath, 'utf8')
}

function countLines(source) {
  if (!source) return 0
  return source.split(/\r?\n/).length
}

function countMatches(source, pattern) {
  if (!source) return 0
  const regex = new RegExp(pattern.source, pattern.flags)
  return source.match(regex)?.length || 0
}

function collectFileEntries() {
  return listFiles(rootDir)
    .filter((filePath) => TEXT_FILE_REGEX.test(filePath))
    .map((filePath) => {
      const source = safeRead(filePath)
      const relativePath = normalizeRelative(filePath)
      return {
        relativePath,
        source,
        lineCount: countLines(source),
        isAppFile: APP_FILE_REGEX.test(relativePath),
        isServiceFile: SERVICE_FILE_REGEX.test(relativePath),
        isTestFile: TEST_FILE_REGEX.test(relativePath),
        isUiFile: UI_FILE_REGEX.test(relativePath),
      }
    })
}

function resolveWithExtensions(baseRelativePath, fileMap) {
  const candidates = [
    baseRelativePath,
    `${baseRelativePath}.ts`,
    `${baseRelativePath}.tsx`,
    `${baseRelativePath}.js`,
    `${baseRelativePath}.jsx`,
    `${baseRelativePath}.mjs`,
    `${baseRelativePath}.cjs`,
    `${baseRelativePath}/index.ts`,
    `${baseRelativePath}/index.tsx`,
    `${baseRelativePath}/index.js`,
    `${baseRelativePath}/index.jsx`,
  ]

  return candidates.find((candidate) => fileMap.has(candidate)) || null
}

function resolveImportTarget(fileRelativePath, specifier, fileMap) {
  if (specifier.startsWith('@/')) {
    return resolveWithExtensions(`src/${specifier.slice(2)}`, fileMap)
  }
  if (!specifier.startsWith('.')) return null
  const fromDir = path.posix.dirname(fileRelativePath)
  return resolveWithExtensions(path.posix.normalize(path.posix.join(fromDir, specifier)), fileMap)
}

function buildImportGraph(appFiles) {
  const fileMap = new Map(appFiles.map((entry) => [entry.relativePath, entry]))
  const graph = new Map(appFiles.map((entry) => [entry.relativePath, new Set()]))
  const reverseGraph = new Map(appFiles.map((entry) => [entry.relativePath, new Set()]))

  for (const file of appFiles) {
    IMPORT_PATTERN.lastIndex = 0
    let match = IMPORT_PATTERN.exec(file.source)
    while (match) {
      const target = resolveImportTarget(file.relativePath, match[1], fileMap)
      if (target && target !== file.relativePath) {
        graph.get(file.relativePath)?.add(target)
        reverseGraph.get(target)?.add(file.relativePath)
      }
      match = IMPORT_PATTERN.exec(file.source)
    }
  }

  return { graph, reverseGraph }
}

function canonicalizeCycleNodes(nodes) {
  const ring = nodes.length > 1 && nodes[0] === nodes.at(-1)
    ? nodes.slice(0, -1)
    : [...nodes]
  if (ring.length === 0) return { signature: '', nodes: [] }

  const rotations = ring.map((_, index) => [
    ...ring.slice(index),
    ...ring.slice(0, index),
  ])
  rotations.sort((left, right) => {
    const leftKey = left.join('\0')
    const rightKey = right.join('\0')
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })

  const canonicalRing = rotations[0]
  const canonicalNodes = [...canonicalRing, canonicalRing[0]]
  return {
    signature: canonicalNodes.join(' -> '),
    nodes: canonicalNodes,
  }
}

function canonicalizeCycleSignature(signature) {
  return canonicalizeCycleNodes(String(signature || '').split(' -> ').filter(Boolean)).signature
}

function detectCycles(graph) {
  const cycles = []
  const visiting = new Set()
  const visited = new Set()
  const stack = []

  function visit(node) {
    if (cycles.length >= 20) return
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node)
      if (cycleStart >= 0) {
        const cycle = canonicalizeCycleNodes([...stack.slice(cycleStart), node])
        const { signature } = cycle
        if (!cycles.some((item) => item.signature === signature)) {
          cycles.push(cycle)
        }
      }
      return
    }
    if (visited.has(node)) return

    visiting.add(node)
    stack.push(node)
    for (const nextNode of graph.get(node) || []) {
      visit(nextNode)
      if (cycles.length >= 20) break
    }
    stack.pop()
    visiting.delete(node)
    visited.add(node)
  }

  for (const node of graph.keys()) {
    visit(node)
    if (cycles.length >= 20) break
  }

  return cycles
}

function computeLongestImportDepth(graph) {
  const memo = new Map()

  function depth(node, trail = new Set()) {
    if (memo.has(node)) return memo.get(node)
    if (trail.has(node)) return 0
    trail.add(node)
    let best = 1
    for (const nextNode of graph.get(node) || []) {
      best = Math.max(best, 1 + depth(nextNode, new Set(trail)))
    }
    memo.set(node, best)
    return best
  }

  let total = 0
  let count = 0
  let maxDepth = 0
  for (const node of graph.keys()) {
    const value = depth(node)
    total += value
    count += 1
    maxDepth = Math.max(maxDepth, value)
  }

  return {
    averageDepth: count > 0 ? Number((total / count).toFixed(2)) : 0,
    maxDepth,
  }
}

function tokenizePath(relativePath) {
  return relativePath
    .split(/[/._-]/)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 4)
}

function buildTestCoverageIndex(testFiles) {
  return testFiles.map((file) => ({
    relativePath: file.relativePath,
    tokens: new Set(tokenizePath(file.relativePath)),
    source: file.source,
  }))
}

function findMatchingTests(relativePath, testIndex) {
  const tokens = tokenizePath(relativePath)
  return testIndex
    .filter((entry) => tokens.some((token) => entry.tokens.has(token)))
    .map((entry) => entry.relativePath)
}

function runGit(command) {
  try {
    return execSync(command, { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim()
  } catch {
    return ''
  }
}

function toTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`
  const divider = `| ${columns.map((column) => (column.align === 'right' ? '---:' : '---')).join(' | ')} |`
  const body = rows.map((row) => `| ${columns.map((column) => column.render(row)).join(' | ')} |`)
  return [header, divider, ...body].join('\n')
}

function isOperationalAuditFile(file) {
  if (AUDIT_NOISE_PATH_PATTERN.test(file.relativePath)) return false
  if (AUDIT_LOG_FILE_PATTERN.test(file.relativePath)) return false
  if (file.relativePath === 'package-lock.json') return false
  if (file.relativePath === 'scripts/deep-audit-suite.mjs') return false
  if (file.relativePath.startsWith('supabase/') && /\.md$/i.test(file.relativePath)) return false
  return file.isAppFile
    || file.relativePath === 'package.json'
    || file.relativePath.startsWith('scripts/')
    || file.relativePath.startsWith('.github/')
    || file.relativePath.startsWith('supabase/')
}

function buildApiResilienceReport(appFiles, testIndex) {
  const serviceFiles = appFiles.filter((file) => file.isServiceFile)
  const surfaces = serviceFiles
    .map((file) => {
      const supabaseOperations = countMatches(file.source, SUPABASE_QUERY_PATTERN)
      const fetchOperations = countMatches(file.source, FETCH_PATTERN)
      const operationCount = supabaseOperations + fetchOperations
      if (operationCount === 0) return null
      const selectStarCount = countMatches(file.source, SELECT_STAR_PATTERN)
      const hasRetry = RETRY_PATTERN.test(file.source)
      const hasTimeout = TIMEOUT_PATTERN.test(file.source)
      const hasRateLimitHandling = RATE_LIMIT_PATTERN.test(file.source)
      const hasIdempotency = IDEMPOTENCY_PATTERN.test(file.source)
      const hasPagination = /\b(limit|range|page|cursor)\b/i.test(file.source)
      const matchedTests = findMatchingTests(file.relativePath, testIndex)
      const score = (operationCount * 3)
        + (selectStarCount * 4)
        + (!hasTimeout ? 4 : 0)
        + (!hasRetry && fetchOperations > 0 ? 3 : 0)
        + (!hasPagination && operationCount >= 3 ? 2 : 0)
        + (matchedTests.length === 0 ? 2 : 0)
      return {
        relativePath: file.relativePath,
        operationCount,
        supabaseOperations,
        fetchOperations,
        selectStarCount,
        hasTimeout,
        hasRetry,
        hasRateLimitHandling,
        hasIdempotency,
        hasPagination,
        matchedTests,
        score,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || right.operationCount - left.operationCount || left.relativePath.localeCompare(right.relativePath, 'tr'))

  const openApiCandidates = [
    'openapi.yaml',
    'openapi.yml',
    'openapi.json',
    'swagger.yaml',
    'swagger.yml',
    'swagger.json',
  ].filter((candidate) => existsSync(path.join(rootDir, candidate)))

  return {
    summary: {
      surfaceCount: surfaces.length,
      highRiskSurfaceCount: surfaces.filter((item) => item.score >= 12).length,
      selectStarSurfaceCount: surfaces.filter((item) => item.selectStarCount > 0).length,
      timeoutGapCount: surfaces.filter((item) => !item.hasTimeout).length,
      retryGapCount: surfaces.filter((item) => item.fetchOperations > 0 && !item.hasRetry).length,
      openApiStatus: openApiCandidates.length > 0 ? 'present' : 'missing',
    },
    openApiCandidates,
    highRiskSurfaces: surfaces.slice(0, 15),
    timeoutGaps: surfaces.filter((item) => !item.hasTimeout).map((item) => item.relativePath),
    retryGaps: surfaces.filter((item) => item.fetchOperations > 0 && !item.hasRetry).map((item) => item.relativePath),
    selectStarHotspots: surfaces.filter((item) => item.selectStarCount > 0).map((item) => ({
      relativePath: item.relativePath,
      selectStarCount: item.selectStarCount,
    })),
    contractCoverage: {
      covered: surfaces.filter((item) => item.matchedTests.length > 0).length,
      uncovered: surfaces.filter((item) => item.matchedTests.length === 0).map((item) => item.relativePath),
    },
  }
}

function buildSessionStateReport(appFiles) {
  const authFiles = appFiles.filter((file) => /\bauth\b/i.test(file.relativePath) || file.relativePath === 'src/contexts/AuthContext.tsx')
  const storageFiles = appFiles
    .filter((file) => LOCAL_STORAGE_PATTERN.test(file.source))
    .map((file) => ({
      relativePath: file.relativePath,
      usesLocalStorage: /\blocalStorage\b/.test(file.source),
      usesSessionStorage: /\bsessionStorage\b/.test(file.source),
      usesDocumentCookie: /\bdocument\.cookie\b/.test(file.source),
    }))
  const supabaseAuthFiles = appFiles.filter((file) => SUPABASE_AUTH_PATTERN.test(file.source)).map((file) => file.relativePath)
  const multiTabSupport = appFiles
    .filter((file) => /\b(visibilitychange|BroadcastChannel|addEventListener\(['"]storage|window\.focus|onAuthStateChange)\b/.test(file.source))
    .map((file) => file.relativePath)
  const passwordResetInvalidationFiles = authFiles
    .filter((file) => /\b(password|sifre).*(signOut|logout|oturum|session)/i.test(file.source))
    .map((file) => file.relativePath)
  const cookieFlagFiles = appFiles.filter((file) => COOKIE_FLAG_PATTERN.test(file.source)).map((file) => file.relativePath)
  /*
   * The rule applies only to auth files that DO WORK.
   *
   * Before, EVERY file with `auth` in its path was flagged, including purely visual components
   * with no error surface (e.g. password strength bar, progress indicator).
   * Asking a rendering component to "show the user an error" is meaningless, and the noise
   * leads to the gate not being taken seriously.
   *
   * The narrowing's effect was MEASURED (2026-08-22): before it there were 4 findings and
   * ALL FOUR were purely visual components; no working file dropped from the list.
   * So no real finding is hidden: every auth file with await/supabase/fetch/catch
   * is still in scope.
   */
  const authOperationPattern = /\b(await|supabase|fetch|catch|then)\b/
  const authUserFacingGaps = authFiles
    .filter((file) => !VALIDATION_PATTERN.test(file.source) && authOperationPattern.test(file.source))
    .map((file) => file.relativePath)

  return {
    summary: {
      authSurfaceCount: authFiles.length,
      storageTouchCount: storageFiles.length,
      supabaseAuthFileCount: supabaseAuthFiles.length,
      multiTabSupportCount: multiTabSupport.length,
      authUserFacingGapCount: authUserFacingGaps.length,
    },
    storageFiles,
    supabaseAuthFiles,
    multiTabSupport,
    passwordResetInvalidationFiles,
    cookieFlagFiles,
    authUserFacingGaps,
    notes: [
      passwordResetInvalidationFiles.length > 0
        ? 'Parola/oturum iliskisi olan akislarda invalidation izi bulundu.'
        : 'Parola degisimi sonrasi tum aktif oturumlarin kapatildigina dair yerel kanit bulunamadi.',
      cookieFlagFiles.length > 0
        ? 'Cookie flaglerine dair kod veya dokuman referansi bulundu.'
        : 'Cookie flag denetimi icin belirgin bir kod referansi yok; Supabase tarafinda harici ayar olabilir.',
    ],
  }
}

function buildIntegrationSecurityReport(allFiles) {
  const operationalFiles = allFiles.filter(isOperationalAuditFile)
  const webhookFiles = operationalFiles.filter((file) => WEBHOOK_PATTERN.test(file.relativePath) || WEBHOOK_PATTERN.test(file.source)).map((file) => file.relativePath)
  const oauthFiles = operationalFiles.filter((file) => OAUTH_PATTERN.test(file.relativePath) || OAUTH_PATTERN.test(file.source)).map((file) => file.relativePath)
  const externalUrlFiles = operationalFiles
    .map((file) => ({
      relativePath: file.relativePath,
      urls: Array.from(new Set(file.source.match(EXTERNAL_URL_PATTERN) || [])),
    }))
    .filter((file) => file.urls.length > 0)
  const supabaseFiles = operationalFiles.filter((file) => /\bsupabase\b/i.test(file.source) || /\bsupabase\b/i.test(file.relativePath)).map((file) => file.relativePath)
  const cloudflareFiles = operationalFiles.filter((file) => /\b(cloudflare|wrangler|pages deploy)\b/i.test(file.source) || /\b(cloudflare|wrangler)\b/i.test(file.relativePath)).map((file) => file.relativePath)

  return {
    summary: {
      webhookSurfaceCount: webhookFiles.length,
      oauthSurfaceCount: oauthFiles.length,
      externalUrlFileCount: externalUrlFiles.length,
      supabaseIntegrationCount: supabaseFiles.length,
      cloudflareIntegrationCount: cloudflareFiles.length,
    },
    webhookFiles,
    oauthFiles,
    externalUrlFiles: externalUrlFiles.slice(0, 20),
    supabaseFiles: supabaseFiles.slice(0, 30),
    cloudflareFiles: cloudflareFiles.slice(0, 30),
    findings: [
      webhookFiles.length === 0
        ? { key: 'webhook', status: 'na', detail: 'Repo icinde belirgin webhook alici veya gonderici yuzeyi bulunmadi.' }
        : { key: 'webhook', status: 'review', detail: 'Webhook yuzeyleri bulundu; imza, replay ve retry davranisi manuel inceleme gerektiriyor.' },
      oauthFiles.length === 0
        ? { key: 'oauth', status: 'na', detail: 'Dogrudan OAuth state akisi koda yansimiyor; callback referanslari daha cok dokuman tarafinda.' }
        : { key: 'oauth', status: 'review', detail: 'OAuth/callback referanslari bulundu; state ve refresh yarisi denetlenmeli.' },
    ],
  }
}

function buildSchemaValidationReport(appFiles, testIndex) {
  const candidateFiles = appFiles.filter((file) =>
    SERVICE_FILE_REGEX.test(file.relativePath)
      && /\b(insert|update|upsert|from\(|rpc\(|JSON\.stringify|jsonb)\b/i.test(file.source)
  )

  const validationHotspots = candidateFiles
    .map((file) => {
      const hasZod = ZOD_PATTERN.test(file.source)
      const hasValidation = VALIDATION_PATTERN.test(file.source)
      const hasJsonb = JSONB_PATTERN.test(file.source)
      const matchedTests = findMatchingTests(file.relativePath, testIndex)
      const score = (!hasZod ? 4 : 0) + (!hasValidation ? 4 : 0) + (hasJsonb ? 2 : 0) + (matchedTests.length === 0 ? 2 : 0)
      return {
        relativePath: file.relativePath,
        hasZod,
        hasValidation,
        hasJsonb,
        matchedTests,
        score,
      }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath, 'tr'))

  return {
    summary: {
      candidateCount: candidateFiles.length,
      hotspotCount: validationHotspots.length,
      zodCoverageCount: candidateFiles.filter((file) => ZOD_PATTERN.test(file.source)).length,
      jsonbTouchCount: candidateFiles.filter((file) => JSONB_PATTERN.test(file.source)).length,
    },
    validationHotspots: validationHotspots.slice(0, 20),
    unvalidatedCandidates: validationHotspots.filter((item) => !item.hasValidation).map((item) => item.relativePath),
    jsonbCandidates: validationHotspots.filter((item) => item.hasJsonb).map((item) => item.relativePath),
  }
}

function buildComplexityReport(appFiles, testIndex) {
  const { graph, reverseGraph } = buildImportGraph(appFiles)
  const cycles = detectCycles(graph)
  const importDepth = computeLongestImportDepth(graph)

  const fileStats = appFiles.map((file) => {
    const fanOut = (graph.get(file.relativePath) || new Set()).size
    const fanIn = (reverseGraph.get(file.relativePath) || new Set()).size
    const matchedTests = findMatchingTests(file.relativePath, testIndex)
    const commentCount = countMatches(file.source, COMMENT_PATTERN)
    const commentDensity = file.lineCount > 0 ? Number((commentCount / file.lineCount).toFixed(3)) : 0
    const asyncAwaitCount = countMatches(file.source, ASYNC_AWAIT_PATTERN)
    const tutorialStyle = TUTORIAL_COMMENT_PATTERN.test(file.source)
    const hasCatch = CATCH_PATTERN.test(file.source)
    const riskScore = Math.round(
      (file.lineCount / 100)
      + (fanOut * 1.4)
      + (fanIn * 1.2)
      + (matchedTests.length === 0 ? 3 : 0)
      + (asyncAwaitCount >= 4 && !hasCatch ? 2 : 0),
    )
    return {
      relativePath: file.relativePath,
      lineCount: file.lineCount,
      fanIn,
      fanOut,
      matchedTests,
      commentDensity,
      asyncAwaitCount,
      tutorialStyle,
      riskScore,
      hasCatch,
    }
  })

  const topRiskModules = [...fileStats]
    .sort((left, right) => right.riskScore - left.riskScore || right.lineCount - left.lineCount || left.relativePath.localeCompare(right.relativePath, 'tr'))
    .slice(0, 10)

  const untestedComplexModules = [...fileStats]
    .filter((item) => item.lineCount >= 300 && item.matchedTests.length === 0)
    .sort((left, right) => right.lineCount - left.lineCount || left.relativePath.localeCompare(right.relativePath, 'tr'))
    .slice(0, 15)

  return {
    summary: {
      appFileCount: appFiles.length,
      cycleCount: cycles.length,
      averageImportDepth: importDepth.averageDepth,
      maxImportDepth: importDepth.maxDepth,
      topRiskModuleCount: topRiskModules.length,
      untestedComplexModuleCount: untestedComplexModules.length,
    },
    cycles,
    topRiskModules,
    untestedComplexModules,
    fanInLeaders: [...fileStats].sort((left, right) => right.fanIn - left.fanIn).slice(0, 10),
    fanOutLeaders: [...fileStats].sort((left, right) => right.fanOut - left.fanOut).slice(0, 10),
    aiCodeAudit: {
      highCommentDensityCandidates: fileStats.filter((item) => item.commentDensity >= 0.08).slice(0, 15),
      tutorialStyleCandidates: fileStats.filter((item) => item.tutorialStyle).slice(0, 15),
      catchlessAsyncCandidates: fileStats.filter((item) => item.asyncAwaitCount >= 4 && !item.hasCatch).slice(0, 15),
    },
  }
}

function buildTestStrategyReport(allFiles, appFiles) {
  const testFiles = allFiles.filter((file) => file.isTestFile)
  const testIndex = buildTestCoverageIndex(testFiles)
  const contractTests = testFiles.filter((file) => /tests\/contracts\//.test(file.relativePath))
  const e2eTests = testFiles.filter((file) => /tests\/e2e\//.test(file.relativePath))
  const unitLikeTests = testFiles.filter((file) => !/tests\/contracts\//.test(file.relativePath) && !/tests\/e2e\//.test(file.relativePath))
  const flakyCandidates = testFiles.filter((file) => FLAKY_TEST_PATTERN.test(file.source)).map((file) => file.relativePath)
  const mutationToolPresent = allFiles.some((file) => /\b(stryker|mutation test)\b/i.test(file.relativePath) || /\b(stryker|mutation)\b/i.test(file.source))

  const allCriticalUntestedModules = appFiles
    .filter((file) => CRITICAL_SURFACE_PATTERN.test(file.relativePath))
    .map((file) => ({
      relativePath: file.relativePath,
      matchedTests: findMatchingTests(file.relativePath, testIndex),
      lineCount: file.lineCount,
    }))
    .filter((item) => item.matchedTests.length === 0)
    .sort((left, right) => right.lineCount - left.lineCount || left.relativePath.localeCompare(right.relativePath, 'tr'))

  const criticalUntestedModules = allCriticalUntestedModules.slice(0, 20)

  return {
    summary: {
      totalTestFileCount: testFiles.length,
      contractTestCount: contractTests.length,
      e2eTestCount: e2eTests.length,
      unitLikeTestCount: unitLikeTests.length,
      flakyCandidateCount: flakyCandidates.length,
      mutationTestSupport: mutationToolPresent,
    },
    pyramid: {
      contractTests: contractTests.map((file) => file.relativePath),
      e2eTests: e2eTests.map((file) => file.relativePath),
      unitLikeTests: unitLikeTests.map((file) => file.relativePath),
    },
    flakyCandidates,
    criticalUntestedModules,
    allCriticalUntestedModules,
    gaps: [
      mutationToolPresent ? null : 'Mutation test altyapisi yerel olarak bulunmadi.',
      e2eTests.length === 0 ? 'E2E test bulunmuyor.' : null,
      criticalUntestedModules.length > 0 ? 'Bazi kritik moduller icin eslesen test bulunamadi.' : null,
    ].filter(Boolean),
  }
}

function buildReleaseDisciplineReport(allFiles) {
  const currentBranch = runGit('git rev-parse --abbrev-ref HEAD')
  const recentSubjects = runGit('git log -n 30 --pretty=%s')
    .split(/\r?\n/)
    .filter(Boolean)
  const conventionalCommitCount = recentSubjects.filter((subject) => /^[a-z]+(\([^)]+\))?!?:\s/i.test(subject)).length
  const changelogFiles = allFiles.filter((file) => CHANGELOG_PATTERN.test(path.posix.basename(file.relativePath))).map((file) => file.relativePath)
  const releaseDocs = allFiles.filter((file) => RELEASE_DOC_PATTERN.test(file.relativePath)).map((file) => file.relativePath)
  const ciExists = existsSync(path.join(rootDir, '.github', 'workflows', 'ci.yml'))

  return {
    summary: {
      currentBranch,
      recentCommitCount: recentSubjects.length,
      conventionalCommitRatio: recentSubjects.length > 0 ? Number((conventionalCommitCount / recentSubjects.length).toFixed(2)) : 0,
      changelogCount: changelogFiles.length,
      ciConfigured: ciExists,
    },
    recentCommitSubjects: recentSubjects,
    changelogFiles,
    releaseDocs: releaseDocs.slice(0, 20),
    findings: [
      changelogFiles.length > 0
        ? { key: 'changelog', status: 'present', detail: 'CHANGELOG benzeri dosya bulundu.' }
        : { key: 'changelog', status: 'missing', detail: 'Yerel repo icinde CHANGELOG bulunmadi.' },
      ciExists
        ? { key: 'ci', status: 'present', detail: 'CI workflow bulundu.' }
        : { key: 'ci', status: 'missing', detail: 'CI workflow bulunmadi.' },
      recentSubjects.length > 0 && conventionalCommitCount === 0
        ? { key: 'commit-style', status: 'review', detail: 'Yakindaki commit mesajlari conventional pattern izlemiyor.' }
        : { key: 'commit-style', status: 'partial', detail: 'Commit mesaj disiplini yerel gecmisten kisitli olarak gozlenebiliyor.' },
    ],
    nonDiscoverable: [
      'Branch protection rule bilgisi yerelden dogrulanamiyor.',
      'PR inceleme SLA ve release onay zinciri git gecmisinden dogrudan cikartilamiyor.',
    ],
  }
}

function buildMultiTenantReport(allFiles) {
  const tenantFiles = allFiles
    .filter((file) => file.isAppFile || file.relativePath.startsWith('supabase/'))
    .filter((file) => MULTI_TENANT_PATTERN.test(file.relativePath) || MULTI_TENANT_PATTERN.test(file.source))
    .map((file) => file.relativePath)

  return {
    summary: {
      tenantSurfaceCount: tenantFiles.length,
      status: tenantFiles.length === 0 ? 'na' : 'review',
    },
    tenantFiles,
    finding: tenantFiles.length === 0
      ? 'Repo icinde tenant_id veya multi-tenant modeli gosteren belirgin bir yuzey bulunmadi; bu alan N/A kabul edildi.'
      : 'Tenant sinirlari gosteren yuzeyler bulundu; ayri guvenlik denetimi gerekir.',
  }
}

function loadPreviousAggregate() {
  if (!existsSync(aggregateJsonPath)) return null
  try {
    return JSON.parse(readFileSync(aggregateJsonPath, 'utf8'))
  } catch {
    return null
  }
}

function diffList(previousValues, currentValues) {
  const previousSet = new Set(previousValues || [])
  return (currentValues || []).filter((item) => !previousSet.has(item))
}

function buildNewViolations(previousReport, report) {
  if (!previousReport) {
    return {
      newApiTimeoutGaps: [],
      newSessionUserFacingGaps: [],
      newWebhookSurfaces: [],
      newSchemaValidationGaps: [],
      newImportCycles: [],
      newCriticalUntestedModules: [],
      newMultiTenantSurfaces: [],
    }
  }

  return {
    newApiTimeoutGaps: diffList(previousReport.apiResilience?.timeoutGaps, report.apiResilience.timeoutGaps),
    newSessionUserFacingGaps: diffList(previousReport.sessionState?.authUserFacingGaps, report.sessionState.authUserFacingGaps),
    newWebhookSurfaces: diffList(previousReport.integrationSecurity?.webhookFiles, report.integrationSecurity.webhookFiles),
    newSchemaValidationGaps: diffList(previousReport.schemaValidationCoverage?.unvalidatedCandidates, report.schemaValidationCoverage.unvalidatedCandidates),
    newImportCycles: diffList(
      (previousReport.complexityMap?.cycles || []).map((item) => canonicalizeCycleSignature(item.signature)),
      report.complexityMap.cycles.map((item) => canonicalizeCycleSignature(item.signature)),
    ),
    newCriticalUntestedModules: Array.isArray(previousReport.testStrategyCoverage?.allCriticalUntestedModules)
      ? diffList(
        previousReport.testStrategyCoverage.allCriticalUntestedModules.map((item) => item.relativePath),
        report.testStrategyCoverage.allCriticalUntestedModules.map((item) => item.relativePath),
      )
      : [],
    newMultiTenantSurfaces: diffList(previousReport.multiTenant?.tenantFiles, report.multiTenant.tenantFiles),
  }
}

function hasRegression(violations) {
  return Object.values(violations).some((items) => Array.isArray(items) && items.length > 0)
}

function toAggregateMarkdown(report) {
  const lines = []
  lines.push('# Deep Audit Baseline')
  lines.push('')
  lines.push(`- Uretim tarihi: ${report.generatedAt}`)
  lines.push(`- API riskli yuzey: ${report.apiResilience.summary.highRiskSurfaceCount}`)
  lines.push(`- Session user-facing gap: ${report.sessionState.summary.authUserFacingGapCount}`)
  lines.push(`- Webhook yuzeyi: ${report.integrationSecurity.summary.webhookSurfaceCount}`)
  lines.push(`- Schema hotspot: ${report.schemaValidationCoverage.summary.hotspotCount}`)
  lines.push(`- Complexity cycle: ${report.complexityMap.summary.cycleCount}`)
  lines.push(`- Kritik testsiz modul: ${report.testStrategyCoverage.criticalUntestedModules.length}`)
  lines.push(`- Multi-tenant durumu: ${report.multiTenant.summary.status}`)
  lines.push('')
  lines.push('## Yeni Regresyonlar')
  lines.push('')
  lines.push(`- API timeout gap: ${report.newViolations.newApiTimeoutGaps.join(', ') || 'yok'}`)
  lines.push(`- Session user-facing gap: ${report.newViolations.newSessionUserFacingGaps.join(', ') || 'yok'}`)
  lines.push(`- Webhook yuzeyi: ${report.newViolations.newWebhookSurfaces.join(', ') || 'yok'}`)
  lines.push(`- Schema validation gap: ${report.newViolations.newSchemaValidationGaps.join(', ') || 'yok'}`)
  lines.push(`- Import cycle: ${report.newViolations.newImportCycles.join(', ') || 'yok'}`)
  lines.push(`- Kritik testsiz modul: ${report.newViolations.newCriticalUntestedModules.join(', ') || 'yok'}`)
  lines.push(`- Multi-tenant surface: ${report.newViolations.newMultiTenantSurfaces.join(', ') || 'yok'}`)
  return `${lines.join('\n')}\n`
}

function toApiMarkdown(report) {
  const lines = []
  lines.push('# API Resilience Baseline')
  lines.push('')
  lines.push(`- API benzeri servis yuzeyi: ${report.summary.surfaceCount}`)
  lines.push(`- Yuksek riskli yuzey: ${report.summary.highRiskSurfaceCount}`)
  lines.push(`- Timeout gap: ${report.summary.timeoutGapCount}`)
  lines.push(`- Retry gap: ${report.summary.retryGapCount}`)
  lines.push(`- select('*') yuzeyi: ${report.summary.selectStarSurfaceCount}`)
  lines.push(`- OpenAPI durumu: ${report.summary.openApiStatus}`)
  lines.push('')
  lines.push('## Yuksek Riskli Yuzeyler')
  lines.push('')
  lines.push(toTable(report.highRiskSurfaces, [
    { label: 'Dosya', render: (row) => `\`${row.relativePath}\`` },
    { label: 'Skor', align: 'right', render: (row) => String(row.score) },
    { label: 'Op', align: 'right', render: (row) => String(row.operationCount) },
    { label: 'Timeout', render: (row) => (row.hasTimeout ? 'var' : 'yok') },
    { label: 'Retry', render: (row) => (row.hasRetry ? 'var' : 'yok') },
    { label: 'Test', render: (row) => (row.matchedTests.length > 0 ? 'var' : 'yok') },
  ]))
  lines.push('')
  lines.push(`- Timeout gap dosyalari: ${report.timeoutGaps.join(', ') || 'yok'}`)
  lines.push(`- Retry gap dosyalari: ${report.retryGaps.join(', ') || 'yok'}`)
  lines.push(`- OpenAPI aday dosyalari: ${report.openApiCandidates.join(', ') || 'yok'}`)
  return `${lines.join('\n')}\n`
}

function toSessionMarkdown(report) {
  const lines = []
  lines.push('# Session State Audit')
  lines.push('')
  lines.push(`- Auth yuzeyi: ${report.summary.authSurfaceCount}`)
  lines.push(`- Storage temas noktasi: ${report.summary.storageTouchCount}`)
  lines.push(`- Supabase auth kullanan dosya: ${report.summary.supabaseAuthFileCount}`)
  lines.push(`- Cok sekmeli destek izi: ${report.summary.multiTabSupportCount}`)
  lines.push(`- Auth user-facing gap: ${report.summary.authUserFacingGapCount}`)
  lines.push('')
  lines.push(`- Storage dosyalari: ${report.storageFiles.map((item) => item.relativePath).join(', ') || 'yok'}`)
  lines.push(`- Multi-tab destek dosyalari: ${report.multiTabSupport.join(', ') || 'yok'}`)
  lines.push(`- Auth user-facing gap dosyalari: ${report.authUserFacingGaps.join(', ') || 'yok'}`)
  lines.push('')
  lines.push('## Notlar')
  lines.push('')
  for (const note of report.notes) lines.push(`- ${note}`)
  return `${lines.join('\n')}\n`
}

function toIntegrationMarkdown(report) {
  const lines = []
  lines.push('# Integrations & Webhook Audit')
  lines.push('')
  lines.push(`- Webhook yuzeyi: ${report.summary.webhookSurfaceCount}`)
  lines.push(`- OAuth/callback yuzeyi: ${report.summary.oauthSurfaceCount}`)
  lines.push(`- Dis URL kullanan dosya: ${report.summary.externalUrlFileCount}`)
  lines.push(`- Supabase entegrasyon dosyasi: ${report.summary.supabaseIntegrationCount}`)
  lines.push(`- Cloudflare entegrasyon dosyasi: ${report.summary.cloudflareIntegrationCount}`)
  lines.push('')
  lines.push(`- Webhook dosyalari: ${report.webhookFiles.join(', ') || 'yok'}`)
  lines.push(`- OAuth/callback dosyalari: ${report.oauthFiles.join(', ') || 'yok'}`)
  lines.push('')
  lines.push('## Bulgular')
  lines.push('')
  for (const finding of report.findings) lines.push(`- [${finding.status}] ${finding.key}: ${finding.detail}`)
  return `${lines.join('\n')}\n`
}

function toSchemaMarkdown(report) {
  const lines = []
  lines.push('# Schema Serialization Audit')
  lines.push('')
  lines.push(`- Aday dosya: ${report.summary.candidateCount}`)
  lines.push(`- Validation hotspot: ${report.summary.hotspotCount}`)
  lines.push(`- Zod kapsami olan aday: ${report.summary.zodCoverageCount}`)
  lines.push(`- JSONB temas sayisi: ${report.summary.jsonbTouchCount}`)
  lines.push('')
  lines.push('## Validation Hotspotlari')
  lines.push('')
  lines.push(toTable(report.validationHotspots, [
    { label: 'Dosya', render: (row) => `\`${row.relativePath}\`` },
    { label: 'Skor', align: 'right', render: (row) => String(row.score) },
    { label: 'Zod', render: (row) => (row.hasZod ? 'var' : 'yok') },
    { label: 'Validation', render: (row) => (row.hasValidation ? 'var' : 'yok') },
    { label: 'JSONB', render: (row) => (row.hasJsonb ? 'var' : 'yok') },
  ]))
  return `${lines.join('\n')}\n`
}

function toComplexityMarkdown(report) {
  const lines = []
  lines.push('# Complexity Map')
  lines.push('')
  lines.push(`- App dosyasi: ${report.summary.appFileCount}`)
  lines.push(`- Import cycle: ${report.summary.cycleCount}`)
  lines.push(`- Ortalama import derinligi: ${report.summary.averageImportDepth}`)
  lines.push(`- Maksimum import derinligi: ${report.summary.maxImportDepth}`)
  lines.push(`- Testsiz karmasik modul: ${report.summary.untestedComplexModuleCount}`)
  lines.push('')
  lines.push('## En Riskli Moduller')
  lines.push('')
  lines.push(toTable(report.topRiskModules, [
    { label: 'Dosya', render: (row) => `\`${row.relativePath}\`` },
    { label: 'Skor', align: 'right', render: (row) => String(row.riskScore) },
    { label: 'Satir', align: 'right', render: (row) => String(row.lineCount) },
    { label: 'Fan-in', align: 'right', render: (row) => String(row.fanIn) },
    { label: 'Fan-out', align: 'right', render: (row) => String(row.fanOut) },
  ]))
  lines.push('')
  lines.push('## Import Cycle')
  lines.push('')
  lines.push(report.cycles.length > 0 ? report.cycles.map((cycle) => `- ${cycle.signature}`).join('\n') : '- yok')
  lines.push('')
  lines.push('## AI Code Audit Heuristics')
  lines.push('')
  lines.push(`- Yuksek yorum yogunlugu: ${report.aiCodeAudit.highCommentDensityCandidates.length}`)
  lines.push(`- Tutorial style adaylari: ${report.aiCodeAudit.tutorialStyleCandidates.length}`)
  lines.push(`- Catchless async adaylari: ${report.aiCodeAudit.catchlessAsyncCandidates.length}`)
  return `${lines.join('\n')}\n`
}

function toTestStrategyMarkdown(report) {
  const lines = []
  lines.push('# Test Strategy Audit')
  lines.push('')
  lines.push(`- Toplam test dosyasi: ${report.summary.totalTestFileCount}`)
  lines.push(`- Contract test: ${report.summary.contractTestCount}`)
  lines.push(`- E2E test: ${report.summary.e2eTestCount}`)
  lines.push(`- Unit-benzeri test: ${report.summary.unitLikeTestCount}`)
  lines.push(`- Flaky aday: ${report.summary.flakyCandidateCount}`)
  lines.push(`- Mutation test destegi: ${report.summary.mutationTestSupport ? 'var' : 'yok'}`)
  lines.push('')
  lines.push(`- Kritik testsiz moduller: ${report.criticalUntestedModules.map((item) => item.relativePath).join(', ') || 'yok'}`)
  lines.push(`- Flaky aday testler: ${report.flakyCandidates.join(', ') || 'yok'}`)
  lines.push('')
  lines.push('## Bosluklar')
  lines.push('')
  for (const gap of report.gaps) lines.push(`- ${gap}`)
  return `${lines.join('\n')}\n`
}

function toReleaseMarkdown(report) {
  const lines = []
  lines.push('# Release Discipline Audit')
  lines.push('')
  lines.push(`- Aktif branch: ${report.summary.currentBranch || 'tespit edilemedi'}`)
  lines.push(`- Son commit sayisi: ${report.summary.recentCommitCount}`)
  lines.push(`- Conventional commit orani: ${report.summary.conventionalCommitRatio}`)
  lines.push(`- CHANGELOG dosyasi: ${report.summary.changelogCount}`)
  lines.push(`- CI var mi: ${report.summary.ciConfigured ? 'evet' : 'hayir'}`)
  lines.push('')
  lines.push('## Bulgular')
  lines.push('')
  for (const finding of report.findings) lines.push(`- [${finding.status}] ${finding.key}: ${finding.detail}`)
  lines.push('')
  lines.push('## Yerelden Dogrulanamayanlar')
  lines.push('')
  for (const note of report.nonDiscoverable) lines.push(`- ${note}`)
  return `${lines.join('\n')}\n`
}

function toMultiTenantMarkdown(report) {
  const lines = []
  lines.push('# Multi-Tenant Audit')
  lines.push('')
  lines.push(`- Durum: ${report.summary.status}`)
  lines.push(`- Tenant yuzeyi: ${report.summary.tenantSurfaceCount}`)
  lines.push('')
  lines.push(`- ${report.finding}`)
  if (report.tenantFiles.length > 0) {
    lines.push('')
    lines.push(`- Dosyalar: ${report.tenantFiles.join(', ')}`)
  }
  return `${lines.join('\n')}\n`
}

function writeReport(baseName, payload, markdown) {
  writeFileSync(path.join(reportDir, `${baseName}.json`), JSON.stringify(payload, null, 2))
  writeFileSync(path.join(reportDir, `${baseName}.md`), markdown)
}

function main() {
  mkdirSync(reportDir, { recursive: true })

  const previousReport = loadPreviousAggregate()
  const allFiles = collectFileEntries()
  const appFiles = allFiles.filter((file) => file.isAppFile)
  const testFiles = allFiles.filter((file) => file.isTestFile)
  const testIndex = buildTestCoverageIndex(testFiles)

  const report = {
    generatedAt: new Date().toISOString(),
    apiResilience: buildApiResilienceReport(appFiles, testIndex),
    sessionState: buildSessionStateReport(appFiles),
    integrationSecurity: buildIntegrationSecurityReport(allFiles),
    schemaValidationCoverage: buildSchemaValidationReport(appFiles, testIndex),
    complexityMap: buildComplexityReport(appFiles, testIndex),
    testStrategyCoverage: buildTestStrategyReport(allFiles, appFiles),
    releaseDiscipline: buildReleaseDisciplineReport(allFiles),
    multiTenant: buildMultiTenantReport(allFiles),
  }

  report.newViolations = buildNewViolations(previousReport, report)

  writeReport('deep-audit-baseline', report, toAggregateMarkdown(report))
  writeReport('api-resilience-baseline', report.apiResilience, toApiMarkdown(report.apiResilience))
  writeReport('session-state-audit', report.sessionState, toSessionMarkdown(report.sessionState))
  writeReport('integrations-webhook-audit', report.integrationSecurity, toIntegrationMarkdown(report.integrationSecurity))
  writeReport('schema-serialization-audit', report.schemaValidationCoverage, toSchemaMarkdown(report.schemaValidationCoverage))
  writeReport('complexity-map', report.complexityMap, toComplexityMarkdown(report.complexityMap))
  writeReport('test-strategy-audit', report.testStrategyCoverage, toTestStrategyMarkdown(report.testStrategyCoverage))
  writeReport('release-discipline-audit', report.releaseDiscipline, toReleaseMarkdown(report.releaseDiscipline))
  writeReport('multi-tenant-audit', report.multiTenant, toMultiTenantMarkdown(report.multiTenant))

  console.log(`[deep-audit] api riskli yuzey: ${report.apiResilience.summary.highRiskSurfaceCount}`)
  console.log(`[deep-audit] session user-facing gap: ${report.sessionState.summary.authUserFacingGapCount}`)
  console.log(`[deep-audit] webhook yuzeyi: ${report.integrationSecurity.summary.webhookSurfaceCount}`)
  console.log(`[deep-audit] schema hotspot: ${report.schemaValidationCoverage.summary.hotspotCount}`)
  console.log(`[deep-audit] complexity cycle: ${report.complexityMap.summary.cycleCount}`)
  console.log(`[deep-audit] critical modules without tests: ${report.testStrategyCoverage.criticalUntestedModules.length}`)
  console.log(`[deep-audit] multi-tenant: ${report.multiTenant.summary.status}`)

  if (failOnRegression && hasRegression(report.newViolations)) {
    console.error('[deep-audit] new regression found.')
    process.exitCode = 1
  }
}

main()
