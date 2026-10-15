import { Area, AreaChart, CartesianGrid, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Reading } from './simulation/domain';

export default function TelemetryChart({scenario,readings,minimumC=2,maximumC=8,large=false}:{scenario:string;readings?:Reading[];minimumC?:number;maximumC?:number;large?:boolean}){
  const data = readings?.length
    ? readings.slice(-36).map(item => {
        let label = '';
        try {
          const d = new Date(item.observedAt);
          label = isNaN(d.getTime()) ? item.observedAt.slice(11, 19) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
          label = item.observedAt?.slice(11, 19) || '';
        }
        return {
          t: label,
          temp: Number(item.temperatureC),
          humidity: item.humidityPct != null ? Number(item.humidityPct) : undefined,
          credible: item.credible,
        };
      })
    : Array.from({ length: 18 }, (_, i) => {
        const base = scenario === 'refrigeration_failure' ? 4.2 + i * 0.55 : scenario === 'sensor_fault' && i === 13 ? 12.4 : 4.2 + Math.sin(i * 0.7) * 0.22;
        return { t: `14:${String(i * 3).padStart(2, '0')}`, temp: base, humidity: 61 + Math.sin(i * 0.45) * 2, credible: true };
      });

  const allTemps = data.map(d => d.temp).filter(t => typeof t === 'number' && !isNaN(t));
  const minTemp = allTemps.length ? Math.min(...allTemps) : 0;
  const maxTemp = allTemps.length ? Math.max(...allTemps) : 10;
  const yMin = Math.max(0, Math.floor((minTemp - 2) / 5) * 5);
  const yMax = Math.max(14, Math.ceil((maxTemp + 3) / 5) * 5);

  return (
    <div className={`chart ${large ? 'chart-large' : ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 20, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#c1bbad" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: '#6b6b62', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.max(1, Math.floor(data.length / 6))} />
          <YAxis yAxisId="temperature" domain={[yMin, yMax]} tick={{ fill: '#6b6b62', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="humidity" orientation="right" domain={[0, 100]} hide />
          <Tooltip
            contentStyle={{ background: '#f8f5ed', border: '1px solid #9f998a', borderRadius: 0, color: '#282820', fontSize: 12 }}
            formatter={(value: any, name: any) => [`${Number(value).toFixed(1)} ${name === 'humidity' ? '%' : '°C'}`, name === 'humidity' ? 'Humidity' : 'Temperature']}
          />
          <ReferenceArea yAxisId="temperature" y1={minimumC} y2={maximumC} fill="#68704d" fillOpacity={0.08} />
          <Area
            yAxisId="temperature"
            type="monotone"
            dataKey="temp"
            name="temperature"
            stroke={maxTemp > 30 || scenario === 'refrigeration_failure' ? '#a65436' : '#68704d'}
            strokeWidth={2}
            fill="none"
            activeDot={{ r: 4, fill: '#f1eee5', stroke: '#68704d' }}
            connectNulls={false}
          />
          <Line yAxisId="humidity" type="monotone" dataKey="humidity" name="humidity" stroke="#a67742" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

