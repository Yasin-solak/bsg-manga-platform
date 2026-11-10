# Reader mode audit

## Current state

`MangaReaderPage` currently runs as a reader with two modes.

- active modes: `vertical flow`, `horizontal page`
- current controls: zoom, fullscreen, auto-scroll, chapter and page navigation
- current side surfaces: chapter note, closing credit, chapter comments
- current persistence: `reader-preferences:v1` for reading preferences, `localStorage` for the anonymous reader key, `sessionStorage` for throttling

Still missing at the reading mode level:

- consistent progress transfer on mode change
- preload and neighbor page warmer for horizontal mode
- making mobile swipe / zoom / tap zones free of conflicts
- extending reader e2e smoke coverage to the reading mode matrix

## Core hardening done in this round

Reader preferences were put under a contract with the `reader-preferences:v1` key.

- `layoutMode`
- `zoomLevel`
- `autoScrollSpeed`
- `verticalImageFitMode`
- `horizontalImageFitMode`

Notes:

- `ReaderLayoutMode = vertical | horizontal-paged`
- `ReaderImageFitMode = fit-width | fit-height | original`
- Preferences persist between sessions in the same browser.
- Vertical flow opens with `fit-width` by default, horizontal page with `fit-height`.
- Each layout stores its own view preference separately; the last selected fit behavior is kept on mode change.
- Vertical mode works with scroll progress and auto-scroll.
- Horizontal mode works with a page index; auto-scroll is deliberately kept off in this mode.
- In horizontal mode the left and right touch zones of the stage are used for page or chapter navigation.
- In horizontal mode edge zones work with a directional cursor.
- The horizontal stage is not put inside a decorative card; the page shows more directly on a black ground.
- The `original` view allows controlled scrolling on overflowing stages; a fit mode does not break the stage.

## Next phase

The next sensible technical phase:

1. add preload and a neighbor page warmer for horizontal mode
2. split progress records durably into scroll and page-index
3. make mobile swipe / zoom / tap zones free of conflicts
4. extend reader e2e smoke coverage to the reading mode matrix
5. reduce perceived delay on nearby images while paging in horizontal mode
