import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Box, Check, Clock3, Compass, Database, Gauge, Menu, Pause, Play, Radio, RotateCcw, Search, ShieldCheck, Snowflake, Wifi, WifiOff } from './uiMarks';
import './style.css';
import ConnectedShipments from './ConnectedShipments';
import { connectedMode } from './api';
import type { Scenario } from './simulation/domain';
import { seedShipments, statusLabel, useApp } from './store/demoStore';
import { useLiveStore } from './store/liveStore';
import LiveDashboard from './LiveDashboard';
import ShipmentDetailContent from './ShipmentDetailContent';
import TelemetryScene from './TelemetryChart';
import RouteMap from './RouteMap';
import EnginesDashboard from './EnginesDashboard';
import './redesign.css';
import { AccountPage, BillingPage } from './AccountPages';
import LegalPage from './LegalPages';
import { readSessionIdentity, signOut } from './authSession';
import { StaticContainer } from './DigitalTwin';

const DigitalTwinScene = React.lazy(() => import('./DigitalTwin'));
const RouteIntelligence = React.lazy(() => import('./RouteIntelligence'));

class VisualBoundary extends React.Component<{children:React.ReactNode;fallback:React.ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:unknown){console.error('Visual module failed safely',error);}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}

function Twin({compact=false}:{compact?:boolean}){const scenario=useApp(s=>s.scenario);const demoTemp=useApp(s=>s.temperatureC);const evidence=useApp(s=>s.evidenceState);const offline=useApp(s=>s.offline);const liveResponse=useLiveStore(s=>s.response);const liveData=liveResponse?.data;const temperature=liveData?liveData.temperature_c:demoTemp;const isLiveOnline=liveResponse?.online??false;const lag=liveResponse?.seconds_since_last_packet;const [now,setNow]=React.useState(()=>new Date());React.useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),1000);return()=>window.clearInterval(timer)},[]);const currentTime=now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});const twinScenario=evidence==='valid_excursion'?'refrigeration_failure':evidence==='suspected_sensor_fault'?'sensor_fault':scenario;return <div className={`twin ${compact?'twin-compact':''}`}><VisualBoundary fallback={<StaticContainer scenario={twinScenario} temperatureC={temperature}/>}><React.Suspense fallback={<StaticContainer scenario={twinScenario} temperatureC={temperature}/>}><DigitalTwinScene scenario={twinScenario} temperatureC={temperature} compact={compact} onReset={()=>useApp.getState().setScenario('normal')}/></React.Suspense></VisualBoundary><div className="twin-hud"><span><i className={evidence==='valid_excursion'?'dot-warn':''}/>{isLiveOnline?'LIVE SENSOR':evidence==='valid_excursion'?'THERMAL ALERT':evidence==='suspected_sensor_fault'?'SENSOR REVIEW':offline?'OFFLINE · BUFFERING':'DIGITAL TWIN'}</span><b>{temperature.toFixed(1)}°<small>C</small></b><em>{isLiveOnline?`T1 · ESP32-S3 · ${lag?.toFixed(1)}s ago`:`Sensor T1 · updated ${currentTime}`}</em></div>{!compact&&<div className="twin-controls"><span>{isLiveOnline?'LIVE SENSOR VIEW':'CONTAINER VIEW'}</span><button onClick={()=>useApp.getState().setScenario('normal')} aria-label="Reset view"><RotateCcw size={14}/></button></div>}</div>}
function TemperatureChart({large=false}:{large?:boolean}){
  const scenario=useApp(s=>s.scenario);
  const demoReadings=useApp(s=>s.readings);
  const liveHistory=useLiveStore(s=>s.history);
  const liveResponse=useLiveStore(s=>s.response);
  const isLive=liveResponse?.online??false;

  const liveReadings = (isLive && liveHistory.length > 0)
    ? liveHistory.map((h, idx) => ({
        eventId: `${h.device_id}-${h.observed_at || h.received_at}-${idx}`,
        observedAt: new Date(h.observed_at || h.received_at).getTime(),
        temperatureC: h.temperature_c,
        humidityPct: h.humidity_pct,
        credible: !h.alarm_active,
      }))
    : demoReadings;

  const min=2,max=8;
  return <VisualBoundary fallback={<div className="chart-loading">Telemetry chart unavailable · readings remain accessible</div>}>
    <TelemetryScene scenario={scenario} readings={liveReadings} minimumC={min} maximumC={max} large={large}/>
  </VisualBoundary>;
}
function IconBrand(){return <Link to="/" className="brand"><span className="brand-mark"><Snowflake size={20}/></span><span className="brand-text">Chill<span className="brand-light">Path</span></span></Link>}
function Shell({children}:{children:React.ReactNode}){
  const [open,setOpen]=useState(false);
  const navigate=useNavigate();
  const offline=useApp(s=>s.offline);
  const identity=readSessionIdentity();
  const orgName=identity?.kind==='demo'?'ChillPath Operations':identity?.organizationName||'ChillPath workspace';
  const profileName=identity?.name||'Alex Morgan';
  const initials=profileName.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();
  const leaveWorkspace=()=>{signOut();navigate('/login',{replace:true});};
  return <div className="app-shell">
    <aside className={`sidebar ${open?'sidebar-open':''}`}>
      <IconBrand/>
      <div className="org"><div className="org-avatar">{orgName[0]}</div><div><b>{orgName}</b><span>{'Operations workspace'}</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{[['Overview','/dashboard'],['Live Sensor','/live-sensor'],['Shipments','/shipments'],['Route intelligence','/route-intelligence'],['Engines','/engines'],['Test scenarios','/simulator']].map(([name,path])=><NavLink key={path} to={path} className={({isActive})=>`nav-item ${isActive?'active':''}`} onClick={()=>setOpen(false)}>{name}</NavLink>)}</nav>
      <div className="side-bottom">
        <div className={`connection ${offline?'offline':''}`}><span className="pulse"/>{offline?'Offline · buffering':'Connected'}</div>
        <div className="profile"><div className="profile-avatar">{initials}</div><div><b title={profileName}>{profileName}</b><span>{identity?.kind==='demo'?'Cold-chain operator':'Workspace member'}</span></div></div>
        <button className="sidebar-signout" type="button" onClick={leaveWorkspace}>Sign out</button>
      </div>
    </aside>
    <div className="app-main"><header className="topbar"><button className="icon-button mobile-menu" onClick={()=>setOpen(!open)} aria-label="Toggle menu"><Menu size={19}/></button><div className="crumb"><span>{orgName}</span><span className="slash">/</span><b>Operations</b></div></header><main>{children}</main></div>
  </div>;
}
function Heading({eyebrow,title,desc,right}:{eyebrow:string;title:string;desc:string;right?:React.ReactNode}){
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>{right}</div>;
}

