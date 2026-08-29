import { useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'manikan_3d_interactive_tour_seen_v1'
const CARD_WIDTH = 340
const VIEWPORT_GAP = 14



function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function rootFor(node) {
  if (!node) return document
  const root = node.getRootNode?.()
  return root && 'querySelector' in root ? root : document
}

function findTarget(node, targetId) {
  return rootFor(node).querySelector(`#${targetId}`)
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  )
}

export default function InteractiveGuide({ widgetStep, isGenerating, restartToken = 0, hasLayer = false, hasColors = false }) {
  const steps = useMemo(() => {
    const arr = [
      {
        targetId: 'start-measurements',
        title: 'Start your 3D fit',
        text: 'Click Get Started. We’ll guide you through the few details needed to build your body model.',
        actionHint: 'Click the highlighted button',
        advanceOnTargetClick: true,
      },
      {
        targetId: 'body-type-control',
        title: 'Choose your body type',
        text: 'Select the option that best matches you. This gives the model the correct base proportions.',
        actionHint: 'Choose an option, or keep the selected one',
        advanceOnTargetClick: true,
      },
      {
        targetId: 'body-measurements',
        title: 'Add your measurements',
        text: 'Adjust height, weight, chest, waist, and hips. Better measurements produce a more useful fit preview.',
        actionHint: 'Drag the sliders, then continue',
      },
      {
        targetId: 'generate-body',
        title: 'Generate your body model',
        text: 'Click here when the measurements look right. Manikan will build the model and dress it in the recommended size.',
        actionHint: 'Click Generate My Body Model',
        advanceOnTargetClick: true,
      },
    ]

    if (hasLayer) {
      arr.push({
        targetId: 'tryon-layer-card',
        title: 'Style your outfit',
        text: 'You brought another item with you. Toggle it to see how it layers with this product.',
        actionHint: 'Toggle the layer, or continue',
        advanceOnTargetClick: false,
      })
    }
    
    if (hasColors) {
      arr.push({
        targetId: 'tryon-color-options',
        title: 'Explore colors',
        text: 'See how different colors look on your body model.',
        actionHint: 'Try a color, or continue',
        advanceOnTargetClick: false,
      })
    }

    arr.push({
      targetId: 'tryon-size-options',
      title: 'Compare available sizes',
      text: 'The green marker shows your recommendation. Click any size to regenerate the garment with that size’s real measurements.',
      actionHint: 'Try a size, or keep the recommendation',
      advanceOnTargetClick: true,
    })

    arr.push({
      targetId: 'tryon-3d-viewer',
      title: 'Inspect the fit from every angle',
      text: 'Drag the body to rotate it and scroll to zoom. You can return to the size controls whenever you want to compare the fit.',
      actionHint: 'Drag to rotate · Scroll to zoom',
    })

    return arr
  }, [hasLayer, hasColors])

  const anchorRef = useRef(null)
  const tooltipRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState(null)

  const activeStep = steps[stepIndex]
  const waitingForModel = open && (widgetStep === 2 || (widgetStep === 3 && isGenerating && stepIndex < 4))

  const startTour = () => {
    setStepIndex(widgetStep === 3 ? 4 : 0)
    setOpen(true)
  }

  useEffect(() => {
    let seen = true
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      // Avoid repeatedly interrupting the shopper if storage is unavailable.
    }
    if (seen) return undefined

    const timer = window.setTimeout(startTour, 650)
    return () => window.clearTimeout(timer)
    // The initial widget state is intentionally captured once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (restartToken <= 0) return undefined
    const timer = window.setTimeout(startTour, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartToken])

  // Follow the real widget flow. Generating temporarily removes the controls;
  // when the model is ready the tour resumes at the size selector.
  useEffect(() => {
    if (!open) return undefined
    const nextIndex = widgetStep === 1 && stepIndex === 0
      ? 1
      : widgetStep === 3 && !isGenerating && stepIndex < 4
        ? 4
        : null
    if (nextIndex === null) return undefined
    const timer = window.setTimeout(() => setStepIndex(nextIndex), 0)
    return () => window.clearTimeout(timer)
  }, [isGenerating, open, stepIndex, widgetStep])

  const closeTour = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Closing still works without storage.
    }
    setOpen(false)
    setTargetRect(null)
    setTooltipPosition(null)
  }

  const goNext = () => {
    if (stepIndex >= steps.length - 1) {
      closeTour()
      return
    }
    setStepIndex(current => current + 1)
  }

  const goBack = () => setStepIndex(current => Math.max(0, current - 1))

  // Clicking a highlighted real control advances the tutorial while allowing
  // that click to keep doing its normal work (changing sex, generating, etc.).
  useEffect(() => {
    if (!open || waitingForModel || !activeStep?.advanceOnTargetClick) return undefined
    const target = findTarget(anchorRef.current, activeStep.targetId)
    if (!target) return undefined

    const handleTargetClick = () => {
      // Entering measurements and generating both replace the current screen;
      // widgetStep drives those transitions so the guide cannot advance twice.
      if (stepIndex === 0 || stepIndex === 3) return
      window.setTimeout(() => setStepIndex(current => Math.min(steps.length - 1, current + 1)), 140)
    }
    target.addEventListener('click', handleTargetClick)
    return () => target.removeEventListener('click', handleTargetClick)
  }, [activeStep, open, stepIndex, waitingForModel])

  // Keep the spotlight and tooltip attached to their real DOM control. This
  // uses the component's own ShadowRoot, not document.getElementById, because
  // the embeddable widget is deliberately isolated from retailer page styles.
  useEffect(() => {
    if (!open || waitingForModel || !activeStep) {
      return undefined
    }

    let animationFrame = 0
    let settleTimer = 0

    const update = () => {
      const target = findTarget(anchorRef.current, activeStep.targetId)
      if (!target) {
        setTargetRect(null)
        setTooltipPosition(null)
        return
      }

      const rect = target.getBoundingClientRect()
      const width = Math.min(CARD_WIDTH, window.innerWidth - 24)
      const height = tooltipRef.current?.getBoundingClientRect().height || 210
      const padded = {
        top: Math.max(8, rect.top - 9),
        left: Math.max(8, rect.left - 9),
        right: Math.min(window.innerWidth - 8, rect.right + 9),
        bottom: Math.min(window.innerHeight - 8, rect.bottom + 9),
      }
      padded.width = padded.right - padded.left
      padded.height = padded.bottom - padded.top

      const spaceRight = window.innerWidth - padded.right
      const spaceLeft = padded.left
      const spaceBelow = window.innerHeight - padded.bottom
      let placement = 'right'
      if (spaceRight >= width + VIEWPORT_GAP) placement = 'right'
      else if (spaceLeft >= width + VIEWPORT_GAP) placement = 'left'
      else if (spaceBelow >= height + VIEWPORT_GAP) placement = 'bottom'
      else placement = 'top'

      let top
      let left
      if (placement === 'right' || placement === 'left') {
        top = clamp(padded.top + padded.height / 2 - height / 2, 12, window.innerHeight - height - 12)
        left = placement === 'right' ? padded.right + VIEWPORT_GAP : padded.left - width - VIEWPORT_GAP
      } else {
        left = clamp(padded.left + padded.width / 2 - width / 2, 12, window.innerWidth - width - 12)
        top = placement === 'bottom' ? padded.bottom + VIEWPORT_GAP : padded.top - height - VIEWPORT_GAP
      }

      top = clamp(top, 12, Math.max(12, window.innerHeight - height - 12))
      left = clamp(left, 12, Math.max(12, window.innerWidth - width - 12))

      setTargetRect(padded)
      setTooltipPosition({ top, left, width, placement })
    }

    const target = findTarget(anchorRef.current, activeStep.targetId)
    if (target) {
      // The modal has its own scrollable body. A target can be inside the
      // browser viewport yet clipped by that inner scroller, so center every
      // new target instead of relying only on viewport bounds.
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    animationFrame = window.requestAnimationFrame(update)
    settleTimer = window.setTimeout(update, 360)
    const handleViewportChange = () => window.requestAnimationFrame(update)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(settleTimer)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [activeStep, open, stepIndex, waitingForModel])

  const shadeStyles = useMemo(() => {
    if (!targetRect) return []
    return [
      { top: 0, left: 0, right: 0, height: targetRect.top },
      { top: targetRect.top, left: 0, width: targetRect.left, height: targetRect.height },
      { top: targetRect.top, left: targetRect.right, right: 0, height: targetRect.height },
      { top: targetRect.bottom, left: 0, right: 0, bottom: 0 },
    ]
  }, [targetRect])

  return (
    <>
      <span ref={anchorRef} className="mw-guide-anchor" aria-hidden="true" />

      {open && waitingForModel && (
        <div className="mw-guide-waiting" role="status" aria-live="polite" onClick={event => event.stopPropagation()}>
          <span className="mw-guide-waiting-spinner" />
          <span><strong>Building your 3D fit</strong><small>Next, we’ll explore sizes and the viewer.</small></span>
        </div>
      )}

      {open && !waitingForModel && targetRect && tooltipPosition && (
        <div className="mw-guide-layer" onClick={event => event.stopPropagation()}>
          {shadeStyles.map((style, index) => (
            <div key={index} className="mw-guide-shade" style={style} aria-hidden="true" />
          ))}

          <div
            className="mw-guide-highlight"
            style={{
              top: targetRect.top,
              left: targetRect.left,
              width: targetRect.width,
              height: targetRect.height,
            }}
            aria-hidden="true"
          >
            <span className="mw-guide-click-pulse" />
          </div>

          <div
            ref={tooltipRef}
            className={`mw-guide-tooltip is-${tooltipPosition.placement}`}
            style={{ top: tooltipPosition.top, left: tooltipPosition.left, width: tooltipPosition.width }}
            role="dialog"
            aria-label={`3D tutorial step ${stepIndex + 1}: ${activeStep.title}`}
          >
            <div className="mw-guide-tooltip-top">
              <span className="mw-guide-kicker">Interactive 3D tour</span>
              <button type="button" onClick={closeTour} className="mw-guide-close" aria-label="Close 3D tutorial"><CloseIcon /></button>
            </div>
            <div className="mw-guide-progress" aria-hidden="true">
              {steps.map((step, index) => <span key={step.targetId} className={index <= stepIndex ? 'is-active' : ''} />)}
            </div>
            <h3>{activeStep.title}</h3>
            <p>{activeStep.text}</p>
            <div className="mw-guide-action-hint"><span className="mw-guide-cursor-dot" />{activeStep.actionHint}</div>

            <div className="mw-guide-footer-actions">
              <button
                type="button"
                onClick={goBack}
                disabled={stepIndex === 0 || (widgetStep === 3 && stepIndex === 4)}
                className="mw-guide-back"
              >
                Back
              </button>
              <span>{stepIndex + 1} / {steps.length}</span>
              {activeStep.advanceOnTargetClick && !['body-type-control', 'tryon-size-options'].includes(activeStep.targetId) ? (
                <span className="mw-guide-click-label">Click to continue</span>
              ) : (
                <button type="button" onClick={goNext} className="mw-guide-next">
                  {stepIndex === steps.length - 1 ? 'Finish' : 'Continue'} <ArrowIcon />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
