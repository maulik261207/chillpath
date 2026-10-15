import { useEffect, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Radio, ShieldCheck, Thermometer } from './uiMarks';
import { api, connectedMode, organizationId } from './api';
import { useApp } from './store/demoStore';

const DigitalTwin = lazy(() => import('./DigitalTwin'));
type RemoteShipment = { id: string; external_ref: string; origin_label: string; destination_label: string; status: string; created_at: string; product_policy_id: string };
type RemotePolicy = { id: string; name: string; temperature_min_c: number; temperature_max_c: number; allowed_excursion_seconds: number };

export default function ShipmentDetailContent({ id }: { id: string }) {
  const demoRows = useApp(state => state.shipments);
  const demo = demoRows.find(row => row.id === id);
  const [remote, setRemote] = useState<RemoteShipment>();
  const [policy, setPolicy] = useState<RemotePolicy>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(connectedMode);

  useEffect(() => {
    if (!connectedMode || !organizationId) return;
    let active = true;
    Promise.all([
      api<RemoteShipment>(`/shipments/${encodeURIComponent(id)}?organization_id=${organizationId}`),
      api<RemotePolicy[]>(`/product-policies?organization_id=${organizationId}`),
    ]).then(([shipment, policies]) => {
      if (!active) return;
      setRemote(shipment);
      setPolicy(policies.find(item => item.id === shipment.product_policy_id));
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load shipment.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="empty-state">Loading shipment record…</div>;
  if (error) return <div className="empty-state" role="alert">{error}</div>;
  if (connectedMode && !remote) return <div className="empty-state">Shipment not found in this organization.</div>;
  if (!connectedMode && !demo) return <div className="empty-state">Shipment not found in demo records.</div>;

  const reference = remote?.external_ref ?? demo!.id;
  const origin = remote?.origin_label ?? demo!.from;
  const destination = remote?.destination_label ?? demo!.to;
  const temperature = demo?.temp ?? 4.2;
  const range = policy ? `${policy.temperature_min_c.toFixed(1)}–${policy.temperature_max_c.toFixed(1)}°C` : '2.0–8.0°C demo range';
  const state = demo?.status ?? remote?.status ?? 'draft';
  const budget = policy ? Math.floor(policy.allowed_excursion_seconds / 60) : demo?.budget ?? 45;
  return <div className="page-wrap shipment-detail-wrap">
    <Link to="/shipments" className="text-link"><ArrowLeft size={14}/>All shipments</Link>
    <div className="page-heading" style={{ marginTop: 16 }}><div><div className="eyebrow">SHIPMENT RECORD · {connectedMode ? 'CONNECTED API' : 'SEEDED DEMO DATA'}</div><h1>{reference}</h1><p>{origin} → {destination}</p></div><span className="status-tag normal">{state}</span></div>
    <div className="dashboard-grid">
      <section className="panel twin-panel"><div className="panel-head"><div><div className="panel-title">Shipment digital twin</div><div className="panel-sub">Sensor condition view · synthetic demo visual</div></div></div><Suspense fallback={<div className="twin-loading">Loading twin…</div>}><DigitalTwin scenario="normal" temperatureC={temperature} onReset={()=>{}}/></Suspense></section>
      <section className="panel"><div className="panel-head"><div><div className="panel-title">Condition and policy</div><div className="panel-sub">Configured product limits</div></div></div><div className="evidence-row"><span><Thermometer size={13}/> Current demo reading</span><b>{temperature.toFixed(1)}°C</b></div><div className="evidence-row"><span>Temperature range</span><b>{range}</b></div><div className="evidence-row"><span>Exposure allowance</span><b>{budget} min</b></div><div className="evidence-row"><span>Product policy</span><b>{policy?.name ?? demo?.category ?? 'Assigned policy'}</b></div><div className="evidence-row"><span>Record state</span><b>{state}</b></div><div className="disclaimer"><ShieldCheck size={15}/><span>Decision support only. A temperature reading does not establish product safety or release suitability.</span></div></section>
    </div>
    <div className="dashboard-grid" style={{ marginTop: 14 }}><section className="panel"><div className="panel-head"><div><div className="panel-title">Route</div><div className="panel-sub">Configured origin and destination</div></div></div><div className="evidence-row"><span><MapPin size={13}/> Origin</span><b>{origin}</b></div><div className="evidence-row"><span><MapPin size={13}/> Destination</span><b>{destination}</b></div><div className="evidence-row"><span>Estimated arrival</span><b>{demo?.eta ?? 'Not configured'}</b></div></section><section className="panel"><div className="panel-head"><div><div className="panel-title">Assigned sensors</div><div className="panel-sub">Sensor identity and connectivity</div></div></div><div className="evidence-row"><span><Radio size={13}/> Sensor T-04</span><b>{connectedMode ? 'Assignment not available' : demo?.health ?? 'Demo nominal'}</b></div><div className="evidence-row"><span>Last measurement</span><b>{temperature.toFixed(1)}°C · synthetic demo</b></div></section></div>
  </div>;
}
