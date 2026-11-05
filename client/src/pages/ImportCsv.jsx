import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Card, Button, Empty, Banner, Chip, CategoryMark, Skeleton, AdvisoryNote } from '../components/ui';
import { api, getToken } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, shortDate } from '../lib/format';

/**
 * Two-step CSV import.
 *
 * Step 1 uploads the file and gets back parsed rows, each with a proposed
 * category and a confidence. Step 2 lets the student change any category before
 * anything is written. Rows below 60% confidence are highlighted for review.
 */
export default function ImportCsv() {
  const { currency } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [onlyReview, setOnlyReview] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      toast.error('Please choose a .csv file.');
      return;
    }

    setBusy(true);
    setFileName(file.name);

    try {
      const body = new FormData();
      body.append('file', file);

      const [result, cats] = await Promise.all([
        api.post('/import/preview', body),
        api.get('/categories')
      ]);

      setPreview(result);
      setCategories(cats.categories);
      setRows(
        result.rows.map((row, index) => ({
          ...row,
          id: index,
          categoryId: row.category?.id || '',
          include: true
        }))
      );
      setStep(2);
    } catch (err) {
      toast.error(err.message);
      setFileName('');
    } finally {
      setBusy(false);
    }
  };

  const setRow = (id, patch) => {
    setRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const commit = async () => {
    const selected = rows.filter((r) => r.include && r.categoryId);
    if (!selected.length) {
      toast.error('Select at least one row with a category.');
      return;
    }

    setBusy(true);
    try {
      const result = await api.post('/import/commit', {
        rows: selected.map((r) => ({
          line: r.line,
          date: r.date,
          description: r.description,
          amount: r.amount,
          type: r.type,
          categoryId: r.categoryId
        }))
      });

      toast.success(result.message);
      if (result.rejected?.length) {
        toast.warn(`${result.rejected.length} rows could not be imported.`);
      }
      navigate('/app/transactions');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    // Fetch with the auth header, then save the blob — a plain link cannot carry the token.
    try {
      const response = await fetch('/api/import/template', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'spendify-template.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download the template.');
    }
  };

  const reset = () => {
    setStep(1);
    setPreview(null);
    setRows([]);
    setFileName('');
    setOnlyReview(false);
  };

  const included = rows.filter((r) => r.include);
  const visibleRows = onlyReview ? rows.filter((r) => r.confidence < 0.6) : rows;
  const includedTotal = included.reduce(
    (sum, r) => sum + (r.type === 'expense' ? -Number(r.amount) : Number(r.amount)),
    0
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Import from CSV</h1>
          <p className="page-sub">
            Bring in past months in one go. A category is proposed for every row — you decide before anything is saved.
          </p>
        </div>

        <div className="row gap-2 hide-print">
          <Button icon="download" onClick={downloadTemplate}>Template file</Button>
          {step === 2 && <Button icon="left" onClick={reset}>Start over</Button>}
        </div>
      </div>

      {/* ------------------------------------------------------- step 1 */}
      {step === 1 && (
        <div className="grid grid-split">
          <Card title="Choose your file">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                upload(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--honey)' : 'var(--line-strong)'}`,
                background: dragging ? 'var(--honey-soft)' : 'var(--surface-2)',
                borderRadius: 'var(--r-lg)',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.18s var(--ease)'
              }}
            >
              <div className="empty-mark" style={{ background: 'var(--honey-soft)', color: 'var(--honey-deep)' }}>
                {busy ? <span className="spinner" /> : <Icon name="upload" size={24} />}
              </div>
              <h3 style={{ fontSize: '1rem' }}>{busy ? 'Reading your file…' : 'Drop a CSV here, or click to browse'}</h3>
              <p className="small muted mt-1">Up to 1000 rows, maximum 2 MB.</p>
              {fileName && <Chip tone="honey">{fileName}</Chip>}

              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </div>
          </Card>

          <Card title="What the file should look like">
            <p className="small muted">
              A header row plus one row per transaction. Column names are matched loosely, so
              <b> details</b>, <b>narration</b> or <b>merchant</b> all work as the description.
            </p>

            <div className="table-wrap mt-3">
              <table className="data">
                <thead>
                  <tr><th>Column</th><th>Required</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {[
                    ['date', 'Yes', 'dd/mm/yyyy or yyyy-mm-dd'],
                    ['amount', 'Yes', 'Negative or (120.50) means an expense'],
                    ['description', 'No', 'Used to propose the category'],
                    ['type', 'No', 'income / expense, debit / credit'],
                    ['category', 'No', 'Matched by name if it exists']
                  ].map(([col, req, note]) => (
                    <tr key={col}>
                      <td><code className="small strong">{col}</code></td>
                      <td className="small">{req === 'Yes' ? <Chip tone="expense">Yes</Chip> : <Chip>Optional</Chip>}</td>
                      <td className="small muted">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Banner icon="info" className="mt-3">
              Rows without a readable date or amount are skipped and listed, not silently dropped.
            </Banner>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------- step 2 */}
      {step === 2 && preview && (
        <>
          <div className="grid grid-4 mb-3">
            {[
              { label: 'Rows read', value: preview.summary.readable, icon: 'list' },
              { label: 'Skipped', value: preview.summary.skipped, icon: 'alert' },
              { label: 'Need a look', value: preview.summary.needsReview, icon: 'eye' },
              { label: 'Selected', value: included.length, icon: 'check' }
            ].map((tile) => (
              <div key={tile.label} className="stat">
                <span className="stat-mark" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                  <Icon name={tile.icon} size={16} />
                </span>
                <span className="eyebrow">{tile.label}</span>
                <span className="stat-value figure">{tile.value}</span>
              </div>
            ))}
          </div>

          {preview.skipped.length > 0 && (
            <Banner tone="warn" icon="alert" title={`${preview.skipped.length} rows were skipped`} className="mb-3">
              {preview.skipped.slice(0, 3).map((s) => `line ${s.line} (${s.reason})`).join(', ')}
              {preview.skipped.length > 3 && `, and ${preview.skipped.length - 3} more`}.
            </Banner>
          )}

          <Card
            title="Check the categories"
            note="Change anything that looks wrong — your corrections also teach the suggestions for next time."
            action={
              <div className="row gap-2">
                <Button
                  size="sm"
                  variant={onlyReview ? 'primary' : 'ghost'}
                  icon="filter"
                  onClick={() => setOnlyReview((v) => !v)}
                >
                  {onlyReview ? 'Showing low confidence' : 'Low confidence only'}
                </Button>
                <Button size="sm" onClick={() => setRows((l) => l.map((r) => ({ ...r, include: !included.length })))}>
                  {included.length ? 'Deselect all' : 'Select all'}
                </Button>
              </div>
            }
            className="flush"
          >
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th style={{ width: 90 }}>Match</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id} style={{ opacity: row.include ? 1 : 0.45 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) => setRow(row.id, { include: e.target.checked })}
                          aria-label={`Include line ${row.line}`}
                        />
                      </td>
                      <td className="small muted nowrap">{shortDate(row.date)}</td>
                      <td className="small">{row.description || <span className="dim">—</span>}</td>
                      <td>
                        <select
                          className="select"
                          style={{ minWidth: 160, padding: '0.35rem 1.8rem 0.35rem 0.6rem', fontSize: '0.83rem' }}
                          value={row.categoryId}
                          onChange={(e) => setRow(row.id, { categoryId: e.target.value })}
                        >
                          <option value="">Choose…</option>
                          {categories.filter((c) => c.type === row.type).map((c) => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {row.confidence >= 0.6 ? (
                          <span className="row gap-1 tiny" style={{ color: 'var(--income)' }} title={row.reason}>
                            <Icon name="check" size={12} /> {Math.round(row.confidence * 100)}%
                          </span>
                        ) : (
                          <span className="row gap-1 tiny" style={{ color: 'var(--warn)' }} title={row.reason}>
                            <Icon name="eye" size={12} /> check
                          </span>
                        )}
                      </td>
                      <td className={`right small strong tabular nowrap ${row.type === 'income' ? 'money-in' : 'money-out'}`}>
                        {row.type === 'income' ? '+' : '−'}{money(row.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row-between wrap gap-3" style={{ padding: '1rem 1.2rem', borderTop: '1px solid var(--line)' }}>
              <div>
                <span className="small muted">{included.length} of {rows.length} rows selected · net </span>
                <span className={`small strong tabular ${includedTotal >= 0 ? 'money-in' : 'money-out'}`}>
                  {money(includedTotal, currency)}
                </span>
              </div>
              <div className="row gap-2">
                <Button onClick={reset} disabled={busy}>Cancel</Button>
                <Button variant="primary" icon="check" loading={busy} onClick={commit}>
                  Import {included.length} transaction{included.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </Card>

          <AdvisoryNote>
            Categories here were proposed by matching each description against your past entries and a starter
            vocabulary. Every one can be changed, and nothing is saved until you press import.
          </AdvisoryNote>
        </>
      )}
    </>
  );
}
