import { useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Center } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'

/* ─────────────────────────────────────────────────────────────────────────
   Dressed Avatar Model — loads dressed .glb with vertex colours
   ───────────────────────────────────────────────────────────────────────── */
function DressedModel({ url }) {
  const gltf = useLoader(GLTFLoader, url)
  const meshRef = useRef()

  // Gentle idle rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.12
    }
  })

  // Use vertex colours from the GLB (skin + t-shirt colouring)
  const enhancedScene = useMemo(() => {
    const scene = gltf.scene.clone(true)

    scene.traverse((child) => {
      if (child.isMesh) {
        // Check if mesh has vertex colours
        const hasVertexColors = child.geometry?.attributes?.color

        if (hasVertexColors) {
          // Use vertex colours for the dressed look
          child.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.6,
            metalness: 0.02,
            envMapIntensity: 0.7,
          })
        } else {
          // Fallback — skin-coloured PBR material
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#c8a88e'),
            roughness: 0.55,
            metalness: 0.05,
            envMapIntensity: 0.8,
          })
        }

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
