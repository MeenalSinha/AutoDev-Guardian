import React, { useState } from 'react';
import { api } from '../utils/api';

const EXAMPLES = [
  'Add user authentication with JWT tokens and refresh token rotation',
  'Create a REST API endpoint for uploading and processing CSV files',
  'Implement a caching layer using Redis for database query results',
  'Add rate limiting to all public API endpoints using a sliding window algorithm',
  'Build a WebSocket notification system for real-time order status updates',
];

export default function NewPipeline({ setPage, setActivePipelineId }) {
  const [featureRequest, setFeatureRequest] = useState('');
  const [requirements, setRequirements] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!featureRequest.trim()) {
      setError('Please enter a feature request');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.startPipeline({
        feature_request: featureRequest,
        requirements_txt: requirements || null,
      });
      setActivePipelineId(result.pipeline_id);
      setPage('pipelines');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="mb-16">
        <div style={{ fontSize: 18, fontWeight: 600 }}>New Pipeline</div>
        <div className="text-muted mt-4">
          Describe a feature and AutoDev Guardian will autonomously write, secure, test, and deploy it.
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-title mb-16" style={{ marginBottom: 16 }}>Feature Request</div>

        <div className="form-group">
          <label className="form-label">Feature Description *</label>
          <textarea
            className="form-textarea"
            rows={5}
            placeholder="Describe the feature you want implemented. Be specific about requirements, expected behavior, and any constraints."
            value={featureRequest}
            onChange={e => setFeatureRequest(e.target.value)}
          />
          <span className="form-hint">The Feature Builder Agent will break this into implementation steps and generate code.</span>
        </div>

        <div className="form-group">
          <label className="form-label">Example requests</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                className="btn btn-secondary btn-sm"
                style={{ textAlign: 'left', justifyContent: 'flex-start', fontFamily: 'var(--sans)' }}
                onClick={() => setFeatureRequest(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-title" style={{ marginBottom: 12 }}>Optional Configuration</div>
        <div className="form-group">
          <label className="form-label">requirements.txt (optional)</label>
          <textarea
            className="form-textarea"
            rows={6}
            placeholder="fastapi==0.88.0&#10;pydantic==1.10.4&#10;requests==2.28.1&#10;..."
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
          />
          <span className="form-hint">Leave blank to use the default template. The Dependency Healer will scan and upgrade these.</span>
        </div>
      </div>

      <div className="card mb-16" style={{ background: 'var(--info-bg)', borderColor: 'var(--info-border)' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--info)', marginBottom: 8 }}>What happens next</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--info)' }}>
          {[
            'Feature Builder Agent generates production-ready code',
            'Dependency Healer scans and upgrades vulnerable packages',
            'Security Triage Agent patches vulnerabilities (OWASP Top 10)',
            'Test Runner validates the implementation',
            'GitLab workflow creates Issue, MR, and triggers CI pipeline',
            'Auto-Research Agent runs self-improvement loop (4 iterations)',
          ].map((step, i) => (
            <div key={i} className="flex gap-8">
              <span style={{ minWidth: 18, fontFamily: 'var(--mono)', fontWeight: 600 }}>{i + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert alert-warning mb-16" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-12">
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Starting...' : 'Start Autonomous Pipeline'}
        </button>
        <button className="btn btn-secondary" onClick={() => setPage('dashboard')} disabled={loading}>
          Cancel
        </button>
      </div>
    </div>
  );
}
