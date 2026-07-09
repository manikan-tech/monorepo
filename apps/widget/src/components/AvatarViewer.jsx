import { useRef, useEffect, useState, Suspense, useMemo } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Center } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'

/* ─────────────────────────────────────────────────────────────────────────
   Avatar Model — loads .glb from Object URL and renders with PBR material
   ───────────────────────────────────────────────────────────────────────── */
function AvatarModel({ url }) {
  const gltf = useLoader(GLTFLoader, url)
  const meshRef = useRef()

  // Gentle idle rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15
    }
  })

  // Apply premium material override to all meshes
  const enhancedScene = useMemo(() => {
    const scene = gltf.scene.clone(true)

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c8a88e'),
      roughness: 0.55,
      metalness: 0.05,
      envMapIntensity: 0.8,
    })

    scene.traverse((child) => {
      if (child.isMesh) {
        child.material = material
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    return scene
  }, [gltf])

  return (
    <Center>
      <group ref={meshRef}>
        <primitive object={enhancedScene} />
      </group>
    </Center>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Loading Spinner (shown while GLB is loading)
   ───────────────────────────────────────────────────────────────────────── */
function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.3, 32, 32]} />
      <meshStandardMaterial
        color="#6366f1"
        emissive="#6366f1"
        emissiveIntensity={0.3}
        wireframe
      />
    </mesh>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Animated Grid Floor
   ───────────────────────────────────────────────────────────────────────── */
function GridFloor() {
  return (
    <gridHelper
      args={[10, 20, '#2a2d45', '#1a1d30']}
      position={[0, -1, 0]}
      rotation={[0, 0, 0]}
    />
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Empty State — shown before any model is generated
   ───────────────────────────────────────────────────────────────────────── */
function EmptyState() {
  const meshRef = useRef()

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.4
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.08
    }
  })

  return (
    <group ref={meshRef}>
      <mesh>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial
          color="#6366f1"
          emissive="#4f46e5"
          emissiveIntensity={0.15}
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial
          color="#818cf8"
          wireframe
          transparent
          opacity={0.15}
        />
      </mesh>
    </group>
  )
}


/* ─────────────────────────────────────────────────────────────────────────
   Body Processing Overlay — premium loading experience

   Shows an animated human silhouette with a scanning beam and
   real-time status updates to feel like high-end body AI software.
   ───────────────────────────────────────────────────────────────────────── */
const BODY_PROCESSING_PHASES = [
  'Initialising body model…',
  'Analysing proportions…',
  'Optimising shape parameters…',
  'Sculpting your avatar…',
  'Finalising mesh geometry…',
]

