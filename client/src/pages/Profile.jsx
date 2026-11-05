import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import {
  Card, Button, Field, MoneyInput, Banner, Toggle, CategoryMark,
  Empty, ConfirmDialog, Chip, Skeleton
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { symbolFor, longDate, relativeTime, initials, money } from '../lib/format';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'PKR', 'AED'];
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate', 'Other'];

export default function Profile() {
  const { user, patchUser, logout, currency } = useAuth();
  const { theme, setTheme, scale, setScale } = useTheme();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user?.name || '',
    academicYear: user?.academicYear || '',
    monthlyAllowance: user?.monthlyAllowance ?? '',
    savingsGoal: user?.savingsGoal ?? ''
  });
  const [saving, setSaving] = useState(false);

  const [activity, setActivity] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadActivity = useCallback(async () => {
    try {
      setActivity(await api.get('/profile/activity'));
    } catch {
      /* the panel is optional */
    }
  }, []);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { user: updated } = await api.put('/profile', {
        name: form.name,
        academicYear: form.academicYear,
        monthlyAllowance: Number(form.monthlyAllowance) || 0,
        savingsGoal: Number(form.savingsGoal) || 0
      });
      patchUser(updated);
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePreference = async (patch) => {
    try {
      const { user: updated } = await api.put('/profile/preferences', patch);
      patchUser(updated);
      toast.success('Preferences updated.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deleteAccount = async () => {
    setDeleteBusy(true);
    try {
      await api.del('/profile');
      toast.success('Your account has been removed.');
      logout('account_deleted');
    } catch (err) {
      toast.error(err.message);
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Profile & settings</h1>
          <p className="page-sub">Your details, how the app looks, and what happens to your data.</p>
        </div>
      </div>

      <div className="grid grid-split">
        <div className="stack gap-3">
          {/* ------------------------------------------------- identity */}
          <Card>
            <div className="row gap-3 mb-3">
              <span
                className="rail-mark"
                style={{ width: 58, height: 58, borderRadius: 16, fontSize: '1.3rem', background: 'var(--honey)', color: 'var(--ink)' }}
              >
                {initials(user?.name)}
              </span>
              <div className="grow">
                <h2 style={{ fontSize: '1.25rem' }}>{user?.name}</h2>
                <p className="small muted">{user?.email}</p>
                <div className="row gap-2 mt-1">
                  {user?.academicYear && <Chip tone="outline">{user.academicYear}</Chip>}
                  <Chip>Member since {longDate(user?.createdAt)}</Chip>
                </div>
              </div>

            </div>

            <form onSubmit={saveProfile} className="stack gap-3">
              <div className="grid grid-2">
                <Field label="Full name" required>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </Field>

                <Field label="Academic year">
                  <select className="select" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })}>
                    <option value="">Not set</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid grid-2">
                <Field label="Monthly allowance baseline" hint="What you normally receive in a month.">
                  <MoneyInput
                    symbol={symbolFor(currency)}
                    value={form.monthlyAllowance}
                    onChange={(e) => setForm({ ...form, monthlyAllowance: e.target.value })}
                  />
                </Field>

                <Field label="Monthly savings goal" hint="Used to track progress and shape your tips.">
                  <MoneyInput
                    symbol={symbolFor(currency)}
                    value={form.savingsGoal}
                    onChange={(e) => setForm({ ...form, savingsGoal: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Current savings balance" hint="Synced with your available balance after each transaction.">
                <MoneyInput
                  symbol={symbolFor(currency)}
                  value={user?.currentSavings ?? 0}
                  readOnly
                />
              </Field>

              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" loading={saving} icon="check">Save profile</Button>
              </div>
            </form>
          </Card>

          {/* --------------------------------------------------- danger */}
          <Card title="Delete account" note="This cannot be undone.">
            <Banner tone="danger" icon="alert">
              Deleting removes your profile, every transaction, budget, tip and summary permanently.
            </Banner>
            <div className="row mt-3" style={{ justifyContent: 'flex-end' }}>
              <Button variant="danger" icon="trash" onClick={() => setDeleting(true)}>Delete my account</Button>
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------------ side */}
        <div className="stack gap-3">
          <Card title="Appearance" note="Saved to your account, so it follows you to another device.">
            <div className="stack gap-3">
              <div>
                <span className="label">Theme</span>
                <div className="row gap-2 mt-1">
                  {[
                    { key: 'light', label: 'Light', icon: 'sun' },
                    { key: 'dark', label: 'Dark', icon: 'moon' }
                  ].map((option) => (
                    <button
                      key={option.key}
                      className={`filter-chip row gap-2 ${theme === option.key ? 'on' : ''}`}
                      onClick={() => setTheme(option.key)}
                    >
                      <Icon name={option.icon} size={15} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">Text size</span>
                <div className="row gap-2 mt-1">
                  {[
                    { value: 1, label: 'Normal' },
                    { value: 1.1, label: 'Large' },
                    { value: 1.2, label: 'Larger' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`filter-chip ${Math.abs(scale - option.value) < 0.01 ? 'on' : ''}`}
                      onClick={() => setScale(option.value)}
                      style={{ fontSize: `${0.8 * option.value}rem` }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="field-hint mt-1">Scales every piece of text and spacing in the app.</p>
              </div>

              <div>
                <span className="label">Currency</span>
                <select
                  className="select mt-1"
                  value={user?.preferences?.currency || 'USD'}
                  onChange={(e) => savePreference({ currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c} — {symbolFor(c)}</option>
                  ))}
                </select>
                <p className="field-hint mt-1">Changes the symbol shown. Amounts already logged are not converted.</p>
              </div>
            </div>
          </Card>

          <Card title="Category suggestions">
            <Toggle
              checked={user?.preferences?.assistantEnabled !== false}
              onChange={(value) => savePreference({ assistantEnabled: value })}
              label="Suggest a category as I type"
              hint="Matches your description against your own past entries. Turn it off to always choose manually."
            />
          </Card>

          {/* ------------------------------------------------- activity */}
          <Card title="Recent activity" note="Carried across sessions.">
            {!activity ? (
              <div className="stack gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={40} />)}</div>
            ) : activity.viewed.length === 0 && activity.edited.length === 0 ? (
              <Empty icon="history" title="Nothing yet">Entries you open or change will be listed here.</Empty>
            ) : (
              <div className="stack gap-3">
                {activity.edited.length > 0 && (
                  <div>
                    <span className="eyebrow">Recently edited</span>
                    <div className="stack mt-1">
                      {activity.edited.map((entry) => (
                        <div key={entry.logId} className="row gap-2" style={{ padding: '0.45rem 0' }}>
                          <CategoryMark category={entry.transaction.category} size={24} />
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="small strong nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {entry.transaction.description || entry.transaction.category?.name}
                            </div>
                            <div className="tiny dim">{entry.action} {relativeTime(entry.at)}</div>
                          </div>
                          <span className="tiny tabular muted">{money(entry.transaction.amount, currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activity.viewed.length > 0 && (
                  <div>
                    <span className="eyebrow">Recently viewed</span>
                    <div className="stack mt-1">
                      {activity.viewed.map((entry) => (
                        <div key={entry.logId} className="row gap-2" style={{ padding: '0.45rem 0' }}>
                          <CategoryMark category={entry.transaction.category} size={24} />
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="small strong nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {entry.transaction.description || entry.transaction.category?.name}
                            </div>
                            <div className="tiny dim">{relativeTime(entry.at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        title="Delete your account?"
        message="Every transaction, budget, tip and monthly summary will be permanently removed. There is no way to recover them."
        confirmLabel="Delete everything"
        busy={deleteBusy}
        onConfirm={deleteAccount}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
