// Contracts pin source text; the translation wrapper (txa) does not remove the pinned Turkish text,
// only wraps it. This helper unwraps it: the guard keeps searching the same text,
// and its English equivalent is enforced separately by i18n-text-coverage-contract.

function readString(source, start) {
  const quote = source[start]
  if (quote !== "'" && quote !== '"') return null
  let value = ''
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '\\') {
      value += source[i + 1]
      i += 1
    } else if (ch === quote) {
      return { value, end: i + 1 }
    } else if (ch === '\n') {
      return null
    } else {
      value += ch
    }
  }
  return null
}

function readBalanced(source, start) {
  const open = { '{': '}', '(': ')', '[': ']' }
  const stack = []
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === "'" || ch === '"') {
      const literal = readString(source, i)
      if (literal) i = literal.end - 1
    } else if (ch === '`') {
      i = source.indexOf('`', i + 1)
      if (i < 0) return -1
    } else if (open[ch]) {
      stack.push(open[ch])
    } else if (ch === stack[stack.length - 1]) {
      stack.pop()
      if (!stack.length) return i + 1
    }
  }
  return -1
}

function parseVars(body) {
  const vars = {}
  const pattern = /v(\d+):\s*/g
  let depth = 0
  let current = null
  let from = 0
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch === "'" || ch === '"') {
      const literal = readString(body, i)
      if (literal) i = literal.end - 1
      continue
    }
    if (ch === '`') {
      i = body.indexOf('`', i + 1)
      if (i < 0) break
      continue
    }
    if ('({['.includes(ch)) depth += 1
    if (')}]'.includes(ch)) depth -= 1
    if (depth !== 0) continue
    pattern.lastIndex = i
    const match = /^(?:^|,?\s*)v(\d+):\s*/.exec(body.slice(i))
    if (match && (i === 0 || ch === ',' || /\s/.test(ch))) {
      if (current) vars[current] = body.slice(from, i).trim()
      current = match[1]
      from = i + match[0].length
      i += match[0].length - 1
    }
  }
  if (current) vars[current] = body.slice(from).trim().replace(/,$/, '')
  return vars
}

function fill(text, vars, wrap) {
  return text.replace(/\{v(\d+)\}/g, (whole, key) => (key in vars ? wrap(vars[key]) : whole))
}

function unwrapOnce(source) {
  let out = ''
  let cursor = 0
  const pattern = /(?<![\w.])txa\(/g
  let match
  while ((match = pattern.exec(source))) {
    const textStart = match.index + match[0].length
    const literal = readString(source, textStart)
    if (!literal) continue
    let end = literal.end
    let vars = null
    if (source.startsWith(', {', end)) {
      const close = readBalanced(source, end + 2)
      if (close < 0) continue
      vars = parseVars(source.slice(end + 3, close - 1).trim())
      end = close
    }
    if (source[end] !== ')') continue
    end += 1

    const before = source.slice(cursor, match.index)
    const jsxBrace = before.endsWith('{') && source[end] === '}'
    const attr = jsxBrace ? /([A-Za-z-]+)=\{$/.exec(before) : null
    const getter = /get ([\w']+)\(\) \{ return $/.exec(before)
    if (getter && source.startsWith(' }', end)) {
      out += before.slice(0, getter.index) + `${getter[1]}: '${literal.value}'`
      end += 2
    } else if (attr && !vars) {
      out += before.slice(0, -1) + `"${literal.value}"`
      end += 1
    } else if (jsxBrace && !attr) {
      out += before.slice(0, -1) + fill(literal.value, vars ?? {}, (expr) => `{${expr}}`)
      end += 1
    } else if (vars) {
      out += before + '`' + fill(literal.value, vars, (expr) => '${' + expr + '}') + '`'
    } else {
      out += before + `'${literal.value}'`
    }
    cursor = end
    pattern.lastIndex = end
  }
  return out + source.slice(cursor)
}

export function untranslate(source) {
  let current = source
  for (let pass = 0; pass < 4; pass += 1) {
    const next = unwrapOnce(current)
    if (next === current) break
    current = next
  }
  return current
}

// Language layer for contracts that run modules: Turkish text returns as is.
const fillVars = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole))
export const activeLocaleShim = { txa: fillVars, intlLocale: () => 'tr-TR', getActiveLocale: () => 'tr', lookupEn: (text) => text }

// Inlines the language layer in ESM output loaded via a data: URL.
export function inlineActiveLocale(js) {
  return js.replace(/import \{([^}]*)\} from ['"]@\/i18n\/activeLocale['"];?/, (whole, names) => names.split(',').map((name) => name.trim()).filter(Boolean).map((name) => {
    if (name === 'txa') return "const txa = (text, vars = {}) => text.replace(/\\{(\\w+)\\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole));"
    if (name === 'intlLocale') return "const intlLocale = () => 'tr-TR';"
    if (name === 'getActiveLocale') return "const getActiveLocale = () => 'tr';"
    return `const ${name} = (text) => text;`
  }).join('\n'))
}
