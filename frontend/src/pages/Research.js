import React, { useCallback, useState } from 'react';
import { api } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Legend,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';

function SessionCard({ session, isSelected, onClick }) {
  const pct = session.baseline_ms && session.best_ms
    ? ((session.baseline_ms - session.best_ms) / session.baseline_ms * 100).toFixed(1)
    : null;
  return (
    <button className="btn btn-secondary" style={{
      flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 12px',
      background: isSelected ? 'var(--accent-light)' : 'var(--surface)',
      borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
    }} onClick={onClick}>
      <div className="text-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{session.id}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge ${session.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{session.status}</span>
        {pct && <span className="badge badge-info">{pct}% faster</span>}
      </div>
    </button>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}{p.name.includes('ms') ? '' : ''}</div>
      ))}
    </div>
  );
};

export default function Research() {
  const [selectedId, setSelectedId] = useState(null);

  const fetchSessions = useCallback(() => api.getResearchSessions(), []);
  const { data: sessionsData } = usePolling(fetchSessions, 3000);
  const sessions = sessionsData?.sessions || [];
  const activeId = selectedId || sessions[0]?.id;
  const activeSession = sessions.find(s => s.id === activeId);

  const iterations = activeSession?.iterations || [];
  const baseline = activeSession?.baseline_ms;
  const bestMs = activeSession?.best_ms;
  const bestIter = activeSession?.best_iteration;

  const chartData = iterations.map(it => ({
    name: `Iter ${it.iteration}`,
    iteration: it.iteration,
    'Time (ms)': it.execution_time_ms,
    'Memory (MB)': it.metrics?.memory_mb ?? 0,
    'Throughput': it.metrics?.throughput_rps ?? 0,
    accepted: it.accepted,
    strategy: it.optimization?.strategy || '',
  }));

  const improvementPct = baseline && bestMs
    ? ((baseline - bestMs) / baseline * 100).toFixed(1)
    : 0;

  return (
    <div className="page">
      <div className="mb-16">
        <div style={{ fontSize: 18, fontWeight: 600 }}>Auto-Research Agent</div>
        <div className="text-muted mt-4">
          Self-improving loop with real timeit benchmarks — each iteration tests a targeted optimization
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          No research sessions yet. Run a pipeline to trigger the auto-research loop.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Sessions</div>
            {sessions.map(s => (
              <SessionCard key={s.id} session={s} isSelected={s.id === activeId}
                           onClick={() => setSelectedId(s.id)} />
            ))}
          </div>

          {activeSession && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Summary stat strip */}
              <div className="grid-4">
                {[
                  { label: 'Baseline', value: `${baseline?.toFixed(1)}ms`, sub: 'Pre-optimization' },
                  { label: 'Best Result', value: `${bestMs?.toFixed(1)}ms`, sub: `Iteration ${bestIter}`, accent: true },
                  { label: 'Improvement', value: `${improvementPct}%`, sub: 'Faster', accent: true },
                  { label: 'Accepted', value: `${iterations.filter(i => i.accepted).length}/${iterations.length}`, sub: 'Optimizations kept' },
                ].map(({ label, value, sub, accent }) => (
                  <div key={label} className="stat-card">
                    <div className="stat-label">{label}</div>
                    <div className="stat-value" style={{ fontSize: 20, ...(accent ? { color: 'var(--accent)' } : {}) }}>{value ?? '—'}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Execution time chart */}
              {chartData.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Execution Time per Iteration (real timeit)</div>
                      <div className="card-subtitle">Baseline={baseline?.toFixed(1)}ms — lower is better</div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} unit="ms" />
                      <Tooltip content={<CustomTooltip />} />
                      {baseline && (
                        <ReferenceLine y={baseline} stroke="#ef4444" strokeDasharray="6 3"
                          label={{ value: `Baseline ${baseline.toFixed(1)}ms`, fill: '#ef4444', fontSize: 11, position: 'insideTopRight' }} />
                      )}
                      {bestMs && (
                        <ReferenceLine y={bestMs} stroke="#10b981" strokeDasharray="6 3"
                          label={{ value: `Best ${bestMs.toFixed(1)}ms`, fill: '#10b981', fontSize: 11, position: 'insideBottomRight' }} />
                      )}
                      <Line type="monotone" dataKey="Time (ms)" stroke="var(--accent)" strokeWidth={2.5}
                            dot={(props) => {
                              const iter = iterations.find(i => i.iteration === props.index + 1);
                              const accepted = iter?.accepted;
                              return <circle key={props.cx} cx={props.cx} cy={props.cy} r={accepted ? 6 : 4}
                                      fill={accepted ? '#10b981' : '#ef4444'} stroke="white" strokeWidth={2} />;
                            }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                      Accepted optimization
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                      Reverted (no improvement)
                    </div>
                  </div>
                </div>
              )}

              {/* Memory + throughput */}
              {chartData.length > 0 && chartData.some(d => d['Memory (MB)'] > 0) && (
                <div className="grid-2 gap-16">
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 10 }}>Memory Usage (MB)</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit="MB" />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="Memory (MB)" fill="var(--accent)" opacity={0.7} radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 10 }}>Throughput (rps)</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="Throughput" fill="#10b981" opacity={0.7} radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Detailed iteration table */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Iteration Log — Real Benchmark Results</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Iter</th>
                      <th>Time (ms)</th>
                      <th>vs Baseline</th>
                      <th>Memory (MB)</th>
                      <th>Throughput (rps)</th>
                      <th>Strategy</th>
                      <th>Reasoning</th>
                      <th>Risk</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iterations.map((it) => {
                      const vsBaseline = baseline ? ((baseline - it.execution_time_ms) / baseline * 100) : 0;
                      const isBest = it.iteration === bestIter;
                      return (
                        <tr key={it.iteration} style={isBest ? { background: 'var(--success-bg)' } : {}}>
                          <td className="text-mono">
                            {it.iteration}
                            {isBest && <span className="badge badge-success" style={{ marginLeft: 6, fontSize: 9 }}>Best</span>}
                          </td>
                          <td className="text-mono" style={{ fontWeight: isBest ? 700 : 400 }}>{it.execution_time_ms?.toFixed(2)}</td>
                          <td>
                            <span style={{ color: vsBaseline > 0 ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
                              {vsBaseline > 0 ? '+' : ''}{vsBaseline.toFixed(1)}%
                            </span>
                          </td>
                          <td className="text-mono">{it.metrics?.memory_mb?.toFixed(3) ?? '—'}</td>
                          <td className="text-mono">{it.metrics?.throughput_rps?.toFixed(1) ?? '—'}</td>
                          <td style={{ maxWidth: 180, fontSize: 11, color: 'var(--text-secondary)' }}>
                            {it.optimization?.strategy || '—'}
                          </td>
                          <td style={{ maxWidth: 200, fontSize: 11, color: 'var(--text-muted)' }}>
                            {(it.optimization?.reasoning || '—').slice(0, 80)}
                          </td>
                          <td>
                            <span className={`badge ${it.optimization?.risk_level === 'low' ? 'badge-success' : 'badge-warning'}`}>
                              {it.optimization?.risk_level || 'low'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${it.accepted ? 'badge-success' : 'badge-neutral'}`}>
                              {it.accepted ? 'Accepted' : 'Reverted'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Summary sentence — for demo storytelling */}
                {iterations.length > 0 && (
                  <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--info-bg)',
                                border: '1px solid var(--info-border)', borderRadius: 6, fontSize: 13 }}>
                    <strong>Result:</strong> The Auto-Research Agent ran {iterations.length} real benchmark iterations,
                    accepted {iterations.filter(i => i.accepted).length} optimization(s), and achieved a
                    <strong style={{ color: 'var(--accent)' }}> {improvementPct}% performance improvement</strong> over
                    the original code — from {baseline?.toFixed(1)}ms down to {bestMs?.toFixed(1)}ms execution time.
                    The best version was selected automatically.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
