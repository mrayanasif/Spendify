import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Button, Card, ConfirmDialog, Empty, Field, Modal } from '../components/ui';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { relativeTime } from '../lib/format';

const COLORS = [
  { id: 'rose', label: 'Rose', background: 'var(--primary-soft)', foreground: 'var(--primary)' },
  { id: 'honey', label: 'Honey', background: 'var(--honey-soft)', foreground: 'var(--honey-deep)' },
  { id: 'mint', label: 'Mint', background: 'var(--income-soft)', foreground: 'var(--income)' },
  { id: 'sky', label: 'Sky', background: 'var(--surface-3)', foreground: 'var(--text-2)' }
];

const EMPTY_FORM = { title: '', body: '', tag: '', category: '', color: 'rose', pinned: false };

export default function Notes() {
  const toast = useToast();
  const [notes, setNotes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try {
      const [data, categoryData] = await Promise.all([
        api.get('/notes'),
        api.get('/categories')
      ]);
      setNotes(data.notes);
      setCategories(categoryData.categories || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openEditor = (note = null) => {
    setEditing(note || 'new');
    setForm(note ? {
      title: note.title || '', body: note.body, tag: note.tag || '',
      category: note.category?._id || note.category || '',
      color: note.color, pinned: note.pinned
    } : EMPTY_FORM);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (editing && editing !== 'new') await api.put(`/notes/${editing._id}`, form);
      else await api.post('/notes', form);
      setEditing(null);
      toast.success(editing && editing !== 'new' ? 'Note updated.' : 'Note saved.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (note) => {
    try {
      await api.put(`/notes/${note._id}`, { pinned: !note.pinned });
      toast.success(note.pinned ? 'Note unpinned.' : 'Note pinned.');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/notes/${removing._id}`);
      setRemoving(null);
      toast.success('Note deleted.');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Financial notes</h1>
          <p className="page-sub">Keep semester plans, book lists, and split-bill reminders together.</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => openEditor()}>New note</Button>
      </div>

      {loading ? (
        <p className="small muted">Loading notes…</p>
      ) : notes.length === 0 ? (
        <Card><Empty icon="book" title="No notes yet" action={<Button variant="primary" icon="plus" onClick={() => openEditor()}>Create a note</Button>}>Your private scratchpad is ready when you need it.</Empty></Card>
      ) : (
        <div className="grid grid-2">
          {notes.map((note) => {
            const color = COLORS.find((item) => item.id === note.color) || COLORS[0];
            return (
              <Card key={note._id}>
                <div className="row-between gap-2 mb-2">
                  <div className="row gap-2 wrap">
                    {(note.category?.name || note.tag) && (
                      <span className="chip" style={{ background: color.background, color: color.foreground }}>
                        {note.category?.name || note.tag}
                      </span>
                    )}
                    {note.pinned && <span className="tiny strong" style={{ color: 'var(--primary)' }}><Icon name="pin" size={12} /> Pinned</span>}
                  </div>
                  <div className="row gap-1">
                    <button className="icon-btn" title={note.pinned ? 'Unpin note' : 'Pin note'} aria-label={note.pinned ? 'Unpin note' : 'Pin note'} onClick={() => togglePin(note)}>
                      <Icon name="pin" size={15} />
                    </button>
                    <button className="icon-btn" title="Edit note" aria-label="Edit note" onClick={() => openEditor(note)}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button className="icon-btn" title="Delete note" aria-label="Delete note" onClick={() => setRemoving(note)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
                <h2 className="card-title">{note.title || note.category?.name || 'Untitled note'}</h2>
                <p className="small mt-2" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.body}</p>
                <p className="tiny dim mt-3">Updated {relativeTime(note.updatedAt)}</p>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && editing !== 'new' ? 'Edit note' : 'New note'}
        footer={(
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button type="submit" form="note-editor" variant="primary" icon={editing === 'new' ? 'plus' : 'check'} loading={busy}>
              {editing === 'new' ? 'Add note' : 'Save changes'}
            </Button>
          </>
        )}
      >
        <form id="note-editor" className="stack gap-3" onSubmit={save}>
          <Field label="Category" required>
            <select
              className="select"
              value={form.category || ''}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              required
            >
              <option value="">Choose a category…</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>{category.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Title">
            <input className="input" maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </Field>
          <Field label="Note" required>
            <textarea className="textarea" rows={7} maxLength={4000} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required />
          </Field>
          <div className="grid grid-2">
            <Field label="Tag">
              <input className="input" maxLength={32} placeholder="e.g. Semester" value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} />
            </Field>
            <Field label="Color">
              <select className="select" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })}>
                {COLORS.map((color) => <option key={color.id} value={color.id}>{color.label}</option>)}
              </select>
            </Field>
          </div>
          <label className="row gap-2 small">
            <input type="checkbox" checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} />
            Pin this note
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete this note?"
        message="This note will be removed permanently."
        confirmLabel="Delete note"
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </>
  );
}
