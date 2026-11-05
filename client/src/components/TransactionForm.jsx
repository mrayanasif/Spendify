import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { Button, Field, MoneyInput, TypeSwitch, Toggle, CategoryMark, AdvisoryNote, Modal } from './ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, symbolFor, toInputDate } from '../lib/format';

/**
 * Add / edit form for a transaction.
 *
 * While the student types a description the form asks the API for a category
 * suggestion, debounced to 450 ms. The suggestion is never applied on its own —
 * it appears as a row the student can accept, and whatever they finally choose
 * is sent back so the assistant learns from the correction.
 */
export default function TransactionForm({ categories = [], initial = null, onSaved, onCancel, onScanReceipt }) {
  const { user, currency } = useAuth();
  const toast = useToast();
  const isEdit = Boolean(initial?._id);

  const [type, setType] = useState(initial?.type || 'expense');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category?._id || initial?.category || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [note, setNote] = useState(initial?.note || '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod || 'cash');
  const [date, setDate] = useState(toInputDate(initial?.date || new Date()));
  const [recurring, setRecurring] = useState(Boolean(initial?.isRecurring));
  const [frequency, setFrequency] = useState(initial?.recurrence?.frequency || 'monthly');
  const [endsOn, setEndsOn] = useState(initial?.recurrence?.endsOn ? toInputDate(initial.recurrence.endsOn) : '');

  const today = toInputDate(new Date());

  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [permissionPrompt, setPermissionPrompt] = useState(null);

  // Remembers what the assistant proposed, so the server can learn from an override.
  const suggestedRef = useRef(null);
  const fieldRefs = useRef({});
  useEffect(() => {
    const firstInvalidField = ['amount', 'date', 'category', 'endsOn']
      .find((field) => errors[field]);
    if (!firstInvalidField) return;
    const element = fieldRefs.current[firstInvalidField];
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  }, [errors]);

  const options = useMemo(() => categories.filter((c) => c.type === type && !c.isArchived), [categories, type]);

  /* Keep the selected category valid when the type flips. */
  useEffect(() => {
    if (categoryId && !options.some((c) => c._id === categoryId)) setCategoryId('');
  }, [options, categoryId]);

  /* --- debounced suggestion --- */
  const assistantOn = user?.preferences?.assistantEnabled !== false;

  useEffect(() => {
    if (!assistantOn || description.trim().length < 3) {
      setSuggestion(null);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSuggesting(true);
      try {
        const data = await api.post('/transactions/suggest', { description, type }, { signal: controller.signal });
        if (data.suggestion) {
          setSuggestion(data.suggestion);
          suggestedRef.current = data.suggestion.categoryId;
        } else {
          setSuggestion(null);
        }
      } catch {
        /* a failed suggestion must never block the entry */
      } finally {
        setSuggesting(false);
      }
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [description, type, assistantOn]);

  const applySuggestion = useCallback(() => {
    if (suggestion) setCategoryId(suggestion.categoryId);
  }, [suggestion]);

  const validate = () => {
    const next = {};
    if (!amount || Number(amount) <= 0) next.amount = 'Enter an amount greater than zero.';
    if (!categoryId) next.category = 'Choose a category.';
    if (!date) {
      next.date = 'Pick a date.';
    } else if (date > today) {
      next.date = 'Future dates cannot be selected.';
    }
    if (recurring && endsOn && endsOn < date) {
      next.endsOn = 'Stop date cannot be earlier than the transaction date.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event, overrideOpts = {}) => {
    if (event?.preventDefault) event.preventDefault();
    if (!validate()) {
      toast.error('Please check the form for errors.');
      return;
    }

    setSaving(true);
    const payload = {
      type,
      amount: Number(amount),
      category: categoryId,
      description: description.trim(),
      note: note.trim(),
      paymentMethod,
      date,
      isRecurring: recurring,
      recurrence: recurring ? { frequency, endsOn: endsOn || null } : undefined,
      suggestedCategory: suggestedRef.current || null,
      ...overrideOpts
    };
    try {
      const result = isEdit
        ? await api.put(`/transactions/${initial._id}`, payload)
        : await api.post('/transactions', payload);

      if (result?.needPermission) {
        setPermissionPrompt(result);
        setSaving(false);
        return;
      }

      toast.success(isEdit ? 'Transaction updated.' : 'Transaction saved.');
      if (result.alerts && !result.warnings?.length) {
        toast.warn('A budget alert was raised — check your notifications.');
      }
      if (result.warnings?.length) {
        result.warnings.forEach(w => {
          if (w.level === 'danger') toast.error(w.message);
          else toast.warn(w.message);
        });
      }
      setPermissionPrompt(null);
      onSaved?.(result);
    } catch (err) {
      // Budget warning requiring permission to use savings.
      if (err.status === 409 && err.payload?.needPermission) {
        setPermissionPrompt(err.payload);
        setSaving(false);
        return;
      }
      if (err.message.startsWith('Please create a budget for ')) {
        setErrors((current) => ({ ...current, category: err.message }));
      }
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const suggestionIsApplied = suggestion && suggestion.categoryId === categoryId;

  return (
    <form onSubmit={submit} className="stack gap-3">
      {/* ── Budget warning & permission prompt ── */}
      <Modal
        open={Boolean(permissionPrompt)}
        onClose={() => setPermissionPrompt(null)}
        title={permissionPrompt?.insufficientSavings ? 'Insufficient funds' : 'Budget exceeded'}
        subtitle={permissionPrompt?.warningType === 'budget_exceeded' ? 'Review the amount before saving this transaction.' : 'This transaction exceeds your available funds.'}
        footer={permissionPrompt && (
          <div className="row gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="quiet" onClick={() => { setPermissionPrompt(null); onCancel?.(); }} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPermissionPrompt(null);
                fieldRefs.current.amount?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                fieldRefs.current.amount?.focus({ preventScroll: true });
              }}
              disabled={saving}
            >
              Adjust funds
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => submit(null, { confirmOverride: true, useSavings: true })}
              loading={saving}
              disabled={permissionPrompt.insufficientSavings}
            >
              Proceed
            </Button>
          </div>
        )}
      >
        {permissionPrompt?.warningType === 'budget_exceeded' ? (
          <div className="stack gap-3">
            <p className="small" style={{ lineHeight: 1.6 }}>
              This transaction totals <b>{money(Number(amount) || 0, currency)}</b> and exceeds your <b>{permissionPrompt.categoryName}</b> budget of <b>{money(permissionPrompt.budgetLimit || 0, currency)}</b> by <b>{money(permissionPrompt.need || 0, currency)}</b>.
            </p>
            <p className="small" style={{ lineHeight: 1.6 }}>
              The over-budget amount will be deducted from your savings. Do you want to proceed?
            </p>
            {permissionPrompt.savingsRequired > 0 && (
              <p className="small" style={{ color: permissionPrompt.insufficientSavings ? 'var(--expense)' : 'var(--text-2)' }}>
                Savings needed: {money(permissionPrompt.savingsRequired, currency)} · available: {money(permissionPrompt.savingsBalance || 0, currency)}
                {permissionPrompt.insufficientSavings && <strong> · Insufficient funds. Try managing your funds or reducing the transaction amount.</strong>}
              </p>
            )}
          </div>
        ) : (
          <div className="stack gap-3">
            <p className="small" style={{ lineHeight: 1.6 }}>{permissionPrompt?.message}</p>
            <p className="small" style={{ color: 'var(--expense)' }}>
              Insufficient funds. Try managing your funds or reducing the transaction amount.
            </p>
          </div>
        )}
      </Modal>

      {onScanReceipt && !isEdit && type === 'expense' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--primary-soft)', border: '1px dashed var(--primary)', borderRadius: 'var(--radius)' }}>
          <div className="row gap-2" style={{ color: 'var(--primary)' }}>
            <Icon name="camera" size={16} />
            <span className="small strong">Have a bill or paper slip?</span>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onScanReceipt}>
            Scan receipt
          </Button>
        </div>
      )}
      <div className="row-between wrap gap-2">
        <TypeSwitch value={type} onChange={setType} disabled={saving} />
        <span className="small dim">{type === 'expense' ? 'Money going out' : 'Money coming in'}</span>
      </div>

      <div className="grid grid-2">
        <Field label="Amount" required error={errors.amount}>
          <MoneyInput
            symbol={symbolFor(currency)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
            inputRef={(element) => { fieldRefs.current.amount = element; }}
          />
        </Field>

        <Field label="Date" required error={errors.date}>
          <input
            type="date"
            className="input"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            ref={(element) => { fieldRefs.current.date = element; }}
          />
        </Field>
      </div>

      <Field
        label="Description"
        hint={assistantOn ? 'Type what it was for — a category will be suggested automatically.' : undefined}
      >
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={type === 'expense' ? 'e.g. Campus Cafe lunch' : 'e.g. Monthly allowance'}
          maxLength={160}
        />
      </Field>

      {assistantOn && (suggesting || suggestion) && (
        <div className="suggest">
          {suggesting ? (
            <>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              <span className="muted">Looking at your past entries…</span>
            </>
          ) : (
            <>
              <CategoryMark category={{ color: suggestion.color, icon: suggestion.icon }} size={26} />
              <span className="grow">
                Suggested: <b>{suggestion.categoryName}</b>
                <span className="dim tiny" style={{ display: 'block' }}>{suggestion.reason}</span>
              </span>
              <span className="confidence" title={`Confidence ${Math.round(suggestion.confidence * 100)}%`}>
                <i style={{ width: `${suggestion.confidence * 100}%` }} />
              </span>
              {suggestionIsApplied ? (
                <span className="chip chip-honey"><Icon name="check" size={12} /> Applied</span>
              ) : (
                <Button type="button" size="sm" variant="primary" onClick={applySuggestion}>Use</Button>
              )}
            </>
          )}
        </div>
      )}

      <Field label="Category" required error={errors.category}>
        <select
          className={`select ${errors.category ? 'error' : ''}`}
          value={categoryId}
          ref={(element) => { fieldRefs.current.category = element; }}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setErrors((current) => ({ ...current, category: undefined }));
          }}
        >
          <option value="">Choose a category…</option>
          {options.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}{c.isDefault ? '' : ' (yours)'}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Payment method">
        <select className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="digital_wallet">Digital wallet</option>
        </select>
      </Field>

      <Field label="Note" hint="Optional — anything you want to remember about this entry.">
        <textarea
          className="textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Optional"
        />
      </Field>

      <div className="card tight" style={{ background: 'var(--surface-2)' }}>
        <Toggle
          checked={recurring}
          onChange={setRecurring}
          label="Repeat this entry"
          hint="For things like a monthly allowance or a subscription charge."
        />

        {recurring && (
          <div className="grid grid-2 mt-3">
            <Field label="How often">
              <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="monthly">Every month</option>
                <option value="weekly">Every week</option>
                <option value="yearly">Every year</option>
              </select>
            </Field>
            <Field label="Stop after" hint="Leave empty to keep going." error={errors.endsOn}>
              <input
                type="date"
                className="input"
                value={endsOn}
                min={date || undefined}
                onChange={(e) => setEndsOn(e.target.value)}
                ref={(element) => { fieldRefs.current.endsOn = element; }}
              />
            </Field>
          </div>
        )}
      </div>

      {assistantOn && suggestion && <AdvisoryNote />}

      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
        {onCancel && <Button type="button" onClick={onCancel} disabled={saving}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={saving} icon={saving ? undefined : 'check'}>
          {isEdit ? 'Save changes' : 'Add transaction'}
        </Button>
      </div>
    </form>
  );
}
