// hyphen paketi (TeX heceleme desenleri) tip bildirimi; dil alt yollari ayni arayuzu verir.
declare module 'hyphen/*' {
  const hyphenator: {
    hyphenateSync: (text: string, options?: { hyphenChar?: string, minWordLength?: number }) => string
  }
  export default hyphenator
}
