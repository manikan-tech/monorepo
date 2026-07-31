import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import MeasurementSlider from './MeasurementSlider'
import TryOnViewer from './TryOnViewer'
import { generateDressedAvatar } from '../lib/api'

/* ─────────────────────────────────────────────────────────────────────────
   Manikan Widget — Multi-step SDK integration modal

   Flow:
     Step 0: Welcome (first-time user)
     Step 1: Body measurements (first-time user)
     Step 2: Generating body model
     Step 3: Size selection + 3D try-on
   ───────────────────────────────────────────────────────────────────────── */

// Check localStorage for existing profile
function getSavedProfile() {
  try {
    const saved = localStorage.getItem('manikan_profile')
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

function saveProfile(profile) {
  localStorage.setItem('manikan_profile', JSON.stringify(profile))
}

export default function ManikanWidget({ product, onClose }) {
  const savedProfile = getSavedProfile()
  const isReturningUser = savedProfile?.has_avatar

  // Steps: 0=welcome, 1=measurements, 2=generating, 3=tryon
  const [step, setStep] = useState(isReturningUser ? 3 : 0)
  const [sex, setSex] = useState(savedProfile?.sex || 'male')
  const [height, setHeight] = useState(savedProfile?.height_cm || 175)
  const [weight, setWeight] = useState(savedProfile?.weight_kg || 75)
  const [chest, setChest] = useState(savedProfile?.chest_cm || 96)
  const [waist, setWaist] = useState(savedProfile?.waist_cm || 82)
  const [hips, setHips] = useState(savedProfile?.hips_cm || 96)

  // Recommend the best size from the measurement that actually drives fit for
  // this category: chest for tops, WAIST for pants (the bake grid is
  // waist-keyed). Reading chest_width_cm on a pants variant yields undefined,
  // so `undefined * 2 - chest` is NaN, every comparison is false, and the
  // default 'M' was being returned for every body regardless of size.
  const SIZE_DRIVER = {
    pants: { key: 'waist_width_cm', body: 'waist' },
    default: { key: 'chest_width_cm', body: 'chest' },
  }
  const recommendedSize = useMemo(() => {
    const driver = SIZE_DRIVER[product.category] || SIZE_DRIVER.default
    const userCirc = driver.body === 'waist' ? waist : chest
    let best = null
    let bestDiff = Infinity
    for (const [sz, specs] of Object.entries(product.sizes)) {
      const flat = specs?.[driver.key]
      if (typeof flat !== 'number') continue // measurement missing for this size
      const diff = Math.abs(flat * 2 - userCirc)
      if (diff < bestDiff) {
        bestDiff = diff
        best = sz
      }
    }
    return best ?? Object.keys(product.sizes)[0] ?? 'M'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chest, waist, product.sizes, product.category])

  const [selectedSize, setSelectedSize] = useState(() => isReturningUser ? recommendedSize : 'M')
  const [tryOnUrl, setTryOnUrl] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState(null)
  const previousUrlRef = useRef(null)

  const sizeKeys = Object.keys(product.sizes)
  const currentSpecs = product.sizes[selectedSize]
  // Which four measurements to show depends on the category — a pants variant
  // has no chest/sleeve/shoulder, and rendering those printed four blanks.
  const specRows = (product.category === 'pants'
    ? [
        ['Waist cm', 'waist_width_cm'],
        ['Hip cm', 'hip_width_cm'],
        ['Inseam cm', 'inseam_cm'],
        ['Rise cm', 'rise_cm'],
      ]
    : [
        ['Chest cm', 'chest_width_cm'],
        ['Length cm', 'body_length_cm'],
        ['Sleeve cm', 'sleeve_length_cm'],
        ['Shoulder cm', 'shoulder_width_cm'],
      ]
  ).map(([label, key]) => ({ label, value: currentSpecs?.[key] ?? '—' }))

  // Generate dressed avatar
  const generateTryOn = useCallback(async (size) => {
    setIsGenerating(true)
    setError(null)

    try {
      const url = await generateDressedAvatar({
        product_id: product.id,
        size,
        sex,
        height_cm: height,
        weight_kg: weight,
        chest_cm: chest,
        waist_cm: waist,
        hips_cm: hips,
        recommended_size: recommendedSize,
      })

      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current)
      }
      previousUrlRef.current = url
      setTryOnUrl(url)
    } catch (err) {
      if (err.name !== 'AbortError') {
        // TOO_SMALL is a real fit verdict, not a transient failure: the body
        // service refuses a garment more than 25cm smaller than the body.
        // "Please try again" is useless advice for it -- retrying can never
        // succeed. Name the actual problem and point at a size that fits.
        if (err.message === 'TOO_SMALL') {
          const suggestion = recommendedSize && recommendedSize !== size
            ? ` Try ${recommendedSize}.`
            : ''
          setError(`Size ${size} is too small for your measurements.${suggestion}`)
        } else {
          console.error('Try-On Error:', err)
          setError('Failed to generate virtual try-on. Please try again.')
        }
      }
    } finally {
      setIsGenerating(false)
    }
  }, [sex, height, weight, chest, waist, hips, product.id, recommendedSize])

  // Handle "Generate My Body Model" click
  const handleGenerateBody = async () => {
    setStep(2) // show generating

    // Save profile
    const profile = {
      sex, height_cm: height, weight_kg: weight,
      chest_cm: chest, waist_cm: waist, hips_cm: hips,
      has_avatar: true,
    }
    saveProfile(profile)

    // Generate the dressed avatar with recommended size
    await generateTryOn(recommendedSize)
    setSelectedSize(recommendedSize)
    setStep(3) // show try-on
  }

  // Handle size change in try-on view
  const handleSizeChange = async (size) => {
    setSelectedSize(size)
    await generateTryOn(size)
  }

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current)
    }
  }, [])

  // Auto-generate for returning users
  useEffect(() => {
    if (isReturningUser && step === 3 && !tryOnUrl && !isGenerating) {
      const timer = setTimeout(() => generateTryOn(recommendedSize), 0)
      return () => clearTimeout(timer)
    }
  }, [isReturningUser, step, tryOnUrl, isGenerating, generateTryOn, recommendedSize])

  // Products without garment data can't be rendered in 3D yet — show a graceful
  // "coming soon" state instead of walking the shopper into a failed try-on.
  if (!product.isTryOnEnabled) {
    return <ComingSoon product={product} onClose={onClose} />
  }

  return (
    <div className="mw-overlay" onClick={onClose}>
      <div className="mw-container" onClick={e => e.stopPropagation()}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="mw-header">
          <div className="mw-header-brand">
            <div>
              <h2 className="mw-brand-name">Manikan</h2>
              <p className="mw-brand-sub">Virtual Try-On</p>
            </div>
          </div>
          <button onClick={onClose} className="mw-close" id="close-widget">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Step indicator ─────────────────────────────────────────── */}
        {step < 3 && (
          <div className="mw-steps">
            {['Welcome', 'Measurements', 'Generate'].map((label, i) => (
              <div key={i} className={`mw-step ${step >= i ? 'active' : ''} ${step === i ? 'current' : ''}`}>
                <div className="mw-step-dot">{step > i ? '✓' : i + 1}</div>
                <span className="mw-step-label">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Step Content ───────────────────────────────────────────── */}
        <div className="mw-body">

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="mw-step-content animate-fade-in">
              <div className="mw-welcome">
                <div className="mw-welcome-icon">
                  <svg viewBox="0 0 100 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="mw-welcome-body">
                    <defs>
                      <linearGradient id="wGrad" x1="50" y1="0" x2="50" y2="180" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="var(--color-accent-secondary)" stopOpacity="0.8" />
                      </linearGradient>
                    </defs>
                    <circle cx="50" cy="18" r="12" stroke="url(#wGrad)" strokeWidth="1.5" />
                    <line x1="50" y1="30" x2="50" y2="40" stroke="url(#wGrad)" strokeWidth="1.5" />
                    <path d="M30 40 L70 40 L65 100 L35 100 Z" stroke="url(#wGrad)" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M30 40 L15 50 L10 80" stroke="url(#wGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M70 40 L85 50 L90 80" stroke="url(#wGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M40 100 L35 140 L30 175" stroke="url(#wGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M60 100 L65 140 L70 175" stroke="url(#wGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="mw-welcome-title">Let's find your perfect fit</h3>
                <p className="mw-welcome-desc">
                  We'll create a 3D model of your body to show you exactly how this
                  <strong> {product.name}</strong> fits. It takes less than a minute.
                </p>
                <div className="mw-welcome-features">
                  <div className="mw-feature">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Under 5 seconds</span>
                  </div>
                  <div className="mw-feature">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Private & secure</span>
                  </div>
                  <div className="mw-feature">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <span>AI-powered accuracy</span>
                  </div>
                </div>
                <button onClick={() => setStep(1)} className="mw-primary-btn" id="start-measurements">
                  Get Started
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Measurements */}
          {step === 1 && (
            <div className="mw-step-content animate-fade-in">
              <div className="mw-measurements">
                <h3 className="mw-section-title">Your Measurements</h3>
                <p className="mw-section-desc">Adjust the sliders to match your body. We'll use these to create your personalized 3D avatar.</p>

                {/* Sex toggle */}
                <div className="mw-sex-toggle">
                  <button
                    onClick={() => setSex('male')}
                    className={`mw-sex-btn ${sex === 'male' ? 'active' : ''}`}
                  >
                    Male
                  </button>
                  <button
                    onClick={() => setSex('female')}
                    className={`mw-sex-btn ${sex === 'female' ? 'active' : ''}`}
                  >
                    Female
                  </button>
                </div>

                <div className="mw-sliders">
                  <MeasurementSlider label="Height" unit="cm" value={height} onChange={setHeight} min={120} max={220}
                    icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0-16l-3 3m3-3l3 3m-3 13l-3-3m3 3l3-3" /></svg>} />
                  <MeasurementSlider label="Weight" unit="kg" value={weight} onChange={setWeight} min={35} max={200}
                    icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m-7-9H4m16 0h1M7.05 7.05l-.7-.7m12.02.7l.7-.7M7.05 16.95l-.7.7m12.02-.7l.7.7" /><circle cx="12" cy="12" r="4" /></svg>} />
                  <MeasurementSlider label="Chest" unit="cm" value={chest} onChange={setChest} min={60} max={160}
                    icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 8c0 4 3.5 8 8 8s8-4 8-8M4 8l2-4h12l2 4" /></svg>} />
                  <MeasurementSlider label="Waist" unit="cm" value={waist} onChange={setWaist} min={50} max={160}
                    icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 4c0 3 2 5 6 5s6-2 6-5M6 20c0-3 2-5 6-5s6 2 6 5" /></svg>} />
                  <MeasurementSlider label="Hips" unit="cm" value={hips} onChange={setHips} min={60} max={160}
                    icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 6c-2 2-3 5-3 8 0 2 1 4 3 6M16 6c2 2 3 5 3 8 0 2-1 4-3 6M8 6h8" /></svg>} />
                </div>

                <button onClick={handleGenerateBody} className="mw-primary-btn" id="generate-body">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate My Body Model
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Generating */}
          {step === 2 && (
            <div className="mw-step-content animate-fade-in">
              <GeneratingOverlay />
            </div>
          )}

          {/* Step 3: Try-On Viewer + Size Selection */}
          {step === 3 && (
            <div className="mw-step-content mw-tryon-step animate-fade-in">
              <div className="mw-tryon-layout">
                {/* Left: 3D Viewer */}
                <div className="mw-tryon-viewer">
                  <TryOnViewer
                    modelUrl={tryOnUrl}
                    isLoading={isGenerating}
                    productColor={product.color_hex}
                  />
                </div>

                {/* Right: Size controls */}
                <div className="mw-tryon-controls">
                  <div className="mw-tryon-product-info">
                    <img src={product.image} alt={product.name} className="mw-tryon-product-thumb" />
                    <div>
                      <h4 className="mw-tryon-product-name">{product.name}</h4>
                      <p className="mw-tryon-product-color">{product.color_name}</p>
                    </div>
                  </div>

                  <div className="mw-tryon-size-section">
                    <h4 className="mw-tryon-label">Select Size</h4>
                    <div className="mw-tryon-size-pills">
                      {sizeKeys.map(size => (
                        <button
                          key={size}
                          onClick={() => handleSizeChange(size)}
                          disabled={isGenerating}
                          className={`mw-tryon-size-pill ${selectedSize === size ? 'active' : ''} ${size === recommendedSize ? 'recommended' : ''}`}
                          id={`tryon-size-${size}`}
                        >
                          {size}
                          {size === recommendedSize && <span className="mw-rec-dot" />}
                        </button>
                      ))}
                    </div>
                    {recommendedSize && (
                      <p className="mw-tryon-rec-text">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Manikan recommends <strong>{recommendedSize}</strong> for your body
                      </p>
                    )}
                  </div>

                  {/* Garment specs for selected size */}
                  <div className="mw-tryon-specs">
                    <h4 className="mw-tryon-label">Size {selectedSize} Measurements</h4>
                    <div className="mw-tryon-spec-grid">
                      <div className="mw-tryon-spec">
                        <span className="mw-tryon-spec-val">{specRows[0].value}</span>
                        <span className="mw-tryon-spec-label">{specRows[0].label}</span>
                      </div>
                      <div className="mw-tryon-spec">
                        <span className="mw-tryon-spec-val">{specRows[1].value}</span>
                        <span className="mw-tryon-spec-label">{specRows[1].label}</span>
                      </div>
                      <div className="mw-tryon-spec">
                        <span className="mw-tryon-spec-val">{specRows[2].value}</span>
                        <span className="mw-tryon-spec-label">{specRows[2].label}</span>
                      </div>
                      <div className="mw-tryon-spec">
                        <span className="mw-tryon-spec-val">{specRows[3].value}</span>
                        <span className="mw-tryon-spec-label">{specRows[3].label}</span>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="mw-error">
                      <p>{error}</p>
                    </div>
                  )}

                  {/* Reset profile */}
                  <button
                    onClick={() => {
                      localStorage.removeItem('manikan_profile')
                      setStep(0)
                      setTryOnUrl(null)
                    }}
                    className="mw-reset-btn"
                  >
                    Reset Body Profile
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="mw-footer">
          <span className="mw-footer-text">Powered by</span>
          <div className="mw-footer-logo">
            <span>Manikan</span>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ─────────────────────────────────────────────────────────────────────────
   Generating Overlay — shown during body model creation
   ───────────────────────────────────────────────────────────────────────── */
const GENERATING_PHASES = [
  'Initialising body model…',
  'Analysing your proportions…',
  'Optimising shape parameters…',
  'Fitting the t-shirt…',
  'Rendering your avatar…',
]

function GeneratingOverlay() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(p => (p + 1) % GENERATING_PHASES.length)
    }, 1200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mw-generating">
      {/* Animated silhouette */}
      <div className="mw-gen-silhouette">
        <svg viewBox="0 0 100 180" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="genGrad" x1="50" y1="0" x2="50" y2="180" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.6" />
              <stop offset="50%" stopColor="var(--color-accent-bright)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.4" />
            </linearGradient>
            <filter id="genGlow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx="50" cy="18" r="12" stroke="url(#genGrad)" strokeWidth="1.5" filter="url(#genGlow)" opacity="0.7" />
          <line x1="50" y1="30" x2="50" y2="40" stroke="url(#genGrad)" strokeWidth="1.5" opacity="0.5" />
          <path d="M30 40 L70 40 L65 100 L35 100 Z" stroke="url(#genGrad)" strokeWidth="1.5" strokeLinejoin="round" filter="url(#genGlow)" opacity="0.7" />
          <path d="M30 40 L15 50 L10 80" stroke="url(#genGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          <path d="M70 40 L85 50 L90 80" stroke="url(#genGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          <path d="M40 100 L35 140 L30 175" stroke="url(#genGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          <path d="M60 100 L65 140 L70 175" stroke="url(#genGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          <g className="loading-measure-lines">
            <line x1="25" y1="55" x2="75" y2="55" stroke="var(--color-accent-bright)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            <line x1="30" y1="80" x2="70" y2="80" stroke="var(--color-accent-bright)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            <line x1="32" y1="100" x2="68" y2="100" stroke="var(--color-accent-bright)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
          </g>
        </svg>

        {/* Scanning beam */}
        <div className="mw-gen-beam" />

        {/* Corner brackets */}
        <div className="mw-gen-bracket tl" />
        <div className="mw-gen-bracket tr" />
        <div className="mw-gen-bracket bl" />
        <div className="mw-gen-bracket br" />
      </div>

      <p className="mw-gen-phase" key={phase}>{GENERATING_PHASES[phase]}</p>

      <div className="mw-gen-progress">
        <div className="mw-gen-progress-bar" />
      </div>
    </div>
  )
}


/* ─────────────────────────────────────────────────────────────────────────
   Coming Soon — shown for products that don't have 3D garment data yet
   (isTryOnEnabled === false). Keeps the shopper informed instead of erroring.
   ───────────────────────────────────────────────────────────────────────── */
function ComingSoon({ product, onClose }) {
  return (
    <div className="mw-overlay" onClick={onClose}>
      <div className="mw-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="mw-header">
          <div className="mw-header-brand">
            <div>
              <h2 className="mw-brand-name">Manikan</h2>
              <p className="mw-brand-sub">Virtual Try-On</p>
            </div>
          </div>
          <button onClick={onClose} className="mw-close" id="close-widget">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mw-body" style={{ textAlign: 'center' }}>
          {product.image && (
            <img
              src={product.image}
              alt={product.name}
              style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 12, margin: '8px auto 20px' }}
            />
          )}
          <h3 className="mw-welcome-title">{product.name}</h3>
          <p className="mw-section-desc" style={{ marginTop: 8 }}>
            3D virtual try-on isn’t available for this product yet — we’re adding
            it soon. In the meantime, check the size guide on the product page.
          </p>
        </div>

        <div className="mw-footer">
          <span className="mw-footer-text">Powered by</span>
          <div className="mw-footer-logo"><span>Manikan</span></div>
        </div>
      </div>
    </div>
  )
}