function BodyProcessingOverlay() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % BODY_PROCESSING_PHASES.length)
    }, 1200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-primary/85 backdrop-blur-md">

      {/* Animated body silhouette with scanning beam */}
      <div className="relative w-28 h-52 mb-8">
        {/* Human silhouette SVG */}
        <svg
          viewBox="0 0 100 180"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Body outline — subtle stroke with glow */}
          <defs>
            <linearGradient id="bodyGrad" x1="50" y1="0" x2="50" y2="180" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.6" />
              <stop offset="50%" stopColor="var(--color-accent-bright)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.4" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Head */}
          <circle cx="50" cy="18" r="12" stroke="url(#bodyGrad)" strokeWidth="1.5" filter="url(#glow)" opacity="0.7" />
          {/* Neck */}
          <line x1="50" y1="30" x2="50" y2="40" stroke="url(#bodyGrad)" strokeWidth="1.5" opacity="0.5" />
          {/* Torso */}
          <path d="M30 40 L70 40 L65 100 L35 100 Z" stroke="url(#bodyGrad)" strokeWidth="1.5" strokeLinejoin="round" filter="url(#glow)" opacity="0.7" />
          {/* Left arm */}
          <path d="M30 40 L15 50 L10 80" stroke="url(#bodyGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          {/* Right arm */}
          <path d="M70 40 L85 50 L90 80" stroke="url(#bodyGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          {/* Left leg */}
          <path d="M40 100 L35 140 L30 175" stroke="url(#bodyGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          {/* Right leg */}
          <path d="M60 100 L65 140 L70 175" stroke="url(#bodyGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />

          {/* Measurement lines — pulse animation */}
          <g className="loading-measure-lines">
            {/* Chest line */}
            <line x1="25" y1="55" x2="75" y2="55" stroke="var(--color-accent-bright)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            {/* Waist line */}
            <line x1="30" y1="80" x2="70" y2="80" stroke="var(--color-accent-bright)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            {/* Hip line */}
            <line x1="32" y1="100" x2="68" y2="100" stroke="var(--color-accent-bright)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
          </g>
        </svg>

        {/* Scanning beam — sweeps vertically */}
        <div
          className="absolute left-0 right-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, var(--color-accent-bright) 30%, #fff 50%, var(--color-accent-bright) 70%, transparent 100%)',
            boxShadow: '0 0 20px 4px var(--color-accent)',
            animation: 'scanBeam 2.4s ease-in-out infinite',
          }}
        />

        {/* Corner brackets — framing the body */}
        <div className="absolute top-0 left-0 w-5 h-5 border-l-2 border-t-2 border-accent/40 rounded-tl" />
        <div className="absolute top-0 right-0 w-5 h-5 border-r-2 border-t-2 border-accent/40 rounded-tr" />
        <div className="absolute bottom-0 left-0 w-5 h-5 border-l-2 border-b-2 border-accent/40 rounded-bl" />
        <div className="absolute bottom-0 right-0 w-5 h-5 border-r-2 border-b-2 border-accent/40 rounded-br" />
      </div>

      {/* Status text — cycles through phases */}
      <p
        className="text-sm text-text-secondary font-medium tracking-wide"
        style={{ animation: 'fadeInOut 1.2s ease-in-out infinite' }}
        key={phase}
      >
        {BODY_PROCESSING_PHASES[phase]}
      </p>

      {/* Progress bar */}
      <div className="w-48 h-1 mt-4 rounded-full bg-surface-hover overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-bright"
          style={{ animation: 'progressSweep 2s ease-in-out infinite' }}
        />
      </div>
    </div>
  )
}


/* ─────────────────────────────────────────────────────────────────────────
   Main Viewer Component
   ───────────────────────────────────────────────────────────────────────── */
export default function AvatarViewer({ modelUrl, isLoading }) {
  return (
    <div className="relative w-full h-full">
      {/* Loading overlay — premium body processing animation */}
      {isLoading && <BodyProcessingOverlay />}

      {/* Status badge */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-elevated/80 backdrop-blur border border-border-subtle">
        <div className={`w-2 h-2 rounded-full ${modelUrl ? 'bg-success' : 'bg-text-muted'}`} />
        <span className="text-xs text-text-secondary font-medium tracking-wide uppercase">
          {modelUrl ? '3D Model Loaded' : 'Awaiting Input'}
        </span>
      </div>

      {/* Orbit hint */}
      {modelUrl && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-surface-elevated/60 backdrop-blur border border-border-subtle">
          <span className="text-xs text-text-muted font-medium">
            Drag to rotate · Scroll to zoom
          </span>
        </div>
      )}

      <Canvas
        shadows
        camera={{ position: [0, 0.5, 2.5], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        style={{ background: 'transparent' }}
      >
        {/* Lighting rig */}
        <ambientLight intensity={0.4} color="#c7d2fe" />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1.8}
          color="#f8fafc"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={50}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
        />
        <directionalLight position={[-3, 4, -3]} intensity={0.5} color="#818cf8" />
        <pointLight position={[0, 3, -2]} intensity={0.3} color="#a78bfa" />

        {/* Scene content */}
        <Suspense fallback={<LoadingFallback />}>
          {modelUrl ? (
            <AvatarModel url={modelUrl} />
          ) : (
            <EmptyState />
          )}
        </Suspense>

        {/* Ground effects */}
        <ContactShadows
          position={[0, -1, 0]}
          opacity={0.4}
          scale={8}
          blur={2.5}
          far={4}
          color="#000000"
        />
        <GridFloor />

        {/* Controls */}
        <OrbitControls
          enablePan={false}
          minDistance={1}
          maxDistance={6}
          minPolarAngle={Math.PI * 0.15}
          maxPolarAngle={Math.PI * 0.75}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
    </div>
  )
}
