import { useRef, useMemo, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Center } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'

/* ─────────────────────────────────────────────────────────────────────────
   Dressed Avatar Model — loads dressed .glb with vertex colours
   ───────────────────────────────────────────────────────────────────────── */
// Tier 1.5 idle jiggle tuning — subtle, hem-weighted sway. Purely cosmetic:
// never changes fit/silhouette, only adds a little life while the model is
// sitting idle. Amplitude in local mesh units (metres).
const JIGGLE_AMPLITUDE = 0.009
const JIGGLE_FREQUENCY = 1.6
const JIGGLE_MIN_WEIGHT = 0.05 // vertices below this are skipped (perf, and keeps shoulder/collar rigid)

function DressedModel({ url }) {
  const gltf = useLoader(GLTFLoader, url)
  const meshRef = useRef()
  const garmentRef = useRef(null)
  const restPositionsRef = useRef(null)

  // Gentle idle rotation + Tier 1.5 hem jiggle
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.12
    }

    const garment = garmentRef.current
    const rest = restPositionsRef.current
    if (garment && rest) {
      const pos = garment.geometry.attributes.position
      const { jiggleIdx, heightWeight } = garment.userData
      const t = state.clock.elapsedTime
      for (let k = 0; k < jiggleIdx.length; k++) {
        const i = jiggleIdx[k]
        const ox = rest[i * 3], oy = rest[i * 3 + 1], oz = rest[i * 3 + 2]
        const w = heightWeight[i]
        const dx = JIGGLE_AMPLITUDE * w * Math.sin(t * JIGGLE_FREQUENCY + ox * 8.0)
        const dz = JIGGLE_AMPLITUDE * 0.6 * w * Math.cos(t * JIGGLE_FREQUENCY * 0.8 + oy * 6.0)
        pos.setXYZ(i, ox + dx, oy, oz + dz)
      }
      pos.needsUpdate = true
      // Without this, lighting uses the rest-pose normals against displaced
      // positions -- most visibly wrong (dark/incorrect shading) at high-
      // curvature areas like the collar, right where jiggle weight fades out.
      garment.geometry.computeVertexNormals()
    }
  })

  // Use the GLB's own texture (product photo) or vertex colours (skin + flat
  // t-shirt colouring fallback) depending on what the backend produced.
  const enhancedScene = useMemo(() => {
    const scene = gltf.scene.clone(true)

    scene.traverse((child) => {
      if (child.isMesh) {
        const textureMap = child.material?.map || null
        const hasVertexColors = !!child.geometry?.attributes?.color
        const isGarment = textureMap || hasVertexColors

        if (textureMap) {
          // Textured garment (Phase 4: product photo). Double-sided: thin
          // garment meshes can fold slightly on themselves (e.g. a subtle
          // scan-noise pinch at the collar) -- single-sided rendering shows
          // that as a see-through gap to whatever's behind the canvas.
          child.material = new THREE.MeshStandardMaterial({
            map: textureMap,
            roughness: 0.75,
            metalness: 0.0,
            envMapIntensity: 0.6,
            side: THREE.DoubleSide,
          })
        } else if (hasVertexColors) {
          // Flat-colour garment fallback (no product photo available)
          child.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.6,
            metalness: 0.02,
            envMapIntensity: 0.7,
            side: THREE.DoubleSide,
          })
        } else {
          // Skin-coloured PBR material (body mesh) — never jiggled
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#c8a88e'),
            roughness: 0.55,
            metalness: 0.05,
            envMapIntensity: 0.8,
          })
        }

        if (isGarment) {
          // Own geometry copy — never mutate the cached/loaded original.
          child.geometry = child.geometry.clone()
          const posAttr = child.geometry.attributes.position
          const arr = posAttr.array

          let ymin = Infinity, ymax = -Infinity
          for (let i = 0; i < posAttr.count; i++) {
            const y = arr[i * 3 + 1]
            if (y < ymin) ymin = y
            if (y > ymax) ymax = y
          }
          const span = Math.max(ymax - ymin, 1e-6)
          const heightWeight = new Float32Array(posAttr.count)
          const jiggleIdx = []
          for (let i = 0; i < posAttr.count; i++) {
            const tNorm = (arr[i * 3 + 1] - ymin) / span // 0 at hem .. 1 at shoulder
            const w = Math.pow(Math.max(0, 1 - tNorm), 1.5) // strong at hem, ~0 at shoulder
            heightWeight[i] = w
            if (w > JIGGLE_MIN_WEIGHT) jiggleIdx.push(i)
          }
          child.userData.heightWeight = heightWeight
          child.userData.jiggleIdx = jiggleIdx
          child.userData.isGarment = true
        }

        child.castShadow = true
        child.receiveShadow = true
      }
    })

    return scene
  }, [gltf])

  // Wire up the jiggle refs after the scene is committed (refs must not be
  // touched during render, hence not inside the useMemo above).
  useEffect(() => {
    let garment = null
    enhancedScene.traverse((child) => {
      if (child.isMesh && child.userData.isGarment) garment = child
    })
    garmentRef.current = garment
    restPositionsRef.current = garment
      ? garment.geometry.attributes.position.array.slice()
      : null
  }, [enhancedScene])

  return (
    <Center>
      <group ref={meshRef}>
        <primitive object={enhancedScene} />
      </group>
    </Center>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Loading Spinner (Three.js fallback)
   ───────────────────────────────────────────────────────────────────────── */
function LoadingFallback() {
  const ref = useRef()
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.6
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.05
    }
  })
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.4, 1]} />
      <meshStandardMaterial
        color="#6366f1"
        emissive="#4f46e5"
        emissiveIntensity={0.2}
        wireframe
        transparent
        opacity={0.6}
      />
    </mesh>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   TryOnViewer — 3D scene for dressed avatar visualization
   ───────────────────────────────────────────────────────────────────────── */
export default function TryOnViewer({ modelUrl, isLoading }) {
  return (
    <div className="tryon-viewer-container">
      {/* Loading overlay */}
      {isLoading && (
        <div className="tryon-loading-overlay">
          <div className="tryon-loading-spinner" />
          <p className="tryon-loading-text">Generating try-on…</p>
        </div>
      )}

      {/* Status badge */}
      <div className="tryon-status-badge">
        <div className={`tryon-status-dot ${modelUrl ? 'active' : ''}`} />
        <span>{modelUrl ? '3D Try-On Ready' : 'Generating…'}</span>
      </div>

      {/* Orbit hint */}
      {modelUrl && !isLoading && (
        <div className="tryon-orbit-hint">
          <span>Drag to rotate · Scroll to zoom</span>
        </div>
      )}

      <Canvas
        shadows
        camera={{ position: [0, 0.5, 2.5], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        style={{ background: 'transparent' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.5} color="#c7d2fe" />
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

        {/* Model */}
        <Suspense fallback={<LoadingFallback />}>
          {modelUrl ? <DressedModel url={modelUrl} /> : <LoadingFallback />}
        </Suspense>

        {/* Ground */}
        <ContactShadows
          position={[0, -1, 0]}
          opacity={0.4}
          scale={8}
          blur={2.5}
          far={4}
          color="#000000"
        />
        <gridHelper
          args={[10, 20, '#2a2d45', '#1a1d30']}
          position={[0, -1, 0]}
        />

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
