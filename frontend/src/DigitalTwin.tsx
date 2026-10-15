export default function DigitalTwin({ scenario, temperatureC = 4.2, compact = false }: {
  scenario: string;
  temperatureC?: number;
  compact?: boolean;
  onReset: () => void;
}) {
  const danger = scenario === 'refrigeration_failure';
  const fault = scenario === 'sensor_fault';
  const tone = danger ? 'danger' : fault ? 'fault' : 'nominal';

  return <div className={`twin-canvas twin-static ${tone} ${compact ? 'is-compact' : ''}`} aria-label="Shipment container digital twin">
    <div className="container-shadow" />
    <div className="container-model" aria-hidden="true">
      <div className="container-top" />
      <div className="container-side" />
      <div className="container-front">
        <div className="container-ribs" />
        <span className="container-brand">CHILLPATH</span>
        <span className="container-status-light" />
      </div>
      <div className="cooling-unit"><span /><i /></div>
      {[2, 3, 4].map((sensor, index) => <div className={`static-sensor sensor-${sensor}`} key={sensor}>
        <i />
        <span>T-{String(sensor).padStart(2, '0')} <b>{(temperatureC + (index - 1) * .4).toFixed(1)}°</b></span>
      </div>)}
    </div>
  </div>;
}
