import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import {
  Card, Button, Empty, Banner, CategoryMark,
  Chip, Skeleton, AdvisoryNote, Field
} from '../components/ui';
import { DonutChart, GroupedBarChart, AreaChart, RankedBars } from '../components/charts';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, percent, monthKey, monthLabel, longDate, shortDate, recentMonths } from '../lib/format';

const INCOME_SOURCE_COLORS = [
  'var(--chart-teal)',
  'var(--chart-blue)',
  'var(--chart-violet)',
  'var(--chart-green)',
  'var(--chart-rose)'
];

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildIncomeSourceBreakdown(items) {
  const sorted = [...items]
    .map((item) => ({ ...item, total: Number(item.total) || 0 }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  const total = sorted.reduce((sum, item) => sum + item.total, 0);

  if (!total) return { total: 0, sources: [] };

  const sources = sorted.length > 4
    ? [
      ...sorted.slice(0, 3),
      { name: 'Other', total: sorted.slice(3).reduce((sum, item) => sum + item.total, 0), isOther: true }
    ]
    : sorted;
  const percentages = sources.map((source) => Math.floor((source.total / total) * 100));
  const remainder = 100 - percentages.reduce((sum, value) => sum + value, 0);
  const remainderOrder = sources
    .map((source, index) => ({
      index,
      fraction: (source.total / total) * 100 - percentages[index]
    }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let index = 0; index < remainder; index += 1) {
    percentages[remainderOrder[index].index] += 1;
  }

  return {
    total,
    sources: sources.map((source, index) => ({
      ...source,
      percentage: percentages[index],
      share: (source.total / total) * 100,
      color: source.isOther
        ? 'var(--text-3)'
        : INCOME_SOURCE_COLORS[index % INCOME_SOURCE_COLORS.length]
    }))
  };
}

function IncomeSourcesCard({ incomeByCategory, currency }) {
  const [animated, setAnimated] = useState(false);
  const { total, sources } = buildIncomeSourceBreakdown(incomeByCategory);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const size = 160;
  const center = size / 2;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const ariaSummary = sources
    .map((source) => `${source.name} ${source.percentage}%`)
    .join(', ');
  let offset = 0;

  return (
    <Card title="Where your money came from" note="Income by source for this period.">
      {!sources.length ? (
        <p className="income-source-empty">No income recorded for this period.</p>
      ) : sources.length === 1 ? (
        <div className="income-source-single">
          <div className="figure income-source-single-total">{money(total, currency)}</div>
          <p className="income-source-empty">All of it came from {sources[0].name} this period.</p>
        </div>
      ) : (
        <div className="income-sources-layout">
          <div
            className="income-sources-donut"
            role="img"
            aria-label={`Income by source: ${ariaSummary}. Total received: ${money(total, currency)}.`}
          >
            <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="var(--line)"
                strokeWidth="16"
              />
              <g transform={`rotate(-90 ${center} ${center})`}>
                {sources.map((source, index) => {
                  const arcLength = (source.share / 100) * circumference;
                  const visibleLength = Math.max(0, arcLength - 1.25);
                  const circle = (
                    <circle
                      key={source.categoryId || source.name || index}
                      cx={center}
                      cy={center}
                      r={radius}
                      fill="none"
                      stroke={source.color}
                      strokeWidth="16"
                      strokeDasharray={animated
                        ? `${visibleLength} ${circumference - visibleLength}`
                        : `0 ${circumference}`}
                      strokeDashoffset={-offset}
                      className="income-source-donut-slice"
                    />
                  );
                  offset += arcLength;
                  return circle;
                })}
              </g>
            </svg>
            <div className="income-sources-donut-center" aria-hidden="true">
              <span className="eyebrow">Received</span>
              <span className="figure">{money(total, currency)}</span>
            </div>
          </div>

          <ul className="income-source-list">
            {sources.map((source, index) => (
              <li key={source.categoryId || source.name || index} className="income-source-item">
                <div className="income-source-heading">
                  <span className="income-source-name-wrap">
                    <span className="income-source-dot" style={{ background: source.color }} aria-hidden="true" />
                    <span className="income-source-name">{source.name}</span>
                  </span>
                  <span className="income-source-amount">
                    {money(source.total, currency)} · {source.percentage}%
                  </span>
                </div>
                <div className="income-source-track" aria-hidden="true">
                  <span
                    className="income-source-fill"
                    style={{
                      width: animated ? `${source.share}%` : '0%',
                      background: source.color
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function getMonthDateRange(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${mKey}-01`,
    end: `${mKey}-${String(lastDay).padStart(2, '0')}`
  };
}

export default function Reports() {
  const { user, currency } = useAuth();
  const toast = useToast();

  const months = useMemo(() => recentMonths(12), []);
  const currentMonth = useMemo(() => monthKey(), []);
  const initialRange = useMemo(() => getMonthDateRange(currentMonth), [currentMonth]);

  const [month, setMonth] = useState(currentMonth);
  const [from, setFrom] = useState(initialRange.start);
  const [to, setTo] = useState(initialRange.end);
  const [categoryId, setCategoryId] = useState('');
  const [incomeSource, setIncomeSource] = useState('');
  const [categories, setCategories] = useState({ all: [], income: [], expense: [] });

  const [data, setData] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [shareBusy, setShareBusy] = useState(false);

  const printRef = useRef(null);

  useEffect(() => {
    api.get('/categories')
      .then((res) => {
        setCategories({
          all: res.categories || [],
          income: res.income || res.categories?.filter((c) => c.type === 'income') || [],
          expense: res.expense || res.categories?.filter((c) => c.type === 'expense') || []
        });
      })
      .catch(() => {});
  }, []);

  const hasActiveFilters = useMemo(() => {
    const defRange = getMonthDateRange(month);
    return (
      month !== currentMonth ||
      from !== defRange.start ||
      to !== defRange.end ||
      Boolean(categoryId) ||
      Boolean(incomeSource)
    );
  }, [month, from, to, categoryId, incomeSource, currentMonth]);

  const handleMonthChange = (newMonth) => {
    setMonth(newMonth);
    const range = getMonthDateRange(newMonth);
    setFrom(range.start);
    setTo(range.end);
  };

  const clearFilters = () => {
    setMonth(currentMonth);
    const defRange = getMonthDateRange(currentMonth);
    setFrom(defRange.start);
    setTo(defRange.end);
    setCategoryId('');
    setIncomeSource('');
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = { month };
      if (from) query.from = from;
      if (to) query.to = to;
      if (categoryId) query.category = categoryId;
      if (incomeSource) query.incomeSource = incomeSource;

      const report = await api.get('/reports', query);
      setData(report);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, from, to, categoryId, incomeSource, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadForecast = async () => {
    try {
      setForecast(await api.get('/reports/forecast', { month }));
    } catch (err) {
      toast.error(err.message);
    }
  };

  /**
   * Export.
   * html2canvas renders the report node to a canvas; from there it is either
   * downloaded as a PNG or split into A4-sized PDF pages.
   * Both libraries are loaded on demand so they stay out of the initial bundle.
   */
  const exportAs = async (format) => {
    if (!printRef.current) return;
    setExporting(format);

    try {
      const [{ default: html2canvas }, jsPdfModule] = await Promise.all([
        import('html2canvas'),
        format === 'pdf' ? import('jspdf') : Promise.resolve(null)
      ]);

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const bgColor = getComputedStyle(document.body).backgroundColor || (isDark ? '#12151c' : '#ffffff');

      const canvas = await html2canvas(printRef.current, {
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        backgroundColor: bgColor,
        useCORS: true,
        logging: false
      });

      if (!canvas.width || !canvas.height) throw new Error('The report image was empty.');

      const dateSuffix = from && to ? `${from}_${to}` : month;
      const fileName = `spendify-report-${dateSuffix}`;

      if (format === 'image') {
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('The report image could not be encoded.'));
          }, 'image/png');
        });
        downloadBlob(blob, `${fileName}.png`);
        toast.success('Report saved as an image.');
      } else {
        const { jsPDF } = jsPdfModule || {};
        if (!jsPDF) throw new Error('The PDF export library could not be loaded.');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const contentWidth = pageWidth - margin * 2;
        const contentHeight = pageHeight - margin * 2;
        const pageImageHeight = Math.max(1, Math.floor((canvas.width * contentHeight) / contentWidth));

        for (let offsetY = 0; offsetY < canvas.height; offsetY += pageImageHeight) {
          const sliceHeight = Math.min(pageImageHeight, canvas.height - offsetY);
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;
          const context = pageCanvas.getContext('2d');
          if (!context) throw new Error('Could not prepare a PDF page.');
          context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

          if (offsetY > 0) pdf.addPage();
          const imageHeight = (sliceHeight * contentWidth) / canvas.width;
          pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, imageHeight, undefined, 'FAST');
        }

        pdf.save(`${fileName}.pdf`);
        toast.success('Report saved as a PDF.');
      }
    } catch (err) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting('');
    }
  };

  const share = async () => {
    const to = user?.email?.trim();
    if (!to) {
      toast.error('Your account does not have an email address to send the report to.');
      return;
    }

    setShareBusy(true);
    try {
      const result = await api.post('/reports/share', { to, month });
      if (!result.delivered) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setShareBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <>
        <div className="page-head"><h1 className="page-title">Reports</h1></div>
        <div className="stack gap-3">
          <Skeleton height={90} radius={18} />
          <Skeleton height={300} radius={18} />
          <Skeleton height={300} radius={18} />
        </div>
      </>
    );
  }

  if (!data) return <Empty icon="chart" title="Could not load reports" action={<Button onClick={load}>Try again</Button>} />;

  const totals = data.rangeTotals || data.monthTotals;
  const selectedCatObj = categories.all.find((c) => c._id === categoryId);
  const selectedIncomeObj = categories.income.find((c) => c._id === incomeSource);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Monthly reports</h1>
          <p className="page-sub">Review this month’s activity by category, then export or share what you see.</p>
        </div>

        <div className="row gap-2 wrap hide-print">
          <Button icon="download" loading={exporting === 'pdf'} onClick={() => exportAs('pdf')}>PDF</Button>
          <Button icon="download" loading={exporting === 'image'} onClick={() => exportAs('image')}>Image</Button>
          <Button icon="mail" loading={shareBusy} onClick={share}>Email me</Button>
        </div>
      </div>

      {/* -------------------------------------------------- filter controls */}
      <section className="transaction-filter-bar mb-3 hide-print" aria-label="Filter reports">
        <div className="reports-filter-grid">
          <Field label="Month">
            <select
              className="select"
              value={month}
              onChange={(e) => handleMonthChange(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </Field>

          <Field label="From date">
            <input
              type="date"
              className="input"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>

          <Field label="To date">
            <input
              type="date"
              className="input"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>

          <Field label="Category">
            <select
              className="select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.expense.length > 0 && (
                <optgroup label="Expense Categories">
                  {categories.expense.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
              {categories.income.length > 0 && (
                <optgroup label="Income Categories">
                  {categories.income.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>

          <Field label="Income source">
            <select
              className="select"
              value={incomeSource}
              onChange={(e) => setIncomeSource(e.target.value)}
            >
              <option value="">All income sources</option>
              {categories.income.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <div className="transaction-filter-actions" style={{ alignSelf: 'end', marginBottom: '2px' }}>
            {hasActiveFilters && (
              <Button size="sm" variant="quiet" icon="x" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- printable body */}
      <div ref={printRef} className="stack gap-3" style={{ background: 'var(--bg)', padding: 2 }}>
        {/* header, only meaningful in the exported file */}
        <div className="row-between wrap gap-2" style={{ paddingBottom: '0.4rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>
              Spendify — {data.monthLabel}
              {from && to && ` (${shortDate(from)} – ${shortDate(to)})`}
            </h2>
            <p className="small dim">
              {user?.name}
              {selectedCatObj && ` · Category: ${selectedCatObj.name}`}
              {selectedIncomeObj && ` · Income source: ${selectedIncomeObj.name}`}
            </p>
          </div>
          <span className="small dim">Generated {longDate(new Date())}</span>
        </div>

        {/* --- headline numbers --- */}
        <div className="grid grid-4">
          {[
            { label: 'Income', value: totals.income, tone: 'income', icon: 'trendUp' },
            { label: 'Spent', value: totals.expense, tone: 'expense', icon: 'trendDown' },
            { label: 'Balance', value: totals.balance, tone: totals.balance >= 0 ? 'income' : 'expense', icon: 'scale' },
            { label: 'Entries', value: null, count: totals.count ?? data.monthTotals.entryCount ?? data.monthTotals.transactionCount, icon: 'list' }
          ].map((tile) => (
            <div key={tile.label} className={`stat transaction-summary-card report-summary-card ${tile.label === 'Balance' ? 'report-balance-card' : ''}`}>
              <span
                className="stat-mark"
                style={{
                  background: tile.tone === 'income' ? 'var(--income-soft)' : tile.tone === 'expense' ? 'var(--expense-soft)' : 'var(--surface-3)',
                  color: tile.tone === 'income' ? 'var(--income)' : tile.tone === 'expense' ? 'var(--expense)' : 'var(--text-2)'
                }}
              >
                <Icon name={tile.icon} size={16} />
              </span>
              <span className="eyebrow">{tile.label}</span>
              <span className="stat-value figure">
                {tile.value === null ? tile.count : money(tile.value, currency)}
              </span>
            </div>
          ))}
        </div>

        {/* --- category-wise --- */}
        <div className="grid grid-split">
          <Card title="Spending by category" note={`All expenses in ${data.monthLabel}.`}>
            {data.expenseByCategory.length === 0 ? (
              <Empty icon="tag" title="No expenses in this period" />
            ) : (
              <>
                <RankedBars data={data.expenseByCategory} currency={currency} limit={10} colorMode="brand" />

                <div className="table-wrap mt-4">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="right">Entries</th>
                        <th className="right">Largest</th>
                        <th className="right">Total</th>
                        <th className="right">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expenseByCategory.map((row) => (
                        <tr key={row.categoryId}>
                          <td>
                            <span className="row gap-2">
                              <CategoryMark category={row} size={24} />
                              <span className="small strong">{row.name}</span>
                            </span>
                          </td>
                          <td className="right small tabular">{row.count}</td>
                          <td className="right small tabular muted">{money(row.largest, currency)}</td>
                          <td className="right small tabular strong">{money(row.total, currency)}</td>
                          <td className="right small tabular muted">{percent(row.share)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Card title="Share of spending">
            <DonutChart data={data.expenseByCategory} currency={currency} />
          </Card>
        </div>

        {/* --- six month trend and budgets --- */}
        <div className="grid grid-split">
          <Card title="Income against spending" note="The last six months.">
            <GroupedBarChart data={data.trend} currency={currency} height={250} />
          </Card>

          {data.budgets.length > 0 && (
            <Card title="Budget performance" note={data.monthLabel}>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="right">Budget</th>
                      <th className="right">Spent</th>
                      <th className="right">Left</th>
                      <th style={{ width: 130 }}>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.budgets.map((budget) => (
                      <tr key={budget.budgetId}>
                        <td>
                          <span className="row gap-2">
                            <CategoryMark category={budget} size={24} />
                            <span className="small strong">{budget.name}</span>
                            {budget.state === 'over' && <Chip tone="expense">Over</Chip>}
                          </span>
                        </td>
                        <td className="right small tabular">{money(budget.limitAmount, currency)}</td>
                        <td className="right small tabular strong">{money(budget.spent, currency)}</td>
                        <td className={`right small tabular ${budget.remaining < 0 ? 'money-out' : 'muted'}`}>
                          {money(budget.remaining, currency)}
                        </td>
                        <td>
                          <div className={`bar ${budget.state}`}>
                            <i style={{ width: `${Math.min(100, budget.percent)}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* --- daily and weekly --- */}
        <div className="grid grid-split">
          <Card title="Daily spending" note={`Every day of ${data.monthLabel}.`}>
            <AreaChart
              data={data.daily}
              currency={currency}
              xKey="label"
              yKey="total"
              color="var(--chart-teal)"
              fillColor="var(--chart-blue)"
            />
          </Card>

          <Card title="Weekly summary" note={`${data.monthLabel}, by calendar week.`}>
            {data.weekly.length === 0 ? (
              <Empty icon="calendar" title="Nothing logged this month" />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Days</th>
                      <th className="right">Entries</th>
                      <th className="right">Daily avg</th>
                      <th className="right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weekly.map((week) => (
                      <tr key={week.week}>
                        <td className="small strong">{week.label}</td>
                        <td className="small muted tabular">{week.range}</td>
                        <td className="right small tabular">{week.count}</td>
                        <td className="right small tabular muted">{money(week.dailyAverage, currency)}</td>
                        <td className="right small tabular strong">{money(week.total, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* --- income sources --- */}
        <IncomeSourcesCard incomeByCategory={data.incomeByCategory || []} currency={currency} />

      </div>

      {/* ------------------------------------------------------- forecast */}
      <Card
        title="Next month, projected"
        note="An estimate from your last three months."
        className="mt-3 hide-print"
        action={<Button size="sm" icon="refresh" onClick={loadForecast}>{forecast ? 'Refresh' : 'Calculate'}</Button>}
      >
        {!forecast ? (
          <Empty icon="trendUp" title="Not calculated yet" action={<Button variant="primary" size="sm" onClick={loadForecast}>Calculate projection</Button>}>
            Averages your last three months per category and applies a damped trend.
          </Empty>
        ) : forecast.categories.length === 0 ? (
          <Empty icon="trendUp" title="Not enough history yet">Log a couple of months and a projection becomes possible.</Empty>
        ) : (
          <>
            <div className="row-between wrap gap-3 mb-3">
              <div>
                <span className="eyebrow">Projected total for {monthLabel(forecast.month)}</span>
                <div className="figure" style={{ fontSize: '1.7rem' }}>{money(forecast.total, currency)}</div>
              </div>
              <Chip tone={forecast.confidence === 'moderate' ? 'honey' : 'warn'}>
                {forecast.confidence} confidence
              </Chip>
            </div>

            <div className="table-wrap">
              <table className="data report-forecast-table">
                <colgroup>
                  <col style={{ width: '32%' }} />
                  {Array.from({ length: forecast.basedOn.length + 2 }, (_, index) => (
                    <col key={index} style={{ width: `${68 / (forecast.basedOn.length + 2)}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th>Category</th>
                    {forecast.basedOn.map((m) => (
                      <th key={m} className="right">{monthLabel(m).split(' ')[0].slice(0, 3)}</th>
                    ))}
                    <th className="right">Average</th>
                    <th className="right">Projected</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.categories.map((row) => (
                    <tr key={row.categoryId}>
                      <td>
                        <span className="row gap-2">
                          <CategoryMark category={row} size={24} />
                          <span className="small strong">{row.name}</span>
                          <Icon
                            name={row.direction === 'up' ? 'trendUp' : row.direction === 'down' ? 'trendDown' : 'right'}
                            size={14}
                            style={{ color: row.direction === 'up' ? 'var(--expense)' : row.direction === 'down' ? 'var(--income)' : 'var(--text-3)' }}
                          />
                        </span>
                      </td>
                      {row.history.map((h) => (
                        <td key={h.month} className="right small tabular muted">{money(h.total, currency)}</td>
                      ))}
                      <td className="right small tabular">{money(row.average, currency)}</td>
                      <td className="right small tabular strong">{money(row.projected, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <AdvisoryNote>
              A projection from three months of your own data — useful for planning, not a prediction. It assumes
              next month looks broadly like the recent ones.
            </AdvisoryNote>
          </>
        )}
      </Card>

    </>
  );
}
