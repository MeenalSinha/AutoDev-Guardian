import React, { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

const STAGE_LABELS = {
  feature_agent: 'Feature Builder',
  dependency_agent: 'Dependency Healer',
  security_agent: 'Security Triage',
  test_runner: 'Test Runner',
  gitlab_mr: 'GitLab Workflow',
  deployment_agent: 'Deployment',
  research_agent: 'Auto-Research',
};

function StageBadge({ status }) {
  const map = { completed: 'badge-success', running: 'badge-warning', failed: 'badge-danger', pending: 'badge-neutral', cancelled: 'badge-neutral' };
  const label = { completed: 'Done', running: 'Running', failed: 'Failed', pending: 'Pending', cancelled: 'Cancelled' };
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{label[status] || status}</span>;
}

// Simple syntax-coloured code display
function CodeBlock({ code, maxLines = 60 }) {
  if (!code) return <div className="text-muted text-sm">No code generated</div>;
  const lines = code.split('\n');
  const display = lines.slice(0, maxLines);
  const truncated = lines.length > maxLines;
  return (
    <div className="code-block" style={{ maxHeight: 400 }}>
      {display.join('\n')}
      {truncated && `\n... (${lines.length - maxLines} more lines)`}
    </div>
  );
}

// Diff viewer: shows before/after code side by side
function DiffViewer({ before, after, label }) {
  const [view, setView] = useState('after');
  if (!before && !after) return null;
  return (
    <div>
      <div className="flex gap-8 mb-8" style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 500, fontSize: 12 }}>{label}</span>
        <button className={`btn btn-sm ${view === 'before' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('before')}>Before</button>
        <button className={`btn btn-sm ${view === 'after' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('after')}>After</button>
      </div>
      <CodeBlock code={view === 'before' ? before : after} />
    </div>
  );
}

