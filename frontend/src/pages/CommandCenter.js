/**
 * Command Center — The primary demo page.
 *
 * Layout:
 *   - Hero branding strip (positioning statement)
 *   - Live metric counters (always updating)
 *   - Pipeline flow diagram (7 nodes, animated active stage)
 *   - Split pane: active agents LEFT | live decision feed RIGHT
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

// ─── Flow diagram nodes ───────────────────────────────────────────────────────
const FLOW_NODES = [
  { key: 'feature_agent',    short: 'Code Gen',   icon: '{}', label: 'Feature Builder' },
  { key: 'dependency_agent', short: 'Deps',       icon: '↑',  label: 'Dependency Healer' },
  { key: 'security_agent',   short: 'Security',   icon: '⬡',  label: 'Security Triage' },
  { key: 'test_runner',      short: 'Tests',      icon: '✓',  label: 'Test Runner' },
  { key: 'gitlab_mr',        short: 'GitLab',     icon: '⬔',  label: 'GitLab MR' },
  { key: 'deployment_agent', short: 'Deploy',     icon: '▲',  label: 'Deployment' },
  { key: 'research_agent',   short: 'Research',   icon: '∿',  label: 'Auto-Research' },
];

const STATUS_STYLE = {
  completed: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', glow: 'rgba(16,185,129,0.25)' },
  running:   { bg: '#fffbeb', border: '#f59e0b', text: '#78350f', glow: 'rgba(245,158,11,0.35)' },
  failed:    { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', glow: 'rgba(239,68,68,0.2)' },
  pending:   { bg: '#f9fafb', border: '#e5e7eb', text: '#9ca3af', glow: 'transparent' },
};

function FlowNode({ node, status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  const isRunning = status === 'running';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 70 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: s.bg, border: `2px solid ${s.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color: s.text,
        boxShadow: isRunning ? `0 0 0 6px ${s.glow}, 0 0 18px ${s.glow}` : '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'all 0.4s ease',
        position: 'relative',
      }}>
        {node.icon}
        {isRunning && (
          <div style={{
            position: 'absolute', top: -3, right: -3, width: 11, height: 11,
            borderRadius: '50%', background: '#f59e0b', border: '2px solid white',
            animation: 'blink 1s infinite',
          }} />
        )}
        {status === 'completed' && (
          <div style={{
            position: 'absolute', top: -3, right: -3, width: 14, height: 14,
            borderRadius: '50%', background: '#10b981', border: '2px solid white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: 'white', fontWeight: 700,
          }}>✓</div>
        )}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: s.text, textAlign: 'center',
        fontFamily: 'var(--sans)', letterSpacing: '0.02em', lineHeight: 1.2,
      }}>
        {node.short}
      </div>
    </div>
  );
}

function FlowConnector({ active, running }) {
  return (
    <div style={{
      flex: 1, height: 2, margin: '0 4px', marginBottom: 22,
      background: active ? '#10b981' : running ? '#f59e0b' : '#e5e7eb',
      borderRadius: 1, transition: 'background 0.5s',
      position: 'relative', overflow: 'hidden',
    }}>
      {running && (
        <div style={{
          position: 'absolute', top: 0, left: '-100%', width: '100%', height: '100%',
          background: 'linear-gradient(90deg, transparent, #f59e0b88, transparent)',
          animation: 'sweep 1.5s infinite',
        }} />
      )}
    </div>
  );
}

// ─── Log entry renderer ───────────────────────────────────────────────────────
const LOG_TYPES = {
  '[DECISION]':        { color: '#1a56db', bg: '#eff4ff', badge: 'DECISION',   badgeCls: 'badge-info' },
  '[AUTONOMOUS CHOICE]':{ color: '#7c3aed', bg: '#f5f3ff', badge: 'AUTONOMOUS', badgeCls: 'badge-info' },
  '[ITERATION':        { color: '#059669', bg: '#ecfdf5', badge: 'METRIC',     badgeCls: 'badge-success' },
  '[BASELINE]':        { color: '#1a56db', bg: '#eff4ff', badge: 'BASELINE',   badgeCls: 'badge-info' },
  '[COMPLETE]':        { color: '#059669', bg: '#ecfdf5', badge: 'COMPLETE',   badgeCls: 'badge-success' },
  '[SCAN':             { color: '#d97706', bg: '#fffbeb', badge: 'SCAN',       badgeCls: 'badge-warning' },
  '[AI]':              { color: '#7c3aed', bg: '#f5f3ff', badge: 'AI',         badgeCls: 'badge-info' },
  '[ANALYSIS]':        { color: '#0891b2', bg: '#ecfeff', badge: 'ANALYSIS',   badgeCls: 'badge-info' },
  '[RAG]':             { color: '#0891b2', bg: '#ecfeff', badge: 'RAG',        badgeCls: 'badge-info' },
};

function getLogType(message) {
  for (const [prefix, type] of Object.entries(LOG_TYPES)) {
    if (message.startsWith(prefix)) return type;
  }
  return null;
}

function LogEntry({ log }) {
  const t = getLogType(log.message);
  const isWarning = log.level === 'warning' || log.level === 'error';
  const borderLeft = t ? t.color : isWarning ? '#f59e0b' : '#e5e7eb';
  const bg = t ? t.bg : 'transparent';

  return (
    <div style={{
      borderLeft: `3px solid ${borderLeft}`, background: bg,
      padding: '7px 10px', borderRadius: '0 6px 6px 0', marginBottom: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: t ? 4 : 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
          {(log.timestamp || '').slice(11, 19)}
        </span>
        <span style={{ fontSize: 10, color: t?.color || 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
          [{log.agent}]
        </span>
        {t && <span className={`badge ${t.badgeCls}`} style={{ fontSize: 9 }}>{t.badge}</span>}
        {isWarning && !t && <span className="badge badge-warning" style={{ fontSize: 9 }}>WARN</span>}
      </div>
      <div style={{
        fontSize: 11.5, color: 'var(--text-primary)', fontFamily: 'var(--mono)',
        whiteSpace: 'pre-wrap', lineHeight: 1.65,
      }}>
        {log.message}
      </div>
    </div>
  );
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function AnimCounter({ value, unit = '', label, accent, large }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const target = parseFloat(value) || 0;
    if (target === prev.current) return;
    const steps = 12;
    const delta = (target - prev.current) / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      prev.current += delta;
      setDisplay(Math.round(prev.current * 10) / 10);
      if (i >= steps) { setDisplay(target); prev.current = target; clearInterval(id); }
    }, 40);
    return () => clearInterval(id);
  }, [value]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: large ? 36 : 28, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1,
        color: accent ? 'var(--accent)' : 'var(--text-primary)',
      }}>
        {display}{unit}
      </div>
      <div style={{
        fontSize: 10, color: 'var(--text-muted)', marginTop: 5,
        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
      }}>{label}</div>
    </div>
  );
}

// ─── Command Center ───────────────────────────────────────────────────────────
export default function CommandCenter({ setPage }) {
  const [logs, setLogs] = useState([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logFilter, setLogFilter] = useState('decisions');
  const logsEndRef = useRef(null);

  const fetchPipelines = useCallback(() => api.listPipelines(), []);
  const fetchAgents    = useCallback(() => api.getAgentStatus(), []);
  const fetchStats     = useCallback(() => api.getStats(), []);
  const fetchMetrics   = useCallback(() => api.getMetrics(), []);

  const { data: plData }  = usePolling(fetchPipelines, 2000);
  const { data: agData }  = usePolling(fetchAgents,    1500);
  const { data: stats }   = usePolling(fetchStats,     3000);
  const { data: metrics } = usePolling(fetchMetrics,   6000);

  const pipelines    = plData?.pipelines || [];
  const activeAgents = agData?.agents    || [];

  const activePipeline =
    pipelines.find(p => p.status === 'running' || p.status === 'in_progress') ||
    pipelines[0] || null;

  // Incremental log polling
  useEffect(() => {
    if (!activePipeline) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await api.getPipelineLogs(activePipeline.id, logTotal);
        if (cancelled) return;
        if (data.logs?.length > 0) {
          setLogs(prev => [...prev.slice(-300), ...data.logs]);
          setLogTotal(data.total);
        }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 1200);
    return () => { cancelled = true; clearInterval(id); };
  }, [activePipeline?.id, logTotal]);

  // Reset on pipeline change
  useEffect(() => { setLogs([]); setLogTotal(0); }, [activePipeline?.id]);

  // Auto-scroll log feed
  useEffect(() => {
    if (logFilter !== 'all') return; // only auto-scroll "all" tab
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, logFilter]);

  const filteredLogs = logFilter === 'decisions'
    ? logs.filter(l =>
        l.message.startsWith('[DECISION]') ||
        l.message.startsWith('[AUTONOMOUS') ||
        l.message.startsWith('[ITERATION'))
    : logFilter === 'metrics'
    ? logs.filter(l =>
        l.message.startsWith('[BASELINE') ||
        l.message.startsWith('[ITERATION') ||
        l.message.startsWith('[COMPLETE'))
    : logs;

  const stages = activePipeline?.stages || {};
  const stageKeys = Object.keys(stages);
  const doneCount = stageKeys.filter(k => stages[k] === 'completed').length;
  const bestImp   = stats?.best_improvement_pct ?? 0;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes sweep   { 0%{left:-100%} 100%{left:100%} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
      `}</style>

      {/* ── Branding strip ── */}
      <div style={{
        background: 'var(--accent)', borderRadius: 10, padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        color: 'white',
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px' }}>
            Self-Improving AI Software Engineer
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>
            "We didn't build another AI tool. We built an autonomous engineer that writes, secures, and improves its own code."
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            background: 'rgba(255,255,255,0.2)', borderRadius: 6,
            padding: '4px 10px', fontSize: 11, fontWeight: 700,
          }}>
            {activeAgents.length > 0 ? `${activeAgents.length} AGENT(S) ACTIVE` : 'READY'}
          </span>
          {activePipeline && (
            <span style={{
              background: 'rgba(255,255,255,0.15)', borderRadius: 6,
              padding: '4px 10px', fontSize: 11,
            }}>
              Pipeline {activePipeline.id}
            </span>
          )}
        </div>
      </div>

      {/* ── Live metric counters ── */}
      <div className="card" style={{ padding: '16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, alignItems: 'center' }}>
          <AnimCounter value={stats?.pipelines?.total  ?? 0} label="Pipelines" />
          <AnimCounter value={stats?.pipelines?.completed ?? 0} label="Completed" />
          <AnimCounter value={stats?.pipelines?.running   ?? 0} label="Running" />
          <AnimCounter value={stats?.total_vulnerabilities_fixed ?? 0} label="Vulns Fixed" />
          <AnimCounter value={stats?.mrs_created ?? 0} label="MRs Created" />
          <AnimCounter value={bestImp > 0 ? bestImp : 0} unit="%" label="Best Speedup" accent large={bestImp > 50} />
          <AnimCounter value={metrics?.system?.cpu_pct?.toFixed(0) ?? 0} unit="%" label="CPU" />
        </div>
      </div>

      {/* ── Pipeline flow diagram ── */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Pipeline Flow</div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
              {activePipeline
                ? `${activePipeline.feature_request.slice(0, 65)}${activePipeline.feature_request.length > 65 ? '…' : ''}`
                : 'No active pipeline — start one to see the flow'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="progress" style={{ width: 120 }}>
              <div className="progress-bar success" style={{
                width: `${(doneCount / 7) * 100}%`, transition: 'width 0.6s',
              }} />
            </div>
            <span className="text-mono text-muted" style={{ fontSize: 11 }}>{doneCount}/7</span>
            {activePipeline && (
              <span className={`badge ${
                activePipeline.status === 'completed' ? 'badge-success' :
                activePipeline.status === 'failed' ? 'badge-danger' : 'badge-warning'
              }`}>{activePipeline.status}</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {FLOW_NODES.map((node, i) => {
            const status = stages[node.key] || 'pending';
            const prevDone = i === 0 || stages[FLOW_NODES[i-1].key] === 'completed';
            const isActive = activeAgents.some(a =>
              a.agent.toLowerCase().replace(/[^a-z]/g, '').includes(node.short.toLowerCase().replace(/[^a-z]/g, ''))
            );
            return (
              <React.Fragment key={node.key}>
                <FlowNode node={node} status={isActive ? 'running' : status} />
                {i < FLOW_NODES.length - 1 && (
                  <FlowConnector
                    active={stages[node.key] === 'completed'}
                    running={isActive}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Node labels row */}
        <div style={{ display: 'flex', marginTop: 8 }}>
          {FLOW_NODES.map((node, i) => (
            <React.Fragment key={node.key}>
              <div style={{ minWidth: 70, textAlign: 'center', fontSize: 9.5,
                            color: stages[node.key] === 'completed' ? 'var(--success)' :
                                   stages[node.key] === 'running' ? '#d97706' : 'var(--text-muted)',
                            fontWeight: 500 }}>
                {node.label}
              </div>
              {i < FLOW_NODES.length - 1 && <div style={{ flex: 1 }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Bottom split: agents + log feed ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14 }}>

        {/* Active agents panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Active Agents</div>

          {activeAgents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0',
                          color: 'var(--text-muted)', fontSize: 12 }}>
              All agents idle
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {activeAgents.map((a, i) => (
                <div key={i} style={{
                  padding: '9px 11px', borderRadius: 8,
                  background: '#fffbeb', border: '1px solid #fcd34d',
                  display: 'flex', alignItems: 'center', gap: 8,
                  animation: 'fadeIn 0.3s ease',
                }}>
                  <span className="status-dot running" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{a.agent}</div>
                    <div className="text-mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {a.pipeline_id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="divider" style={{ margin: '8px 0' }} />
          <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)',
                        marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Agent Roster
          </div>
          {FLOW_NODES.map(node => {
            const status = stages[node.key] || 'pending';
            const isActive = activeAgents.some(a =>
              a.agent.toLowerCase().includes(node.short.toLowerCase().slice(0, 4))
            );
            return (
              <div key={node.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 13, width: 20, textAlign: 'center',
                               color: status === 'completed' ? 'var(--success)' :
                                      isActive ? '#d97706' : 'var(--text-muted)' }}>
                  {node.icon}
                </span>
                <span style={{ fontSize: 11.5, flex: 1, color: 'var(--text-secondary)' }}>
                  {node.label}
                </span>
                <span className={`badge ${
                  isActive ? 'badge-warning' :
                  status === 'completed' ? 'badge-success' :
                  status === 'failed' ? 'badge-danger' : 'badge-neutral'
                }`} style={{ fontSize: 9 }}>
                  {isActive ? 'Active' : status === 'completed' ? 'Done' : status}
                </span>
              </div>
            );
          })}

          {bestImp > 0 && (
            <>
              <div className="divider" style={{ margin: '10px 0' }} />
              <div style={{
                background: 'var(--accent-light)', borderRadius: 8, padding: '10px 12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)',
                              color: 'var(--accent)', lineHeight: 1 }}>
                  {bestImp}%
                </div>
                <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
                  PEAK SPEEDUP
                </div>
                <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>
                  real timeit benchmark
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live decision feed */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Live Decision Feed</div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                Real-time agent reasoning, autonomous choices, and benchmark results
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['decisions','Decisions'],['metrics','Metrics'],['all','All']].map(([k,l]) => (
                <button key={k}
                  className={`btn btn-sm ${logFilter === k ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setLogFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div style={{
            flex: 1, background: '#fafbfc', border: '1px solid var(--border)',
            borderRadius: 6, padding: 10, overflowY: 'auto', maxHeight: 500,
          }}>
            {filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0',
                            color: 'var(--text-muted)', fontSize: 13 }}>
                {logs.length === 0
                  ? 'Start a pipeline to see live agent decisions here'
                  : 'No entries match the current filter — try "All"'}
              </div>
            ) : (
              filteredLogs.map((log, i) => (
                <div key={i} style={{ animation: 'fadeIn 0.25s ease' }}>
                  <LogEntry log={log} />
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>

          {logs.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)',
                          display: 'flex', justifyContent: 'space-between' }}>
              <span>{logs.length} entries — pipeline {activePipeline?.id}</span>
              <button className="btn btn-secondary btn-sm"
                      style={{ fontSize: 10, padding: '2px 8px' }}
                      onClick={() => { setLogs([]); setLogTotal(0); }}>
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick start CTA if no pipelines ── */}
      {pipelines.length === 0 && (
        <div style={{
          background: 'var(--info-bg)', border: '1px solid var(--info-border)',
          borderRadius: 10, padding: '18px 24px', textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--info)', marginBottom: 8 }}>
            Start the Autonomous SDLC
          </div>
          <div style={{ fontSize: 13, color: 'var(--info)', marginBottom: 14 }}>
            Describe a feature. Watch the AI write, secure, test, deploy, and optimize it — autonomously.
          </div>
          <button className="btn btn-primary"
                  onClick={() => setPage && setPage('new')}>
            New Pipeline
          </button>
        </div>
      )}
    </div>
  );
}
