/**
 * Resolve a slot's horizontal placement.
 *
 * Most slots are centred on the page axis, but some are pinned: Headline Win
 * (21770:3317) puts its heading at left 108, and its currency and game name at
 * right edge 1334.38 via Figma's `-translate-x-full`.
 */
const d = n => `calc(${+Number(n).toFixed(3)} * var(--u))`

export function alignStyle({ align, left, right, width }) {
  if (align === 'left') {
    return { insetInline: 'auto', left: d(left), marginInline: '0', textAlign: 'left', width: width ? d(width) : 'max-content' }
  }
  if (align === 'right') {
    return { insetInline: 'auto', right: d(1443 - right), marginInline: '0', textAlign: 'right', width: width ? d(width) : 'max-content' }
  }
  return width
    ? { insetInline: 'auto', left: d(left), width: d(width), marginInline: '0' }
    : {}
}
