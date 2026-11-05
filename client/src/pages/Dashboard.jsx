import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import {
  Card, Button, Modal, Empty, Progress, CategoryMark, Banner,
  CardSkeleton, AdvisoryNote
} from '../components/ui';
import { BudgetVsActualChart, DonutChart, GroupedBarChart, Sparkline } from '../components/charts';
import TransactionForm from '../components/TransactionForm';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, percent, shortDate, monthKey, greeting } from '../lib/format';

export default function Dashboard() {
  const { user, currency, patchUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [month] = useState(monthKey());
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // null | 'expense' | 'income'
  const [borrowPrompt, setBorrowPrompt] = useState(null); // { needBorrow, need, borrowOptions, ... }
  const [pendingExpense, setPendingExpense] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, cats] = await Promise.all([
        api.get('/dashboard', { month }),
        api.get('/categories')
      ]);
      if (dashboard.savings?.balance !== undefined && dashboard.savings.balance !== user?.currentSavings) {
        patchUser({ currentSavings: dashboard.savings.balance });
      }
      setData(dashboard);
      setCategories(cats.categories);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, toast, patchUser, user?.currentSavings]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll('.dashboard-grid > *'));
    if (!cards.length) return undefined;

    cards.forEach((card, index) => {
      card.classList.add('dashboard-reveal');
      card.style.setProperty('--reveal-delay', `${Math.min(index * 45, 180)}ms`);
    });

    if (!('IntersectionObserver' in window)) {
      cards.forEach((card) => card.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
    }, { threshold: 0.14 });

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [data]);

  const generateInsight = async () => {
    try {
      await api.post('/insights/generate', { month });
      toast.success('Monthly summary generated.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const actOnTip = async (id, action) => {
    try {
      await api.patch(`/tips/${id}`, { action });
      toast.success(action === 'dismiss' ? 'Tip dismissed.' : action === 'save' ? 'Tip saved.' : 'Tip updated.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading && !data) {
    return (
      <>
        <div className="page-head dashboard-page-head">
          <div><h1 className="page-title dashboard-page-title">Dashboard</h1></div>
        </div>
        <div className="grid grid-split">
          <div className="stack gap-3">
            <CardSkeleton height={160} />
            <CardSkeleton height={220} />
          </div>
          <div className="stack gap-3">
            <CardSkeleton height={200} />
            <CardSkeleton height={160} />
          </div>
        </div>
      </>
    );
  }

  if (!data) return <Empty icon="alert" title="Could not load your dashboard" action={<Button onClick={load}>Try again</Button>}>Check that the API server is running.</Empty>;

  const { totals, savings, budgets, budgetSummary, topCategory, breakdown, trend, tips, insight, recent, announcements, spentChange, alerts: dashboardAlerts } = data;

  const visibleAnnouncements = announcements.filter(
    (notice) => notice.title?.trim().toLowerCase() !== 'welcome to Spendify'
  );
  const spendTrend = trend.map((t) => t.expense);
  const savingsRate = totals.income > 0
    ? Math.round((totals.balance / totals.income) * 100)
    : 0;
  const alertCopy = {
    using_savings: 'This expense is using savings.',
    savings_warning: 'Spending is nearing your savings goal.',
    expense_limit: 'Expenses are higher than income this month.'
  };

  return (
    <>
      {/* ------------------------------------------------------ page head */}
      <div className="page-head dashboard-page-head">
        <div>
          <p className="eyebrow" style={{ color: 'var(--primary)' }}>
            Student cockpit · {data.monthLabel}
          </p>
          <h1 className="page-title dashboard-page-title">{greeting()}, {data.greetingName}</h1>
        </div>
        <div className="row gap-2 wrap hide-print">
          <Button variant="primary" icon="plus" onClick={() => setAdding('expense')}>Add entry</Button>
        </div>
      </div>

      <section className="dashboard-summary-grid" aria-label="Monthly financial summary">
        <article className="dashboard-summary-card balance">
          <div className="dashboard-summary-card-top">
            <span className="dashboard-summary-icon"><Icon name="coins" size={20} /></span>
            {spendTrend.length > 1 && (
              <Sparkline values={spendTrend} width={86} height={32} color="var(--chart-blue)" />
            )}
          </div>
          <span className="tiny-label">Available balance</span>
          <strong>{money(totals.spendableBalance ?? totals.balance, currency)}</strong>
          <p>{(totals.spendableBalance ?? totals.balance) >= 0 ? 'You are in a healthy lane.' : 'Spending is above income.'}</p>
          <span className="dashboard-summary-detail">
            Savings {money(savings.balance || 0, currency)}
          </span>
        </article>

        <article className="dashboard-summary-card income">
          <div className="dashboard-summary-card-top">
            <span className="dashboard-summary-icon"><Icon name="down" size={20} /></span>
          </div>
          <span className="tiny-label">Total income</span>
          <strong>{money(totals.income, currency)}</strong>
          <p>This month · {totals.incomeEntryCount ?? totals.incomeCount} entries</p>
        </article>

        <article className="dashboard-summary-card expense">
          <div className="dashboard-summary-card-top">
            <span className="dashboard-summary-icon"><Icon name="up" size={20} /></span>
          </div>
          <span className="tiny-label">Total expenses</span>
          <strong>{money(totals.expense, currency)}</strong>
          <p>
            {spentChange === null
              ? `This month · ${totals.expenseEntryCount ?? totals.expenseCount} entries`
              : `This month · ${spentChange >= 0 ? '+' : ''}${percent(spentChange)} vs last month`}
          </p>
        </article>

        <article className="dashboard-summary-card savings">
          <div className="dashboard-summary-card-top">
            <span className="dashboard-summary-icon"><Icon name="trendUp" size={20} /></span>
          </div>
          <span className="tiny-label">Savings rate</span>
          <strong>{savingsRate}%</strong>
          <p>Net balance / income</p>
          {savings.goal > 0 && (
            <span className="dashboard-summary-detail">
              Goal {money(savings.goal, currency)} · {savings.percent === null ? '—' : percent(Math.max(0, savings.percent))}
            </span>
          )}
        </article>
      </section>

      {/* --------------------------------------------------- alerts */}
      {dashboardAlerts?.length > 0 && (
        <div className="stack gap-2 mb-3">
          {dashboardAlerts.map((alert, idx) => (
            <Banner key={idx} tone={alert.level === 'danger' ? 'danger' : 'warn'} icon="alert" title={alert.type === 'using_savings' ? 'Savings Alert' : alert.type === 'savings_warning' ? 'Savings Warning' : 'Expense Limit Alert'}>
              {alertCopy[alert.type] || alert.message}
            </Banner>
          ))}
        </div>
      )}

      {/* --------------------------------------------------- announcement */}
      {visibleAnnouncements.length > 0 && (
        <div className="stack gap-2 mb-3">
          {visibleAnnouncements.map((notice) => (
            <Banner key={notice._id} tone="honey" icon="megaphone" title={notice.title}>
              {notice.body}
            </Banner>
          ))}
        </div>
      )}

      <div className="dashboard-grid dashboard-content-grid">
          {/* --- income vs expense --- */}
          <Card
            title="Income vs spending"
            note="Compare what came in with what you spent each month."
            action={<Link to="/app/reports"><Button size="sm" icon="chart">Reports</Button></Link>}
          >
            <GroupedBarChart data={trend} currency={currency} />
          </Card>

          {/* --- budget vs actual --- */}
          <Card
            title="Budget vs actual"
            action={<Link to="/app/budgets"><Button size="sm" icon="target">Budgets</Button></Link>}
          >
            {budgets.length === 0 ? (
              <Empty icon="target" title="No budgets set yet" action={<Link to="/app/budgets"><Button variant="primary" size="sm">Set your first budget</Button></Link>}>
                Give your heaviest categories a monthly cap and this widget will track them in real time.
              </Empty>
            ) : (
              <BudgetVsActualChart data={budgets} currency={currency} />
            )}
          </Card>

          {/* --- tips --- */}
          <Card
            title="Saving tips"
            action={<Link to="/app/tips"><Button size="sm">All tips</Button></Link>}
          >
            {tips.length === 0 ? (
              <Empty icon="bulb" title="No tips yet">Tips will appear as you log expenses.</Empty>
            ) : (
              <div className="stack gap-2">
                {tips.map((tip, index) => (
                  <article key={tip._id} className={`tip ${tip.status === 'pinned' ? 'pinned' : ''}`}>
                    <span className="tip-rank">{index + 1}</span>
                    <div className="grow">
                      <div className="row-between gap-2">
                        <span className="strong small">{tip.title}</span>
                        {tip.potentialSaving > 0 && (
                          <span className="saving-badge">save {money(tip.potentialSaving, currency)}</span>
                        )}
                      </div>
                      <p className="tiny muted mt-1">{tip.body}</p>
                      <div className="row gap-1 mt-2">
                        <Button
                          size="sm"
                          variant="quiet"
                          icon="pin"
                          onClick={() => actOnTip(tip._id, tip.status === 'pinned' ? 'unpin' : 'pin')}
                        >
                          {tip.status === 'pinned' ? 'Unpin' : 'Pin'}
                        </Button>
                        <Button size="sm" variant="quiet" icon="x" onClick={() => actOnTip(tip._id, 'dismiss')}>
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
                <AdvisoryNote />
              </div>
            )}
          </Card>

          {/* --- top category and category split --- */}
          <Card title="This month's top category">
            <div className="dashboard-category-combo">
              <div className="dashboard-category-lead">
                {topCategory ? (
                  <>
                    <div className="row gap-3" style={{ alignItems: 'center' }}>
                      <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--primary-soft) 0%, var(--primary-border) 100%)',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 12px color-mix(in srgb, var(--primary) 18%, transparent)'
                      }}>
                        <CategoryMark category={topCategory} size={42} style={{ background: 'transparent' }} />
                      </div>
                      <div className="grow">
                        <div className="figure" style={{ fontSize: '1.6rem' }}>{money(topCategory.total, currency)}</div>
                        <div className="small muted">
                          {topCategory.name} · {percent(topCategory.share)} of all spending
                        </div>
                      </div>
                    </div>
                    <p className="small dim mt-2">
                      {topCategory.count} entries, largest {money(topCategory.largest, currency)}.
                    </p>
                  </>
                ) : (
                  <Empty icon="tag" title="Nothing logged yet">Add an expense and it will show up here.</Empty>
                )}
              </div>
              <div className="dashboard-category-chart">
                <h3 className="small strong mb-2">Spending by category</h3>
                <DonutChart data={breakdown} currency={currency} centerLabel="Spent" size={172} thickness={23} />
              </div>
            </div>
          </Card>

          {/* --- monthly insight --- */}
          <Card
            title="Monthly summary"
            action={
              <Button size="sm" icon="refresh" onClick={generateInsight}>
                {insight ? 'Refresh' : 'Generate'}
              </Button>
            }
          >
            {insight ? (
              <>
                <p className="insight-body small">{insight.summaryText}</p>
                {insight.tipText && (
                  <p className="insight-quote mt-3 small">{insight.tipText}</p>
                )}
                {insight.highlights?.length > 0 && (
                  <div className="highlight-grid mt-3">
                    {insight.highlights.slice(0, 4).map((h) => (
                      <div key={h.label} className="highlight" data-tone={h.tone}>
                        <div className="tiny dim">{h.label}</div>
                        <div className="strong small">{h.value}</div>
                      </div>
                    ))}
                  </div>
                )}
                <AdvisoryNote />
              </>
            ) : (
              <Empty icon="book" title="No summary yet" action={<Button variant="primary" size="sm" onClick={generateInsight}>Generate</Button>} />
            )}
          </Card>

          {/* --- recent --- */}
          <Card
            title="Recent entries"
            action={<Link to="/app/transactions"><Button size="sm">All entries</Button></Link>}
          >
            {recent.length === 0 ? (
              <Empty icon="list" title="Nothing logged yet">Your latest entries will appear here.</Empty>
            ) : (
              <div className="mt-2">
                {recent.map((t) => (
                  <button
                    key={t._id}
                    className="tx-card"
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => navigate('/app/transactions')}
                  >
                    <CategoryMark category={t.category} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="small strong nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.description || t.category?.name}
                      </div>
                      <div className="tiny dim">{t.category?.name} · {shortDate(t.date)}</div>
                    </div>
                    <span className={`small strong tabular ${t.type === 'income' ? 'money-in' : 'money-out'}`}>
                      {t.type === 'income' ? '+' : '−'}{money(t.amount, currency)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
      </div>

      {/* ------------------------------------------------------ add modal */}
      <Modal
        open={Boolean(adding)}
        onClose={() => setAdding(null)}
        title={adding?.type === 'income' || adding === 'income' ? 'Add income' : 'Add an expense'}
        subtitle="Everything except the amount and category is optional."
      >
        <TransactionForm
          categories={categories}
          initial={
            typeof adding === 'object' && adding
              ? adding
              : { type: adding || 'expense' }
          }
          onSaved={(result) => {
            if (result?.needBorrow) {
              setPendingExpense(result._pending || null);
              setBorrowPrompt(result);
              setAdding(null);
            } else {
              if (result?.warnings?.length) {
                result.warnings.forEach(w => {
                  if (w.level === 'danger') toast.error(w.message);
                  else toast.error(w.message);
                });
              }
              setAdding(null);
              load();
            }
          }}
          onCancel={() => setAdding(null)}
        />
      </Modal>

      {/* ------------------------------------------------------ borrow modal */}
      <Modal
        open={Boolean(borrowPrompt)}
        onClose={() => { setBorrowPrompt(null); setPendingExpense(null); }}
        title="Borrow budget from another category"
        subtitle={borrowPrompt?.message || "You don't have budget from this category but you can borrow amount from another category."}
      >
        <div className="stack gap-3">
          <div className="small">
            Need: <b>{money(borrowPrompt?.need || 0, currency)}</b>
          </div>
          <div className="stack gap-2">
            {borrowPrompt?.borrowOptions?.map(opt => (
              <button
                key={opt.categoryId}
                className="row gap-3"
                style={{ padding: '0.6rem 0.8rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', textAlign: 'left', width: '100%' }}
                onClick={async () => {
                  try {
                    if (!pendingExpense) return;
                    const res = await api.post('/transactions', {
                      ...pendingExpense,
                      borrowFromCategory: opt.categoryId,
                      borrowAmount: borrowPrompt.need
                    });
                    toast.success('Expense added with borrowed budget.');
                    setBorrowPrompt(null);
                    setPendingExpense(null);
                    load();
                  } catch (err) {
                    toast.error(err.message);
                  }
                }}
              >
                <CategoryMark category={opt} />
                <div className="grow">
                  <div className="small strong">{opt.name}</div>
                  <div className="tiny muted">Available: {money(opt.available, currency)}</div>
                </div>
                <Button size="sm" variant="primary">Borrow & Add</Button>
              </button>
            ))}
          </div>
          <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
            <Button variant="quiet" onClick={() => { setBorrowPrompt(null); setPendingExpense(null); }}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  if (!pendingExpense) return;
                  await api.post('/transactions', {
                    ...pendingExpense,
                    confirmOverride: true
                  });
                  toast.success('Expense added with your permission.');
                  setBorrowPrompt(null);
                  setPendingExpense(null);
                  load();
                } catch (err) {
                  toast.error(err.message);
                }
              }}
            >
              Confirm & Proceed
            </Button>
          </div>
        </div>
      </Modal>

    </>
  );
}
