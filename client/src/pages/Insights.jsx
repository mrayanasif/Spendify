import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import {
  Card, Button, Empty, Chip, Skeleton
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, monthKey, monthLabel, longDate } from '../lib/format';

/** Small icon for a highlight chip, chosen from its label. */
function highlightIcon(label = '') {
  const text = String(label).toLowerCase();
  if (text.includes('balance')) return 'wallet';
  if (text.includes('food')) return 'bowl';
  if (text.includes('budget')) return 'target';
  if (text.includes('categor')) return 'tag';
  if (text.includes('subscription')) return 'repeat';
  if (text.includes('rise') || text.includes('up')) return 'trendUp';
  return 'sparkle';
}

export default function Insights() {
  const { currency } = useAuth();
  const toast = useToast();

  const [month, setMonth] = useState(monthKey());
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ insight }, { insights }] = await Promise.all([
        api.get(`/insights/${month}`),
        api.get('/insights')
      ]);
      setCurrent(insight);
      setHistory(insights);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const regenerate = async () => {
    setGenerating(true);
    try {
      await api.post('/insights/generate', { month });
      toast.success('Summary rebuilt from your latest entries.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const toggleBookmark = async (id) => {
    try {
      const res = await api.patch(`/insights/${id}/bookmark`);
      toast.success(res?.bookmarked ? 'Summary saved to bookmarks.' : 'Summary removed from bookmarks.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Small visual aids for the hero strip, all derived from stored stats.
  const stats = current?.stats || {};
  const flow = (Number(stats.income) || 0) + (Number(stats.expense) || 0);
  const incomePercent = flow > 0 ? Math.round(((Number(stats.income) || 0) / flow) * 100) : 0;
  const spentPercent = flow > 0 ? 100 - incomePercent : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Monthly insights</h1>
          <p className="page-sub">A short review of each month, written from your own entries.</p>
        </div>

        <div className="row gap-2 wrap hide-print">
          <Button variant="primary" icon="refresh" loading={generating} onClick={regenerate}>
            Rebuild summary
          </Button>
        </div>
      </div>

      <div className="grid grid-split">
        {/* ---------------------------------------------- current month */}
        <div className="stack gap-3">
          {loading && !current ? (
            <Skeleton height={320} radius={18} />
          ) : !current ? (
            <Card>
              <Empty
                icon="book"
                title={`Nothing written for ${monthLabel(month)} yet`}
                action={<Button variant="primary" onClick={regenerate} loading={generating}>Generate summary</Button>}
              >
                The summary reads your transactions for the month and describes what changed, in plain language.
              </Empty>
            </Card>
          ) : (
            <Card className="insight-summary-card">
              <div className="insight-hero">
                <div className="row-between wrap gap-2">
                  <div>
                    <span className="eyebrow">Summary</span>
                    <h2 className="insight-month">{monthLabel(month)}</h2>
                  </div>
                  <Button
                    size="sm"
                    icon="bookmark"
                    variant={current.bookmarked ? 'primary' : 'ghost'}
                    onClick={() => toggleBookmark(current._id)}
                  >
                    {current.bookmarked ? 'Saved' : 'Save'}
                  </Button>
                </div>

                {current.stats && (
                  <>
                    <div className="insight-figures">
                      <div>
                        <span>Received</span>
                        <b className="money-in">{money(stats.income || 0, currency)}</b>
                      </div>
                      <div>
                        <span>Spent</span>
                        <b className="money-out">{money(stats.expense || 0, currency)}</b>
                      </div>
                      <div>
                        <span>Left</span>
                        <b>{money(stats.balance || 0, currency)}</b>
                      </div>
                    </div>

                    {flow > 0 && (
                      <div className="insight-flow" aria-hidden="true">
                        <i className="insight-flow-in" style={{ width: `${incomePercent}%` }} />
                        <i className="insight-flow-out" style={{ width: `${spentPercent}%` }} />
                      </div>
                    )}
                  </>
                )}
              </div>

              <p className="insight-body">{current.summaryText}</p>

              {current.tipText && (
                <div className="mt-3">
                  <span className="eyebrow">What to try next month</span>
                  <p className="insight-quote mt-1">{current.tipText}</p>
                </div>
              )}

              {current.highlights?.length > 0 && (
                <div className="highlight-grid mt-4">
                  {current.highlights.map((h) => (
                    <div key={h.label} className="highlight" data-tone={h.tone} data-label={h.label.toLowerCase()}>
                      <span className="highlight-icon">
                        <Icon name={highlightIcon(h.label)} size={14} />
                      </span>
                      <div className="tiny dim row gap-1 insight-highlight-label" title={h.label}>
                        {h.direction !== 'flat' && (
                          <Icon name={h.direction === 'up' ? 'trendUp' : 'trendDown'} size={12} />
                        )}
                        {h.label}
                      </div>
                      <div className="strong insight-highlight-value" title={h.value}>{h.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {current.stats?.categories?.length > 0 && (
                <div className="mt-4">
                  <span className="eyebrow">Categories this month</span>
                  <div className="table-wrap mt-2">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th className="right">Spent</th>
                          <th className="right">vs your average</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.stats.categories.map((row) => (
                          <tr key={row.name}>
                            <td>
                              <span className="row gap-2">
                                <span className="chip-dot insight-category-dot" />
                                <span className="small strong">{row.name}</span>
                              </span>
                            </td>
                            <td className="right small tabular">{money(row.total, currency)}</td>
                            <td className="right small tabular">
                              {row.changePercent === null ? (
                                <span className="dim">new</span>
                              ) : (
                                <span className={row.changePercent > 0 ? 'money-out' : 'money-in'}>
                                  {row.changePercent > 0 ? '+' : ''}{Math.round(row.changePercent)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="tiny dim mt-3">
                Generated {longDate(current.generatedAt)} from your entries. Not financial advice.
              </p>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------------ history */}
        <div className="stack gap-3">
          <Card title="Past months" note="Every summary is kept so you can look back.">
            {history.length === 0 ? (
              <Empty icon="history" title="No history yet">Summaries you generate are stored here.</Empty>
            ) : (
              <div className="stack gap-2">
                {history.map((item) => (
                  <button
                    key={item._id}
                    className={`tip ${item.month === month ? 'tip-selected' : ''}`}
                    style={{ textAlign: 'left', width: '100%' }}
                    onClick={() => setMonth(item.month)}
                  >
                    <div className="grow">
                      <div className="row-between gap-2">
                        <span className="strong small">{item.monthLabel || monthLabel(item.month)}</span>
                        <span className="row gap-1">
                          {item.bookmarked && <Icon name="bookmark" size={13} style={{ color: 'var(--honey-deep)' }} />}
                          <span className={`tiny tabular strong ${item.stats?.balance >= 0 ? 'money-in' : 'money-out'}`}>
                            {money(item.stats?.balance || 0, currency)}
                          </span>
                        </span>
                      </div>
                      {item.stats?.topCategory && (
                        <Chip tone="outline">
                          Top: {item.stats.topCategory.name}
                        </Chip>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="How this is written">
            <ul className="stack gap-3 small muted">
              {[
                { icon: 'chart', text: 'Compared with your recent monthly average.' },
                { icon: 'alert', text: 'Notable category changes are highlighted.' },
                { icon: 'target', text: 'Budgets and spending trends are checked.' }
              ].map((line) => (
                <li key={line.text} className="row gap-3">
                  <span className="cat-dot insight-method-icon" style={{ width: 28, height: 28 }}>
                    <Icon name={line.icon} size={14} />
                  </span>
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>

            <p className="small muted mt-3">Built only from your own transactions.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
