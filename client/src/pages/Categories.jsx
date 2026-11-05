import { useCallback, useEffect, useState } from 'react';
import Icon, { CATEGORY_ICONS } from '../components/Icon';
import {
  Card, Button, Modal, Empty, Field, CategoryMark, Chip, Banner, TypeSwitch, Skeleton
} from '../components/ui';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

const SWATCHES = [
  '#FF6026', '#E98713', '#F59E0B', '#16A34A', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#D97706', '#1F2937'
];

/** Add / edit form for a personal category. */
function CategoryForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const isEdit = Boolean(initial?._id);

  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState(initial?.type || 'expense');
  const [icon, setIcon] = useState(initial?.icon || 'dots');
  const [color, setColor] = useState(initial?.color || '#FF6026');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give the category a name.');
      toast.error('Give the category a name.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (isEdit) await api.put(`/categories/${initial._id}`, { name, icon, color });
      else await api.post('/categories', { name, type, icon, color });
      toast.success(isEdit ? 'Category updated.' : 'Category created.');
      onSaved();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack gap-3">
      {error && <Banner tone="danger" icon="alert">{error}</Banner>}

      <div className="row gap-3">
        <CategoryMark category={{ icon, color }} size={52} />
        <div className="grow">
          <Field label="Name" required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coffee runs" maxLength={40} autoFocus />
          </Field>
        </div>
      </div>

      {!isEdit && (
        <Field label="Type" hint="This cannot be changed later." group>
          <TypeSwitch value={type} onChange={setType} />
        </Field>
      )}

      <Field label="Icon" group>
        <div className="row gap-2 wrap">
          {CATEGORY_ICONS.map((key) => (
            <button
              key={key}
              type="button"
              className="icon-btn"
              onClick={() => setIcon(key)}
              style={{
                border: `1px solid ${icon === key ? color : 'var(--line)'}`,
                background: icon === key ? `${color}1f` : 'var(--surface-2)',
                color: icon === key ? color : 'var(--text-2)'
              }}
              aria-label={key}
              aria-pressed={icon === key}
            >
              <Icon name={key} size={17} />
            </button>
          ))}
        </div>
      </Field>

      <Field label="Colour" group>
        <div className="row gap-2 wrap">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-label={swatch}
              aria-pressed={color === swatch}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: swatch,
                border: color === swatch ? '2px solid var(--text)' : '2px solid transparent',
                outline: color === swatch ? '2px solid var(--surface)' : 'none',
                outlineOffset: -4
              }}
            />
          ))}
        </div>
      </Field>

      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
        <Button type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{isEdit ? 'Save changes' : 'Create category'}</Button>
      </div>
    </form>
  );
}

/** Delete flow — asks where to move the transactions when the category is in use. */
function DeleteCategory({ category, categories, onDone, onCancel }) {
  const toast = useToast();
  const [reassignTo, setReassignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState('');

  const run = async () => {
    setBusy(true);
    try {
      const result = await api.del(`/categories/${category._id}`, reassignTo ? { reassignTo } : undefined);
      toast.success(result.movedTransactions ? `Category deleted, ${result.movedTransactions} entries moved.` : 'Category deleted.');
      onDone();
    } catch (err) {
      if (err.status === 409) setConflict(err.message);
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const targets = categories.filter((c) => c.type === category.type && c._id !== category._id);

  return (
    <div className="stack gap-3">
      <p className="muted small">
        "{category.name}" will be removed from your category list.
      </p>

      {conflict && (
        <>
          <Banner tone="warn" icon="alert">{conflict}</Banner>
          <Field label="Move those transactions to" required>
            <select className="select" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value="">Choose a category…</option>
              {targets.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </>
      )}

      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="danger" loading={busy} disabled={Boolean(conflict) && !reassignTo} onClick={run}>
          {conflict ? 'Move and delete' : 'Delete category'}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Categories() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get('/categories'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const renderGroup = (type) => {
    const all = (data?.categories || []).filter((c) => c.type === type);
    const defaults = all.filter((c) => c.isDefault);
    const own = all.filter((c) => !c.isDefault);

    return (
      <Card
        title={type === 'income' ? 'Income categories' : 'Expense categories'}
        note={`${defaults.length} standard, ${own.length} of your own`}
        action={
          <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing({ type })}>
            Add
          </Button>
        }
      >
        <div className="stack gap-3">
          <div>
            <span className="eyebrow">Standard</span>
            <div className="row gap-2 wrap mt-2">
              {defaults.map((c) => (
                <span key={c._id} className="row gap-2" style={{ padding: '0.4rem 0.7rem 0.4rem 0.4rem', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--surface-2)' }}>
                  <CategoryMark category={c} size={26} />
                  <span className="small strong">{c.name}</span>
                </span>
              ))}
            </div>
            <p className="tiny dim mt-2">Available to every student. Managed by an administrator.</p>
          </div>

          <hr className="divider" />

          <div>
            <span className="eyebrow">Manage own categories</span>
            {own.length === 0 ? (
              <Empty icon="tag" title="You have not added any yet" action={<Button size="sm" variant="primary" icon="plus" onClick={() => setEditing({ type })}>Add a category</Button>}>
                Create categories that match how you actually spend — "Coffee runs", "Society fees", anything.
              </Empty>
            ) : (
              <div className="stack mt-2">
                {own.map((c) => (
                  <div key={c._id} className="row gap-3" style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--line)' }}>
                    <CategoryMark category={c} size={32} />
                    <div className="grow">
                      <span className="strong small" style={{ marginRight: 8 }}>{c.name}</span>
                      <Chip tone="outline">yours</Chip>
                    </div>
                    <div className="row gap-1">
                      <button className="icon-btn" onClick={() => setEditing(c)} aria-label="Edit"><Icon name="edit" size={15} /></button>
                      <button className="icon-btn" onClick={() => setDeleting(c)} aria-label="Delete"><Icon name="trash" size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-sub">The standard set, plus any you create for yourself.</p>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-2">
          <Skeleton height={320} radius={18} />
          <Skeleton height={320} radius={18} />
        </div>
      ) : (
        <div className="grid grid-2">
          {renderGroup('expense')}
          {renderGroup('income')}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?._id ? 'Edit category' : 'New category'}
        subtitle={editing?._id ? undefined : 'It will appear in your entry forms straight away.'}
      >
        <CategoryForm
          initial={editing}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete category">
        {deleting && (
          <DeleteCategory
            category={deleting}
            categories={data?.categories || []}
            onDone={() => {
              setDeleting(null);
              load();
            }}
            onCancel={() => setDeleting(null)}
          />
        )}
      </Modal>
    </>
  );
}
