import { useCallback, useState } from 'react';
import { money } from '../lib/format';

/**
 * Charts drawn as plain SVG.
 *
 * Built by hand rather than with a charting library so the marks match the rest
 * of the design (same radii, same type, same two themes) and so the bundle stays
 * small. Each chart is responsive through a viewBox plus `preserveAspectRatio`,
 * and every series reads its colour from the category it represents.
 */

/* ------------------------------------------------------------- tooltip */

function useTooltip() {
  const [tip, setTip] = useState(null);

  const show = useCallback((event, content) => {
    setTip({ content, x: event.clientX, y: event.clientY });
  }, []);

  const move = useCallback((event) => {
    setTip((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : null));
  }, []);

  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  ) : null;

  return { show, move, hide, node };
}

/* --------------------------------------------------------------- donut */

const DONUT_COLORS = [
  'var(--chart-green)',
  'var(--chart-blue)',
  'var(--chart-violet)',
  'var(--chart-red)',
  'var(--chart-teal)',
  'var(--chart-yellow)',
  'var(--chart-rose)',
  'var(--chart-slate)'
];

/**
 * Category share. Values are drawn as arc segments with a gap between them, and
 * the middle carries the total so the chart answers "how much" as well as
 * "what share".
 */
export function DonutChart({ data = [], currency = 'USD', size = 190, thickness = 26, centerLabel = 'Spent', metric = 'total' }) {
  const { show, move, hide, node } = useTooltip();
  const [active, setActive] = useState(null);

  const valueFor = (item) => Number(item[metric] || 0);
  const total = data.reduce((sum, d) => sum + valueFor(d), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (!total) {
    return (
      <div className="center" style={{ padding: '2rem 0' }}>
        <svg width={size} height={size} className="chart" style={{ margin: '0 auto' }}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        </svg>
        <p className="small dim mt-2">Nothing recorded yet</p>
      </div>
    );
  }

  let offset = 0;

  return (
    <>
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} className="chart" style={{ transform: 'rotate(-90deg)' }}>
          {data.map((slice, i) => {
            const value = valueFor(slice);
            const fraction = value / total;
            // A 1.5px gap keeps neighbouring slices legible without a stroke ring.
            const length = Math.max(0, fraction * circumference - 1.5);
            const dash = `${length} ${circumference - length}`;
            const element = (
              <circle
                key={slice.categoryId || slice.name || i}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth={active === i ? thickness + 5 : thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                className="chart-hit"
                style={{ transition: 'stroke-width 0.16s ease' }}
                onMouseEnter={(e) => {
                  setActive(i);
                  show(e, `${slice.name} · ${metric === 'count' ? `${slice.count} entries` : money(value, currency)} (${Math.round(fraction * 100)}%)`);
                }}
                onMouseMove={move}
                onMouseLeave={() => {
                  setActive(null);
                  hide();
                }}
              />
            );
            offset += fraction * circumference;
            return element;
          })}
        </svg>

        <div
          className="donut-center"
          style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center' }}
        >
          <div className="eyebrow">{active !== null ? data[active].name : centerLabel}</div>
          <div className="figure" style={{ fontSize: '1.35rem' }}>
            {metric === 'count' ? valueFor(active !== null ? data[active] : { count: total }) : money(active !== null ? valueFor(data[active]) : total, currency)}
          </div>
        </div>
      </div>

      <div className="legend">
        {data.slice(0, 7).map((slice, i) => (
          <span
            key={slice.categoryId || slice.name || i}
            className="legend-item"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            style={{ cursor: 'default', opacity: active === null || active === i ? 1 : 0.45 }}
          >
            <span className="legend-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            {slice.name}
            <b className="tabular" style={{ color: 'var(--text)' }}>{Math.round((valueFor(slice) / total) * 100)}%</b>
          </span>
        ))}
      </div>
      {node}
    </>
  );
}

/* ----------------------------------------------------------- grouped bars */

/** Monthly income and spending, shown as a pair of bars for each month. */
export function GroupedBarChart({ data = [], currency = 'USD', height = 230 }) {
  const { show, move, hide, node } = useTooltip();

  const width = 620;
  const pad = { top: 16, right: 12, bottom: 30, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = Math.max(...data.flatMap((row) => [row.income || 0, row.expense || 0]), 1);
  // Round the axis top up to a clean number so the gridlines read well.
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;

  const slot = plotW / Math.max(data.length, 1);
  const barW = Math.min(18, slot / 4);
  const gap = Math.min(5, slot / 12);
  const y = (value) => pad.top + plotH - (value / top) * plotH;
  const series = [
    { key: 'income', label: 'Received', color: 'var(--chart-green)', gradientId: 'income-bars-gradient', offset: -(barW + gap) / 2 },
    { key: 'expense', label: 'Spent', color: 'var(--chart-red)', gradientId: 'spending-bars-gradient', offset: (barW + gap) / 2 }
  ];

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart" preserveAspectRatio="xMidYMid meet" style={{ height }}>
        <defs>
          <linearGradient id="income-bars-gradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="var(--chart-green)" />
            <stop offset="100%" stopColor="var(--chart-yellow)" />
          </linearGradient>
          <linearGradient id="spending-bars-gradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="var(--chart-yellow)" />
            <stop offset="100%" stopColor="var(--chart-red)" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={y(top * t)} y2={y(top * t)} />
            <text x={pad.left - 8} y={y(top * t) + 4} textAnchor="end">
              {money(top * t, currency, { compact: true })}
            </text>
          </g>
        ))}

        {data.map((row, i) => {
          const cx = pad.left + slot * i + slot / 2;

          return (
            <g key={row.month || i}>
              {series.map((item) => {
                const value = Number(row[item.key]) || 0;
                const barH = Math.max(value > 0 ? 2 : 0, plotH - (y(value) - pad.top));
                return (
                  <rect
                    key={item.key}
                    x={cx + item.offset - barW / 2}
                    y={pad.top + plotH - barH}
                    width={barW}
                    height={barH}
                    rx={4}
                    fill={`url(#${item.gradientId})`}
                    className="chart-hit"
                    onMouseEnter={(e) => show(e, `${row.label} · ${item.label} ${money(value, currency)}`)}
                    onMouseMove={move}
                    onMouseLeave={hide}
                  />
                );
              })}
              <text x={cx} y={height - 10} textAnchor="middle">{row.label}</text>
            </g>
          );
        })}

        <line className="axis-line" x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} />
      </svg>

      <div className="legend">
        {series.map((item) => (
          <span key={item.key} className="legend-item">
            <span className="legend-swatch" style={{ background: item.key === 'income' ? 'linear-gradient(90deg, var(--chart-green), var(--chart-yellow))' : 'linear-gradient(90deg, var(--chart-yellow), var(--chart-red))' }} />{item.label}
          </span>
        ))}
      </div>
      {node}
    </>
  );
}

