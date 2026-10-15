import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search } from './uiMarks';
import { api, connectedMode, organizationId } from './api';

type ApiShipment = {
  id: string; external_ref: string; origin_label: string; destination_label: string;
  status: string; created_at: string; product_policy_id: string;
};
type ApiPolicy = { id: string; name: string; temperature_min_c: number; temperature_max_c: number; };

export default function ConnectedShipments() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ApiShipment[]>([]);
  const [policies, setPolicies] = useState<ApiPolicy[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ external_ref: '', origin_label: '', destination_label: '', policy: '', policy_name: '', min: '2', max: '8', budget: '30' });

  async function refresh() {
    if (!organizationId) return;
    setError('');
    try {
      const [shipmentRows, policyRows] = await Promise.all([
        api<ApiShipment[]>(`/shipments?organization_id=${organizationId}`),
        api<ApiPolicy[]>(`/product-policies?organization_id=${organizationId}`),
      ]);
      setRows(shipmentRows); setPolicies(policyRows);
      setForm(value => ({ ...value, policy: value.policy || policyRows[0]?.id || '' }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load shipments.'); }
  }
  useEffect(() => { void refresh(); }, []);

  async function createShipment(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      let policyId = form.policy;
      if (!policyId) {
        const policy = await api<ApiPolicy>('/product-policies', { method: 'POST', body: JSON.stringify({
          organization_id: organizationId, name: form.policy_name, temperature_min_c: Number(form.min),
          temperature_max_c: Number(form.max), allowed_excursion_seconds: Number(form.budget) * 60,
        }) });
        policyId = policy.id;
      }
      await api<ApiShipment>('/shipments', { method: 'POST', body: JSON.stringify({
        organization_id: organizationId, external_ref: form.external_ref, product_policy_id: policyId,
        origin_label: form.origin_label, destination_label: form.destination_label,
      }) });
      setOpen(false); setForm(value => ({ ...value, external_ref: '', origin_label: '', destination_label: '' }));
      await refresh();
      setSuccess('Shipment created successfully.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create shipment.'); }
    finally { setBusy(false); }
  }

  const visible = rows.filter(row => `${row.external_ref} ${row.origin_label} ${row.destination_label}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel table-panel">
    <div className="table-toolbar"><div><div className="panel-title">{connectedMode ? 'Connected shipments' : 'API shipment preview'} <span className="table-count">{visible.length}</span></div><div className="panel-sub">{connectedMode ? 'Loaded from your ChillPath API' : 'Configure API URL and organization ID to connect'}</div></div>
      <div className="table-tools"><label className="search-box"><Search size={15}/><span className="sr-only">Search shipments</span><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search shipments"/></label>{connectedMode && <button className="button button-primary" onClick={() => { setOpen(value => !value); setSuccess(''); }}>＋ New shipment</button>}</div></div>
    {error && <div className="empty-state" role="alert">{error}</div>}
    {success && <div className="notice notice-success" role="status"><span>{success}</span><button type="button" onClick={() => setSuccess('')} aria-label="Dismiss success message">Close</button></div>}
    {!connectedMode && <div className="empty-state">Set <code>VITE_API_BASE_URL</code> and <code>VITE_ORGANIZATION_ID</code> in <code>frontend/.env.local</code> to use connected mode. Seeded demo data remains available in the command center.</div>}
    {open && <form className="panel" onSubmit={createShipment} style={{ margin: 20, padding: 20, display: 'grid', gap: 12 }}>
      <div className="panel-title">Create shipment</div>
      <label>Shipment reference<input required value={form.external_ref} onChange={e => setForm({ ...form, external_ref: e.target.value })}/></label>
      <label>Origin<input required value={form.origin_label} onChange={e => setForm({ ...form, origin_label: e.target.value })}/></label>
      <label>Destination<input required value={form.destination_label} onChange={e => setForm({ ...form, destination_label: e.target.value })}/></label>
      {policies.length ? <select value={form.policy} onChange={e => setForm({ ...form, policy: e.target.value })}><option value="">Create a new policy</option>{policies.map(policy => <option key={policy.id} value={policy.id}>{policy.name} · {policy.temperature_min_c}–{policy.temperature_max_c}°C</option>)}</select> : <p className="panel-sub">No existing policies. Create one below.</p>}
      {!form.policy && <><label>New product policy name<input required value={form.policy_name} onChange={e => setForm({ ...form, policy_name: e.target.value })}/></label><div className="connected-number-fields"><label>Minimum temperature °C<input required type="number" step="0.1" value={form.min} onChange={e => setForm({ ...form, min: e.target.value })}/></label><label>Maximum temperature °C<input required type="number" step="0.1" value={form.max} onChange={e => setForm({ ...form, max: e.target.value })}/></label><label>Allowed minutes<input required type="number" min="0" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })}/></label></div></>}
      <div style={{ display: 'flex', gap: 8 }}><button className="button button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create shipment'}</button><button type="button" className="button button-outline" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>}
    {connectedMode && <div className="table-scroll"><table><thead><tr><th>REFERENCE</th><th>ROUTE</th><th>STATUS</th><th>CREATED</th><th/></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><b className="mono">{row.external_ref}</b></td><td>{row.origin_label}<span className="route-arrow"> → </span>{row.destination_label}</td><td><span className="status-tag normal">{row.status}</span></td><td>{new Date(row.created_at).toLocaleDateString()}</td><td><button className="arrow-btn" aria-label={`Open ${row.external_ref}`} onClick={() => navigate(`/shipments/${encodeURIComponent(row.id)}`)}><ArrowRight size={15}/></button></td></tr>)}</tbody></table></div>}
    {connectedMode && !visible.length && !error && <div className="empty-state">No shipments found for this organization.</div>}
  </section>;
}
