import { useCallback, useEffect, useState } from 'react';
import Icon, { CATEGORY_ICONS } from '../../components/Icon';
import {
  Card, Button, Modal, Empty, Field, Banner, Chip, CategoryMark, TypeSwitch, ConfirmDialog, Skeleton
} from '../../components/ui';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const SWATCHES = [
  '#FF6026', '#E98713', '#F59E0B', '#16A34A', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#D97706', '#1F2937'
];

export default function AdminCategories() {
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: '', type: 'expense', icon: 'dots', color: '#FF6026' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/admin/categories');
      setCategories(data.categories);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (category = null) => {
    setEditing(category || 'new');
    setForm({
      name: category?.name || '',
      type: category?.type || 'expense',
      icon: category?.icon || 'dots',
      color: category?.color || '#10B981'
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (editing === 'new') await api.post('/admin/categories', form);
      else await api.put(`/admin/categories/${editing._id}`, { name: form.name, icon: form.icon, color: form.color });
      toast.success(editing === 'new' ? 'Default category created.' : 'Category updated.');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async (category) => {
    try {
      await api.put(`/admin/categories/${category._id}`, { isArchived: !category.isArchived });
      toast.success(category.isArchived ? 'Category restored.' : 'Category archived — it no longer appears in new entry forms.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await api.del(`/admin/categories/${removing._id}`);
      toast.success(result.message);
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const renderGroup = (type) => {
    const group = categories.filter((c) => c.type === type);

    return (
      <Card
        title={type === 'income' ? 'Income categories' : 'Expense categories'}
        note={`${group.length} available to every student`}
        action={
          <Button
            size="sm"
            variant="primary"
            icon="plus"
            onClick={() => {
              openEditor();
              setForm((f) => ({ ...f, type }));
            }}
          >
            Add
          </Button>
        }
      >
        {group.length === 0 ? (
          <Empty icon="tag" title={`No default ${type} categories`}>Students will have nothing to choose from.</Empty>
        ) : (
          <div className="stack">
            {group.map((category) => (
              <div
                key={category._id}
                className="row gap-3"
                style={{ padding: '0.65rem 0', borderBottom: '1px solid var(--line)', opacity: category.isArchived ? 0.55 : 1 }}
              >
                <CategoryMark category={category} size={34} />
                <div className="grow">
                  <div className="row gap-2">
                    <span className="strong small">{category.name}</span>
                    {category.isArchived && <Chip tone="warn">Archived</Chip>}
                  </div>
                  <div className="tiny dim">
                    {category.usageCount} transaction{category.usageCount === 1 ? '' : 's'} · {category.budgetCount || 0} budget{category.budgetCount === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="row gap-1">
                  <button className="icon-btn" onClick={() => openEditor(category)} aria-label="Edit">
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => toggleArchive(category)}
                    aria-label={category.isArchived ? 'Restore' : 'Archive'}
                    title={category.isArchived ? 'Restore' : 'Archive'}
                  >
                    <Icon name={category.isArchived ? 'refresh' : 'eye'} size={15} />
                  </button>
                  <button className="icon-btn" onClick={() => setRemoving(category)} aria-label="Delete">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Default categories</h1>
          <p className="page-sub">
            The set every student sees. Students can still add their own on top of these.
          </p>
        </div>
      </div>

      <Banner icon="info" className="mb-3">
        A category already used by a transaction or budget is archived rather than deleted, so no student's history
        or budget loses its category. Archived categories stay on old entries but disappear from new entry forms.
      </Banner>

      {loading && categories.length === 0 ? (
        <div className="grid grid-2">
          <Skeleton height={340} radius={18} />
          <Skeleton height={340} radius={18} />
        </div>
      ) : (
        <div className="grid grid-2">
          {renderGroup('expense')}
          {renderGroup('income')}
        </div>
      )}

      {/* ------------------------------------------------------ editor */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New default category' : 'Edit default category'}
        subtitle={editing === 'new' ? 'It becomes available to every student immediately.' : undefined}
      >
        <form onSubmit={save} className="stack gap-3">
          <div className="row gap-3">
            <CategoryMark category={form} size={52} />
            <div className="grow">
              <Field label="Name" required>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={40}
                  autoFocus
                  required
                />
              </Field>
            </div>
          </div>

          {editing === 'new' && (
            <Field label="Type" hint="This cannot be changed later." group>
              <TypeSwitch value={form.type} onChange={(type) => setForm({ ...form, type })} />
            </Field>
          )}

          <Field label="Icon" group>
            <div className="row gap-2 wrap">
              {CATEGORY_ICONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="icon-btn"
                  onClick={() => setForm({ ...form, icon: key })}
                  style={{
                    border: `1px solid ${form.icon === key ? form.color : 'var(--line)'}`,
                    background: form.icon === key ? `${form.color}1f` : 'var(--surface-2)',
                    color: form.icon === key ? form.color : 'var(--text-2)'
                  }}
                  aria-pressed={form.icon === key}
                  aria-label={key}
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
                  onClick={() => setForm({ ...form, color: swatch })}
                  aria-label={swatch}
                  aria-pressed={form.color === swatch}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: swatch,
                    border: form.color === swatch ? '2px solid var(--text)' : '2px solid transparent',
                    outline: form.color === swatch ? '2px solid var(--surface)' : 'none',
                    outlineOffset: -4
                  }}
                />
              ))}
            </div>
          </Field>

          <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              {editing === 'new' ? 'Create category' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete this default category?"
        message={
          removing
            ? removing.usageCount > 0
              ? `"${removing.name}" is used by ${removing.usageCount} transactions${removing.budgetCount ? ` and ${removing.budgetCount} budgets` : ''}, so it will be archived instead of deleted. Existing entries keep their label.`
              : removing.budgetCount > 0
                ? `"${removing.name}" is used by ${removing.budgetCount} budgets, so it will be archived instead of deleted.`
              : `"${removing.name}" is not used by any transaction and will be removed completely.`
            : ''
        }
        confirmLabel={removing?.usageCount > 0 || removing?.budgetCount > 0 ? 'Archive it' : 'Delete'}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