/* ----------------------------------------------- budget vs actual line */

/** Cumulative budgeted spending compared with the month's total budget cap. */
export function BudgetTrendChart({ data = [], budgetLimit = 0, currency = 'USD', height = 210 }) {
  const { show, move, hide, node } = useTooltip();
  const [active, setActive] = useState(null);
  const width = 620;
  const pad = { top: 16, right: 12, bottom: 28, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(budgetLimit, ...data.map((row) => row.cumulative || 0), 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const x = (index) => pad.left + (data.length <= 1 ? plotW / 2 : (index / (data.length - 1)) * plotW);
  const y = (value) => pad.top + plotH - ((Number(value) || 0) / top) * plotH;
  const actualLine = data
    .map((row, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(row.cumulative)}`)
    .join(' ');
  const labelEvery = Math.max(1, Math.ceil(data.length / 5));

  if (!data.length) return <p className="small dim center" style={{ padding: '2rem 0' }}>No spending trend available</p>;

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart"
        preserveAspectRatio="xMidYMid meet"
        style={{ height }}
        aria-label="Cumulative spending compared with the total monthly budget"
        onMouseLeave={() => {
          setActive(null);
          hide();
        }}
      >
        <defs>
          <linearGradient id="budget-trend-spend-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--chart-green)" />
            <stop offset="100%" stopColor="var(--chart-red)" />
          </linearGradient>
          <linearGradient id="budget-trend-limit-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--chart-yellow)" />
            <stop offset="100%" stopColor="var(--chart-red)" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((fraction) => {
          const value = top * fraction;
          return (
            <g key={fraction}>
              <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} />
              <text x={pad.left - 8} y={y(value) + 4} textAnchor="end">
                {money(value, currency, { compact: true })}
              </text>
            </g>
          );
        })}

        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={y(budgetLimit)}
          y2={y(budgetLimit)}
          stroke="url(#budget-trend-limit-gradient)"
          strokeWidth="2"
          strokeDasharray="6 5"
        />
        <path d={actualLine} fill="none" stroke="url(#budget-trend-spend-gradient)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />

        {data.map((row, index) => (
          <g key={row.day}>
            {active === index && (
              <>
                <line x1={x(index)} x2={x(index)} y1={pad.top} y2={pad.top + plotH} stroke="var(--line-strong)" strokeDasharray="3 3" />
                <circle cx={x(index)} cy={y(row.cumulative)} r="4.5" fill="var(--chart-green)" stroke="var(--surface)" strokeWidth="2" />
              </>
            )}
            <rect
              x={x(index) - plotW / data.length / 2}
              y={pad.top}
              width={plotW / data.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={(event) => {
                setActive(index);
                show(event, `Day ${row.day} · ${money(row.cumulative, currency)} spent`);
              }}
              onMouseMove={move}
            />
            {index % labelEvery === 0 && (
              <text x={x(index)} y={height - 8} textAnchor="middle">{row.day}</text>
            )}
          </g>
        ))}

        <line className="axis-line" x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} />
      </svg>
      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'linear-gradient(90deg, var(--chart-green), var(--chart-red))' }} />Spent
        </span>
        <span className="legend-item">
          <span className="budget-trend-swatch" />Budget limit
        </span>
      </div>
      {node}
    </>
  );
}

export function BudgetVsActualChart({ data = [], currency = 'USD', height = 240 }) {
  const { show, move, hide, node } = useTooltip();
  const width = 620;
  const pad = { top: 18, right: 16, bottom: 42, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const top = Math.max(...data.flatMap((row) => [row.limitAmount || 0, row.spent || 0]), 1);
  const x = (index) => pad.left + (data.length <= 1 ? plotW / 2 : (index / (data.length - 1)) * plotW);
  const y = (value) => pad.top + plotH - ((Number(value) || 0) / top) * plotH;
  const series = [
    { key: 'limitAmount', label: 'Budget', color: 'var(--chart-yellow)', gradientId: 'budget-limit-gradient' },
    { key: 'spent', label: 'Actual', color: 'var(--chart-green)', gradientId: 'actual-spend-gradient' }
  ];

  if (!data.length) return <p className="small dim center" style={{ padding: '2rem 0' }}>No budgets this month</p>;

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart"
        preserveAspectRatio="xMidYMid meet"
        style={{ height }}
        onMouseLeave={hide}
      >
        <defs>
          <linearGradient id="budget-limit-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--chart-yellow)" />
            <stop offset="100%" stopColor="var(--chart-red)" />
          </linearGradient>
          <linearGradient id="actual-spend-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--chart-green)" />
            <stop offset="100%" stopColor="var(--chart-red)" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((fraction) => {
          const value = top * fraction;
          return (
            <g key={fraction}>
              <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} />
              <text x={pad.left - 8} y={y(value) + 4} textAnchor="end">{money(value, currency, { compact: true })}</text>
            </g>
          );
        })}

        {series.map((item) => {
          const points = data.map((row, index) => `${x(index)},${y(row[item.key])}`).join(' ');
          return (
            <g key={item.key}>
              <polyline
                points={points}
                fill="none"
                stroke={`url(#${item.gradientId})`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={item.key === 'limitAmount' ? '7 5' : undefined}
              />
              {data.map((row, index) => (
                <circle
                  key={`${item.key}-${row.categoryId || index}`}
                  cx={x(index)}
                  cy={y(row[item.key])}
                  r="5"
                  fill={item.color}
                  stroke="var(--surface)"
                  strokeWidth="2"
                  className="chart-hit"
                  onMouseEnter={(event) => show(event, `${row.name} · ${item.label} ${money(row[item.key], currency)}`)}
                  onMouseMove={move}
                  onMouseLeave={hide}
                />
              ))}
            </g>
          );
        })}

        {data.map((row, index) => (
          <text
            key={row.categoryId || index}
            x={x(index)}
            y={height - 12}
            textAnchor={data.length > 1 && index === 0 ? 'start' : data.length > 1 && index === data.length - 1 ? 'end' : 'middle'}
            title={row.name}
          >
            {row.name.length > 16 ? `${row.name.slice(0, 15)}…` : row.name}
          </text>
        ))}
        <line className="axis-line" x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} />
      </svg>
      <div className="legend">
        {series.map((item) => (
          <span key={item.key} className="legend-item">
            <span
              className={`budget-series-swatch ${item.key === 'limitAmount' ? 'dashed' : ''}`}
              style={{ background: item.key === 'limitAmount' ? 'linear-gradient(90deg, var(--chart-yellow), var(--chart-red))' : 'linear-gradient(90deg, var(--chart-green), var(--chart-red))' }}
            />{item.label}
          </span>
        ))}
      </div>
      {node}
    </>
  );
}

