import { useEffect } from 'react';
import { useLiveStore } from './store/liveStore';
import './live-dashboard.css';

/** Maps temperature to the theme's earthy palette */
function statusColor(tempC: number): string {
  if (tempC < 5) return '#68704d';   // green — safe/cold
  if (tempC < 20) return '#68704d';  // green — comfortable
  if (tempC < 35) return '#7a6c55';  // muted brown — warm
  return '#a65436';                  // red/orange — alarm
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return '--';
  }
}

export default function LiveDashboard() {
  const { response, history, error, startPolling, stopPolling, lastFetchedAt } = useLiveStore();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const data = response?.data ?? null;
  const online = response?.online ?? false;
  const lag = response?.seconds_since_last_packet;

  const sessionMax = history.length > 0
    ? Math.max(...history.map(d => d.temperature_c))
    : null;

  const alarm = data
    ? data.alarm_active || data.temperature_c > 50 || data.temperature_c < -10
    : false;

  return (
    <div className="live-dashboard">
      {/* Page Heading */}
      <div className="live-page-heading">
        <div className="eyebrow">LIVE TELEMETRY · ESP32-S3 SENSOR BRIDGE</div>
        <h1>Live sensor</h1>
        <p>Real-time temperature, humidity and sensor readings from your connected device.</p>
      </div>

      {/* Connection Status */}
      <div className={`live-status-bar ${online ? 'live-online' : data ? 'live-offline' : 'live-waiting'}`}>
        <span className="live-dot" />
        <span className="live-status-text">
          {error
            ? `Connection error: ${error}`
            : !data
              ? 'Waiting for sensor connection'
              : online
                ? `LIVE · ${lag?.toFixed(1)}s latency`
                : `OFFLINE · last packet ${lag?.toFixed(0)}s ago`}
        </span>
        {lastFetchedAt && (
          <span className="live-updated">Updated {lastFetchedAt.toLocaleTimeString()}</span>
        )}
      </div>

      {alarm && (
        <div className="live-alarm-banner">
          ⚠ TEMPERATURE ALARM — Sensor reading outside safe limits
        </div>
      )}

      {data ? (
        <>
          {/* Temperature Gauge */}
          <div className="live-gauge-section">
            <div className="live-gauge-card">
              <svg viewBox="0 0 200 200" className="live-gauge-svg">
                <circle cx="100" cy="100" r="90" fill="none" strokeWidth="10" />
                <circle
                  cx="100" cy="100" r="90"
                  fill="none"
                  stroke={statusColor(data.temperature_c)}
                  strokeWidth="10"
                  strokeDasharray={565}
                  strokeDashoffset={565 - Math.min(1, Math.max(0, (data.temperature_c + 10) / 60)) * 565}
                  strokeLinecap="butt"
                  transform="rotate(-90 100 100)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
                />
              </svg>
              <div className="live-gauge-value" style={{ color: statusColor(data.temperature_c) }}>
                {data.temperature_c.toFixed(1)}
                <span className="live-gauge-unit">°C</span>
              </div>
              <div className="live-gauge-secondary">
                {(data.temperature_f ?? (data.temperature_c * 9 / 5 + 32)).toFixed(1)} °F
              </div>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="live-kpi-grid">
            <div className="live-kpi">
              <span className="live-kpi-label">Humidity</span>
              <span className="live-kpi-value" style={{ color: '#7a6c55' }}>
                {data.humidity_pct != null ? `${data.humidity_pct.toFixed(1)}%` : '--%'}
              </span>
            </div>
            <div className="live-kpi">
              <span className="live-kpi-label">DHT temperature</span>
              <span className="live-kpi-value">
                {data.dht_temp_c != null ? `${data.dht_temp_c.toFixed(1)}°C` : '--°C'}
              </span>
            </div>
            <div className="live-kpi">
              <span className="live-kpi-label">DHT sensor</span>
              <span className="live-kpi-value" style={{ color: data.dht_valid ? '#68704d' : '#696960' }}>
                {data.dht_valid ? 'Online' : 'Connecting'}
              </span>
            </div>
            <div className="live-kpi">
              <span className="live-kpi-label">Range status</span>
              <span className={`live-kpi-value ${alarm ? 'live-alarm-text' : 'live-ok-text'}`}>
                {alarm ? 'Alarm' : 'Normal'}
              </span>
            </div>
            <div className="live-kpi">
              <span className="live-kpi-label">Digital output</span>
              <span className="live-kpi-value" style={{ color: data.do_tripped ? '#a65436' : '#68704d' }}>
                {data.do_tripped ? 'Tripped' : 'Normal'}
              </span>
            </div>
            <div className="live-kpi">
              <span className="live-kpi-label">Buzzer</span>
              <span className="live-kpi-value" style={{ color: data.buzzer_active ? '#a65436' : '#696960' }}>
                {data.buzzer_active ? 'Beeping' : 'Off'}
              </span>
            </div>
            <div className="live-kpi">
              <span className="live-kpi-label">Voltage</span>
              <span className="live-kpi-value">
                {data.voltage ? `${data.voltage.toFixed(3)}V` : data.adc_mv ? `${data.adc_mv}mV` : '--'}
              </span>
            </div>
            <div className="live-kpi">
              <span className="live-kpi-label">Session max</span>
              <span className="live-kpi-value">
                {sessionMax != null ? `${sessionMax.toFixed(1)}°C` : '--'}
              </span>
            </div>
          </div>

          {/* Device Info Bar */}
          <div className="live-device-info">
            <span>Device: <b>{data.device_id ?? 'esp32-s3-temp-01'}</b></span>
            <span>Packets: <b>{history.length}</b></span>
            <span>Source: <b>{data.source ?? 'unknown'}</b></span>
          </div>

          {/* Temperature Chart */}
          <div className="live-sparkline-section">
            <div className="live-sparkline-header">
              <span className="panel-title">Temperature history</span>
              <span className="live-sparkline-count">{history.length} readings</span>
            </div>
            <div className="live-sparkline-container">
              {history.length > 1 ? (
                <Sparkline data={history.slice(-60).map(d => d.temperature_c)} color={statusColor(data.temperature_c)} />
              ) : (
                <div className="live-sparkline-placeholder">Collecting data…</div>
              )}
            </div>
          </div>

          {/* Reading Log */}
          <div className="live-log-section">
            <div className="live-log-header">
              <span className="panel-title">Recent readings</span>
            </div>
            <div className="live-log-list">
              {history.slice(-20).reverse().map((entry, i) => (
                <div className={`live-log-row ${(entry.alarm_active || entry.temperature_c > 50 || entry.temperature_c < -10) ? 'live-log-alarm' : ''}`} key={i}>
                  <span className="live-log-time">{formatTime(entry.observed_at)}</span>
                  <span className="live-log-temp" style={{ color: statusColor(entry.temperature_c) }}>
                    {entry.temperature_c.toFixed(1)}°C
                  </span>
                  <span className="live-log-hum">
                    {entry.humidity_pct != null ? `${entry.humidity_pct.toFixed(1)}%` : '--%'}
                  </span>
                  <span className="live-log-status">
                    {entry.do_tripped ? 'DO tripped' : 'Normal'}
                  </span>
                </div>
              ))}
              {history.length === 0 && <div className="live-log-empty">No data yet.</div>}
            </div>
          </div>
        </>
      ) : (
        <div className="live-waiting-message">
          <div className="live-waiting-icon" aria-hidden="true"><span className="live-signal" /></div>
          <h3>Waiting for sensor data</h3>
          <p>Connect the ESP32-S3 bridge to display live temperature and humidity readings.</p>
          <div className="live-waiting-hint">Run <code>python pc_sensor_bridge.py</code> on the connected PC.</div>
        </div>
      )}
    </div>
  );
}

/** SVG sparkline using theme colors */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data) - 1;
  const max = Math.max(...data) + 1;
  const w = 600;
  const h = 80;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="live-sparkline-svg" preserveAspectRatio="none">
      {/* Safe zone band 2-8°C */}
      <rect
        x={0}
        y={h - ((8 - min) / (max - min)) * h}
        width={w}
        height={Math.abs(((8 - 2) / (max - min)) * h)}
        fill="rgba(104, 112, 77, 0.10)"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