function Dashboard(){
  const profileName=readSessionIdentity()?.name||'Operator';
  const s=useApp(x=>x.scenario);
  const startLive=useLiveStore(x=>x.startPolling);
  const stopLive=useLiveStore(x=>x.stopPolling);
  const liveResponse=useLiveStore(x=>x.response);
  const liveData=liveResponse?.data;
  const isLive=liveResponse?.online??false;

  React.useEffect(()=>{
    startLive();
    return()=>stopLive();
  },[startLive,stopLive]);

  const liveTemp=liveData?liveData.temperature_c.toFixed(1)+'°C':null;
  const liveHum=liveData?.humidity_pct!=null?liveData.humidity_pct.toFixed(1)+'%':null;
  const liveDevice=liveData?.device_id??null;

  return <Shell><div className="page-wrap">
    <Heading
      eyebrow={isLive?'LIVE SENSOR CONNECTED · REAL-TIME OPERATIONS':'OPERATIONS OVERVIEW'}
      title={isLive?'Live monitoring':`Good afternoon, ${profileName}`}
      desc={isLive?`Receiving live data from ${liveDevice??'ESP32-S3'} sensor bridge.`:'Here\'s the current picture across your cold-chain fleet.'}
    />
    <div className="metric-grid dashboard-metrics">
      <Metric minimal label={isLive?'Live temperature':'Active shipments'} value={isLive&&liveTemp?liveTemp:String(seedShipments.length)} foot={isLive?'ESP32-S3 sensor':'Seeded demo shipments'} tone={isLive&&liveData&&liveData.temperature_c>35?'orange':'green'}/>
      <Metric minimal label={isLive?'Humidity':'Temperature OK'} value={isLive?(liveHum??'--%'):String(seedShipments.filter(x=>x.status==='In transit').length)} foot={isLive?'DHT sensor reading':'Inside the safe demo range'} tone="green"/>
      <Metric minimal label={isLive?'Alarm status':'Needs attention'} value={isLive?(liveData?.alarm_active?'Active':'Normal'):String(seedShipments.filter(x=>x.status!=='In transit').length+(s==='normal'?0:1))} foot={isLive?(liveData?.alarm_active?'Temperature alarm triggered':'All readings normal'):'Temperature or sensor review'} tone={isLive&&liveData?.alarm_active?'orange':'green'}/>
      <Metric minimal label={isLive?'Connection':'Pending actions'} value={isLive?'Online':s==='normal'?'01':'02'} foot={isLive?`${liveResponse?.seconds_since_last_packet?.toFixed(1)}s latency`:'Operator approval required'} tone={isLive?'green':'purple'}/>
    </div>
    <section className="panel twin-panel dashboard-twin-only">
        <div className="panel-head">
          <div>
            <div className="panel-title">{isLive?'Sensor condition':'Shipment condition'}</div>
            <div className="panel-sub">{isLive?`${liveDevice??'ESP32-S3'} · Live bridge`:'CH-2048 · Basel → Copenhagen'}</div>
          </div>
        </div>
        <Twin/>
        <div className="twin-foot">
          <span><i className="legend-dot cyan"/>Safe range</span>
          <span><i className="legend-dot orange"/>Excursion</span>
          <span><i className="legend-dot purple"/>Sensor review</span>
        </div>
    </section>
  </div></Shell>;
}
function Metric({icon,label,value,foot,tone='blue',minimal=false}:{icon?:React.ReactNode;label:string;value:string;foot:string;tone?:string;minimal?:boolean}){return <div className={`metric-card ${minimal?'metric-card-minimal':''}`}>{!minimal&&icon&&<div className={`metric-icon ${tone}`}>{icon}</div>}<div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div>{!minimal&&<div className="metric-trend"><ArrowUpRight size={13}/></div>}</div>}
function EventList({limit}:{limit?:number}){const events=useApp(s=>s.events);return <div className="event-list">{events.slice(0,limit??8).map(e=><div className="event-row" key={e.id}><span className={`event-dot ${e.kind}`}/><div className="event-copy"><b>{e.title}</b><span>{e.detail}</span></div><time>{e.time}</time></div>)}</div>}
function Shipments(){
 const navigate=useNavigate();
 const [query,setQuery]=useState('');
 const [statusFilter,setStatusFilter]=useState('All statuses');
 const [notice,setNotice]=useState('');
 const shipments=useApp(state=>state.shipments);
 const rows=shipments.filter(row=>`${row.id} ${row.product} ${row.from} ${row.to}`.toLowerCase().includes(query.toLowerCase())).filter(row=>statusFilter==='All statuses'||row.status===statusFilter);
 const nominal=shipments.filter(row=>row.status==='In transit').length;
 const attention=shipments.filter(row=>row.status!=='In transit').length;
 return <Shell><div className="page-wrap shipments-page">
  <Heading eyebrow="FLEET MANAGEMENT" title="Shipments" desc="Track temperature, sensor status and delivery progress for active shipments." right={connectedMode?undefined:<button className="button button-primary" onClick={()=>setNotice('Connect the backend API to create and save a shipment. Demo records remain available below.')}>＋ New shipment</button>}/>
  {notice&&<div className="notice notice-info" role="status"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss message">Close</button></div>}
  <div className="metric-grid compact-metrics"><Metric minimal label="Active" value={String(shipments.length)} foot="Seeded demo records"/><Metric minimal label="Temperature OK" value={String(nominal)} foot="Inside the safe demo range" tone="green"/><Metric minimal label="Needs review" value={String(attention)} foot="Temperature or sensor issue" tone="orange"/><Metric minimal label="Test status" value={useApp.getState().evidenceState==='normal'?'Baseline':'Active'} foot="Synthetic demo state" tone="purple"/></div>
  {connectedMode?<ConnectedShipments/>:<section className="panel table-panel"><div className="table-toolbar"><div><div className="panel-title">Seeded demo fleet <span className="table-count">{rows.length}</span></div><div className="panel-sub">Demo records · not live sensor readings</div></div><div className="table-tools"><label className="search-box"><Search size={15}/><span className="sr-only">Search shipments</span><input value={query} onChange={event=>setQuery(event.target.value)} aria-label="Search shipments"/></label><select className="select-button" aria-label="Filter shipments by status" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option>All statuses</option>{[...new Set(shipments.map(row=>row.status))].map(value=><option key={value}>{value}</option>)}</select></div></div>
   <div className="table-scroll"><table><thead><tr><th>SHIPMENT</th><th>PRODUCT</th><th>ROUTE</th><th>TEMP.</th><th>SENSOR HEALTH</th><th>ETA</th><th>STATUS</th><th/></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><Link className="mono" to={`/shipments/${encodeURIComponent(row.id)}`}>{row.id}</Link></td><td><b>{row.product}</b><span className="cell-sub">{row.category} · demo</span></td><td>{row.from}<span className="route-arrow"> → </span>{row.to}</td><td className={row.status==='Excursion'?'critical':''}>{row.temp.toFixed(1)}°C</td><td><span className={`health ${row.health==='Nominal'?'healthy':'unhealthy'}`}><i/>{row.health}</span></td><td>{row.eta}</td><td><span className={`status-tag ${row.status==='Excursion'?'warn':row.status==='Evidence gap'?'purple':'normal'}`}>{row.status}</span></td><td><button className="arrow-btn" onClick={()=>navigate(`/shipments/${encodeURIComponent(row.id)}`)} aria-label={`Inspect ${row.id}`}><ArrowRight size={15}/></button></td></tr>)}</tbody></table></div>
   {rows.length===0&&<div className="empty-state">No shipments match this search and status.</div>}<div className="table-footer">Showing {rows.length} of {shipments.length} synthetic records <span>Demo data</span></div></section>}
 </div></Shell>
}
function ShipmentDetailPage(){const {id=''}=useParams();return <Shell><ShipmentDetailContent id={decodeURIComponent(id)}/></Shell>}
const scenarioOptions:[Scenario,string,string][]=[['normal','Nominal operations','Baseline telemetry within configured policy.'],['refrigeration_failure','Refrigeration failure','Progressive temperature rise with sensor agreement.'],['traffic_delay','Traffic delay','Adds 30 minutes to estimated arrival.'],['destination_closure','Destination closure','Receiving facility unavailable; evaluate alternatives.'],['sensor_fault','Sensor fault','Inject an implausible spike with conflicting evidence.'],['network_disconnection','Network disconnection','Buffer events locally, then synchronize on reconnect.']];
function Simulator(){const scenario=useApp(s=>s.scenario);const running=useApp(s=>s.running);const offline=useApp(s=>s.offline);const guidedDemo=useApp(s=>s.guidedDemo);const guidedStep=useApp(s=>s.guidedStep);const choose=useApp(s=>s.setScenario);const reset=useApp(s=>s.reset);const toggle=useApp(s=>s.toggleRun);const tick=useApp(s=>s.tick);const temperature=useApp(s=>s.temperatureC);const exposure=useApp(s=>s.confirmedExposureSeconds);const uncertain=useApp(s=>s.uncertainExposureSeconds);const evidence=useApp(s=>s.evidenceState);const delay=useApp(s=>s.delaySeconds);const buffered=useApp(s=>s.bufferedCount);const approve=useApp(s=>s.approve);const reconnect=useApp(s=>s.reconnect);const disconnect=useApp(s=>s.disconnect);const [speed,setSpeed]=useState(1);React.useEffect(()=>{if(!running)return;const timer=window.setInterval(tick,1000/speed);return()=>window.clearInterval(timer)},[running,speed,tick]);const options=scenarioOptions.find(x=>x[0]===scenario);const recommendations=scenario==='destination_closure'?[['Escalate to the receiving coordinator','Destination is marked unavailable; no alternate facility is verified.'],['Preserve shipment in monitored cold storage','Hold at a confirmed facility while the operator verifies a destination.']]:scenario==='sensor_fault'?[['Inspect sensor T-04 and preserve the raw reading','The isolated 12.4°C spike conflicts with adjacent in-range readings.'],['Continue monitoring with independent sensors','Do not treat the questionable sensor sample as a confirmed excursion.']]:scenario==='traffic_delay'?[['Recalculate delivery priority','Revised ETA includes a simulated 30 minute delay.'],['Check remaining exposure margin','Delay is simulated; compare it with the product policy before acting.']]:evidence==='valid_excursion'?[['Prioritize delivery to receiving facility','Confirmed readings are outside the declared 2–8°C range.'],['Inspect refrigeration at the next checkpoint','The temperature is rising across repeated measurements.']]:[['Maintain monitored route','Current measurements remain within the demo policy range.'],['Review sensor evidence','Keep the event record and verify the next measurement.']];return <Shell><div className="page-wrap sim-wrap"><Heading eyebrow="DETERMINISTIC SCENARIO LAB" title="Disruption simulator" desc="Run reproducible disruptions and watch telemetry, evidence, exposure and response update together."/><div className="sim-toolbar panel"><div className="scenario-select"><label htmlFor="scenario">SCENARIO</label><select id="scenario" value={scenario} onChange={e=>choose(e.target.value as Scenario)}>{scenarioOptions.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></div><div className="sim-controls"><button className="button button-primary" onClick={toggle}>{running?<><Pause size={15}/>Pause</>:<><Play size={14} fill="currentColor"/>{useApp.getState().elapsedSeconds?'Resume':'Start'}</>}</button><button className="button button-outline" onClick={reset}><RotateCcw size={14}/>Reset</button><label className="select-button">Speed <select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label><button className="button button-outline" onClick={()=>offline?reconnect():disconnect()} disabled={guidedDemo&&guidedStep===4&&buffered<2}>{offline?<><Wifi size={14}/>Reconnect & sync</>:<><WifiOff size={14}/>Disconnect</>}</button><button className="button button-outline" onClick={()=>choose('normal')}>Restore normal</button></div></div>{guidedDemo&&<div className="panel guided-banner" role="status"><b>{guidedStep===0?'Step 1 of 4 · Establish baseline':guidedStep===1?'Step 2 of 4 · Cooling failure':guidedStep===2?'Step 3 of 4 · Route delay':guidedStep===3?'Operator review · Approve an action to continue':guidedStep===4?'Step 4 of 4 · Offline recovery': 'Guided demo complete'}</b><span>{guidedStep===3?'The simulation is paused for your decision. Approval records your action and starts the offline segment.':guidedStep===4?'Two buffered measurements are required before reconnect and synchronization.':guidedStep===5?'Buffered measurements were synchronized with their original measurement times.':'The simulator advances through a reproducible disruption sequence; you can pause at any time.'}</span></div>}<div className="sim-grid"><section className="panel sim-visual"><div className="panel-head"><div><div className="panel-title">CH-2048 · Basel → Copenhagen</div><div className="panel-sub">mRNA vaccine · Policy range 2.0–8.0°C</div></div><span className={`status-tag ${evidence==='valid_excursion'?'warn':evidence==='suspected_sensor_fault'?'purple':'normal'}`}>{statusLabel(scenario,evidence,offline)}</span></div><Twin/><div className="sim-stats"><div><span>Temperature</span><b className={temperature>8?'critical':''}>{temperature.toFixed(1)}°C</b></div><div><span>Confirmed time out of range</span><b>{Math.floor(exposure/60)} min</b></div><div><span>Remaining budget</span><b>{Math.max(0,45-Math.floor(exposure/60))} min</b></div><div><span>Estimated arrival</span><b>{delay?`+${Math.floor(delay/60)} min`:'On schedule'}</b></div></div><div className="evidence-row"><span>Evidence classification</span><b>{evidence.replaceAll('_',' ')}</b></div>{uncertain>0&&<div className="evidence-row"><span>Possible time out of range</span><b>{Math.floor(uncertain/60)} min</b></div>}</section><section className="panel sim-chart"><div className="panel-head"><div><div className="panel-title">Shipment telemetry</div><div className="panel-sub">Measurement timestamps retained · Temperature and humidity</div></div><span className="chart-live"><i/>{running?'SIMULATING':'PAUSED'}</span></div><div className="chart-key"><i/>Temperature <span>Safe range 2–8°C</span><i style={{background:'#a67742',marginLeft:8}}/>Humidity</div><TemperatureChart large/><div className="chart-legend"><span>30-second measurement cadence</span><span>{offline?`Offline · ${buffered} events buffered`:'Stream connected'}</span></div></section></div><div className="sim-bottom"><section className="panel scenario-details"><div className="panel-head"><div><div className="panel-title">Scenario briefing</div><div className="panel-sub">What changes in this simulation</div></div><Box size={17}/></div><h3>{options?.[1]}</h3><p>{options?.[2]}</p><div className="scenario-chips"><span><Database size={13}/>Seed 2048</span><span><Clock3 size={13}/>{useApp.getState().readings.length} readings</span><span><ShieldCheck size={13}/>Human approval required</span></div></section><section className="panel sim-recovery"><div className="panel-head"><div><div className="panel-title">Suggested actions</div><div className="panel-sub">Suggestions based on the current readings</div></div></div>{recommendations.map(([title,reason],i)=><div className="mini-rec" key={title}><span className="rank mini">0{i+1}</span><div><b>{title}</b><small>{reason}</small></div></div>)}<div className="mini-rec"><button className="button button-primary button-sm" onClick={()=>approve(recommendations[0][0])}><Check size={14}/>Approve selected action</button><small>Operator action is added to the event history.</small></div></section></div><section className="panel sim-event"><div className="panel-head"><div><div className="panel-title">Traceability event stream</div><div className="panel-sub">Events generated from the active simulation</div></div></div><EventList limit={6}/></section></div></Shell>}
function Landing(){const nav=useNavigate();return <div className="landing"><header className="landing-nav"><IconBrand/><div className="landing-nav-actions"><Link className="button button-outline landing-signin-btn" to="/login">Sign in</Link></div></header><RouteMap hero/><section className="manifesto" id="platform"><h2>Know where it is.<br/>Know <span>what to do next.</span></h2><p>When plans change, teams can see the route, check shipment conditions and choose a clear next step.</p><div className="manifesto-cards"><article><span>01 / TRACK</span><h3>Follow every shipment.</h3><p>See the route, temperature and sensor status in one place.</p></article><article><span>02 / CHECK</span><h3>Spot real problems.</h3><p>Tell the difference between a true temperature change, a sensor issue and missing data.</p></article><article><span>03 / RESPOND</span><h3>Choose the next step.</h3><p>Review clear recovery options while the operator stays in control.</p></article></div></section><section className="landing-cta" id="technology"><div><h2>See the issue.<br/><span>Choose the next move.</span></h2></div><div className="hero-actions"><button className="button button-outline" onClick={()=>nav('/engines')}>See how it works <ArrowRight size={15}/></button><button className="button button-primary" onClick={()=>nav('/simulator')}>Try a test scenario <ArrowRight size={15}/></button></div></section><footer className="landing-footer"><div className="footer-side footer-left"><IconBrand/><Link to="/terms" className="footer-policy-link">Terms of Service</Link></div><div className="footer-center"><span>© 2026 ChillPath · Shipment decisions with human oversight</span></div><div className="footer-side footer-right"><Link to="/privacy" className="footer-policy-link">Privacy Policy</Link></div></footer></div>}
function Technology(){return <Shell><div className="page-wrap"><Heading eyebrow="HOW CHILLPATH WORKS" title="Evidence before urgency" desc="A transparent operational workflow that connects shipment records, timestamped measurements and operator decisions."/><div className="manifesto-cards technology-cards"><article><span>01 / INGEST</span><Radio/><h3>Measurements keep their context.</h3><p>Temperature readings retain their measurement time and stable event identifier, including while the demo is offline.</p></article><article><span>02 / CLASSIFY</span><Gauge/><h3>Signal quality shapes the conclusion.</h3><p>Repeated readings can support an excursion classification; isolated spikes and long gaps remain uncertain.</p></article><article><span>03 / RESPOND</span><Compass/><h3>People authorize interventions.</h3><p>Recommendations explain their assumptions. A human operator records approval or rejection.</p></article></div><section className="panel" style={{padding:24,marginTop:24}}><div className="panel-title">Prototype boundaries</div><p className="panel-sub">The default fleet is synthetic demo data. Connected shipment records use the configured API. The current API uses organization IDs for scoping and does not provide production authentication or authorization.</p><Link className="button button-primary" to="/simulator">Run the guided demo <ArrowRight size={15}/></Link></section></div></Shell>}
function NotFound(){return <div className="not-found-page"><IconBrand/><main><p className="error-code">404</p><h1>We could not find that page.</h1><p>The address may be incorrect, or the page may have moved.</p><div><Link className="button button-primary" to="/">Return home</Link></div></main><footer><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link></footer></div>}
const pageTitles: Record<string,string> = {'/':'Route planning','/login':'Sign in','/signup':'Create account','/billing':'Access','/terms':'Terms of Service','/privacy':'Privacy Policy','/dashboard':'Overview','/live-sensor':'Live Sensor','/shipments':'Shipments','/engines':'Engines','/route-intelligence':'Route intelligence','/simulator':'Test scenarios','/technology':'System architecture'};
function PageMeta(){const {pathname}=useLocation();React.useEffect(()=>{const base=pathname.startsWith('/shipments/')?'Shipment details':pageTitles[pathname]??'Page not found';document.title=`${base} | ChillPath`;window.scrollTo({top:0,left:0,behavior:'auto'});},[pathname]);return null;}
function RequireSignIn(){
  const location=useLocation();
  return readSessionIdentity()
    ? <Outlet/>
    : <Navigate to="/login" replace state={{from:`${location.pathname}${location.search}${location.hash}`}}/>;
}
function App(){return <BrowserRouter><PageMeta/><Routes>
  <Route path="/" element={<Landing/>}/>
  <Route path="/login" element={<AccountPage mode="login"/>}/>
  <Route path="/signup" element={<AccountPage mode="register"/>}/>
  <Route path="/billing" element={<BillingPage/>}/>
  <Route path="/terms" element={<LegalPage type="terms"/>}/>
  <Route path="/privacy" element={<LegalPage type="privacy"/>}/>
  <Route element={<RequireSignIn/>}>
    <Route path="/dashboard" element={<Dashboard/>}/>
    <Route path="/live-sensor" element={<Shell><div className="page-wrap"><LiveDashboard/></div></Shell>}/>
    <Route path="/shipments" element={<Shipments/>}/>
    <Route path="/shipments/:id" element={<ShipmentDetailPage/>}/>
    <Route path="/engines" element={<Shell><EnginesDashboard/></Shell>}/>
    <Route path="/route-intelligence" element={<Shell><React.Suspense fallback={<div className="empty-state">Loading India map…</div>}><RouteIntelligence/></React.Suspense></Shell>}/>
    <Route path="/simulator" element={<Simulator/>}/>
    <Route path="/technology" element={<Technology/>}/>
  </Route>
  <Route path="*" element={<NotFound/>}/>
</Routes></BrowserRouter>}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
