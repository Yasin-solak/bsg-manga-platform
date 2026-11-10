export function featureFlagUsageSource(file) {
  if (file.isAppCode) return file.source
  if (!/^supabase\/migrations\/[^/]+\.sql$/i.test(file.relativePath)) return ''
  // SQL functions also consume flags. A seed row, comment or test reference is not usage.
  // This is a static dependency inventory; it does not prove the live flag's value.
  const source = file.source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
  return Array.from(source.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\b[\s\S]*?\bas\s+(\$(?:[a-z_][a-z_0-9]*)?\$)([\s\S]*?)\1/gi), match => match[2]).join('\n')
}
