import { createRoot } from 'react-dom/client'
import EmbedWidget from './EmbedWidget.jsx'
import widgetCss from '../index.css?inline'
import { getProductById } from '../data/products'

/* ─────────────────────────────────────────────────────────────────────────
   Shadow DOM mounting

   Tailwind's @theme block declares the design tokens (--color-*, --shadow-*,
   etc.) on `:root`, which does NOT penetrate a shadow tree — without this
   patch every component would render completely unstyled inside the shadow
   root. Mirroring the same declarations onto `:host` is the standard fix.
   This transforms the already-compiled CSS text at injection time only —
   it does not modify index.css/widget.css.

   `:host { all: initial; ... }` resets inherited properties (font-family,
   color, line-height) that CSS inheritance would otherwise carry in from
   the retailer's page across the shadow boundary (Shadow DOM isolates
   selector matching, not property inheritance). The widget's own styles
   (which follow right after in the same stylesheet) re-establish everything
   they need, same as they already do for `body` in the non-embedded demo.
   ───────────────────────────────────────────────────────────────────────── */
const HOST_RESET = `
:host {
  all: initial;
  display: block;
  font-family: var(--font-display);
  color: var(--color-text-primary);
  line-height: normal;
}
`

function injectStyles(shadowRoot) {
  const style = document.createElement('style')
  style.textContent = HOST_RESET + widgetCss.replace(/:root\b/g, ':root, :host')
  shadowRoot.appendChild(style)
}

/**
 * Mount the Manikan try-on widget into `target`.
 *
 * @param {string|HTMLElement} target - a CSS selector or element to attach
 *   a shadow root to. The element itself becomes the shadow host, so any
 *   layout/positioning (floating vs. inline) is the caller's concern — this
 *   function only handles style isolation + rendering inside the shadow root.
 * @param {{ productId: string, retailerId?: string }} options
 * @returns {{ unmount: () => void } | null}
 */
export function mount(target, { productId, retailerId } = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target
  if (!host) {
    console.error(`Manikan widget: mount target "${target}" not found`)
    return null
  }

  const product = getProductById(productId)
  if (!product) {
    console.error(`Manikan widget: unknown productId "${productId}"`)
    return null
  }

  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  shadowRoot.innerHTML = ''
  injectStyles(shadowRoot)

  const container = document.createElement('div')
  shadowRoot.appendChild(container)

  const root = createRoot(container)
  root.render(<EmbedWidget product={product} retailerId={retailerId} />)

  return { unmount: () => root.unmount() }
}
