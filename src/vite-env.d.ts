/// <reference types="vite/client" />

/** Derleme aninda gomulen git commit'i; bkz. vite.config.ts. */
declare const __APP_COMMIT__: string
/** Derlemenin yapildigi an (ISO). Deploy zamaninin yerine gecer. */
declare const __APP_BUILT_AT__: string

declare module '*.webp' {
    const src: string
    export default src
}

declare module '*.webm' {
    const src: string
    export default src
}