/* ------------------------------------------------------------ area line */

/** Daily spending through a month, as a filled line. */
export function AreaChart({
  data = [],
  currency = 'USD',
  height = 210,
  color = 'var(--chart-teal)',
  fillColor = 'var(--chart-blue)',
  xKey = 'label',
  yKey = 'total'
}) {
  const { show, move, hide, node } = useTooltip();
  const [active, setActive] = useState(null);

  const width = 620;
  const pad = { top: 16, right: 12, bottom: 26, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = data.map((d) => Number(d[yKey]) || 0);
  const max = Math.max(...values, 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.max(Math.ceil(max / step) * step, 1);

  const x = (i) => pad.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (value) => pad.top + plotH - (value / top) * plotH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(Number(d[yKey]) || 0)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${pad.top + plotH} L${x(0)},${pad.top + plotH} Z`;

  // Label roughly every fifth point so a 31-day month does not crowd the axis.
  const labelEvery = Math.max(1, Math.round(data.length / 7));

  if (!data.length) return <p className="small dim center" style={{ padding: '2rem 0' }}>No data for this period</p>;

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart"
        preserveAspectRatio="xMidYMid meet"
        style={{ height }}
        onMouseLeave={() => {
          setActive(null);
          hide();
        }}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="grid-line" x1={pad.left} x2={width - pad.right} y1={y(top * t)} y2={y(top * t)} />
            <text x={pad.left - 8} y={y(top * t) + 4} textAnchor="end">
              {money(top * t, currency, { compact: true })}
            </text>
          </g>
        ))}

        <path d={area} fill={fillColor} fillOpacity="0.12" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <g key={i}>
            {active === i && (
              <>
                <line x1={x(i)} x2={x(i)} y1={pad.top} y2={pad.top + plotH} stroke="var(--line-strong)" strokeDasharray="3 3" />
                <circle cx={x(i)} cy={y(Number(d[yKey]) || 0)} r="4.5" fill={color} stroke="var(--surface)" strokeWidth="2" />
              </>
            )}
            {/* Invisible hit area so hovering anywhere in the column works. */}
            <rect
              x={x(i) - plotW / data.length / 2}
              y={pad.top}
              width={plotW / data.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={(e) => {
                setActive(i);
                show(e, `${d[xKey]} · ${money(Number(d[yKey]) || 0, currency)}`);
              }}
              onMouseMove={move}
            />
            {i % labelEvery === 0 && (
              <text x={x(i)} y={height - 8} textAnchor="middle">{d[xKey]}</text>
            )}
          </g>
        ))}

        <line className="axis-line" x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} />
      </svg>
      {node}
    </>
  );
}

/* --------------------------------------------------------- horizontal bars */

/** Ranked categories — easier to read than a pie when names matter. */
export function RankedBars({ data = [], currency = 'USD', limit = 7, colorMode = 'category' }) {
  const rows = data.slice(0, limit);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const chartColors = DONUT_COLORS;

  if (!rows.length) return <p className="small dim center" style={{ padding: '1.5rem 0' }}>Nothing to rank yet</p>;

  return (
    <div className="stack gap-3">
      {rows.map((row, index) => {
        const color = chartColors[index % chartColors.length];
        return (
        <div key={row.categoryId || row.name} className="stack gap-1">
          <div className="row-between small">
            <span className="row gap-2">
              <span className="chip-dot" style={{ background: color }} />
              <span className="strong">{row.name}</span>
            </span>
            <span className="tabular muted">
              {money(row.total, currency)} <span className="dim">· {Math.round(row.share)}%</span>
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${(row.total / max) * 100}%`, background: color }} />
          </div>
        </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- sparkline */

/** Tiny inline trend, used in stat tiles. */
export function Sparkline({ values = [], width = 76, height = 26, color = 'var(--chart-teal)' }) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / span) * (height - 4) - 2}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="spark" viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
