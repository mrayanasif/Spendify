import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import {
  Card, Button, Modal, Empty, Field, Chip, Banner, ConfirmDialog, Pagination, Skeleton, CategoryMark
} from '../../components/ui';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { money, longDate, relativeTime, shortDate, initials } from '../../lib/format';

export default function AdminUsers() {
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [viewing, setViewing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get('/admin/users', { q: query, status, page }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [query, status, page, toast]);

  /* Debounce the search so typing does not fire a request per keystroke. */
  useEffect(() => {
    const timer = setTimeout(load, query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const openUser = async (id) => {
    setViewing({ loading: true });
    try {
      setViewing(await api.get(`/admin/users/${id}`));
    } catch (err) {
      toast.error(err.message);
      setViewing(null);
    }
  };

  const act = async (id, action) => {
    setBusy(true);
    try {
      const result = await api.patch(`/admin/users/${id}`, { action });
      toast.success(result.message);
      if (result.temporaryPassword) setTempPassword({ password: result.temporaryPassword, name: result.message });
      setConfirming(null);
      load();
      if (viewing?.user?.id === id) openUser(id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async () => {
    setBusy(true);
    try {
      const result = await api.del(`/admin/users/${confirming.user.id}`);
      toast.success(result.message);
      setConfirming(null);
      setViewing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const users = data?.users || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-sub">View an account, disable it, or issue a temporary password.</p>
        </div>
      </div>

      <Card className="mb-3">
        <div className="row-between wrap gap-3">
          <div className="grow" style={{ maxWidth: 380, position: 'relative' }}>
            <Icon name="search" size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              className="input"
              style={{ paddingLeft: '2.1rem' }}
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
              placeholder="Search by name or email"
            />
          </div>

          <div className="row gap-2">
            {[
              { key: '', label: 'All' },
              { key: 'active', label: 'Active' },
              { key: 'disabled', label: 'Disabled' }
            ].map((option) => (
              <button
                key={option.key}
                className={`filter-chip ${status === option.key ? 'on' : ''}`}
                onClick={() => {
                  setPage(1);
                  setStatus(option.key);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="flush">
        {loading && !data ? (
          <div className="stack gap-2" style={{ padding: '1.2rem' }}>
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} />)}
          </div>
        ) : users.length === 0 ? (
          <Empty icon="users" title="No students match" >
            {query ? 'Try a different search term.' : 'No student accounts have been created yet.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Year</th>
                  <th className="right">Entries</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                  <th style={{ width: 150 }} />
                </tr>
              </thead>
              <tbody>
                {users.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="row gap-2">
                        <span className="cat-dot" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                          {initials(student.name)}
                        </span>
                        <div>
                          <div className="strong small">{student.name}</div>
                          <div className="tiny dim">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="small muted">{student.academicYear || '—'}</td>
                    <td className="right small tabular">{student.transactionCount}</td>
                    <td className="small muted nowrap">
                      {student.lastLoginAt ? relativeTime(student.lastLoginAt) : 'never'}
                    </td>
                    <td>
                      {student.isDisabled ? <Chip tone="expense">Disabled</Chip> : <Chip tone="income">Active</Chip>}
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" icon="eye" onClick={() => openUser(student.id)}>View</Button>
                        <Button
                          size="sm"
                          variant={student.isDisabled ? 'ghost' : 'quiet'}
                          onClick={() => act(student.id, student.isDisabled ? 'enable' : 'disable')}
                        >
                          {student.isDisabled ? 'Enable' : 'Disable'}
                        </Button>
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

      {/* ------------------------------------------------------ detail */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        wide
        title={viewing?.user?.name || 'Student'}
        subtitle={viewing?.user?.email}
      >
        {viewing?.loading || !viewing?.user ? (
          <div className="stack gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={50} />)}</div>
        ) : (
          <div className="stack gap-3">
            {viewing.user.isDisabled && (
              <Banner tone="danger" icon="alert" title="This account is disabled">
                The student cannot sign in until it is re-enabled.
              </Banner>
            )}

            <div className="grid grid-4">
              {[
                { label: 'Transactions', value: viewing.activity.transactionCount },
                { label: 'Budgets', value: viewing.activity.budgetCount },
                { label: 'Summaries', value: viewing.activity.insightCount },
                { label: 'Savings goal', value: money(viewing.user.savingsGoal) }
              ].map((tile) => (
                <div key={tile.label} className="stat tight" style={{ padding: '0.8rem' }}>
                  <span className="eyebrow">{tile.label}</span>
                  <span className="figure" style={{ fontSize: '1.15rem' }}>{tile.value}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-2">
              <div>
                <span className="eyebrow">Academic year</span>
                <p className="small">{viewing.user.academicYear || 'Not set'}</p>
              </div>
              <div>
                <span className="eyebrow">Monthly allowance</span>
                <p className="small">{money(viewing.user.monthlyAllowance)}</p>
              </div>
              <div>
                <span className="eyebrow">Registered</span>
                <p className="small">{longDate(viewing.user.createdAt)}</p>
              </div>
              <div>
                <span className="eyebrow">Last sign-in</span>
                <p className="small">{viewing.user.lastLoginAt ? longDate(viewing.user.lastLoginAt) : 'Never'}</p>
              </div>
            </div>

            {viewing.activity.latest.length > 0 && (
              <div>
                <span className="eyebrow">Latest entries</span>
                <div className="stack mt-1">
                  {viewing.activity.latest.map((t) => (
                    <div key={t._id} className="row gap-2" style={{ padding: '0.45rem 0', borderBottom: '1px solid var(--line)' }}>
                      <CategoryMark category={t.category} size={24} />
                      <div className="grow">
                        <div className="small strong">{t.description || t.category?.name}</div>
                        <div className="tiny dim">{shortDate(t.date)}</div>
                      </div>
                      <span className={`small tabular strong ${t.type === 'income' ? 'money-in' : 'money-out'}`}>
                        {money(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="tiny dim mt-2">
                  Shown so you can confirm an account is in use. Full transaction history stays private to the student.
                </p>
              </div>
            )}

            <hr className="divider" />

            <div className="row gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
              <Button
                icon="refresh"
                loading={busy}
                onClick={() => act(viewing.user.id, 'reset-password')}
              >
                Issue temporary password
              </Button>
              <Button
                variant={viewing.user.isDisabled ? 'ghost' : 'dark'}
                icon="shield"
                loading={busy}
                onClick={() => act(viewing.user.id, viewing.user.isDisabled ? 'enable' : 'disable')}
              >
                {viewing.user.isDisabled ? 'Re-enable account' : 'Disable account'}
              </Button>
              <Button variant="danger" icon="trash" onClick={() => setConfirming({ user: viewing.user })}>
                Delete account
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------- temporary password */}
      <Modal
        open={Boolean(tempPassword)}
        onClose={() => setTempPassword(null)}
        title="Temporary password issued"
        subtitle="Read it out to the student. It is not shown again."
      >
        <Banner tone="warn" icon="alert">
          The student's old password no longer works. Ask them to change this one after signing in.
        </Banner>
        <div
          className="center mt-3"
          style={{
            padding: '1.2rem',
            background: 'var(--surface-3)',
            borderRadius: 'var(--r)',
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: '1.3rem',
            fontWeight: 700,
            letterSpacing: '0.05em'
          }}
        >
          {tempPassword?.password}
        </div>
        <div className="row mt-3" style={{ justifyContent: 'flex-end' }}>
          <Button
            icon="copy"
            onClick={() => {
              navigator.clipboard?.writeText(tempPassword.password);
              toast.success('Copied.');
            }}
          >
            Copy
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete this student account?"
        message={
          confirming
            ? `${confirming.user.name}'s account, transactions, budgets and summaries will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete permanently"
        busy={busy}
        onConfirm={removeUser}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
