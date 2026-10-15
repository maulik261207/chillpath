import { useEffect, useState } from 'react';
import { Activity, Check, Cpu, Database, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { api, apiBase } from './api';

type Engine = { id: string; name: string; group: string; status: string; description: string; inputs: string[] };
type Status = { connected: boolean; service: string; checked_at: string; engines: Engine[] };

export default function EnginesDashboard() {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try { setStatus(await api<Status>('/engines/status')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Engine service unavailable'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const groups = status ? [...new Set(status.engines.map(engine => engine.group))] : [];
  return <div className="page-wrap engines-page">
    <div className="page-heading"><div><div className="eyebrow">BACKEND INTELLIGENCE · LIVE CONNECTION</div><h1>Engine control center</h1><p>One view of the trust, condition, recovery and route engines running behind ChillPath.</p></div><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading?'spin':''}/>Refresh status</button></div>
    <section className={`engine-connection panel ${status?.connected?'connected':'disconnected'}`}><div className="engine-connection-icon">{status?.connected?<Wifi size={20}/>:<WifiOff size={20}/>}</div><div><span>BACKEND CONNECTION</span><b>{status?.connected ? `${status.service} connected` : 'Backend disconnected'}</b><small>{status ? `Verified ${new Date(status.checked_at).toLocaleTimeString()}` : error || 'Checking service status…'}</small></div><code>{apiBase}</code></section>
    {status && <div className="engine-metrics"><div className="metric-card"><Cpu/><span>Engines loaded</span><b>{status.engines.length}</b></div><div className="metric-card"><Activity/><span>Operational</span><b>{status.engines.filter(item=>item.status==='operational').length}</b></div><div className="metric-card"><ShieldCheck/><span>Trust engines</span><b>{status.engines.filter(item=>item.group==='Sensor trust').length}</b></div><div className="metric-card"><Database/><span>Service state</span><b className="engine-state">LIVE</b></div></div>}
    {error && <div className="disclaimer engine-error"><WifiOff size={16}/><span>{error}. Start the FastAPI service at the configured address and refresh this page.</span></div>}
    {groups.map(group => <section className="engine-group" key={group}><div className="engine-group-title"><span>{group}</span><i>{status!.engines.filter(engine=>engine.group===group).length} MODULES</i></div><div className="engine-grid">{status!.engines.filter(engine=>engine.group===group).map(engine => <article className="panel engine-card" key={engine.id}><div className="engine-card-top"><span className="engine-icon"><Cpu size={17}/></span><span className="engine-status"><i/><Check size={11}/>{engine.status}</span></div><small>{engine.id}</small><h2>{engine.name}</h2><p>{engine.description}</p><div className="engine-inputs"><b>INPUTS</b>{engine.inputs.map(input=><span key={input}>{input}</span>)}</div></article>)}</div></section>)}
    {!status&&!error&&<div className="empty-state">Connecting to the engine service…</div>}
  </div>;
}
