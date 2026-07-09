import { useId, useMemo } from 'react'

/* ─────────────────────────────────────────────────────────────────────────
   Premium Range Slider — single measurement control
   ───────────────────────────────────────────────────────────────────────── */
export default function MeasurementSlider({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step = 1,
  icon,
}) {
  const id = useId()
  const progress = useMemo(
    () => ((value - min) / (max - min)) * 100,
    [value, min, max]
  )

  return (
    <div className="group animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <label
          htmlFor={id}
          className="flex items-center gap-2 text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors duration-200"
        >
          {icon}
          {label}
        </label>
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-elevated border border-border-subtle">
          <span className="text-sm font-semibold text-accent-bright tabular-nums">
            {value}
          </span>
          <span className="text-xs text-text-muted font-medium">{unit}</span>
        </div>
      </div>

      {/* Slider */}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ '--slider-progress': `${progress}%` }}
      />

      {/* Range labels */}
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-text-muted font-medium tabular-nums">
          {min}{unit}
        </span>
        <span className="text-[10px] text-text-muted font-medium tabular-nums">
          {max}{unit}
        </span>
      </div>
    </div>
  )
}
