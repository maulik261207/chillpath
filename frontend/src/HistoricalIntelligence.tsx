import { useEffect, useMemo, useState } from 'react';
import { Database, Download, Pause, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import { controlHistoricalReplay, createHistoricalReplay, getHistoricalActions, getHistoricalDatasets, getHistoricalSeries, getHistoricalSummary, type HistoricalDataset, type HistoricalPoint, type HistoricalReplay, type HistoricalSensorSummary } from './api';
import { readSessionIdentity } from './authSession';

const configuredOrganization = (import.meta.env.VITE_ORGANIZATION_ID as string | undefined) ?? '';

function MiniChart({ points, field, color }: { points: HistoricalPoint[]; field: 'temperature_c' | 'humidity_pct'; color: string }) {
  const values = points.map(point => point[field]).filter((value): value is number => value != null);
  if (values.length < 2) return <div className="historical-chart-empty">No valid readings for this signal.</div>;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const line = values.map((value, index) => `${(index / (values.length - 1)) * 100},${96 - ((value - min) / range) * 82}`).join(' ');
  return <div className="historical-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${field} history`}><path d="M 0 96 H 100" stroke="currentColor" opacity=".16" vectorEffect="non-scaling-stroke"/><polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><div className="historical-chart-scale"><span>{max.toFixed(1)}</span><span>{min.toFixed(1)}</span></div></div>;
}

export default function HistoricalIntelligence() {
  const identity = readSessionIdentity();
  const organization = identity?.organizationId || configuredOrganization;
  const [datasets, setDatasets] = useState<HistoricalDataset[]>([]);
  const [datasetId, setDatasetId] = useState('');
  const [summary, setSummary] = useState<HistoricalSensorSummary[]>([]);
  const [points, setPoints] = useState<HistoricalPoint[]>([]);
  const [actions, setActions] = useState<Array<{ action: string; start: string; end: string }>>([]);
  const [selectedSensors, setSelectedSensors] = useState<string[]>([]);
  const [replay, setReplay] = useState(false);
  const [replaySession, setReplaySession] = useState<HistoricalReplay | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organization) return;
    setLoading(true); setError('');
    getHistoricalDatasets(organization).then(result => {
      setDatasets(result.items);
      if (result.items[0]) setDatasetId(result.items[0].id);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Historical datasets are unavailable.')).finally(() => setLoading(false));
  }, [organization]);

  useEffect(() => {
    if (!organization || !datasetId) return;
    const sensors = selectedSensors.length ? selectedSensors : (datasets.find(item => item.id === datasetId)?.sensors.map(sensor => sensor.sensor_id) ?? []);
    if (!sensors.length) return;
    setLoading(true); setError('');
    Promise.all([getHistoricalSummary(datasetId, organization), getHistoricalSeries(datasetId, organization, sensors), getHistoricalActions(datasetId, organization)])
      .then(([summaryResult, seriesResult, actionResult]) => { setSummary(summaryResult.sensors); setPoints(seriesResult.points); setActions(actionResult.items); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Historical data could not be loaded.'))
      .finally(() => setLoading(false));
  }, [organization, datasetId, selectedSensors, datasets]);

  const selectedDataset = datasets.find(item => item.id === datasetId);
  const displayed = useMemo(() => points.filter(point => !selectedSensors.length || selectedSensors.includes(point.sensor_id)), [points, selectedSensors]);
  const currentSensor = selectedSensors[0] ?? summary[0]?.sensor_id;
  const sensorSummary = summary.find(item => item.sensor_id === currentSensor) ?? summary[0];
  const temperaturePoints = displayed.filter(point => point.sensor_id === currentSensor);
  const humidityPoints = temperaturePoints;
  const runReplay = async () => {
    try {
      const session = replaySession ?? await createHistoricalReplay(datasetId, organization, selectedSensors);
      const next = await controlHistoricalReplay(session.id, organization, replay ? 'pause' : (session.status === 'PAUSED' ? 'resume' : 'start'));
      setReplaySession(next); setReplay(next.status === 'RUNNING');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Replay could not be started.'); }
  };
  const resetReplay = async () => {
    if (!replaySession) { setReplay(false); return; }
    try { setReplaySession(await controlHistoricalReplay(replaySession.id, organization, 'restart')); setReplay(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Replay could not be reset.'); }
  };

  if (!organization) return <div className="historical-empty panel"><Database size={22}/><h2>Historical Intelligence needs an organization</h2><p>Sign in with an account connected to the API, or set <code>VITE_ORGANIZATION_ID</code> for the local research workspace.</p></div>;
  return <div className="historical-page">
    <div className="page-heading"><div><div className="eyebrow">HISTORICAL RESEARCH</div><h1>Historical Intelligence</h1><p>Explore preserved sensor evidence without mixing it with live hardware telemetry.</p></div><span className="historical-source"><i/>HISTORICAL_RESEARCH</span></div>
    {error && <div className="notice notice-info" role="alert">{error}</div>}
    <section className="historical-toolbar panel"><label>Dataset<select value={datasetId} onChange={event => { setDatasetId(event.target.value); setSelectedSensors([]); }}><option value="">Choose a dataset</option>{datasets.map(dataset => <option value={dataset.id} key={dataset.id}>{dataset.name}</option>)}</select></label><div className="historical-toolbar-meta">{selectedDataset ? `${selectedDataset.sensors.length} sensors · ${selectedDataset.provenance}` : loading ? 'Loading datasets…' : 'No dataset imported'}</div></section>
    {selectedDataset && <>
      <section className="historical-layout">
        <aside className="panel historical-sensors"><div className="panel-title">Sensors</div><p className="panel-sub">Compare preserved readings</p>{selectedDataset.sensors.map(sensor => <label className="historical-sensor-option" key={sensor.sensor_id}><input type="checkbox" checked={selectedSensors.includes(sensor.sensor_id)} onChange={event => setSelectedSensors(current => event.target.checked ? [...current, sensor.sensor_id] : current.filter(id => id !== sensor.sensor_id))}/><span>{sensor.sensor_id}</span><small>{sensor.rows.toLocaleString()} rows</small></label>)}<div className="historical-replay"><div className="panel-title">Replay</div><p>Historical playback remains separate from LIVE SENSOR mode.</p><button className="button button-outline" onClick={runReplay}>{replay ? <Pause size={14}/> : <Play size={14}/>} {replay ? 'Pause replay' : 'Start replay'}</button><button className="button button-outline" onClick={resetReplay}><RotateCcw size={14}/> Reset</button>{replaySession && <small className="historical-replay-progress">{replaySession.status} · {replaySession.progress_pct.toFixed(1)}%</small>}</div></aside>
        <section className="panel historical-analysis"><div className="panel-head"><div><div className="panel-title">Sensor analytics</div><div className="panel-sub">Server-sampled series · missing values preserved</div></div><span className="historical-status"><ShieldCheck size={14}/>Retrospective analysis</span></div>{sensorSummary ? <div className="historical-stats"><div><span>Completeness</span><b>{sensorSummary.completeness_pct.toFixed(1)}%</b></div><div><span>Temperature avg</span><b>{sensorSummary.temperature_avg_c?.toFixed(1) ?? '—'}°C</b></div><div><span>Humidity avg</span><b>{sensorSummary.humidity_avg_pct?.toFixed(1) ?? '—'}%</b></div><div><span>Missing readings</span><b>{sensorSummary.temperature_missing.toLocaleString()}</b></div></div> : <div className="historical-chart-empty">Select a sensor to inspect its reliability.</div>}<div className="historical-chart-block"><div className="historical-chart-heading"><b>Temperature</b><span>°C</span></div><MiniChart points={temperaturePoints} field="temperature_c" color="#6bd8e7"/></div><div className="historical-chart-block"><div className="historical-chart-heading"><b>Humidity</b><span>%</span></div><MiniChart points={humidityPoints} field="humidity_pct" color="#b59af6"/></div></section>
      </section>
      <section className="panel historical-actions"><div className="panel-head"><div><div className="panel-title">Experiment actions</div><div className="panel-sub">Original timestamps · no causal inference implied</div></div><Download size={16}/></div>{actions.length ? <div className="historical-action-list">{actions.slice(0, 12).map(action => <div key={`${action.start}-${action.action}`}><time>{new Date(action.start).toLocaleString()}</time><b>{action.action}</b></div>)}</div> : <p className="historical-muted">No experiment_actions.csv was supplied with the nine sensor files.</p>}</section>
    </>}
  </div>;
}
