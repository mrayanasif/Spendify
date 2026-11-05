import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import {
  Card, Button, Modal, Empty, Field, Banner, Chip, Toggle, ConfirmDialog, Skeleton
} from '../../components/ui';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { longDate } from '../../lib/format';

/**
 * Two kinds of content live here:
 *   - announcements, shown as a banner on every student dashboard
 *   - tip templates, mixed into the tips feed for students with too little
 *     history for data-driven advice
 */
export default function AdminAnnouncements() {
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('announcement');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ title: '', body: '', kind: 'announcement', active: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/admin/announcements');
      setItems(data.items);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (item = null) => {
    setEditing(item || 'new');
    setForm({
      title: item?.title || '',
      body: item?.body || '',
      kind: item?.kind || tab,
      active: item?.active ?? true
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = editing === 'new'
        ? await api.post('/admin/announcements', form)
        : await api.put(`/admin/announcements/${editing._id}`, form);

      if (editing === 'new') {
        toast.success(saved.notified ? `Published — ${saved.notified} students notified.` : 'Published.');
      } else if (saved.notified) {
        toast.success(`Saved — ${saved.notified} students notified.`);
      } else {
        toast.success('Saved.');
      }

      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (item) => {
    try {
      await api.put(`/admin/announcements/${item._id}`, { active: !item.active });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/admin/announcements/${removing._id}`);
      toast.success('Removed.');
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const visible = items.filter((item) => item.kind === tab);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Notices & tip templates</h1>
          <p className="page-sub">System-wide messages for students, and generic advice for new accounts.</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => openEditor()}>
          {tab === 'announcement' ? 'New announcement' : 'New tip template'}
        </Button>
      </div>

      <div className="row gap-2 mb-3">
        {[
          { key: 'announcement', label: 'Announcements', icon: 'megaphone' },
          { key: 'tipTemplate', label: 'Tip templates', icon: 'bulb' }
        ].map((option) => (
          <button
            key={option.key}
            className={`filter-chip row gap-2 ${tab === option.key ? 'on' : ''}`}
            onClick={() => setTab(option.key)}
          >
            <Icon name={option.icon} size={15} />
            {option.label}
            <span className="tabular">{items.filter((i) => i.kind === option.key).length}</span>
          </button>
        ))}
      </div>

      <Banner icon="info" className="mb-3">
        {tab === 'announcement'
          ? 'Active announcements appear as a banner at the top of every student dashboard.'
          : 'Tip templates are shown to students who have too few transactions for advice built from their own data.'}
      </Banner>

      {loading && items.length === 0 ? (
        <div className="stack gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={110} radius={12} />)}</div>
      ) : visible.length === 0 ? (
        <Card>
          <Empty
            icon={tab === 'announcement' ? 'megaphone' : 'bulb'}
            title={tab === 'announcement' ? 'No announcements' : 'No tip templates'}
            action={<Button variant="primary" icon="plus" onClick={() => openEditor()}>Create one</Button>}
          >
            {tab === 'announcement'
              ? 'Publish a message and every student will see it on their dashboard.'
              : 'Write generic advice for students who have not logged enough to get personalised tips yet.'}
          </Empty>
        </Card>
      ) : (
        <div className="stack gap-2">
          {visible.map((item) => (
            <article key={item._id} className="card" style={{ opacity: item.active ? 1 : 0.6 }}>
              <div className="row-between wrap gap-2">
                <div className="row gap-2">
                  <span
                    className="cat-dot"
                    style={{
                      background: item.active ? 'var(--honey-soft)' : 'var(--surface-3)',
                      color: item.active ? 'var(--honey-deep)' : 'var(--text-3)',
                      width: 34,
                      height: 34
                    }}
                  >
                    <Icon name={item.kind === 'announcement' ? 'megaphone' : 'bulb'} size={16} />
                  </span>
                  <div>
                    <div className="strong">{item.title}</div>
                    <div className="tiny dim">Published {longDate(item.createdAt)}</div>
                  </div>
                </div>

                <div className="row gap-2">
                  <Chip tone={item.active ? 'income' : ''}>{item.active ? 'Live' : 'Hidden'}</Chip>
                  <button className="icon-btn" onClick={() => toggleActive(item)} aria-label="Toggle visibility" title={item.active ? 'Hide' : 'Show'}>
                    <Icon name="eye" size={15} />
                  </button>
                  <button className="icon-btn" onClick={() => openEditor(item)} aria-label="Edit">
                    <Icon name="edit" size={15} />
                  </button>
                  <button className="icon-btn" onClick={() => setRemoving(item)} aria-label="Delete">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>

              <p className="small muted mt-2">{item.body}</p>
            </article>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------ editor */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New message' : 'Edit message'}
      >
        <form onSubmit={save} className="stack gap-3">
          <Field label="Kind">
            <select
              className="select"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              disabled={editing !== 'new'}
            >
              <option value="announcement">Announcement — banner on the student dashboard</option>
              <option value="tipTemplate">Tip template — generic advice for new accounts</option>
            </select>
          </Field>

          <Field label="Title" required>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={120}
              placeholder={form.kind === 'announcement' ? 'Exam week reminder' : 'Set a weekly food cap'}
              required
              autoFocus
            />
          </Field>

          <Field label="Message" required hint="Keep it to a couple of sentences — it is read at a glance.">
            <textarea
              className="textarea"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={4}
              maxLength={1000}
              required
            />
          </Field>

          <div className="card tight" style={{ background: 'var(--surface-2)' }}>
            <Toggle
              checked={form.active}
              onChange={(active) => setForm({ ...form, active })}
              label="Visible to students"
              hint="Turn off to keep it as a draft."
            />
          </div>

          <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              {editing === 'new' ? 'Publish' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this message?"
        message={removing ? `"${removing.title}" will be deleted. Students will no longer see it.` : ''}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
