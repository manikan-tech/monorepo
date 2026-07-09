import { useState } from 'react'
import MeasurementSlider from './MeasurementSlider'

/* ─────────────────────────────────────────────────────────────────────────
   Control Panel — Left sidebar with measurement sliders + generate button
   ───────────────────────────────────────────────────────────────────────── */
export default function ControlPanel({ onGenerate, isLoading }) {
  const [sex, setSex] = useState('male')
  const [height, setHeight] = useState(175)
  const [weight, setWeight] = useState(75)
  const [chest, setChest] = useState(96)
  const [waist, setWaist] = useState(82)
  const [hips, setHips] = useState(96)

  const handleGenerate = () => {
    onGenerate({
      sex,
      height_cm: height,
      weight_kg: weight,
      chest_cm: chest,
      waist_cm: waist,
      hips_cm: hips,
    })
  }

  return (
    <div className="flex flex-col h-full bg-surface-secondary border-r border-border-subtle">
      {/* ── Scrollable controls area ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6" style={{ scrollbarGutter: 'stable' }}>
        {/* Sex toggle */}
        <div className="animate-fade-in">
          <label className="text-sm font-medium text-text-secondary mb-2.5 flex items-center gap-2">
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Body Type
          </label>
          <div className="flex gap-2 p-1 bg-surface-primary rounded-lg border border-border-subtle">
            <button
              onClick={() => setSex('male')}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all duration-200 cursor-pointer ${
                sex === 'male'
                  ? 'bg-accent text-white shadow-md shadow-accent/25'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              Male
            </button>
            <button
              onClick={() => setSex('female')}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all duration-200 cursor-pointer ${
                sex === 'female'
                  ? 'bg-accent text-white shadow-md shadow-accent/25'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              Female
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />

        {/* Measurement sliders — clean SVG icons instead of emojis */}
        <MeasurementSlider
          label="Height"
          unit="cm"
          icon={<IconHeight />}
          value={height}
          onChange={setHeight}
          min={120}
          max={220}
        />

        <MeasurementSlider
          label="Weight"
          unit="kg"
          icon={<IconWeight />}
          value={weight}
          onChange={setWeight}
          min={35}
          max={200}
        />

        <MeasurementSlider
          label="Chest"
          unit="cm"
          icon={<IconChest />}
          value={chest}
          onChange={setChest}
          min={60}
          max={160}
        />

        <MeasurementSlider
          label="Waist"
          unit="cm"
          icon={<IconWaist />}
          value={waist}
          onChange={setWaist}
          min={50}
          max={160}
        />

        <MeasurementSlider
          label="Hips"
          unit="cm"
          icon={<IconHips />}
          value={hips}
          onChange={setHips}
          min={60}
          max={160}
        />
      </div>

      {/* ── Generate button ─────────────────────────────────────────────── */}
      <div className="px-6 pb-6 pt-4 border-t border-border-subtle">
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className={`
            w-full py-3.5 rounded-xl text-sm font-bold tracking-wide uppercase
            transition-all duration-300 cursor-pointer
            ${isLoading
              ? 'bg-surface-hover text-text-muted cursor-not-allowed'
              : 'bg-gradient-to-r from-accent to-accent-secondary text-white shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/35 hover:-translate-y-0.5 active:translate-y-0'
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-text-muted/30 border-t-text-muted" style={{ animation: 'spin 1s linear infinite' }} />
              Generating…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Avatar
            </span>
          )}
        </button>

        {/* Footer credit */}
        <p className="text-center text-[10px] text-text-muted mt-3 font-medium tracking-wide">
          Powered by SMPL Body Model
        </p>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════
   SVG Icon Components — minimal, human-designed line icons
   ═══════════════════════════════════════════════════════════════════════════ */

function IconHeight() {
  return (
    <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0-16l-3 3m3-3l3 3m-3 13l-3-3m3 3l3-3" />
    </svg>
  )
}

function IconWeight() {
  return (
    <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m-7-9H4m16 0h1M7.05 7.05l-.7-.7m12.02.7l.7-.7M7.05 16.95l-.7.7m12.02-.7l.7.7" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
}

function IconChest() {
  return (
    <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 8c0 4 3.5 8 8 8s8-4 8-8M4 8l2-4h12l2 4" />
    </svg>
  )
}

function IconWaist() {
  return (
    <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4c0 3 2 5 6 5s6-2 6-5M6 20c0-3 2-5 6-5s6 2 6 5" />
    </svg>
  )
}

function IconHips() {
  return (
    <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6c-2 2-3 5-3 8 0 2 1 4 3 6M16 6c2 2 3 5 3 8 0 2-1 4-3 6M8 6h8" />
    </svg>
  )
}
