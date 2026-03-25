import React, { useCallback } from 'react';
import { api } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

export default function Deployment() {
  const fetchPipelines = useCallback(() => api.listPipelines(), []);
  const { data: listData } = usePolling(fetchPipelines, 5000);
  const pipelines = listData?.pipelines || [];

  const deployed = pipelines.filter(p =>
    p.artifacts?.deployment_agent?.status === 'deployed'
  );
  const degraded = pipelines.filter(p =>
    p.artifacts?.deployment_agent?.status === 'degraded'
  );
  const notDeployed = pipelines.filter(p =>
    !p.artifacts?.deployment_agent
  );

  return (
    <div className="page">
      <div className="mb-16">
        <div style={{ fontSize: 18, fontWeight: 600 }}>Deployments</div>
        <div className="text-muted mt-4">Status of all deployed pipeline artifacts</div>
      </div>

      <div className="grid-3 mb-16">
        <div className="stat-card">
          <div className="stat-label">Deployed</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{deployed.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Degraded</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{degraded.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Not Deployed</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{notDeployed.length}</div>
        </div>
      </div>

      {deployed.length === 0 && degraded.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          No deployments yet. Complete a pipeline to see deployments here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[...deployed, ...degraded].map(p => {
            const d = p.artifacts.deployment_agent;
            return (
              <div key={p.id} className="card" style={{ padding: 16 }}>
                <div className="flex justify-between items-center mb-8" style={{ marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.feature_request}</div>
                    <div className="text-muted text-sm">Pipeline {p.id} &middot; {new Date(p.created_at).toLocaleString()}</div>
                  </div>
                  <span className={`badge ${d.status === 'deployed' ? 'badge-success' : 'badge-warning'}`}>{d.status}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div className="text-muted text-sm">URL</div>
                    <div className="text-mono" style={{ fontSize: 12 }}>{d.deployment_url}</div>
                  </div>
                  <div>
                    <div className="text-muted text-sm">Image</div>
                    <div className="text-mono" style={{ fontSize: 12 }}>{d.image_tag}</div>
                  </div>
                  <div>
                    <div className="text-muted text-sm">Deployed</div>
                    <div style={{ fontSize: 12 }}>{d.deployed_at ? new Date(d.deployed_at).toLocaleTimeString() : '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(d.health_checks || []).map((h, i) => (
                    <div key={i} className="flex items-center gap-8">
                      <span className={`status-dot ${h.healthy ? 'completed' : 'failed'}`} />
                      <span className="text-mono text-sm">{h.endpoint}</span>
                    </div>
                  ))}
                  {d.rollback_available && (
                    <span className="badge badge-info">Rollback available</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card mt-16" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>How Deployment Works</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {[
            { step: '1', title: 'Pre-flight Check', desc: 'Validates test pass rate exceeds 70% threshold before proceeding with deployment.' },
            { step: '2', title: 'Dockerfile Generation', desc: 'AI generates a production Dockerfile with non-root user, healthcheck, and optimized layer caching.' },
            { step: '3', title: 'Health Verification', desc: 'Runs health checks against /health and /ready endpoints to confirm the service is operational.' },
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
