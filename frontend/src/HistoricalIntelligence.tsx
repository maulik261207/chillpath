import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, ShieldCheck } from './uiMarks';
import { getHistoricalActions, getHistoricalDatasets, getHistoricalSeries, getHistoricalSummary, getLocalHistoricalWorkspace, type HistoricalDataset, type HistoricalPoint, type HistoricalSensorSummary } from './api';
import { readSessionIdentity, signOut } from './authSession';

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
  const [organization, setOrganization] = useState(identity?.organizationId || configuredOrganization);
  const [workspaceName, setWorkspaceName] = useState(identity?.organizationName ?? 'Local research workspace');
  const [datasets, setDatasets] = useState<HistoricalDataset[]>([]);
  const [datasetId, setDatasetId] = useState('');
  const [summary, setSummary] = useState<HistoricalSensorSummary[]>([]);
  const [points, setPoints] = useState<HistoricalPoint[]>([]);
  const [actions, setActions] = useState<Array<{ action: string; start: string; end: string }>>([]);
  const [selectedSensor, setSelectedSensor] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (organization) return;
    setLoading(true);
    getLocalHistoricalWorkspace()
      .then(workspace => { setOrganization(workspace.organization_id); setWorkspaceName(workspace.organization_name); })
      .catch(() => setError('No local historical workspace was found. Import the dataset first, then restart the backend.'))
      .finally(() => setLoading(false));
  }, [organization]);

  useEffect(() => {
    if (!organization) return;
    setLoading(true); setError('');
    getHistoricalDatasets(organization).then(result => {
      setDatasets(result.items);
      if (result.items[0]) {
        setDatasetId(result.items[0].id);
        setSelectedSensor(result.items[0].sensors[0]?.sensor_id ?? '');
      }
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Historical datasets are unavailable.')).finally(() => setLoading(false));
  }, [organization]);

  useEffect(() => {
    if (!organization || !datasetId) return;
    if (!selectedSensor) return;
    setLoading(true); setError('');
    Promise.all([getHistoricalSummary(datasetId, organization), getHistoricalSeries(datasetId, organization, [selectedSensor]), getHistoricalActions(datasetId, organization)])
      .then(([summaryResult, seriesResult, actionsResult]) => { setSummary(summaryResult.sensors); setPoints(seriesResult.points); setActions(actionsResult.items); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Historical data could not be loaded.'))
      .finally(() => setLoading(false));
  }, [organization, datasetId, selectedSensor]);

  const selectedDataset = datasets.find(item => item.id === datasetId);
  const sensorSummary = summary.find(item => item.sensor_id === selectedSensor);
  const temperaturePoints = points.filter(point => point.sensor_id === selectedSensor);
  const humidityPoints = temperaturePoints;
  if (!organization) return <div className="historical-empty panel">
    <Database size={22}/>
    <h2>{identity?.kind === 'demo' ? 'Connect a workspace to view historical data' : 'This account has no connected workspace'}</h2>
    <p>{identity?.kind === 'demo'
      ? 'Demo sign-in is not connected to an API organization. Create a workspace account or sign in with one to load its historical datasets.'
      : 'Sign in again with an account linked to an API organization, or configure VITE_ORGANIZATION_ID for a local research workspace.'}</p>
    <div className="historical-empty-actions">
      <Link className="button button-primary" to="/signup" state={{ from: '/historical' }}>Create workspace account</Link>
      <Link className="button button-outline" to="/login" state={{ from: '/historical' }} onClick={signOut}>
        {identity?.kind === 'demo' ? 'Sign in with existing account' : 'Sign in again'}
      </Link>
    </div>
  </div>;
  return <div className="historical-page">
    <div className="page-heading"><div><div className="eyebrow">HISTORICAL RESEARCH</div><h1>Historical Intelligence</h1><p>Explore preserved sensor evidence from {workspaceName} without mixing it with live hardware telemetry.</p></div><span className="historical-source"><i/>HISTORICAL_RESEARCH</span></div>
    {error && <div className="notice notice-info" role="alert">{error}</div>}
    {!selectedDataset && (loading
      ? <p className="historical-muted">Loading sensor data…</p>
      : <section className="historical-empty panel">
        <Database size={22}/>
        <h2>No historical dataset in this workspace yet</h2>
        <p>Import the SENSOR01–SENSOR09 CSV files into this organization to view historical sensor analytics.</p>
        <code>python scripts/import_historical_dataset.py --archive datasets --organization-slug &lt;your-organization-slug&gt;</code>
      </section>)}
    {selectedDataset && <>
      <section className="historical-layout">
        <aside className="panel historical-sensors"><div className="panel-title">Sensors</div><p className="panel-sub">Select a sensor to inspect its readings</p>{datasets.length > 1 && <label className="historical-dataset-picker">Dataset<select value={datasetId} onChange={event => { const next = datasets.find(dataset => dataset.id === event.target.value); setDatasetId(event.target.value); setSelectedSensor(next?.sensors[0]?.sensor_id ?? ''); setSummary([]); setPoints([]); }}>{datasets.map(dataset => <option value={dataset.id} key={dataset.id}>{dataset.name}</option>)}</select></label>}{selectedDataset.sensors.map(sensor => <label className="historical-sensor-option" key={sensor.sensor_id}><input type="radio" name="historical-sensor" checked={selectedSensor === sensor.sensor_id} onChange={() => { setSelectedSensor(sensor.sensor_id); setPoints([]); }}/><span>{sensor.sensor_id}</span><small>{sensor.rows.toLocaleString()} rows</small></label>)}</aside>
        <section className="panel historical-analysis"><div className="panel-head"><div><div className="panel-title">Sensor analytics</div><div className="panel-sub">Server-sampled series · missing values preserved</div></div><span className="historical-status"><ShieldCheck size={14}/>Retrospective analysis</span></div>{sensorSummary ? <div className="historical-stats"><div><span>Completeness</span><b>{sensorSummary.completeness_pct.toFixed(1)}%</b></div><div><span>Temperature avg</span><b>{sensorSummary.temperature_avg_c?.toFixed(1) ?? '—'}°C</b></div><div><span>Humidity avg</span><b>{sensorSummary.humidity_avg_pct?.toFixed(1) ?? '—'}%</b></div><div><span>Missing readings</span><b>{sensorSummary.temperature_missing.toLocaleString()}</b></div></div> : <div className="historical-chart-empty">Select a sensor to inspect its reliability.</div>}<div className="historical-chart-block"><div className="historical-chart-heading"><b>Temperature</b><span>°C</span></div><MiniChart points={temperaturePoints} field="temperature_c" color="#6bd8e7"/></div><div className="historical-chart-block"><div className="historical-chart-heading"><b>Humidity</b><span>%</span></div><MiniChart points={humidityPoints} field="humidity_pct" color="#b59af6"/></div></section>
      </section>
      <section className="panel historical-actions"><div className="panel-head"><div><div className="panel-title">Experiment actions</div><div className="panel-sub">Recorded action markers aligned to original timestamps</div></div><span className="historical-muted">{actions.length.toLocaleString()} actions</span></div><div className="historical-action-list">{actions.slice(0, 127).map((action, index) => <div key={`${action.start}-${action.action}-${index}`}><time>{new Date(action.start).toLocaleString()}</time><span>{action.action}</span></div>)}{!loading && actions.length === 0 && <div><span>No experiment actions were recorded for this dataset.</span></div>}</div></section>
    </>}
  </div>;
}
