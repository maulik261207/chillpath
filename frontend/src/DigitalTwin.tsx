import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';

export default function DigitalTwin({ scenario, temperatureC = 4.2 }: {
  scenario: string;
  temperatureC?: number;
  compact?: boolean;
  onReset: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(!document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const danger = scenario === 'refrigeration_failure';
  const fault = scenario === 'sensor_fault';

  useEffect(() => {
    const element = root.current;
    const observer = new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? true), { threshold: 0.01 });
    if (element) observer.observe(element);
    const visibility = () => setVisible(!document.hidden);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(motion.matches);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', change);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', change);
    };
  }, []);

  return <div ref={root} className="twin-canvas">
    <Canvas
      fallback={<StaticContainer scenario={scenario} temperatureC={temperatureC} />}
      frameloop={visible && inView && !reducedMotion ? 'always' : 'demand'}
      camera={{ position: [4.2, 2.4, 5].map(value => value * 7 / Math.hypot(4.2, 2.4, 5)) as [number, number, number], fov: 37 }}
      dpr={[1, 1.35]}
      gl={{ antialias: true, alpha: true }}
    >
      {/* Warm neutral lighting to match the earthy theme */}
      <ambientLight intensity={1.4} color="#f5efe3" />
      <directionalLight position={[4, 5, 4]} intensity={2.2} color="#e8dcc8" />
      <pointLight position={[-3, 1, 1]} intensity={danger ? 2.4 : 1.2} color={danger ? '#a65436' : fault ? '#7a6c55' : '#68704d'} />
      <Suspense fallback={null}>
        <AnimatedContainer danger={danger} fault={fault} temperatureC={temperatureC} animate={!reducedMotion && visible && inView} />
      </Suspense>
      {/* Lock the camera at the previous closest view while allowing rotation. */}
      <OrbitControls enablePan={false} enableZoom={false} minDistance={7} maxDistance={7} minPolarAngle={Math.PI / 3.5} maxPolarAngle={Math.PI / 1.8} />
    </Canvas>
  </div>;
}

function StaticContainer({ scenario, temperatureC }: { scenario: string; temperatureC: number }) {
  const [rotation, setRotation] = useState({ x: -7, y: -16 });
  const drag = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const danger = scenario === 'refrigeration_failure';
  const fault = scenario === 'sensor_fault';
  const tone = danger ? 'danger' : fault ? 'fault' : 'nominal';
  return <div className={`twin-canvas twin-static ${tone}`} aria-label="Interactive shipment container model. Drag to rotate.">
    <div className="container-shadow" />
    <div className="container-model" style={{ '--tilt-x': `${rotation.x}deg`, '--tilt-y': `${rotation.y}deg` } as CSSProperties}
      onPointerDown={event => { drag.current = { pointerX: event.clientX, pointerY: event.clientY, ...rotation }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (!drag.current) return; setRotation({ x: Math.max(-22, Math.min(18, drag.current.x - (event.clientY - drag.current.pointerY) * .35)), y: drag.current.y + (event.clientX - drag.current.pointerX) * .35 }); }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }}>
      <div className="container-top" />
      <div className="container-side" />
      <div className="container-front">
        <div className="container-ribs" />
        <span className="container-brand">CHILLPATH</span>
        <span className="container-status-light" />
      </div>
      <div className="cooling-unit"><span /><i /></div>
      {[1, 2, 3].map((sensor, index) => <div className={`static-sensor sensor-${sensor}`} key={sensor}>
        <i />
        <span className={`sensor-label sensor-label-${sensor}`}>T{sensor} <b>{(temperatureC + (index - 1) * .4).toFixed(1)}°</b></span>
      </div>)}
    </div>
  </div>;
}

