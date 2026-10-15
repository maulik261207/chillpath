import { Suspense, useEffect, useRef, useState } from 'react';
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
      fallback={<div className="twin-fallback">3D view unavailable · shipment readings remain available</div>}
      frameloop={visible && inView && !reducedMotion ? 'always' : 'demand'}
      camera={{ position: [4.2, 2.4, 5], fov: 37 }}
      dpr={[1, 1.35]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={1.25} />
      <directionalLight position={[4, 5, 4]} intensity={2.4} color="#d8f5ff" />
      <pointLight position={[-3, 1, 1]} intensity={danger ? 2.8 : 1.4} color={danger ? '#fa744f' : fault ? '#a88aff' : '#45d7f5'} />
      <Suspense fallback={null}>
        <AnimatedContainer danger={danger} fault={fault} temperatureC={temperatureC} animate={!reducedMotion && visible && inView} />
      </Suspense>
      <OrbitControls enablePan={false} minDistance={4} maxDistance={8} minPolarAngle={Math.PI / 3.5} maxPolarAngle={Math.PI / 1.8} />
    </Canvas>
  </div>;
}

function AnimatedContainer({ danger, fault, temperatureC, animate }: {
  danger: boolean;
  fault: boolean;
  temperatureC: number;
  animate: boolean;
}) {
  const group = useRef<any>(null);
  useFrame((state, delta) => {
    if (group.current && animate) group.current.rotation.y += Math.sin(state.clock.elapsedTime * 0.2) * delta * 0.08;
  });
  return <group ref={group}><Container danger={danger} fault={fault} temperatureC={temperatureC} /></group>;
}

function Container({ danger, fault, temperatureC }: { danger: boolean; fault: boolean; temperatureC: number }) {
  const color = danger ? '#ef704d' : fault ? '#a88aff' : '#53d7e9';
  const materialColor = temperatureC > 8 ? '#704438' : '#233743';
  return <group>
    <mesh castShadow receiveShadow><boxGeometry args={[3.1, 1.85, 1.65]} /><meshStandardMaterial color={materialColor} metalness={0.78} roughness={0.33} /></mesh>
    {Array.from({ length: 17 }, (_, i) => <mesh key={i} position={[-1.48 + i * 0.185, 0, 0.836]}><boxGeometry args={[0.055, 1.77, 0.035]} /><meshStandardMaterial color="#6a8390" metalness={0.8} roughness={0.31} /></mesh>)}
    <mesh position={[0, 0, -0.84]}><boxGeometry args={[3.1, 1.84, 0.035]} /><meshStandardMaterial color="#152a36" metalness={0.6} /></mesh>
    <mesh position={[-1.63, 0, 0]}><boxGeometry args={[0.18, 1.95, 1.82]} /><meshStandardMaterial color="#9bb2bc" metalness={0.75} roughness={0.3} /></mesh>
    <mesh position={[1.63, 0, 0]}><boxGeometry args={[0.18, 1.95, 1.82]} /><meshStandardMaterial color="#9bb2bc" metalness={0.75} roughness={0.3} /></mesh>
    <mesh position={[1.8, 0.3, 0.15]}><boxGeometry args={[0.48, 1.3, 0.9]} /><meshStandardMaterial color="#1b3543" metalness={0.72} roughness={0.28} /></mesh>
    <mesh position={[1.8, -0.42, 0.15]}><boxGeometry args={[0.5, 0.08, 0.95]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} /></mesh>
    <mesh position={[1.62, 0.28, 0.66]}><sphereGeometry args={[0.07, 16, 16]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} /></mesh>
    {[-0.75, 0.05, 0.75].map((x, i) => <group key={x} position={[x, 0.48, 0.9]}>
      <mesh><sphereGeometry args={[0.07, 16, 16]} /><meshStandardMaterial color={i === 2 && fault ? '#af91ff' : color} emissive={i === 2 && fault ? '#af91ff' : color} emissiveIntensity={3} /></mesh>
      <Html distanceFactor={8}><div className="sensor-label">T-{String(i + 2).padStart(2, '0')} <b>{(temperatureC + (i - 1) * 0.4).toFixed(1)}°</b></div></Html>
    </group>)}
    <mesh position={[0, -0.98, 0]}><boxGeometry args={[3.5, 0.08, 2]} /><meshStandardMaterial color="#101f29" /></mesh>
  </group>;
}
