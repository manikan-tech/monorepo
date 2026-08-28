import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchProduct, fetchColorSiblings } from '../lib/products'

/*
  Replaces the simple checkbox for the "also wearing" garment with an
  expandable card that lets the shopper change the size and colour of the
  layered garment.
  */

export default function OutfitLayerCard({
  wornGarment,
  keepWearing,
  isGenerating,
  onToggle,
  onLayerChange,
}) {
  const [layerProduct, setLayerProduct] = useState(null)
  const [colorSiblings, setColorSiblings] = useState([])
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [error, setError] = useState(null)

  // Current layer state
  const [layerSize, setLayerSize] = useState(wornGarment.size)
  const [layerProductId, setLayerProductId] = useState(wornGarment.product_id)
  const [layerName, setLayerName] = useState(wornGarment.name)
  const [layerColorHex, setLayerColorHex] = useState(wornGarment.color_hex || null)
  const [layerColorName, setLayerColorName] = useState(wornGarment.color_name || null)
  const fetchingIdRef = useRef(null)

  const loadLayerData = useCallback(async () => {
    if (layerProduct && layerProduct.id === layerProductId) return
    if (fetchingIdRef.current === layerProductId) return

    fetchingIdRef.current = layerProductId
    setLoadingProduct(true)
    setError(null)
    try {
      const [product, colors] = await Promise.all([
        fetchProduct(layerProductId),
        fetchColorSiblings(layerProductId),
      ])

      // Abort if another request was started while we were fetching
      if (fetchingIdRef.current !== layerProductId) return

      if (!product || !product.sizes) {
        throw new Error("Invalid product data received")
      }

      setLayerProduct(product)
      setColorSiblings(colors.siblings || [])
      if (product.color_hex) setLayerColorHex(product.color_hex)

      // Ensure the selected size is valid for the fetched product
      const productSizes = Object.keys(product.sizes)
      if (productSizes.length > 0 && !productSizes.includes(layerSize)) {
        setLayerSize(productSizes[0])
      }
    } catch (err) {
      console.error('[OutfitLayerCard] Failed to load layer data:', err)
      setError("Failed to load options.")
    } finally {
      if (fetchingIdRef.current === layerProductId) {
        fetchingIdRef.current = null
        setLoadingProduct(false)
      }
    }
  }, [layerProductId, layerProduct, layerSize])

  // Always fetch data when expanded
  useEffect(() => {
    if (keepWearing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadLayerData()
    }
  }, [keepWearing, loadLayerData])

  const sizeKeys = layerProduct && layerProduct.sizes ? Object.keys(layerProduct.sizes) : []

  const handleSizeChange = (size) => {
    setLayerSize(size)
    onLayerChange({
      product_id: layerProductId,
      size,
      name: layerName,
      color_hex: layerColorHex,
      color_name: layerColorName,
      category: wornGarment.category,
    })
  }

  const handleColorChange = async (sibling) => {
    setLayerProductId(sibling.id)
    setLayerName(sibling.name || layerName)
    setLayerColorHex(sibling.color_hex)
    setLayerColorName(null)

    fetchingIdRef.current = sibling.id
    try {
      setLoadingProduct(true)
      const product = await fetchProduct(sibling.id)

      // Abort if another color was clicked while we were fetching
      if (fetchingIdRef.current !== sibling.id) return

      setLayerProduct(product)

      const newSizeKeys = Object.keys(product.sizes || {})
      const validSize = newSizeKeys.includes(layerSize) ? layerSize : (newSizeKeys[0] || layerSize)
      setLayerSize(validSize)

      const colors = await fetchColorSiblings(sibling.id)
      setColorSiblings(colors.siblings || [])

      onLayerChange({
        product_id: sibling.id,
        size: validSize,
        name: sibling.name || layerName,
        color_hex: sibling.color_hex,
        color_name: null,
        category: wornGarment.category,
      })
    } catch (err) {
      console.error('[OutfitLayerCard] Failed to load color variant:', err)
      setError("Failed to load color variant.")
    } finally {
      if (fetchingIdRef.current === sibling.id) {
        fetchingIdRef.current = null
        setLoadingProduct(false)
      }
    }
  }

  const categoryLabel = wornGarment.category === 'tshirt' ? 'T-Shirt' : 'Pants'

  return (
    <div className={`mw-layer-card ${keepWearing ? 'expanded' : ''}`}>
      {/* Header row: premium toggle + garment info */}
      <div
        className="mw-layer-card-header"
        onClick={() => !isGenerating && onToggle(!keepWearing)}
      >
        <div className="mw-layer-card-title-area" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="mw-layer-card-title" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
            <strong style={{ fontWeight: '600' }}>{categoryLabel}:</strong> {layerName || 'Item'}
          </span>
          {!keepWearing && (
            <span className="mw-layer-card-subtitle" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Enable to add to outfit
            </span>
          )}
        </div>

        {/* Toggle Switch */}
        <div className={`mw-toggle-switch ${keepWearing ? 'active' : ''}`}>
          <div className="mw-toggle-knob" />
        </div>
      </div>

      {/* Expanded body wrapper for smooth CSS grid animation */}
      <div className={`mw-layer-card-body-wrapper ${keepWearing ? 'expanded' : ''}`}>
        <div className="mw-layer-card-body-inner">
          <div className="mw-layer-card-body">
            {loadingProduct ? (
              <div className="mw-layer-card-loading">
                <div className="tryon-loading-spinner" style={{ width: 20, height: 20 }} />
                <span>Loading options…</span>
              </div>
            ) : error ? (
              <div className="mw-layer-card-loading" style={{ color: 'var(--color-danger)' }}>
                <span>{error}</span>
              </div>
            ) : (
              <>
                {/* Size pills */}
                {sizeKeys.length > 0 && (
                  <div className="mw-layer-card-section">
                    <h5 className="mw-layer-card-label">Size</h5>
                    <div className="mw-layer-card-pills">
                      {sizeKeys.map((size) => (
                        <button
                          key={size}
                          type="button"
                          disabled={isGenerating}
                          onClick={() => handleSizeChange(size)}
                          className={`mw-tryon-size-pill ${layerSize === size ? 'active' : ''}`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Color swatches */}
                {(colorSiblings.length > 0 || layerProduct) && (
                  <div className="mw-layer-card-section">
                    <h5 className="mw-layer-card-label">Color</h5>
                    <div className="mw-layer-card-colors">
                      {/* Current color */}
                      <button
                        type="button"
                        disabled={isGenerating}
                        className={`mw-layer-card-swatch ${layerProductId === (layerProduct?.id) ? 'active' : ''}`}
                        title="Current color"
                      >
                        <span
                          className="mw-layer-card-swatch-fill"
                          style={{ backgroundColor: layerProduct?.color_hex || layerColorHex || '#ccc' }}
                        />
                      </button>
                      {/* Sibling colors */}
                      {colorSiblings.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isGenerating}
                          onClick={() => handleColorChange(s)}
                          className={`mw-layer-card-swatch ${layerProductId === s.id ? 'active' : ''}`}
                          title={s.name || 'Color variant'}
                        >
                          <span
                            className="mw-layer-card-swatch-fill"
                            style={{ backgroundColor: s.color_hex || '#ccc' }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
