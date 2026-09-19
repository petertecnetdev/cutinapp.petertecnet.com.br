# Cutinapp Overlay Layout Policy

## Contract
All fixed/sticky UI shares one layout contract. New fixed UI must not choose arbitrary bottom offsets or z-index values. Use the tokens in `overlay-layout-system.css` and register recognizable selectors/data attributes with `overlayLayoutManager.js`.

Zones: `top`, `bottom`, `bottom-left`, `bottom-right`, `fullscreen`.
Priority: content < sticky < floating < commerce < navbar/open surface < popover < commerce sheet < backdrop < modal < toast < critical.

The runtime manager measures the real bottom navigation, event action rail and persistent cart with ResizeObserver, reacts to viewport/orientation/keyboard changes, writes `--cut-runtime-*` variables, reserves scroll space and reports forbidden collisions as `ui_overlay_collision`.

## Required regression matrix
Widths/heights: 320x568, 360x800, 390x844, 412x915, tablet and desktop. Verify Chrome Android/PWA, Safari iOS/PWA, portrait/landscape, browser zoom and enlarged text. States: empty/one/many cart items; cart open/closed; event editor; hamburger; modal; keyboard/input focus; WhatsApp/share/flyer; editor action rail.

For `/event/edit/:id` with a pending cart: Preview, Save and Publish must remain fully visible and clickable; cart must be above the action rail; bottom navigation must remain below it; last page control must scroll into view.

## Development rule
Do not add raw high z-index or magic mobile bottom offsets in page/component CSS. Extend the shared overlay system instead. CI runs `npm run lint:overlays`; a failure must be resolved before merge. Keep screenshot/manual device checks for release smoke tests in addition to automated DOM collision tests.
