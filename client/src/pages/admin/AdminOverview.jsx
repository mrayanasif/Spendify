import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Card, Button, Empty, Chip, Skeleton } from '../../components/ui';
import { RankedBars } from '../../components/charts';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { money, longDate, relativeTime } from '../../lib/format';

export default function AdminOverview() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await api.get('/admin/stats'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !stats) {
    return (
      <>
        <div className="page-head"><h1 className="page-title">Control panel</h1></div>
        <div className="grid grid-4 mb-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={110} radius={18} />)}
        </div>
        <Skeleton height={300} radius={18} />
      </>
    );
  }

  if (!stats) return <Empty icon="alert" title="Could not load statistics" action={<Button onClick={load}>Try again</Button>} />;

  const maxTrend = Math.max(...stats.trend.map((t) => t.transactions), 1);

  const tiles = [
    { label: 'Registered students', value: stats.users.total, note: `${stats.users.new30d} joined in 30 days`, icon: 'users', tone: 'honey' },
    { label: 'Active this month', value: stats.users.active30d, note: `${stats.users.disabled} disabled`, icon: 'user', tone: 'income' },
    { label: 'Transactions logged', value: stats.transactions.total, note: `${stats.transactions.thisMonth} this month`, icon: 'list', tone: 'neutral' },
    { label: 'Average per student', value: stats.transactions.averagePerUser, note: `${stats.categories.personal} personal categories`, icon: 'chart', tone: 'neutral' }
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Control panel</h1>
          <p className="page-sub">System-wide usage across every account.</p>
        </div>
        <Button icon="refresh" onClick={load}>Refresh</Button>
      </div>

      {/* --- headline tiles --- */}
      <div className="grid grid-4 mb-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="stat">
            <span
              className="stat-mark"
              style={{
                background: tile.tone === 'honey' ? 'var(--honey-soft)' : tile.tone === 'income' ? 'var(--income-soft)' : 'var(--surface-3)',
                color: tile.tone === 'honey' ? 'var(--honey-deep)' : tile.tone === 'income' ? 'var(--income)' : 'var(--text-2)'
              }}
            >
              <Icon name={tile.icon} size={16} />
            </span>
            <span className="eyebrow">{tile.label}</span>
            <span className="stat-value figure">{tile.value}</span>
            <span className="stat-foot">{tile.note}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-split">
        <div className="stack gap-3">
          {/* --- activity over time --- */}
          <Card title="Activity over six months" note="New accounts and transactions logged each month.">
            <div className="stack gap-3">
              {stats.trend.map((row) => (
                <div key={row.month} className="stack gap-1">
                  <div className="row-between small">
                    <span className="strong">{row.label}</span>
                    <span className="muted tabular">
                      {row.transactions} transactions
                      {row.signups > 0 && <span className="dim"> · {row.signups} new</span>}
                    </span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(row.transactions / maxTrend) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* --- most used categories --- */}
          <Card title="Most-used categories" note="Across every student account.">
            {stats.topCategories.length === 0 ? (
              <Empty icon="tag" title="No transactions logged yet" />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Type</th>
                      <th className="right">Entries</th>
                      <th className="right">Total value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topCategories.map((row) => (
                      <tr key={row.name + row.type}>
                        <td>
                          <span className="row gap-2">
                            <span className="chip-dot" style={{ background: row.color }} />
                            <span className="small strong">{row.name}</span>
                          </span>
                        </td>
                        <td>
                          <Chip tone={row.type === 'income' ? 'income' : 'expense'}>{row.type}</Chip>
                        </td>
                        <td className="right small tabular">{row.count}</td>
                        <td className="right small tabular strong">{money(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack gap-3">
          <Card title="Value logged" note="The sum of everything students have entered.">
            <div className="stack gap-3">
              <div>
                <span className="eyebrow">Income recorded</span>
                <div className="figure money-in" style={{ fontSize: '1.6rem' }}>{money(stats.transactions.incomeLogged)}</div>
              </div>
              <div>
                <span className="eyebrow">Expenses recorded</span>
                <div className="figure money-out" style={{ fontSize: '1.6rem' }}>{money(stats.transactions.expenseLogged)}</div>
              </div>
              <p className="tiny dim">
                No real money moves through this application. These are the figures students have typed in.
              </p>
            </div>
          </Card>

          <Card
            title="Newest students"
            action={<Link to="/admin/users"><Button size="sm">All students</Button></Link>}
          >
            {stats.recentUsers.length === 0 ? (
              <Empty icon="users" title="No students registered yet" />
            ) : (
              <div className="stack">
                {stats.recentUsers.map((student) => (
                  <Link
                    key={student.id}
                    to="/admin/users"
                    className="row gap-2"
                    style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--line)' }}
                  >
                    <span className="cat-dot" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                      <Icon name="user" size={15} />
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="small strong nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {student.name}
                      </div>
                      <div className="tiny dim">{relativeTime(student.createdAt)}</div>
                    </div>
                    {student.isDisabled && <Chip tone="expense">Disabled</Chip>}
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card title="Category library">
            <div className="row-between small">
              <span className="muted">System defaults</span>
              <span className="strong tabular">{stats.categories.defaults}</span>
            </div>
            <hr className="divider mt-2 mb-2" />
            <div className="row-between small">
              <span className="muted">Created by students</span>
              <span className="strong tabular">{stats.categories.personal}</span>
            </div>
            <Link to="/admin/categories" className="mt-3" style={{ display: 'block' }}>
              <Button size="sm" icon="tag" className="btn-block">Manage default categories</Button>
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
