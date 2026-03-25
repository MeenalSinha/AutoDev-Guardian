import React, { useCallback } from 'react';
import { api } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

const OWASP = [
  { id: 'A01', name: 'Broken Access Control', covered: true },
  { id: 'A02', name: 'Cryptographic Failures', covered: true },
  { id: 'A03', name: 'Injection', covered: true },
  { id: 'A04', name: 'Insecure Design', covered: false },
  { id: 'A05', name: 'Security Misconfiguration', covered: true },
  { id: 'A06', name: 'Vulnerable Components', covered: true },
  { id: 'A07', name: 'Authentication Failures', covered: true },
  { id: 'A08', name: 'Software & Data Integrity', covered: true },
  { id: 'A09', name: 'Logging & Monitoring Failures', covered: false },
  { id: 'A10', name: 'SSRF', covered: true },
];

export default function Security() {
  const fetchPipelines = useCallback(() => api.listPipelines(), []);
  const { data: listData } = usePolling(fetchPipelines, 5000);
  const pipelines = listData?.pipelines || [];

  // Aggregate all security findings
  const allFindings = pipelines.flatMap(p => {
    const sec = p.artifacts?.security_agent;
    if (!sec) return [];
    return (sec.sast_findings || []).map(f => ({ ...f, pipeline_id: p.id, feature: p.feature_request }));
  });

  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  allFindings.forEach(f => { if (bySeverity[f.severity] !== undefined) bySeverity[f.severity]++; });

  return (
    <div className="page">
      <div className="mb-16">
        <div style={{ fontSize: 18, fontWeight: 600 }}>Security Triage</div>
        <div className="text-muted mt-4">SAST findings and OWASP Top 10 coverage across all pipelines</div>
      </div>

      {/* Severity summary */}
      <div className="grid-4 mb-16">
        {Object.entries(bySeverity).map(([sev, count]) => (
          <div key={sev} className="stat-card">
            <div className="stat-label">{sev}</div>
            <div className="stat-value" style={{
              fontSize: 22,
              color: sev === 'CRITICAL' ? 'var(--danger)' : sev === 'HIGH' ? '#d97706' : sev === 'MEDIUM' ? 'var(--warning)' : 'var(--text-muted)'
            }}>{count}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 gap-16 mb-16">
        {/* OWASP Coverage */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>OWASP Top 10 Coverage</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OWASP.map(({ id, name, covered }) => (
              <div key={id} className="flex items-center gap-10" style={{ gap: 10 }}>
                <span className="text-mono text-muted" style={{ minWidth: 36, fontSize: 11 }}>{id}</span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{name}</span>
                <span className={`badge ${covered ? 'badge-success' : 'badge-neutral'}`}>{covered ? 'Covered' : 'Partial'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* All findings */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>All SAST Findings</div>
          {allFindings.length === 0 ? (
            <div className="text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>
              No findings yet. Run a pipeline to scan code.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allFindings.map((f, i) => (
                <div key={i} className="stage-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div className="flex items-center gap-8" style={{ gap: 8, width: '100%' }}>
                    <span className={`badge ${f.severity === 'CRITICAL' || f.severity === 'HIGH' ? 'badge-danger' : 'badge-warning'}`} style={{ flexShrink: 0 }}>{f.severity}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{f.name}</span>
                    <span className="badge badge-neutral" style={{ marginLeft: 'auto', fontSize: 10 }}>{f.owasp_ref}</span>
                  </div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Pipeline {f.pipeline_id} &middot; {f.feature?.slice(0, 50)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>How the Security Triage Agent Works</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {[
            { step: '1', title: 'Static Analysis', desc: 'Regex-based SAST scanner detects 10+ vulnerability patterns including SQL injection, hardcoded secrets, and shell injection.' },
            { step: '2', title: 'AI Analysis', desc: 'Mistral 7B reviews the code with a security-focused system prompt, cross-referencing findings with the RAG knowledge base.' },
            { step: '3', title: 'Patch Generation', desc: 'Produces patched code and a detailed report with OWASP references, security scores, and migration guidance.' },
          ].map(({ step, title, desc }) => (
            <div key={step} style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div className="text-mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>STEP {step}</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
