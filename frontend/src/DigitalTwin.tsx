import { useRef, useState, type CSSProperties } from 'react';

export default function DigitalTwin({ scenario, temperatureC = 4.2 }: {
  scenario: string;
  temperatureC?: number;
  compact?: boolean;
  onReset: () => void;
}) {
  return <StaticContainer scenario={scenario} temperatureC={temperatureC} />;
}

export function StaticContainer({ scenario, temperatureC }: { scenario: string; temperatureC: number }) {
  const [rotation, setRotation] = useState({ x: -7, y: -16 });
  const drag = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const danger = scenario === 'refrigeration_failure';
  const fault = scenario === 'sensor_fault';
  const tone = danger ? 'danger' : fault ? 'fault' : 'nominal';

  return <div className={`twin-canvas twin-static ${tone}`} aria-label="Interactive shipment container model. Drag to rotate.">
    <div className="container-shadow" />
    <div
      className="container-model"
      style={{ '--tilt-x': `${rotation.x}deg`, '--tilt-y': `${rotation.y}deg` } as CSSProperties}
      onPointerDown={event => {
        event.preventDefault();
        drag.current = { pointerX: event.clientX, pointerY: event.clientY, ...rotation };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        setRotation({
          x: Math.max(-22, Math.min(18, drag.current.x - (event.clientY - drag.current.pointerY) * .35)),
          y: drag.current.y + (event.clientX - drag.current.pointerX) * .35,
        });
      }}
      onPointerUp={event => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
    >
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
