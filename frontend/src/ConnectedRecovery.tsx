import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Cpu, ShieldCheck } from 'lucide-react';
import { api, organizationId } from './api';

type Shipment = { id: string; external_ref: string; origin_label: string; destination_label: string };
type Recommendation = { action_type: string; feasibility: 'feasible' | 'unknown' | 'blocked'; priority: number; rationale: string; estimated_time_seconds: number | null; approval_status: string };
type Assessment = { shipment_id: string; evidence_state: string; evidence_reason: string; verified_exposure_seconds: number; uncertain_exposure_seconds: number; remaining_budget_seconds: number; added_delay_seconds: number; assumptions: string[]; recommendations: Recommendation[] };

const titleFor = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function ConnectedRecovery() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [assessment, setAssessment] = useState<Assessment>();
  const [selected, setSelected] = useState('');
  const [delay, setDelay] = useState(0);
  const [alternate, setAlternate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadShipments = useCallback(async () => {
    if (!organizationId) return;
    try {
      const result = await api<Shipment[]>(`/shipments?organization_id=${organizationId}`);
      setShipments(result);
      setSelected(current => current || result[0]?.id || '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load shipments.'); }
  }, []);
  const evaluate = useCallback(async () => {
    if (!organizationId || !selected) return;
    setError('');
    try {
      const result = await api<Assessment>(`/shipments/${selected}/recovery?organization_id=${organizationId}&added_delay_seconds=${delay}&alternate_available=${alternate}`);
      setAssessment(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not evaluate recovery options.'); }
  }, [selected, delay, alternate]);
  useEffect(() => { void loadShipments(); }, [loadShipments]);
  useEffect(() => { void evaluate(); }, [evaluate]);
  async function decide(action: Recommendation['action_type'], decision: 'accepted' | 'rejected') {
    if (!organizationId || !selected) return;
    setBusy(true); setError('');
    try {
      await api(`/shipments/${selected}/operator-actions`, { method: 'POST', body: JSON.stringify({ organization_id: organizationId, action_type: action, decision, reason: `Operator ${decision} the proposed action from connected recovery analysis.` }) });
      setAssessment(current => current ? ({ ...current, recommendations: current.recommendations.map(item => item.action_type === action ? { ...item, approval_status: decision } : item) }) : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record operator decision.'); }
    finally { setBusy(false); }
  }
  const shipment = shipments.find(item => item.id === selected);
  return <div className="page-wrap"><div className="page-heading"><div><div className="eyebrow">CONNECTED RECOVERY · HUMAN APPROVAL REQUIRED</div><h1>Recovery intelligence</h1><p>Recommendations use saved telemetry and the assigned product policy.</p></div><span className="mode-pill"><i/>FASTAPI CONNECTED</span></div>
    {error && <div className="empty-state" role="alert">{error}</div>}
    <section className="panel table-toolbar"><label className="scenario-select"><span className="panel-sub">SHIPMENT</span><select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose shipment</option>{shipments.map(item => <option value={item.id} key={item.id}>{item.external_ref} · {item.origin_label} → {item.destination_label}</option>)}</select></label><label className="scenario-select"><span className="panel-sub">ADDED DELAY</span><select value={delay} onChange={event => setDelay(Number(event.target.value))}><option value={0}>No extra delay</option><option value={900}>15 minutes · simulated</option><option value={1800}>30 minutes · simulated</option></select></label><label className="health"><input type="checkbox" checked={alternate} onChange={event => setAlternate(event.target.checked)}/> Alternate facility verified</label></section>
    {assessment && shipment && <><div className="alert-banner"><div className="alert-mark"><AlertTriangle size={18}/></div><div><b>{shipment.external_ref} · {assessment.evidence_state.replaceAll('_', ' ')}</b><span>{assessment.evidence_reason} · {shipment.origin_label} → {shipment.destination_label}</span></div></div><div className="recovery-layout"><div className="recovery-main"><section className="panel recommendation-panel"><div className="panel-head"><div><div className="panel-title">Ranked interventions</div><div className="panel-sub">Ordered by deterministic evidence and feasibility</div></div><span className="updated-label">API ASSESSMENT</span></div>{assessment.recommendations.map((item, index) => <div className="recommendation" key={item.action_type}><div className={`rank ${index===0?'recommended':index===1?'blue':'purple'}`}>{String(index+1).padStart(2,'0')}</div><div className="rec-content"><div className="rec-top"><span className="rec-type">{item.feasibility.toUpperCase()} · {item.approval_status.toUpperCase()}</span><span className="score">PRIORITY <b>{item.priority}</b></span></div><h3>{titleFor(item.action_type)}</h3><p>{item.rationale}</p><div className="evidence-list"><span><i/> Evidence state · {assessment.evidence_state.replaceAll('_',' ')}</span><span><i/> Feasibility · {item.feasibility}</span></div><div className="rec-actions"><button className="button button-primary button-sm" disabled={busy||item.feasibility==='blocked'} onClick={()=>void decide(item.action_type,'accepted')}><Check size={14}/>Approve action</button><button className="button button-outline button-sm" disabled={busy} onClick={()=>void decide(item.action_type,'rejected')}>Reject</button><span className="requires">Operator decision is recorded</span></div></div></div>)}</section><div className="disclaimer"><ShieldCheck size={16}/><span>Decision support only. ChillPath does not determine product safety, compliance or release suitability.</span></div></div><aside className="recovery-side"><section className="panel"><div className="panel-head"><div><div className="panel-title">Evidence snapshot</div><div className="panel-sub">{shipment.external_ref}</div></div></div><div className="evidence-row"><span>Evidence classification</span><b>{assessment.evidence_state.replaceAll('_',' ')}</b></div><div className="evidence-row"><span>Confirmed exposure</span><b>{Math.floor(assessment.verified_exposure_seconds/60)} min</b></div><div className="evidence-row"><span>Uncertain exposure</span><b>{Math.floor(assessment.uncertain_exposure_seconds/60)} min</b></div><div className="evidence-row"><span>Remaining declared budget</span><b>{Math.floor(assessment.remaining_budget_seconds/60)} min</b></div></section><section className="panel agent-panel"><div className="panel-head"><div><div className="panel-title">Analysis pipeline</div><div className="panel-sub">Deterministic modules</div></div><Cpu size={16}/></div>{['Monitoring','Sensor validation','Exposure risk','Route evaluation'].map(name=><div className="agent-row" key={name}><span className="agent-ok"><Check size={13}/></span><div><b>{name}</b><small>Evaluated from connected shipment data</small></div></div>)}</section></aside></div><section className="panel scenario-details" style={{marginTop:12,padding:16}}><b className="panel-title">Assumptions</b>{assessment.assumptions.map(item=><p className="panel-sub" key={item}>{item}</p>)}</section></>}
    {!assessment&&!error&&<div className="empty-state">{shipments.length?'Loading recovery assessment…':'Create a shipment first to evaluate its recovery options.'}</div>}
  </div>;
}
