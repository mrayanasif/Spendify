import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

/* ------------------------------------------------------------------ card */

export function Card({ title, note, action, children, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {note && <p className="card-note">{note}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- button */

export function Button({
  variant = 'ghost',
  size,
  icon,
  loading = false,
  children,
  className = '',
  ...rest
}) {
  return (
    <button
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- field */

export function Field({ label, required, hint, error, children, className = '', group = false }) {
  // A <label> forwards any click inside it to its first labelable descendant, so
  // a field holding several buttons (an icon picker, a segmented switch) must be
  // a plain <div> — otherwise clicking the fifth swatch also fires the first.
  const Tag = group ? 'div' : 'label';

  return (
    <Tag className={`field ${className}`}>
      {label && (
        <span className="label">
          {label} {required && <span className="req">*</span>}
        </span>
      )}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </Tag>
  );
}

export function MoneyInput({ symbol = '$', value, onChange, inputRef, ...rest }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
      onChange(e);
    }
  };
  
  return (
    <div className="input-money">
      <span className="prefix">{symbol}</span>
      <input 
        type="text" 
        inputMode="decimal"
        pattern="[0-9]*\.?[0-9]*"
        className="input" 
        value={value ?? ''}
        ref={inputRef}
        onChange={handleChange}
        autoComplete="off"
        {...rest} 
      />
    </div>
  );
}

/** Income / expense switch used on every entry form. */
export function TypeSwitch({ value, onChange, disabled }) {
  return (
    <div className="segment" role="group" aria-label="Transaction type">
      {['expense', 'income'].map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          data-tone={option}
          className={value === option ? 'on' : ''}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
        >
          {option === 'expense' ? 'Expense' : 'Income'}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button type="button" className="row gap-3" onClick={() => onChange(!checked)} style={{ width: '100%', textAlign: 'left' }}>
      <span className={`switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} />
      <span className="grow">
        <span className="strong small">{label}</span>
        {hint && <span className="field-hint" style={{ display: 'block' }}>{hint}</span>}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, subtitle, footer, wide, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header className="modal-head">
          <div>
            <h2 className="card-title" style={{ fontSize: '1.12rem' }}>{title}</h2>
            {subtitle && <p className="card-note">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={17} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Small confirmation dialog, used before anything destructive. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onCancel, busy }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '0.92rem' }}>{message}</p>
    </Modal>
  );
}

/* --------------------------------------------------------------- states */

export function Empty({ icon = 'list', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-mark"><Icon name={icon} size={24} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = 8, style }) {
  return <div className="skel" style={{ height, width, borderRadius: radius, ...style }} />;
}

/** Placeholder matching the shape of a card while its data loads. */
export function CardSkeleton({ lines = 3, height = 150 }) {
  return (
    <div className="card">
      <Skeleton height={14} width="38%" />
      <div className="stack gap-2 mt-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} height={height / lines - 8} />
        ))}
      </div>
    </div>
  );
}

export function LoadingBar({ show }) {
  return show ? <div className="bar-loader" aria-hidden="true" /> : null;
}

/* ----------------------------------------------------------------- misc */

export function Progress({ value = 0, state = '', large }) {
  return (
    <div className={`bar ${state} ${large ? 'lg' : ''}`}>
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Chip({ tone = '', dot, children }) {
  return (
    <span className={`chip ${tone ? `chip-${tone}` : ''}`}>
      {dot && <span className="chip-dot" style={{ background: dot }} />}
      {children}
    </span>
  );
}

/** Coloured tile carrying a category's icon. */
export function CategoryMark({ category, size = 30, style = {}, className = '' }) {
  const color = category?.color || '#8d91a0';
  return (
    <span
      className={`cat-dot ${className}`}
      style={{ background: `${color}14`, color, width: size, height: size, borderRadius: size / 3.2, display: 'grid', placeItems: 'center', ...style }}
    >
      <Icon name={category?.icon || 'tag'} size={Math.max(16, size * 0.48)} />
    </span>
  );
}

export function Banner({ tone = '', icon = 'info', title, children, action, className = '' }) {
  return (
    <div className={`banner ${tone ? `banner-${tone}` : ''} ${className}`}>
      <Icon name={icon} size={17} style={{ marginTop: 2, flexShrink: 0 }} />
      <div className="grow">
        {title && <div className="strong">{title}</div>}
        <div className={title ? 'small muted' : ''}>{children}</div>
      </div>
      {action}
    </div>
  );
}

/**
 * Standing note wherever a generated suggestion is shown. The brief requires
 * these to read as advice the student can override, never as financial advice.
 */
export function AdvisoryNote({ children = 'Generated from your own entries as a suggestion — review it and change anything that looks wrong. This is not financial advice.' }) {
  return (
    <p className="note-advisory mt-2">
      <Icon name="info" size={13} style={{ marginTop: 2 }} />
      <span>{children}</span>
    </p>
  );
}

/** Month grid used to select a reporting month. */
export function MonthPicker({ value, onChange, options = [] }) {
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [visibleYear, setVisibleYear] = useState(Number(value?.slice(0, 4)) || new Date().getFullYear());
  const pickerRef = useRef(null);
  const selected = new Date(Number(value?.slice(0, 4)), Number(value?.slice(5, 7)) - 1, 1);
  const selectedLabel = Number.isNaN(selected.getTime())
    ? 'Select month'
    : selected.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const years = options.map((month) => Number(month.slice(0, 4))).filter(Number.isFinite);
  const minYear = Math.min(...years, visibleYear);
  const maxYear = Math.max(...years, visibleYear);
  const availableMonths = new Set(options);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && value) setVisibleYear(Number(value.slice(0, 4)));
  }, [open, value]);

  return (
    <div className="month-picker" ref={pickerRef}>
      <button
        type="button"
        className="month-picker-trigger"
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setOpensUp(window.innerHeight - bounds.bottom < 250 && bounds.top > 250);
          setOpen((current) => !current);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="calendar" size={17} />
        <span>{selectedLabel}</span>
        <Icon name="chevronDown" size={15} />
      </button>
      {open && (
        <div className={`month-picker-panel ${opensUp ? 'opens-up' : ''}`} role="dialog" aria-label="Choose a month">
          <div className="month-picker-head">
            <button
              type="button"
              className="month-picker-year-nav"
              onClick={() => setVisibleYear((year) => year - 1)}
              disabled={visibleYear <= minYear}
              aria-label="Previous year"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <strong>{visibleYear}</strong>
            <button
              type="button"
              className="month-picker-year-nav"
              onClick={() => setVisibleYear((year) => year + 1)}
              disabled={visibleYear >= maxYear}
              aria-label="Next year"
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
          <div className="month-picker-grid">
            {Array.from({ length: 12 }, (_, index) => {
              const month = String(index + 1).padStart(2, '0');
              const key = `${visibleYear}-${month}`;
              const isSelected = key === value;
              return (
                <button
                  type="button"
                  key={key}
                  className={`month-picker-option ${isSelected ? 'selected' : ''}`}
                  disabled={!availableMonths.has(key)}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  {new Date(visibleYear, index, 1).toLocaleDateString('en-GB', { month: 'short' })}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="row gap-2 center" style={{ justifyContent: 'center', padding: '1rem' }}>
      <Button size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="small muted tabular">Page {page} of {pages}</span>
      <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next <Icon name="chevronRight" size={14} />
      </Button>
    </div>
  );
}
