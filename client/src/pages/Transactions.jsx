import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import {
  Card, Button, Modal, Empty, Field, CategoryMark, Chip, Banner,
  ConfirmDialog, Pagination, Skeleton
} from '../components/ui';
import TransactionForm from '../components/TransactionForm';
import ReceiptScanner from '../components/ReceiptScanner';
import { DonutChart } from '../components/charts';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, shortDate, longDate, relativeTime, toInputDate } from '../lib/format';

const EMPTY_FILTERS = { type: '', category: '', from: '', to: '', q: '', flagged: '', source: '', paymentMethod: '', minAmount: '', maxAmount: '' };

export default function Transactions() {
  const { currency } = useAuth();
  const toast = useToast();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ sort: 'date', order: 'desc' });

  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

  const [editing, setEditing] = useState(null);   // transaction or 'new'
  const [scanOpen, setScanOpen] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(null);       // 'deleted' | 'recurring' | 'flagged'
  const [panelData, setPanelData] = useState(null);
  const panelRequest = useRef(0);
  const [historyFor, setHistoryFor] = useState(null);
  const [recurringItems, setRecurringItems] = useState([]);
  const [recurringLoading, setRecurringLoading] = useState(true);
  const [recurringEditor, setRecurringEditor] = useState(null);
  const [recurringDelete, setRecurringDelete] = useState(null);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    name: '', description: '', type: 'expense', category: '', amount: '',
    frequency: 'monthly', startDate: toInputDate(new Date()), endDate: ''
  });
  const [anomalyCounts, setAnomalyCounts] = useState({ duplicateCount: 0, largeCount: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get('/transactions', { ...filters, ...sort, page, limit: 15 });
      setData(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, sort, page, toast]);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  const loadAnomalyCounts = useCallback(async () => {
    try {
      const result = await api.get('/reports/anomalies');
      setAnomalyCounts({
      duplicateCount: result.duplicateCount ?? result.duplicates?.length ?? 0,
      largeCount: result.largeCount ?? result.large?.length ?? 0
      });
    } catch {
      /* These counts are an optional summary; keep the transaction page usable if they fail. */
    }
  }, []);

  useEffect(() => {
    loadAnomalyCounts();
  }, [loadAnomalyCounts]);

  const loadRecurring = useCallback(async () => {
    setRecurringLoading(true);
    try {
      const result = await api.get('/recurring-payments');
      setRecurringItems(result.items || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRecurringLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const loadPage = async () => {
      await load();
      await loadRecurring();
    };
    loadPage();
  }, [load, loadRecurring]);

  const openRecurringEditor = (item = null) => {
    setRecurringForm(item ? {
      name: item.name || '',
      description: item.description || '',
      type: item.type || 'expense',
      category: item.category?._id || item.category || '',
      amount: String(item.amount ?? ''),
      frequency: item.frequency || 'monthly',
      startDate: toInputDate(item.startDate || new Date()),
      endDate: item.endDate ? toInputDate(item.endDate) : ''
    } : {
      name: '', description: '', type: 'expense', category: '', amount: '',
      frequency: 'monthly', startDate: toInputDate(new Date()), endDate: ''
    });
    setRecurringEditor(item || 'new');
  };

  const saveRecurring = async (event) => {
    event.preventDefault();
    if (!recurringForm.name.trim() || !recurringForm.category || !recurringForm.amount || Number(recurringForm.amount) <= 0) {
      toast.error('Enter a name, amount, and category.');
      return;
    }
    setRecurringBusy(true);
    try {
      const payload = {
        ...recurringForm,
        name: recurringForm.name.trim(),
        description: recurringForm.description.trim(),
        amount: Number(recurringForm.amount),
        endDate: recurringForm.endDate || null
      };
      if (recurringEditor === 'new') {
        await api.post('/recurring-payments', payload);
        toast.success('Recurring payment added.');
      } else {
        await api.put(`/recurring-payments/${recurringEditor._id}`, payload);
        toast.success('Recurring payment updated.');
      }
      setRecurringEditor(null);
      await load();
      await loadRecurring();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRecurringBusy(false);
    }
  };

  const toggleRecurring = async (item) => {
    try {
      await api.patch(`/recurring-payments/${item._id}/status`, { active: !item.active });
      toast.success(item.active ? 'Recurring payment paused.' : 'Recurring payment resumed.');
      await loadRecurring();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeRecurring = async () => {
    if (!recurringDelete) return;
    setRecurringBusy(true);
    try {
      await api.del(`/recurring-payments/${recurringDelete._id}`);
      toast.success('Recurring payment deleted. Past transactions are kept.');
      setRecurringDelete(null);
      await loadRecurring();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRecurringBusy(false);
    }
  };

  /* Reset to the first page whenever a filter changes. */
  const setFilter = (key, value) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([, v]) => v !== '').length,
    [filters]
  );
  const activeAdvancedFilterCount = useMemo(
    () => ['from', 'to', 'paymentMethod', 'minAmount', 'maxAmount', 'flagged', 'source']
      .filter((key) => filters[key] !== '').length,
    [filters]
  );

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/transactions/${confirming._id}`);
      toast.success('Transaction deleted. It can be restored from the history panel.');
      setConfirming(null);
      load();
      loadAnomalyCounts();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openPanel = async (which) => {
    const requestId = ++panelRequest.current;
    setPanel(which);
    setPanelData(null);
    try {
      let result;
      if (which === 'deleted') result = await api.get('/transactions/deleted');
      if (which === 'recurring') result = await api.get('/transactions/recurring');
      if (which === 'flagged') result = await api.get('/reports/anomalies');
      if (requestId === panelRequest.current) setPanelData(result);
    } catch (err) {
      if (requestId === panelRequest.current) toast.error(err.message);
    }
  };

  const closePanel = () => {
    panelRequest.current += 1;
    setPanel(null);
    setPanelData(null);
  };

  const restore = async (id) => {
    try {
      await api.post(`/transactions/${id}/restore`);
      toast.success('Transaction restored.');
      openPanel('deleted');
      load();
      loadAnomalyCounts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openHistory = async (transaction) => {
    setHistoryFor({ transaction, logs: null });
    try {
      const { logs } = await api.get(`/transactions/${transaction._id}/history`);
      setHistoryFor({ transaction, logs });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const items = data?.items || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-sub">Every entry you have logged, with the full history kept.</p>
        </div>

        <div className="row gap-2 wrap hide-print transaction-page-actions">
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add entry</Button>
        </div>
      </div>

      <div className="grid grid-split mb-3">
        <Card title="Most used categories" note="Share of entries in the current view">
          {data?.categoryUsage?.length ? (
            <DonutChart
              data={data.categoryUsage.map((category) => ({ ...category, total: category.amount }))}
              currency={currency}
              metric="count"
              centerLabel="Entries"
              size={176}
              thickness={25}
            />
          ) : (
            <Empty icon="chart" title="No category activity yet">
              Categories will appear here as you add transactions.
            </Empty>
          )}
        </Card>

        <Card className="spending-patterns-card" title="Spending patterns" note="Duplicate and unusually large expenses · last 90 days">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Activity</th><th className="right">Count</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="row gap-2">
                      <span className="cat-dot" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><Icon name="copy" size={14} /></span>
                      <span>Duplicate entries</span>
                    </span>
                  </td>
                  <td className="right"><Chip tone={anomalyCounts.duplicateCount ? 'warn' : undefined}>{anomalyCounts.duplicateCount}</Chip></td>
                </tr>
                <tr>
                  <td>
                    <span className="row gap-2">
                      <span className="cat-dot" style={{ background: 'var(--expense-soft)', color: 'var(--expense)' }}><Icon name="trendUp" size={14} /></span>
                      <span>Large spending</span>
                    </span>
                  </td>
                  <td className="right"><Chip tone={anomalyCounts.largeCount ? 'warn' : undefined}>{anomalyCounts.largeCount}</Chip></td>
                </tr>
              </tbody>
            </table>
          </div>
          {anomalyCounts.duplicateCount === 0 && anomalyCounts.largeCount === 0 && (
            <p className="tiny muted mt-2">No duplicates or unusually large expenses were found in this period.</p>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------- filters */}
      <section className="transaction-filter-bar mb-3" aria-label="Filter transactions">
        <div className="transaction-filter-primary">
          <Field label="Search">
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                className="input"
                style={{ paddingLeft: '2.1rem' }}
                value={filters.q}
                onChange={(e) => setFilter('q', e.target.value)}
                placeholder="Description or note"
              />
            </div>
          </Field>

          <Field label="Type">
            <select className="select" value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
              <option value="">All</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </Field>

          <Field label="Category">
            <select className="select" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
              <option value="">All categories</option>
              <optgroup label="Expense">
                {categories.filter((c) => c.type === 'expense').map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Income">
                {categories.filter((c) => c.type === 'income').map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </optgroup>
            </select>
          </Field>

          <div className="transaction-filter-actions">
            <Button
              size="sm"
              variant="outline"
              icon="trash"
              onClick={() => openPanel('deleted')}
            >
              Deleted transactions
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon="sliders"
              aria-expanded={advancedFiltersOpen}
              aria-controls="transaction-advanced-filters"
              onClick={() => setAdvancedFiltersOpen((open) => !open)}
            >
              {advancedFiltersOpen ? 'Hide filters' : 'More filters'}
              {activeAdvancedFilterCount > 0 ? ` · ${activeAdvancedFilterCount}` : ''}
            </Button>
            {activeFilterCount > 0 && (
              <Button size="sm" variant="quiet" icon="x" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div
          id="transaction-advanced-filters"
          className="transaction-filter-advanced"
          hidden={!advancedFiltersOpen}
        >
            <div className="transaction-filter-details">
              <Field label="From">
                <input
                  type="date"
                  className="input"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(e) => setFilter('from', e.target.value)}
                />
              </Field>

              <Field label="To">
                <input
                  type="date"
                  className="input"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(e) => setFilter('to', e.target.value)}
                />
              </Field>

              <Field label="Payment method">
                <select className="select" value={filters.paymentMethod} onChange={(e) => setFilter('paymentMethod', e.target.value)}>
                  <option value="">All methods</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="digital_wallet">Digital wallet</option>
                </select>
              </Field>

              <Field label="Minimum amount">
                <input type="number" className="input" min="0" step="0.01" value={filters.minAmount} onChange={(e) => setFilter('minAmount', e.target.value)} />
              </Field>

              <Field label="Maximum amount">
                <input type="number" className="input" min="0" step="0.01" value={filters.maxAmount} onChange={(e) => setFilter('maxAmount', e.target.value)} />
              </Field>

              <Field label="Sort by">
                <select
                  className="select"
                  value={`${sort.sort}:${sort.order}`}
                  onChange={(e) => {
                    const [s, o] = e.target.value.split(':');
                    setSort({ sort: s, order: o });
                  }}
                >
                  <option value="date:desc">Newest first</option>
                  <option value="date:asc">Oldest first</option>
                  <option value="amount:desc">Largest amount</option>
                  <option value="amount:asc">Smallest amount</option>
                </select>
              </Field>
            </div>

            <div className="row gap-2 wrap">
              {[
                { key: 'flagged', value: 'true', label: 'Needs a look' },
                { key: 'source', value: 'recurring', label: 'From a rule' },
                { key: 'source', value: 'csv', label: 'Imported' }
              ].map((chip) => (
                <button
                  key={chip.label}
                  className={`filter-chip ${filters[chip.key] === chip.value ? 'on' : ''}`}
                  onClick={() => setFilter(chip.key, filters[chip.key] === chip.value ? '' : chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
        </div>
      </section>

      {/* --------------------------------------------------------- table */}
      <Card className="flush">
        {loading ? (
          <div className="stack gap-2" style={{ padding: '1.2rem' }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={44} />)}
          </div>
        ) : items.length === 0 ? (
          <Empty
            icon="list"
            title={activeFilterCount ? 'Nothing matches those filters' : 'No transactions yet'}
            action={
              activeFilterCount
                ? <Button onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button>
                : <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add your first entry</Button>
            }
          >
            {activeFilterCount
              ? 'Try widening the date range or clearing the category filter.'
              : 'Log what you spend and receive — everything else in the app is built from these entries.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th className="right">Amount</th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t._id}>
                    <td>
                      <div className="row gap-2">
                        <div style={{ minWidth: 0 }}>
                          <div className="strong">{t.description || <span className="dim">No description</span>}</div>
                          <div className="row gap-1 wrap mt-1">
                            {t.isRecurring && <Chip tone="honey"><Icon name="repeat" size={11} /> Repeats</Chip>}
                            {t.source === 'recurring' && <Chip><Icon name="repeat" size={11} /> Auto</Chip>}
                            {t.source === 'csv' && <Chip><Icon name="upload" size={11} /> Imported</Chip>}
                            {t.flags?.unusuallyLarge && <Chip tone="warn"><Icon name="alert" size={11} /> Unusually large</Chip>}
                            {t.flags?.possibleDuplicate && <Chip tone="warn"><Icon name="copy" size={11} /> Possible duplicate</Chip>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="row gap-2">
                        <CategoryMark category={t.category} size={26} />
                        <span className="small">{t.category?.name}</span>
                      </span>
                    </td>
                    <td className="small muted nowrap">{shortDate(t.date)}</td>
                    <td className={`right strong tabular nowrap ${t.type === 'income' ? 'money-in' : 'money-out'}`}>
                      {t.type === 'income' ? '+' : '−'}{money(t.amount, currency)}
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="icon-btn" onClick={() => openHistory(t)} title="History" aria-label="History">
                          <Icon name="history" size={15} />
                        </button>
                        <button className="icon-btn" onClick={() => setEditing(t)} title="Edit" aria-label="Edit">
                          <Icon name="edit" size={15} />
                        </button>
                        <button className="icon-btn" onClick={() => setConfirming(t)} title="Delete" aria-label="Delete">
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
      </Card>

      <section className="stack gap-2 mt-4" aria-labelledby="recurring-payments-title">
        <div className="row-between wrap gap-2">
          <div>
            <h2 id="recurring-payments-title" className="card-title">Recurring payments</h2>
            <p className="card-note">Manage scheduled income and expenses. Past entries remain in your transaction history.</p>
          </div>
          <Button variant="primary" icon="plus" onClick={() => openRecurringEditor()}>Add entry</Button>
        </div>
        <Card className="flush">
          {recurringLoading ? (
            <div className="stack gap-2" style={{ padding: '1.2rem' }}>
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={44} />)}
            </div>
          ) : recurringItems.length === 0 ? (
            <Empty icon="repeat" title="No recurring payments yet">
              Add an entry to schedule a payment or income on a weekly, monthly, or yearly schedule.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Name / description</th>
                    <th>Category</th>
                    <th>Schedule</th>
                    <th className="right">Amount</th>
                    <th style={{ width: 150 }} />
                  </tr>
                </thead>
                <tbody>
                  {recurringItems.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <div className="strong">{item.name}</div>
                        {item.description && <div className="tiny muted mt-1">{item.description}</div>}
                        {!item.active && <Chip tone="warn">Paused</Chip>}
                      </td>
                      <td>
                        <span className="row gap-2">
                          <CategoryMark category={item.category} size={26} />
                          <span className="small">{item.category?.name}</span>
                        </span>
                      </td>
                      <td className="small muted">
                        <div>Every {item.frequency === 'yearly' ? 'year' : item.frequency === 'weekly' ? 'week' : 'month'}</div>
                        <div className="tiny">Next: {shortDate(item.nextRunOn)}</div>
                        {item.endDate && <div className="tiny">Until: {shortDate(item.endDate)}</div>}
                      </td>
                      <td className={`right strong tabular nowrap ${item.type === 'income' ? 'money-in' : 'money-out'}`}>
                        {item.type === 'income' ? '+' : '−'}{money(item.amount, currency)}
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="icon-btn" onClick={() => openRecurringEditor(item)} title="Edit recurring payment" aria-label="Edit recurring payment">
                            <Icon name="edit" size={15} />
                          </button>
                          <button className="icon-btn" onClick={() => toggleRecurring(item)} title={item.active ? 'Pause recurring payment' : 'Resume recurring payment'} aria-label={item.active ? 'Pause recurring payment' : 'Resume recurring payment'}>
                            <Icon name={item.active ? 'minus' : 'refresh'} size={15} />
                          </button>
                          <button className="icon-btn" onClick={() => setRecurringDelete(item)} title="Delete recurring payment" aria-label="Delete recurring payment">
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <Modal
        open={Boolean(recurringEditor)}
        onClose={() => setRecurringEditor(null)}
        title={recurringEditor === 'new' ? 'Add recurring payment' : 'Edit recurring payment'}
        subtitle="Choose what repeats and when it should run."
      >
        <form onSubmit={saveRecurring} className="stack gap-3">
          <Field label="Name" required>
            <input className="input" value={recurringForm.name} maxLength={100} onChange={(e) => setRecurringForm({ ...recurringForm, name: e.target.value })} placeholder="e.g. Rent or allowance" />
          </Field>
          <Field label="Description">
            <textarea className="input" rows={2} maxLength={400} value={recurringForm.description} onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })} placeholder="Optional details" />
          </Field>
          <div className="grid grid-2">
            <Field label="Type" required>
              <select className="select" value={recurringForm.type} onChange={(e) => setRecurringForm({ ...recurringForm, type: e.target.value, category: '' })}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </Field>
            <Field label="Category" required>
              <select className="select" value={recurringForm.category} onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })}>
                <option value="">Choose a category…</option>
                {categories.filter((category) => category.type === recurringForm.type && !category.isArchived).map((category) => (
                  <option key={category._id} value={category._id}>{category.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-2">
            <Field label="Amount" required>
              <input type="number" className="input" min="0.01" step="0.01" value={recurringForm.amount} onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Repeat" required>
              <select className="select" value={recurringForm.frequency} onChange={(e) => setRecurringForm({ ...recurringForm, frequency: e.target.value })}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-2">
            <Field label="Start date" required>
              <input type="date" className="input" value={recurringForm.startDate} onChange={(e) => setRecurringForm({ ...recurringForm, startDate: e.target.value })} />
            </Field>
            <Field label="End date" hint="Leave blank to repeat until paused or deleted.">
              <input type="date" className="input" min={recurringForm.startDate} value={recurringForm.endDate} onChange={(e) => setRecurringForm({ ...recurringForm, endDate: e.target.value })} />
            </Field>
          </div>
          <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="quiet" onClick={() => setRecurringEditor(null)} disabled={recurringBusy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={recurringBusy}>{recurringEditor === 'new' ? 'Add entry' : 'Save changes'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(recurringDelete)}
        title="Delete this recurring payment?"
        message={recurringDelete ? `Future ${recurringDelete.frequency} entries for “${recurringDelete.name}” will stop. Past transactions will stay in your history.` : ''}
        confirmLabel="Delete"
        busy={recurringBusy}
        onConfirm={removeRecurring}
        onCancel={() => setRecurringDelete(null)}
      />

      {/* -------------------------------------------------- add / edit */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a transaction' : 'Edit transaction'}
      >
        <TransactionForm
          categories={categories}
          initial={editing === 'new' ? null : editing}
          onSaved={() => {
            setEditing(null);
            load();
            loadAnomalyCounts();
          }}
          onCancel={() => setEditing(null)}
          onScanReceipt={() => {
            setEditing(null);
            setScanOpen(true);
          }}
        />
      </Modal>

      <ReceiptScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        categories={categories}
        onSaved={() => { load(); loadAnomalyCounts(); }}
        onEdit={(t) => setEditing(t)}
        onManualPrefill={(p) => setEditing(p)}
      />

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete this transaction?"
        message={
          confirming
            ? `"${confirming.description || confirming.category?.name}" for ${money(confirming.amount, currency)} will be removed from your reports. It stays in the deleted list so you can restore it.`
            : ''
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(null)}
      />

      {/* ---------------------------------------------------- side panels */}
      <Modal
        open={Boolean(panel)}
        onClose={closePanel}
        wide
        title={
          panel === 'deleted' ? 'Deleted transactions'
            : panel === 'recurring' ? 'Recurring entries'
              : 'Entries worth a second look'
        }
        subtitle={
          panel === 'deleted' ? 'Deleting only hides an entry from reports — nothing is lost.'
            : panel === 'recurring' ? 'These generate a new entry on their own schedule.'
              : 'Flagged automatically by comparing each entry against your own averages.'
        }
      >
        {!panelData ? (
          <div className="stack gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={52} />)}</div>
        ) : panel === 'deleted' ? (
          panelData.items.length === 0 ? (
            <Empty icon="trash" title="Nothing deleted">Entries you delete will appear here.</Empty>
          ) : (
            panelData.items.map((t) => (
              <div key={t._id} className="tx-card">
                <CategoryMark category={t.category} />
                <div className="grow">
                  <div className="small strong">{t.description || t.category?.name}</div>
                  <div className="tiny dim">Deleted {relativeTime(t.deletedAt)} · was {shortDate(t.date)}</div>
                </div>
                <span className="small tabular muted">{money(t.amount, currency)}</span>
                <Button size="sm" icon="refresh" onClick={() => restore(t._id)}>Restore</Button>
              </div>
            ))
          )
        ) : panel === 'recurring' ? (
          panelData.items.length === 0 ? (
            <Empty icon="repeat" title="No recurring entries">
              Tick "Repeat this entry" when adding something like your allowance or a subscription.
            </Empty>
          ) : (
            panelData.items.map((t) => (
              <div key={t._id} className="tx-card">
                <CategoryMark category={t.category} />
                <div className="grow">
                  <div className="small strong">{t.description || t.category?.name}</div>
                  <div className="tiny dim">
                    {t.recurrence?.frequency === 'weekly' ? 'Every week' : 'Every month'} ·
                    {' '}next on {shortDate(t.recurrence?.nextRunOn)}
                    {t.recurrence?.active === false && ' · stopped'}
                  </div>
                </div>
                <span className={`small strong tabular ${t.type === 'income' ? 'money-in' : 'money-out'}`}>
                  {money(t.amount, currency)}
                </span>
                <Button size="sm" icon="edit" onClick={() => { setPanel(null); setEditing(t); }}>Edit</Button>
              </div>
            ))
          )
        ) : (
          <div className="stack gap-3">
            <div>
              <h3 className="card-title mb-2">Unusually large</h3>
              {panelData.large.length === 0 ? (
                <p className="small dim">Nothing stands out against your usual amounts.</p>
              ) : (
                panelData.large.map((row) => (
                  <div key={row.id} className="tx-card">
                    <span className="cat-dot" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                      <Icon name="trendUp" size={15} />
                    </span>
                    <div className="grow">
                      <div className="small strong">{row.description}</div>
                      <div className="tiny dim">
                        {row.category} · {shortDate(row.date)} · about {row.timesAverage}× your usual {money(row.categoryAverage, currency)}
                      </div>
                    </div>
                    <span className="small strong tabular money-out">{money(row.amount, currency)}</span>
                  </div>
                ))
              )}
            </div>

            <div>
              <h3 className="card-title mb-2">Possible duplicates</h3>
              {panelData.duplicates.length === 0 ? (
                <p className="small dim">No entries look like accidental repeats.</p>
              ) : (
                panelData.duplicates.map((row) => (
                  <div key={row.id} className="tx-card">
                    <span className="cat-dot" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                      <Icon name="copy" size={15} />
                    </span>
                    <div className="grow">
                      <div className="small strong">{row.description}</div>
                      <div className="tiny dim">
                        Same amount and category as an entry {row.gapDays} day{row.gapDays === 1 ? '' : 's'} earlier
                      </div>
                    </div>
                    <span className="small strong tabular money-out">{money(row.amount, currency)}</span>
                  </div>
                ))
              )}
            </div>

            <Banner icon="info">
              These are prompts to check, not corrections. Nothing has been changed.
            </Banner>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------- history */}
      <Modal
        open={Boolean(historyFor)}
        onClose={() => setHistoryFor(null)}
        title="Entry history"
        subtitle={historyFor?.transaction?.description || historyFor?.transaction?.category?.name}
      >
        {!historyFor?.logs ? (
          <div className="stack gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={40} />)}</div>
        ) : historyFor.logs.length === 0 ? (
          <Empty icon="history" title="No history recorded" />
        ) : (
          <div className="stack gap-2">
            {historyFor.logs.map((log) => (
              <div key={log._id} className="row gap-3" style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--line)' }}>
                <span className="cat-dot" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                  <Icon
                    name={log.action === 'deleted' ? 'trash' : log.action === 'updated' ? 'edit' : log.action === 'viewed' ? 'eye' : 'plus'}
                    size={14}
                  />
                </span>
                <div className="grow">
                  <div className="small strong" style={{ textTransform: 'capitalize' }}>{log.action}</div>
                  {log.changes?.length > 0 && (
                    <div className="tiny dim">Changed: {log.changes.join(', ')}</div>
                  )}
                </div>
                <span className="tiny dim nowrap">{longDate(log.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
