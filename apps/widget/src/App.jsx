import { useState, useCallback, useRef } from 'react'
import ControlPanel from './components/ControlPanel'
import AvatarViewer from './components/AvatarViewer'
import ManikanWidget from './components/ManikanWidget'
import { generateAvatar } from './lib/api'
import { getProducts } from './data/products'

const PRODUCTS = getProducts()

/* ─────────────────────────────────────────────────────────────────────────
   Body Playground — bare SMPL avatar from 5 measurements (/generate-avatar)
   ───────────────────────────────────────────────────────────────────────── */
function PlaygroundTab() {
  const [modelUrl, setModelUrl] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const previousUrlRef = useRef(null)

  const handleGenerate = useCallback(async (measurements) => {
    setIsLoading(true)
    setError(null)
    try {
      const url = await generateAvatar(measurements)
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current)
      previousUrlRef.current = url
      setModelUrl(url)
    } catch (err) {
      console.error('Avatar generation failed:', err)
      setError(err.message || 'Failed to generate avatar. Is the body service running on :8001?')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-[380px] min-w-[340px] flex-shrink-0">
        <ControlPanel onGenerate={handleGenerate} isLoading={isLoading} />
      </aside>
      <main className="flex-1 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-surface-primary via-surface-secondary to-surface-primary" />
        <div className="relative z-[1] w-full h-full">
          <AvatarViewer modelUrl={modelUrl} isLoading={isLoading} />
        </div>
        {error && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-danger/10 border border-danger/20 backdrop-blur-md shadow-lg">
              <p className="text-sm text-danger font-medium">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-2 text-danger/60 hover:text-danger transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Try-On Tab — pick a product from the static catalog, open the widget
   modal (/generate-dressed-avatar). Swap ./data/products.js for a Store
   API call later — this tab doesn't need to change.
   ───────────────────────────────────────────────────────────────────────── */
function TryOnTab() {
  const [activeProduct, setActiveProduct] = useState(null)

  return (
    <div className="flex-1 overflow-y-auto p-10">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-bold text-text-primary mb-2">Pick a product to try on</h2>
        <p className="text-sm text-text-muted mb-8">
          Static demo catalog (src/data/products.js) — swap for a Store API call later.
        </p>
        <div className="product-grid">
          {PRODUCTS.map(product => (
            <button
              key={product.id}
              onClick={() => setActiveProduct(product)}
              className="product-card text-left cursor-pointer"
              id={`try-on-${product.id}`}
            >
              <div className="product-card-image-wrap">
                <img src={product.image} alt={product.name} className="product-card-image" />
                <div className="product-card-overlay">
                  <span className="product-card-cta">Try It On</span>
                </div>
              </div>
              <div className="product-card-info">
                <div className="product-card-color-dot" style={{ background: product.color_hex }} />
                <div className="product-card-name">{product.name}</div>
                <div className="product-card-color-name">{product.color_name}</div>
                <div className="product-card-bottom">
                  <span className="product-card-price">{product.price.toFixed(2)} EGP</span>
                  <span className="product-card-sizes">{Object.keys(product.sizes).join(' · ')}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {activeProduct && (
        <ManikanWidget product={activeProduct} onClose={() => setActiveProduct(null)} />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Dev Demo Shell
   ───────────────────────────────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab] = useState('tryon')

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-primary flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-surface-secondary border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center text-white font-extrabold text-sm">
            M
          </div>
          <span className="font-bold text-text-primary tracking-wide">Manikan Widget — Dev Demo</span>
        </div>
        <div className="flex gap-2 p-1 bg-surface-primary rounded-lg border border-border-subtle">
          <button
            onClick={() => setTab('tryon')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              tab === 'tryon' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Try-On Widget
          </button>
          <button
            onClick={() => setTab('playground')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all cursor-pointer ${
              tab === 'playground' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Body Playground
          </button>
        </div>
      </header>

      {tab === 'playground' ? <PlaygroundTab /> : <TryOnTab />}
    </div>
  )
}
