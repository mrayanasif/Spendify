import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Card, Field, Toggle } from '../../components/ui';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const DEFAULTS = {
  aiEnabled: true,
  aiModel: 'deepseek-chat',
  aiMaxOutputTokens: 1024,
  aiTimeoutMs: 20000,
  sessionIdleMinutes: 15,
  sessionWarningSeconds: 60,
  authRateLimit: 40
};

export default function AdminSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/admin/settings');
      setSettings({ ...DEFAULTS, ...data.settings });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await api.put('/admin/settings', settings);
      setSettings({ ...DEFAULTS, ...data.settings });
      window.dispatchEvent(new CustomEvent('campuscoin:settings-updated'));
      toast.success('System settings saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setNumber = (field) => (event) => setSettings({ ...settings, [field]: Number(event.target.value) });

  if (loading) return <p className="small muted">Loading system settings…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">System settings</h1>
          <p className="page-sub">Control AI behavior and account security thresholds.</p>
        </div>
      </div>

      <form onSubmit={save} className="grid grid-split">
        <Card title="AI assistant" note="These values apply to generated insights and recommendations.">
          <div className="stack gap-3">
            <Toggle checked={settings.aiEnabled} onChange={(value) => setSettings({ ...settings, aiEnabled: value })} label="Enable AI features" />
            <Field label="Model identifier" hint="Uses the model available at the configured AI provider.">
              <input className="input" value={settings.aiModel} maxLength={100} onChange={(event) => setSettings({ ...settings, aiModel: event.target.value })} />
            </Field>
            <Field label="Maximum output tokens">
              <input className="input" type="number" min="128" max="8192" step="128" value={settings.aiMaxOutputTokens} onChange={setNumber('aiMaxOutputTokens')} />
            </Field>
            <Field label="Request timeout (milliseconds)">
              <input className="input" type="number" min="2000" max="60000" step="1000" value={settings.aiTimeoutMs} onChange={setNumber('aiTimeoutMs')} />
            </Field>
          </div>
        </Card>

        <Card title="Session & rate limits" note="Changes to session thresholds are applied to active sessions shortly after saving.">
          <div className="stack gap-3">
            <Field label="Idle time before warning (minutes)">
              <input className="input" type="number" min="5" max="120" value={settings.sessionIdleMinutes} onChange={setNumber('sessionIdleMinutes')} />
            </Field>
            <Field label="Warning countdown (seconds)">
              <input className="input" type="number" min="15" max="300" value={settings.sessionWarningSeconds} onChange={setNumber('sessionWarningSeconds')} />
            </Field>
            <Field label="Authentication requests per 15 minutes">
              <input className="input" type="number" min="5" max="200" value={settings.authRateLimit} onChange={setNumber('authRateLimit')} />
            </Field>
            <Banner tone="warn" icon="shield">Keep session limits long enough for normal coursework, but short enough for shared devices.</Banner>
          </div>
        </Card>

        <div className="row" style={{ justifyContent: 'flex-end', gridColumn: '1 / -1' }}>
          <Button type="submit" variant="primary" icon="check" loading={saving}>Save settings</Button>
        </div>
      </form>
    </>
  );
}