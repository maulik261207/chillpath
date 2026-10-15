import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Activity, ChevronDown, Cpu, RefreshCw, ShieldCheck, Wifi, WifiOff } from './uiMarks';
import { api, apiBase } from './api';

type Engine = { id: string; name: string; group: string; status: string; description: string; inputs: string[] };
type Status = { connected: boolean; service: string; checked_at: string; engines: Engine[] };

const groupColors = ['#68704d', '#a65436', '#82745d', '#77766c'];

export default function EnginesDashboard() {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [expanded, setExpanded] = useState<string>();

  const load = async () => {
    setLoading(true); setError('');
    try { setStatus(await api<Status>('/engines/status')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Engine service unavailable'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => status ? [...new Set(status.engines.map(engine => engine.group))] : [], [status]);
  const operational = status?.engines.filter(engine => engine.status === 'operational').length ?? 0;
  const readiness = status?.engines.length ? Math.round(operational / status.engines.length * 100) : 0;
  const visibleEngines = status?.engines.filter(engine => selectedGroup === 'All' || engine.group === selectedGroup) ?? [];

  return <div className="page-wrap engines-page">
    <div className="page-heading"><div><div className="eyebrow">SYSTEM OVERVIEW</div><h1>Engines</h1><p>See what is running, what is ready, and what needs attention.</p></div><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading?'spin':''}/>Refresh</button></div>
    <section className={`engine-connection panel ${status?.connected?'connected':'disconnected'}`}><div className="engine-connection-icon">{status?.connected?<Wifi size={20}/>:<WifiOff size={20}/>}</div><div><span>SYSTEM STATUS</span><b>{status?.connected ? 'Backend connected' : 'Backend disconnected'}</b><small>{status ? `Last checked ${new Date(status.checked_at).toLocaleTimeString()}` : error || 'Checking connection…'}</small></div><code>{apiBase}</code></section>

    {status && <>
      <div className="engine-visual-grid">
        <section className="panel engine-health-panel">
          <div className="engine-panel-heading"><div><b>Overall readiness</b><span>Live engine status</span></div><Activity size={17}/></div>
          <div className="engine-health-body"><div className="engine-donut" style={{'--engine-ready':`${readiness * 3.6}deg`} as CSSProperties}><div><b>{readiness}%</b><span>ready</span></div></div><div className="engine-health-legend"><p><i className="is-live"/><span>Operational</span><b>{operational}</b></p><p><i className="is-ready"/><span>Ready for hardware</span><b>{status.engines.length-operational}</b></p><p><i className="is-total"/><span>Total engines</span><b>{status.engines.length}</b></p></div></div>
        </section>
        <section className="panel engine-bars-panel">
          <div className="engine-panel-heading"><div><b>Engines by purpose</b><span>Select a bar to filter the list</span></div><Cpu size={17}/></div>
          <div className="engine-bars">{groups.map((group,index)=>{const count=status.engines.filter(engine=>engine.group===group).length;const active=selectedGroup===group;return <button key={group} className={active?'active':''} onClick={()=>setSelectedGroup(active?'All':group)}><span>{group}</span><div><i style={{width:`${count/status.engines.length*100}%`,background:groupColors[index%groupColors.length]}}/></div><b>{count}</b></button>})}</div>
        </section>
        <section className="panel engine-flow-panel">
          <div className="engine-panel-heading"><div><b>How the system works</b><span>A simple view of the data flow</span></div><ShieldCheck size={17}/></div>
          <div className="engine-flow"><div><i>1</i><b>Sensors</b><span>Collect readings</span></div><em>→</em><div><i>2</i><b>Checks</b><span>Verify the data</span></div><em>→</em><div><i>3</i><b>Actions</b><span>Suggest next steps</span></div></div>
        </section>
      </div>

      <section className="engine-list-section">
        <div className="engine-list-head"><div><b>{selectedGroup === 'All' ? 'All engines' : selectedGroup}</b><span>{visibleEngines.length} shown</span></div><div className="engine-filters"><button className={selectedGroup==='All'?'active':''} onClick={()=>setSelectedGroup('All')}>All</button>{groups.map(group=><button key={group} className={selectedGroup===group?'active':''} onClick={()=>setSelectedGroup(group)}>{group}</button>)}</div></div>
        <div className="engine-simple-list">{visibleEngines.map(engine => {const isOpen=expanded===engine.id;return <article className={`panel engine-row ${isOpen?'open':''}`} key={engine.id}><button className="engine-row-main" onClick={()=>setExpanded(isOpen?undefined:engine.id)}><span className="engine-icon"><Cpu size={16}/></span><span className="engine-row-title"><b>{engine.name}</b><small>{engine.group}</small></span><span className={`engine-status ${engine.status==='operational'?'':'ready'}`}><i/>{engine.status==='operational'?'Running':'Ready'}</span><ChevronDown size={16} className="engine-row-chevron"/></button>{isOpen&&<div className="engine-row-detail"><p>{engine.description}</p><div><b>Uses</b>{engine.inputs.map(input=><span key={input}>{input}</span>)}</div></div>}</article>})}</div>
      </section>
    </>}

    {error && <div className="disclaimer engine-error"><WifiOff size={16}/><span>{error}. Start the FastAPI service and refresh this page.</span></div>}
    {!status&&!error&&<div className="empty-state">Connecting to the engine service…</div>}
  </div>;
}
