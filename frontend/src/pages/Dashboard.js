import React, { useCallback } from 'react';
import { api } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';

function StatCard({ label, value, delta, accent, danger }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: 'var(--accent)' } : danger ? { color: 'var(--danger)' } : {}}>
        {value ?? '—'}
      </div>
      {delta && <div className="stat-delta">{delta}</div>}
    </div>
  );
}

export default function Dashboard({ setPage }) {
  const fetchStats = useCallback(() => api.getStats(), []);
  const fetchMetrics = useCallback(() => api.getMetrics(), []);
  const fetchSessions = useCallback(() => api.getResearchSessions(), []);
  const fetchAgents = useCallback(() => api.getAgentStatus(), []);
  const fetchPipelines = useCallback(() => api.listPipelines(), []);

  const { data: stats } = usePolling(fetchStats, 3000);
  const { data: metrics } = usePolling(fetchMetrics, 5000);
  const { data: sessionsData } = usePolling(fetchSessions, 4000);
  const { data: agentsData } = usePolling(fetchAgents, 2000);
  const { data: pipelinesData } = usePolling(fetchPipelines, 4000);

  const sessions = sessionsData?.sessions || [];
  const pipelines = pipelinesData?.pipelines || [];
  const activeAgents = agentsData?.agents || [];

  const chartData = sessions
    .filter(s => s.iterations?.length > 0)
    .flatMap(s => (s.iterations || []).map(it => ({
      name: `I${it.iteration}`,
      ms: it.execution_time_ms,
      baseline: s.baseline_ms,
    }))).slice(-12);

  const statusBadge = (status) => {
    const map = { completed: 'badge-success', running: 'badge-warning', failed: 'badge-danger', cancelled: 'badge-neutral', in_progress: 'badge-info' };
    return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
  };

  return (
    <div className="page">
      <div className="mb-16">
        <div style={{ fontSize: 18, fontWeight: 600 }}>Dashboard</div>
        <div className="text-muted mt-4">Live overview — 7-stage autonomous SDLC pipeline</div>
      </div>

      {/* Top stats */}
      <div className="grid-4 mb-16">
        <StatCard label="Total Pipelines" value={stats?.pipelines?.total ?? 0} />
        <StatCard label="Completed" value={stats?.pipelines?.completed ?? 0} delta="Successful runs" />
        <StatCard label="Deployed" value={stats?.total_deployed ?? 0} delta="Active deployments" accent />
        <StatCard label="Vulns Fixed" value={stats?.total_vulnerabilities_fixed ?? 0} />
      </div>

      <div className="grid-4 mb-16">
        <StatCard label="Best Improvement" value={stats?.best_improvement_pct ? `${stats.best_improvement_pct}%` : '—'} delta="Auto-research gain" accent />
        <StatCard label="MRs Created" value={stats?.mrs_created ?? 0} />
        <StatCard label="RAG Documents" value={stats?.rag_documents ?? 0} />
        <StatCard label="Active Agents" value={stats?.active_agents ?? 0} delta={activeAgents.length > 0 ? activeAgents.map(a => a.agent).join(', ') : 'idle'} />
      </div>

      {/* System metrics + live agents */}
      <div className="grid-2 gap-16 mb-16">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>System Metrics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'CPU Usage', value: metrics?.system?.cpu_pct ?? 0, unit: '%' },
              { label: 'Memory Usage', value: metrics?.system?.memory_pct ?? 0, unit: '%' },
              { label: 'Pipeline Success Rate', value: metrics?.pipelines?.success_rate_pct ?? 0, unit: '%' },
            ].map(({ label, value, unit }) => (
              <div key={label}>
                <div className="flex justify-between mb-4" style={{ marginBottom: 4 }}>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span className="text-sm text-mono">{value}{unit}</span>
                </div>
                <div className="progress">
                  <div className="progress-bar success" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
            {metrics?.system?.memory_used_mb > 0 && (
              <div className="text-muted text-sm">Memory: {metrics.system.memory_used_mb}MB used</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Live Agent Activity</div>
          {activeAgents.length === 0 ? (
            <div className="text-muted" style={{ textAlign: 'center', padding: '16px 0', fontSize: 13 }}>
              All agents idle
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeAgents.map((a, i) => (
                <div key={i} className="stage-item">
                  <span className="status-dot running" />
                  <span className="stage-name">{a.agent}</span>
                  <span className="text-mono text-muted" style={{ fontSize: 11 }}>{a.pipeline_id}</span>
                  <span className="badge badge-warning">running</span>
                </div>
              ))}
            </div>
          )}
          <div className="divider" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="flex justify-between"><span className="text-muted">Avg improvement</span><span className="text-mono text-sm">{metrics?.research?.avg_improvement_pct ?? 0}%</span></div>
            <div className="flex justify-between"><span className="text-muted">Research sessions</span><span className="text-mono text-sm">{metrics?.research?.sessions ?? 0}</span></div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid-2 gap-16 mb-16">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Performance Improvement</div>
              <div className="card-subtitle">Real timeit benchmark (ms) across research iterations</div>
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                <Line type="monotone" dataKey="ms" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} name="Execution (ms)" />
                <Line type="monotone" dataKey="baseline" stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Baseline" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Run a pipeline to see real benchmark data
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Pipeline Status Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Completed', value: stats?.pipelines?.completed ?? 0, total: stats?.pipelines?.total ?? 1, color: 'success' },
              { label: 'Running', value: stats?.pipelines?.running ?? 0, total: stats?.pipelines?.total ?? 1, color: '' },
              { label: 'Failed', value: stats?.pipelines?.failed ?? 0, total: stats?.pipelines?.total ?? 1, color: '' },
            ].map(({ label, value, total, color }) => (
              <div key={label}>
                <div className="flex justify-between mb-4" style={{ marginBottom: 4 }}>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span className="text-sm text-mono">{value}</span>
                </div>
                <div className="progress">
                  <div className={`progress-bar ${color}`} style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent pipelines */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Pipelines</div>
          <button className="btn btn-primary btn-sm" onClick={() => setPage('new')}>New Pipeline</button>
        </div>
        {pipelines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No pipelines yet. Start the autonomous SDLC to see results here.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Feature Request</th><th>Status</th><th>Stages</th><th>Deployed</th><th>Created</th></tr>
            </thead>
            <tbody>
              {pipelines.slice(0, 8).map(p => {
                const stageVals = Object.values(p.stages || {});
                const done = stageVals.filter(v => v === 'completed').length;
                const deployed = p.artifacts?.deployment_agent?.status === 'deployed';
                return (
                  <tr key={p.id}>
                    <td><span className="text-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.id}</span></td>
                    <td style={{ maxWidth: 240 }}><span className="truncate" style={{ display: 'block' }}>{p.feature_request}</span></td>
                    <td>{statusBadge(p.status)}</td>
                    <td>
                      <div className="flex items-center gap-8">
                        <div className="progress" style={{ width: 80 }}>
                          <div className="progress-bar success" style={{ width: `${(done / 7) * 100}%` }} />
                        </div>
                        <span className="text-muted text-sm">{done}/7</span>
                      </div>
                    </td>
                    <td><span className={`badge ${deployed ? 'badge-success' : 'badge-neutral'}`}>{deployed ? 'Yes' : 'No'}</span></td>
                    <td className="text-muted text-sm">{new Date(p.created_at).toLocaleTimeString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
