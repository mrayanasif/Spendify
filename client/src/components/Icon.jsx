/**
 * Hand-built icon set.
 *
 * Every glyph is drawn on a 24x24 grid with a 1.7 stroke so the whole app keeps
 * one weight. Kept as paths in this file rather than pulled from an icon package
 * so the set stays small and consistent with the rest of the design.
 */

const PATHS = {
  /* --- navigation --- */
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  tag: 'M3 11V5a2 2 0 0 1 2-2h6l9 9-8 8-9-9z|M7.5 7.5h.01',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z|M19 19v2H6',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z',
  bookmark: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z',
  upload: 'M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0',
  users: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M2 21a7 7 0 0 1 14 0|M17 4.5a4 4 0 0 1 0 7.5|M18 14.5a6.5 6.5 0 0 1 4 6.5',
  shield: 'M12 3l8 3v5c0 5-3.4 9.1-8 10-4.6-.9-8-5-8-10V6z|M9 12l2 2 4-4',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z|M17 9a4 4 0 0 1 0 6|M7 14v5h3v-4',

  /* --- actions --- */
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z|M14.5 6.5l3 3',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13|M10 11v6M14 11v6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M16.2 16.2L21 21',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  dots: 'M12 6.5h.01M12 12h.01M12 17.5h.01',
  download: 'M12 4v12M8 12l4 4 4-4M4 20h16',
  mail: 'M3 6h18v12H3z|M3 7l9 6 9-6',
  pin: 'M9 3h6l-1 6 4 4v2H6v-2l4-4z|M12 15v6',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7|M20 4v4h-4',
  logout: 'M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3|M15 8l4 4-4 4M19 12H9',
  copy: 'M9 9h10v12H9z|M15 5H5v12',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off': 'M3 3l18 18|M10.6 10.6a2 2 0 0 0 2.8 2.8|M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.1 3.8|M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a10.5 10.5 0 0 0 4-.8',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1|M3 4v4h4|M12 8v4.5l3 1.8',

  /* --- arrows / chevrons --- */
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  right: 'M5 12h14M13 6l6 6-6 6',
  left: 'M19 12H5M11 18l-6-6 6-6',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronDown: 'M6 9l6 6 6-6',
  trendUp: 'M3 17l6-6 4 4 8-8|M15 7h6v6',
  trendDown: 'M3 7l6 6 4-4 8 8|M15 17h6v-6',

  /* --- status --- */
  bell: 'M18 16V11a6 6 0 1 0-12 0v5l-2 3h16z|M10 22h4',
  alert: 'M12 3l9.5 17H2.5z|M12 10v4M12 17.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M12 11v5M12 8h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M12 7v5.2l3.2 2',
  calendar: 'M4 6h16v15H4z|M4 10h16M9 3v4M15 3v4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
  type: 'M4 7V5h16v2|M12 5v14M9 19h6',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2|M14 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0|M8 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0|M14 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0',

  /* --- money + categories --- */
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z|M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  rupee: 'M6 4h12M6 8h12M6 4v7a4 4 0 0 0 4 4h2l5 5',
  sparkle: 'M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M12 7v10M9.5 9.5h4a2 2 0 0 1 0 4h-4m0 0h4.2',
  wallet: 'M3 7a2 2 0 0 1 2-2h12v3|M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H4|M17 13h.01',
  coins: 'M8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12.5 11.2A5 5 0 1 1 11 20.7|M3 13v3c0 1.7 2.2 3 5 3',
  briefcase: 'M3 8h18v12H3z|M9 8V5h6v3|M3 13h18',
  award: 'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M8.5 13L7 21l5-2.5L17 21l-1.5-8',
  gift: 'M3 11h18v10H3z|M3 7h18v4H3z|M12 7v14|M12 7S10.5 3 8 3a2 2 0 0 0 0 4h4zM12 7s1.5-4 4-4a2 2 0 0 1 0 4h-4z',
  bowl: 'M3 11h18a9 9 0 0 1-18 0z|M12 11V8M12 8a2 2 0 1 1 2-2|M3 20h18',
  bus: 'M5 4h14a1 1 0 0 1 1 1v11H4V5a1 1 0 0 1 1-1z|M4 11h16|M7 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  home: 'M4 10l8-6 8 6v10H4z|M9.5 20v-6h5v6',
  repeat: 'M4 9a4 4 0 0 1 4-4h12|M17 2l3 3-3 3|M20 15a4 4 0 0 1-4 4H4|M7 22l-3-3 3-3',
  ticket: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z|M9 7v10',
  scale: 'M12 4v16M6 8h12|M6 8L3 15h6zM18 8l-3 7h6z',
  layers: 'M12 3l9 5-9 5-9-5z|M3 13l9 5 9-5|M3 17l9 5 9-5'
};

export default function Icon({ name, size = 18, stroke = 1.7, className = '', style, title }) {
  const raw = PATHS[name] || PATHS.dots;
  const segments = raw.split('|');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {segments.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** Category icons come from the same set, mapped by the key stored in the DB. */
export const CATEGORY_ICONS = [
  'bowl', 'bus', 'home', 'book', 'repeat', 'ticket', 'coins', 'wallet',
  'briefcase', 'award', 'gift', 'bulb', 'target', 'layers', 'scale', 'camera', 'dots'
];
