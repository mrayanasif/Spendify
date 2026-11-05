import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import {
  Card, Button, Modal, Empty, Field, MoneyInput, Progress, CategoryMark,
  Chip, Banner, MonthPicker, ConfirmDialog, Skeleton
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, percent, symbolFor, recentMonths, monthKey, monthLabel } from '../lib/format';
import { BudgetTrendChart } from '../components/charts';

export default function Budgets() {
  const { currency } = useAuth();
  const toast = useToast();

  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(null);
  const [limit, setLimit] = useState('');
  const [limitError, setLimitError] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const months = recentMonths(12);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [budgets, cats] = await Promise.all([
        api.get('/budgets', { month }),
        api.get('/categories')
      ]);
      setData(budgets);
      setCategories(cats.categories.filter((c) => c.type === 'expense'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (budget = null) => {
    setEditing(budget || 'new');
    setCategoryId(budget?.categoryId || '');
    setLimit(budget?.limitAmount ?? '');
    setLimitError('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!categoryId) {
      toast.error('Choose a category.');
      return;
    }
    const amount = Number(limit);
    if (!String(limit).trim() || !Number.isFinite(amount) || amount <= 0) {
      setLimitError('Enter an amount greater than zero before proceeding.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/budgets', { category: categoryId, month, limitAmount: amount });
      toast.success('Budget saved.');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/budgets/${removing.budgetId}`);
      toast.success('Budget removed.');
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copyPrevious = async () => {
    try {
      const result = await api.post('/budgets/copy', { month });
      toast.success(result.message);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const budgets = data?.budgets || [];
  const summary = data?.summary;

  return (
    <div className="budgets-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Budget goals</h1>
          <p className="page-sub">Set a monthly cap per category and watch it fill up as you spend.</p>
        </div>

        <div className="row gap-2 wrap hide-print">
          <Button icon="copy" onClick={copyPrevious}>Copy last month</Button>
          <Button variant="primary" icon="plus" onClick={() => openEditor()}>Set a budget</Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="stack gap-3">
          <Skeleton height={120} radius={18} />
          <Skeleton height={320} radius={18} />
        </div>
      ) : (
        <div className="grid grid-split">
            {/* --- per category --- */}
            <Card
              title="By category"
              action={<MonthPicker value={month} onChange={setMonth} options={months} />}
              className={budgets.length ? '' : undefined}
            >
              {budgets.length === 0 ? (
                <Empty
                  icon="target"
                  title="No budgets for this month"
                  action={
                    <div className="row gap-2" style={{ justifyContent: 'center' }}>
                      <Button variant="primary" icon="plus" onClick={() => openEditor()}>Set a budget</Button>
                      <Button icon="copy" onClick={copyPrevious}>Copy last month</Button>
                    </div>
                  }
                >
                  Pick the categories you overspend on most. A cap you can actually keep beats an ambitious one.
                </Empty>
              ) : (
                <div className="stack" style={{ gap: 0 }}>
                  {budgets.map((budget) => (
                    <div key={budget.budgetId} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                      padding: '1rem 0',
                      borderBottom: '1px solid var(--line)'
                    }}>
                      <div className="row-between gap-2 wrap">
                        <span className="row gap-2" style={{ alignItems: 'center' }}>
                          <div style={{
                            width: 42,
                            height: 42,
                            borderRadius: '12px',
                            background: `${budget.color || '#8d91a0'}12`,
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0
                          }} className="budget-category-icon">
                            <CategoryMark category={budget} size={28} style={{ background: 'transparent' }} />
                          </div>
                          <span>
                            <span className="strong">{budget.name}</span>
                            <span className="tiny dim" style={{ display: 'block' }}>
                              {budget.state === 'over'
                                ? `${money(Math.abs(budget.remaining), currency)} over`
                                : `${money(budget.remaining, currency)} left`}
                            </span>
                          </span>
                          {budget.state === 'over' && <Chip tone="expense">Over Budget</Chip>}
                          {budget.state === 'near' && <Chip tone="warn">Almost there</Chip>}
                        </span>

                        <span className="row gap-2" style={{ alignItems: 'center' }}>
                          <span className="small tabular">
                            <span style={{ color: budget.state === 'over' ? 'var(--expense)' : 'var(--text)', fontWeight: 600 }}>{money(budget.spent, currency)}</span>
                            <span className="muted"> / {money(budget.limitAmount, currency)}</span>
                          </span>
                          <button className="icon-btn" onClick={() => openEditor(budget)} aria-label="Edit budget">
                            <Icon name="edit" size={16} />
                          </button>
                          <button className="icon-btn" onClick={() => setRemoving(budget)} aria-label="Remove budget">
                            <Icon name="trash" size={16} />
                          </button>
                        </span>
                      </div>
                      <Progress value={budget.percent} state={budget.state} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* --- overall budgets graph --- */}
            <Card className="all-budgets-orange-card" title={`All budgets · ${monthLabel(month)}`}>
              {summary && summary.limitTotal > 0 ? (
                <>
                  <div className="row-between wrap gap-3 mb-3">
                    <div>
                      <div className="figure" style={{ fontSize: '1.9rem' }}>
                        {money(summary.spentTotal, currency)}
                      </div>
                      <div className="small muted">of {money(summary.limitTotal, currency)} budgeted</div>
                    </div>
                    <div className="right">
                      <div className={`figure ${summary.remaining < 0 ? 'money-out' : 'money-in'}`} style={{ fontSize: '1.35rem' }}>
                        {money(Math.abs(summary.remaining), currency)}
                      </div>
                      <div className="small muted">{summary.remaining < 0 ? 'over budget' : 'still available'}</div>
                    </div>
                  </div>

                  <BudgetTrendChart
                    data={summary.trend}
                    budgetLimit={summary.limitTotal}
                    currency={currency}
                  />
                  <div className="row-between small dim mt-1">
                    <span>{percent(summary.percent)} used</span>
                    <span>{budgets.length} categories tracked</span>
                  </div>

                  {summary.unbudgetedSpend > 0 && (
                    <Banner tone="warn" icon="info" className="mt-3">
                      {money(summary.unbudgetedSpend, currency)} was spent this month in categories with no budget set.
                    </Banner>
                  )}
                </>
              ) : (
                <Empty icon="chart" title="No budgets to chart yet">
                  Set a monthly cap for a category to see spending against your total budget.
                </Empty>
              )}
            </Card>
        </div>
      )}

      {/* ----------------------------------------------------- editor */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Set a budget' : 'Edit budget'}
        subtitle={monthLabel(month)}
      >
        <form onSubmit={save} className="stack gap-3" noValidate>
          <Field label="Category" required>
            <select
              className="select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={editing !== 'new'}
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Monthly limit" required hint="Start close to what you already spend, then tighten it." error={limitError}>
            <div className="input-money">
              <span className="prefix">{symbolFor(currency)}</span>
              <input
                type="text"
                inputMode="decimal"
                className="input"
                value={limit}
                onChange={(e) => { setLimit(e.target.value); setLimitError(''); }}
                onKeyDown={(e) => {
                  // Allow numbers, decimal point, backspace, delete, tab, arrows
                  if ([8, 9, 37, 38, 39, 40, 46, 27].includes(e.keyCode)) return;
                  if (e.key === '.') {
                    if (limit.includes('.')) e.preventDefault();
                    return;
                  }
                  if (!/[0-9]/.test(e.key)) {
                    e.preventDefault();
                  }
                }}
                placeholder="0.00"
                autoComplete="off"
              />
            </div>
          </Field>

          <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>Save budget</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this budget?"
        message={removing ? `The cap on ${removing.name} will be removed for ${monthLabel(month)}. Your transactions are not affected.` : ''}
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