function AnimatedContainer({ danger, fault, temperatureC, animate }: {
  danger: boolean;
  fault: boolean;
  temperatureC: number;
  animate: boolean;
}) {
  const group = useRef<any>(null);
  useFrame(state => {
    if (group.current && animate) {
      const t = state.clock.elapsedTime;
      group.current.rotation.y = Math.sin(t * 0.32) * 0.08;
      group.current.rotation.x = Math.sin(t * 0.21) * 0.018;
      group.current.position.y = Math.sin(t * 0.55) * 0.035;
    }
  });
  return <group ref={group}><Container danger={danger} fault={fault} temperatureC={temperatureC} /></group>;
}

function Container({ danger, fault, temperatureC }: { danger: boolean; fault: boolean; temperatureC: number }) {
  // Cohesive warm architectural palette matching the website theme
  const isHighTemp = temperatureC > 35 || danger;
  const accentColor = isHighTemp ? '#a65436' : fault ? '#7a6c55' : '#68704d';
  const bodyColor = isHighTemp ? '#d4b5a6' : fault ? '#cdc5b7' : '#dfd8cb';
  const ribColor = isHighTemp ? '#bfa091' : '#b7af9f';
  const frameColor = '#8e8677';
  const endCapColor = '#a8a090';
  const coolingColor = '#6b6657';
  const baseColor = '#c2baa8';

  return <group>
    {/* Main body */}
    <mesh castShadow receiveShadow><boxGeometry args={[3.1, 1.85, 1.65]} /><meshStandardMaterial color={bodyColor} metalness={0.25} roughness={0.65} /></mesh>
    {/* Ribs on front face */}
    {Array.from({ length: 17 }, (_, i) => <mesh key={i} position={[-1.48 + i * 0.185, 0, 0.836]}><boxGeometry args={[0.055, 1.77, 0.035]} /><meshStandardMaterial color={ribColor} metalness={0.3} roughness={0.6} /></mesh>)}
    {/* Back panel */}
    <mesh position={[0, 0, -0.84]}><boxGeometry args={[3.1, 1.84, 0.035]} /><meshStandardMaterial color={frameColor} metalness={0.35} roughness={0.5} /></mesh>
    {/* Left end cap */}
    <mesh position={[-1.63, 0, 0]}><boxGeometry args={[0.18, 1.95, 1.82]} /><meshStandardMaterial color={endCapColor} metalness={0.35} roughness={0.5} /></mesh>
    {/* Right end cap */}
    <mesh position={[1.63, 0, 0]}><boxGeometry args={[0.18, 1.95, 1.82]} /><meshStandardMaterial color={endCapColor} metalness={0.35} roughness={0.5} /></mesh>
    {/* Cooling unit housing */}
    <mesh position={[1.8, 0.3, 0.15]}><boxGeometry args={[0.48, 1.3, 0.9]} /><meshStandardMaterial color={coolingColor} metalness={0.4} roughness={0.5} /></mesh>
    {/* Cooling status strip */}
    <mesh position={[1.8, -0.42, 0.15]}><boxGeometry args={[0.5, 0.08, 0.95]} /><meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1.8} /></mesh>
    {/* Status indicator light */}
    <mesh position={[1.62, 0.28, 0.66]}><sphereGeometry args={[0.07, 16, 16]} /><meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={2.5} /></mesh>
    {/* Sensor nodes */}
    {[-0.75, 0.05, 0.75].map((x, i) => <group key={x} position={[x, 0.48, 0.9]}>
      <mesh><sphereGeometry args={[0.07, 16, 16]} /><meshStandardMaterial color={i === 2 && fault ? '#7a6c55' : accentColor} emissive={i === 2 && fault ? '#7a6c55' : accentColor} emissiveIntensity={2} /></mesh>
      <Html distanceFactor={8}><div className={`sensor-label sensor-label-${i + 1}`}>T{i + 1} <b>{(temperatureC + (i - 1) * 0.4).toFixed(1)}°</b></div></Html>
    </group>)}
    {/* Base platform */}
    <mesh position={[0, -0.98, 0]}><boxGeometry args={[3.5, 0.08, 2]} /><meshStandardMaterial color={baseColor} roughness={0.7} metalness={0.15} /></mesh>
  </group>;
}