function PipelineDetail({ pipeline, onRefresh }) {
  const logsEndRef = useRef(null);
  const [activeTab, setActiveTab] = useState('stages');
  const [logs, setLogs] = useState([]);
  const [exporting, setExporting] = useState(false);
  const logCountRef = useRef(0);
  const isRunning = pipeline.status === 'running' || pipeline.status === 'in_progress' || pipeline.status === 'initializing';

  // Incremental log polling — only fetch new logs
  useEffect(() => {
    let interval;
    const fetchLogs = async () => {
      try {
        const data = await api.getPipelineLogs(pipeline.id, logCountRef.current);
        if (data.logs && data.logs.length > 0) {
          setLogs(prev => [...prev, ...data.logs]);
          logCountRef.current = data.total;
        }
        if (!isRunning) clearInterval(interval);
      } catch { /* ignore */ }
    };
    fetchLogs();
    if (isRunning) interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, [pipeline.id, isRunning]);

  // Auto-scroll logs
  useEffect(() => {
    if (activeTab === 'logs') logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, activeTab]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await api.exportPipeline(pipeline.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `autodev-${pipeline.id}.zip`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { alert('Export failed: ' + e.message); }
    finally { setExporting(false); }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this pipeline?')) return;
    try { await api.cancelPipeline(pipeline.id); onRefresh(); }
    catch (e) { alert('Cancel failed: ' + e.message); }
  };

  const artifacts = pipeline.artifacts || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-16" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{pipeline.feature_request}</div>
          <div className="text-muted" style={{ marginTop: 3 }}>
            Pipeline <span className="text-mono">{pipeline.id}</span> &middot; {new Date(pipeline.created_at).toLocaleString()}
          </div>
        </div>
        <div className="flex gap-8 items-center">
          <span className={`status-dot ${pipeline.status === 'completed' ? 'completed' : pipeline.status === 'failed' ? 'failed' : isRunning ? 'running' : 'pending'}`} />
          <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{pipeline.status}</span>
          {isRunning && (
            <button className="btn btn-danger btn-sm" onClick={handleCancel}>Cancel</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export ZIP'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onRefresh}>Refresh</button>
        </div>
      </div>

      <div className="tabs">
        {['stages', 'logs', 'artifacts', 'deployment'].map(t => (
          <button key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'deployment' && artifacts.deployment_agent?.status === 'deployed' && (
              <span className="badge badge-success" style={{ marginLeft: 6, fontSize: 10 }}>Live</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'stages' && (
        <div className="stage-list">
          {Object.entries(STAGE_LABELS).map(([key, label]) => {
            const status = pipeline.stages?.[key] || 'pending';
            return (
              <div key={key} className="stage-item">
                <span className={`status-dot ${status}`} />
                <span className="stage-name">{label}</span>
                <StageBadge status={status} />
              </div>
            );
          })}
          <div className="flex items-center gap-8 mt-8" style={{ marginTop: 10 }}>
            <div className="progress" style={{ flex: 1 }}>
              <div className="progress-bar success" style={{
                width: `${(Object.values(pipeline.stages || {}).filter(v => v === 'completed').length / 7) * 100}%`
              }} />
            </div>
            <span className="text-muted text-sm">
              {Object.values(pipeline.stages || {}).filter(v => v === 'completed').length}/7 stages complete
            </span>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="log-box">
          {logs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>Waiting for logs...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="log-line">
                <span className="log-time">{(log.timestamp || '').slice(11, 23)}</span>
                <span className="log-agent">[{log.agent}]</span>
                <span className={`log-msg ${log.level || ''}`}>{log.message}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      )}

      {activeTab === 'artifacts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Feature agent */}
          {artifacts.feature_agent && (
            <div className="card" style={{ padding: 14 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Feature Builder Output</div>
              <div className="flex gap-8 mb-8" style={{ marginBottom: 10 }}>
                <span className="badge badge-info">{artifacts.feature_agent.lines_generated} lines generated</span>
              </div>
              <CodeBlock code={artifacts.feature_agent.generated_code} />
            </div>
          )}
          {/* Security */}
          {artifacts.security_agent && (
            <div className="card" style={{ padding: 14 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Security Triage (Real bandit SAST)</div>
              <div className="flex gap-8 mb-8" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="badge badge-info">Tool: {artifacts.security_agent.sast_tool || 'bandit'}</span>
                <span className={`badge ${artifacts.security_agent.critical_count > 0 ? 'badge-danger' : 'badge-success'}`}>
                  {artifacts.security_agent.vulnerabilities_found} findings
                </span>
                <span className="badge badge-warning">{artifacts.security_agent.critical_count || 0} HIGH/CRITICAL</span>
              </div>
              {(artifacts.security_agent.sast_findings || []).length > 0 && (
                <table className="table" style={{ marginBottom: 10 }}>
                  <thead><tr><th>Issue</th><th>Severity</th><th>OWASP</th><th>Line</th></tr></thead>
                  <tbody>
                    {(artifacts.security_agent.sast_findings || []).map((f, i) => (
                      <tr key={i}>
                        <td>{f.name}</td>
                        <td><span className={`badge ${f.severity === 'HIGH' || f.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}`}>{f.severity}</span></td>
                        <td className="text-mono text-muted">{f.owasp_ref}</td>
                        <td className="text-mono text-muted">{f.line}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {/* Dependency */}
          {artifacts.dependency_agent && (
            <div className="card" style={{ padding: 14 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Dependency Healer (Real PyPI API)</div>
              <div className="flex gap-8 mb-8" style={{ marginBottom: 10 }}>
                <span className="badge badge-info">{artifacts.dependency_agent.packages_scanned} packages scanned</span>
                <span className={`badge ${artifacts.dependency_agent.cve_count > 0 ? 'badge-danger' : 'badge-success'}`}>
                  {artifacts.dependency_agent.cve_count} CVEs
                </span>
                {artifacts.dependency_agent.real_pypi && <span className="badge badge-success">Live PyPI data</span>}
              </div>
              {(artifacts.dependency_agent.vulnerabilities || []).filter(v => v.action !== 'ok').length > 0 && (
                <table className="table">
                  <thead><tr><th>Package</th><th>Current</th><th>Latest (PyPI)</th><th>CVEs</th><th>Action</th></tr></thead>
                  <tbody>
                    {(artifacts.dependency_agent.vulnerabilities || []).filter(v => v.action !== 'ok').map((v, i) => (
                      <tr key={i}>
                        <td className="text-mono">{v.package}</td>
                        <td className="text-mono text-muted">{v.current_version}</td>
                        <td className="text-mono" style={{ color: 'var(--success)' }}>{v.latest_version}</td>
                        <td>{v.cves.length > 0 ? <span className="badge badge-danger">{v.cves.length}</span> : '—'}</td>
                        <td><span className={`badge ${v.action === 'upgrade' ? 'badge-warning' : 'badge-neutral'}`}>{v.action}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {/* Test runner */}
          {artifacts.test_runner && (
            <div className="card" style={{ padding: 14 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Test Runner (Real pytest)</div>
              <div className="flex gap-8 mb-8" style={{ marginBottom: 10 }}>
                <span className="badge badge-success">{artifacts.test_runner.passed}/{artifacts.test_runner.total} passed</span>
                {artifacts.test_runner.coverage_pct && <span className="badge badge-info">Coverage ~{artifacts.test_runner.coverage_pct}%</span>}
                <span className="badge badge-neutral">{artifacts.test_runner.duration_s}s</span>
                {artifacts.test_runner.real_execution && <span className="badge badge-success">Real pytest</span>}
              </div>
              <div className="progress"><div className="progress-bar success" style={{ width: `${(artifacts.test_runner.passed / Math.max(artifacts.test_runner.total, 1)) * 100}%` }} /></div>
            </div>
          )}
          {/* Research */}
          {artifacts.research_agent && (
            <div className="card" style={{ padding: 14 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Auto-Research (Real timeit benchmarks)</div>
              <div className="flex gap-8 mb-8" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="badge badge-success">{artifacts.research_agent.total_improvement_pct}% improvement</span>
                <span className="badge badge-info">Best: Iteration {artifacts.research_agent.best_iteration}</span>
                {artifacts.research_agent.real_benchmarks && <span className="badge badge-success">Real timeit</span>}
              </div>
              <table className="table">
                <thead><tr><th>Iter</th><th>Time (ms)</th><th>Memory (MB)</th><th>Strategy</th><th>Accepted</th></tr></thead>
                <tbody>
                  {(artifacts.research_agent.iterations || []).map((it, i) => (
                    <tr key={i} style={it.iteration === artifacts.research_agent.best_iteration ? { background: 'var(--success-bg)' } : {}}>
                      <td className="text-mono">{it.iteration}{it.iteration === artifacts.research_agent.best_iteration ? ' *' : ''}</td>
                      <td className="text-mono">{it.execution_time_ms}</td>
                      <td className="text-mono">{it.metrics?.memory_mb ?? '—'}</td>
                      <td className="text-muted" style={{ maxWidth: 200 }}>{it.optimization?.strategy || '—'}</td>
                      <td><span className={`badge ${it.accepted ? 'badge-success' : 'badge-neutral'}`}>{it.accepted ? 'Yes' : 'No'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {Object.keys(artifacts).length === 0 && (
            <div className="text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>Pipeline still running...</div>
          )}
        </div>
      )}

      {activeTab === 'deployment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {artifacts.deployment_agent ? (
            <>
              <div className="card" style={{ padding: 14 }}>
                <div className="card-title" style={{ marginBottom: 12 }}>Deployment Status</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="flex justify-between"><span className="text-muted">Status</span><span className={`badge ${artifacts.deployment_agent.status === 'deployed' ? 'badge-success' : 'badge-warning'}`}>{artifacts.deployment_agent.status}</span></div>
                  <div className="flex justify-between"><span className="text-muted">URL</span><span className="text-mono" style={{ fontSize: 12 }}>{artifacts.deployment_agent.deployment_url}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Image</span><span className="text-mono" style={{ fontSize: 12 }}>{artifacts.deployment_agent.image_tag}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Image Size</span><span className="text-mono">{artifacts.deployment_agent.image_size_mb}MB</span></div>
                  <div className="flex justify-between"><span className="text-muted">Build Time</span><span className="text-mono">{artifacts.deployment_agent.build_duration_s}s</span></div>
                  <div className="flex justify-between"><span className="text-muted">Rollback</span><span className={`badge ${artifacts.deployment_agent.rollback_available ? 'badge-success' : 'badge-neutral'}`}>{artifacts.deployment_agent.rollback_available ? 'Available' : 'N/A'}</span></div>
                </div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div className="card-title" style={{ marginBottom: 10 }}>Health Checks</div>
                <table className="table">
                  <thead><tr><th>Endpoint</th><th>Status</th><th>Healthy</th></tr></thead>
                  <tbody>
                    {(artifacts.deployment_agent.health_checks || []).map((h, i) => (
                      <tr key={i}>
                        <td className="text-mono">{h.endpoint}</td>
                        <td className="text-mono">{h.status}</td>
                        <td><span className={`badge ${h.healthy ? 'badge-success' : 'badge-danger'}`}>{h.healthy ? 'OK' : 'FAIL'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {artifacts.deployment_agent.dockerfile && (
                <div className="card" style={{ padding: 14 }}>
                  <div className="card-title" style={{ marginBottom: 10 }}>Generated Dockerfile</div>
                  <CodeBlock code={artifacts.deployment_agent.dockerfile} />
                </div>
              )}
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              Deployment stage not yet complete
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Pipelines({ activePipelineId, setActivePipelineId, setPage }) {
  const fetchList = useCallback(() => api.listPipelines(), []);
  const { data: listData, refetch: refetchList } = usePolling(fetchList, 3000);
  const pipelines = listData?.pipelines || [];
  const selectedId = activePipelineId || pipelines[0]?.id;

  const fetchPipeline = useCallback(
    () => selectedId ? api.getPipeline(selectedId) : Promise.resolve(null),
    [selectedId]
  );
  const isRunning = pipelines.find(p => p.id === selectedId)?.status === 'running';
  const { data: pipelineDetail, refetch: refetchDetail } = usePolling(
    fetchPipeline, isRunning ? 2000 : 10000, !!selectedId
  );

  const handleRefresh = () => { refetchDetail(); refetchList(); };

  return (
    <div className="page" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Pipelines</div>
          <button className="btn btn-primary btn-sm" onClick={() => setPage('new')}>New</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pipelines.length === 0 && <div className="text-muted text-sm">No pipelines yet.</div>}
          {pipelines.map(p => (
            <button key={p.id}
              className="btn btn-secondary"
              style={{
                textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 12px',
                background: selectedId === p.id ? 'var(--accent-light)' : 'var(--surface)',
                borderColor: selectedId === p.id ? 'var(--accent)' : 'var(--border)',
              }}
              onClick={() => setActivePipelineId(p.id)}
            >
              <div className="flex items-center gap-8" style={{ width: '100%' }}>
                <span className={`status-dot ${p.status === 'completed' ? 'completed' : p.status === 'failed' ? 'failed' : 'running'}`} />
                <span className="text-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.id}</span>
              </div>
              <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                {p.feature_request}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div>
        {pipelineDetail ? (
          <div className="card">
            <PipelineDetail pipeline={pipelineDetail} onRefresh={handleRefresh} />
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            Select a pipeline or create a new one
          </div>
        )}
      </div>
    </div>
  );
}
