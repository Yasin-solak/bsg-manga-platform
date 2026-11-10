import { isIP } from 'node:net'
import ts from 'typescript'
import { loadEnv } from 'vite'

const MEDIA_ENV_KEYS = {
  'store-assets://': 'VITE_STORE_ASSET_PUBLIC_BASE_URL',
  'chapter-pages://': 'VITE_CHAPTER_PAGE_PUBLIC_BASE_URL',
}

export function loadProductionFrontendEnv(cwd) {
  // Keeps the same .env.production.local and process.env priority as Vite.
  return loadEnv('production', cwd, 'VITE_')
}

function normalizeBase(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/g, '') : ''
}

export function assertProductionMediaBases(frontendEnv) {
  const bases = new Map()
  for (const [scheme, key] of Object.entries(MEDIA_ENV_KEYS)) {
    const base = normalizeBase(frontendEnv[key])
    if (!base) {
      throw new Error(`${key} is not defined. Fill in the production media address and rebuild.`)
    }

    let url
    try {
      url = new URL(base)
    } catch {
      throw new Error(`${key} geçerli bir HTTPS medya tabanı olmalıdır.`)
    }

    const hostname = url.hostname.toLowerCase()
    const isPublicHostname = hostname.includes('.')
      && !isIP(hostname.replace(/^\[|\]$/g, ''))
      && !/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(hostname)
      && !/(^|\.)example\.(com|org|net)$/.test(hostname)
      && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)
      && !hostname.includes('..')

    if (url.protocol !== 'https:' || !isPublicHostname || url.username || url.password
      || url.search || url.hash || /\s|\\/.test(base)) {
      throw new Error(`${key} kimlik bilgisi, sorgu veya fragment içermeyen, genel erişime açık bir HTTPS alan adı olmalıdır.`)
    }

    bases.set(scheme, { key, base })
  }
  return bases
}

function propertyName(node) {
  return node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined
}

function readStaticInput(node, declarations, visited = new Set()) {
  if (!node || visited.has(node)) return undefined
  visited.add(node)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isParenthesizedExpression(node)) return readStaticInput(node.expression, declarations, visited)
  if (ts.isIdentifier(node)) return readStaticInput(declarations.get(node.text), declarations, visited)
  // Tracks the input of the compiled normalizePublicBaseUrl call; does not run package code.
  if (ts.isCallExpression(node) && node.arguments.length === 1) {
    return readStaticInput(node.arguments[0], declarations, visited)
  }
  return undefined
}

function readResolverBases(fileName, content) {
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const declarations = new Map()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration.initializer)
    }
  }

  const bases = []
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map(node.properties
        .filter(ts.isPropertyAssignment)
        .map((property) => [propertyName(property.name), property.initializer]))
      const scheme = readStaticInput(properties.get('scheme'), declarations)
      if (Object.hasOwn(MEDIA_ENV_KEYS, scheme) && properties.has('publicBaseUrl')) {
        bases.push({ scheme, base: normalizeBase(readStaticInput(properties.get('publicBaseUrl'), declarations)) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return bases
}

export function assertBuiltMediaConfiguration(clientScripts, expectedBases) {
  const found = new Set()
  for (const { relativePath, content } of clientScripts) {
    for (const { scheme, base } of readResolverBases(relativePath, content)) {
      const expected = expectedBases.get(scheme)
      if (base !== expected.base) {
        throw new Error(`${expected.key} does not match the media config in dist (${relativePath}). Rebuild with the right production environment.`)
      }
      found.add(scheme)
    }
  }

  for (const [scheme, { key }] of expectedBases) {
    if (!found.has(scheme)) {
      throw new Error(`${key} could not be verified in the media config of the dist client bundle. Rebuild; if the bundle structure changed update the check.`)
    }
  }
}
