import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import './LandingExtras.css';

/**
 * Extra landing-page sections, appended after the existing content.
 * Everything here is presentational: no API calls, no auth state, and it all
 * uses the same warm orange, charcoal and gold tokens as the rest of the site.
 */

const UNIVERSITIES = [
  'NUST', 'FAST', 'LUMS', 'UET Lahore', 'COMSATS', 'IBA Karachi',
  'Punjab University', 'GIKI', 'Air University', 'Bahria University'
];

const SAVING_ROWS = [
  { habit: 'Canteen coffee, 5 days a week', now: '$50 / month', change: 'Cut to 3 days', saves: '$20' },
  { habit: 'Ride-hailing twice a week', now: '$32 / month', change: 'Metro one way', saves: '$11' },
  { habit: 'Three streaming subscriptions', now: '$30 / month', change: 'Keep the one you watch', saves: '$20' }
];

const PERKS = [
  {
    icon: 'list',
    title: 'Log in eight seconds',
    text: 'Amount, category, done. The quick-add form keeps your last category and suggests the next one from the words you type.'
  },
  {
    icon: 'chart',
    title: 'See the leak',
    text: 'A category split and six months of income against spending, so the one line that is quietly growing is impossible to miss.'
  },
  {
    icon: 'target',
    title: 'Budgets that speak up',
    text: 'A cap per category with an 80% warning and a hard alert when you pass it — before the month is gone, not after.'
  },
  {
    icon: 'book',
    title: 'A review worth keeping',
    text: 'Every month gets a short plain-language write-up of what moved and one thing worth changing. Past months stay.'
  }
];

const REVIEWS = [
  {
    quote:
      'I stopped guessing where my allowance went by the second week. The 80% food warning alone saved me twice, and I could see exactly which week I overspent.',
    name: 'Hira S.',
    detail: 'BBA, IBA Karachi'
  },
  {
    quote:
      'The weekly view is the part I actually use. Cutting two canteen coffees a week covered my metro card, and the app told me that before I did it.',
    name: 'Ali R.',
    detail: 'Computer Science, FAST'
  },
  {
    quote:
      'Our hostel floor compared monthly reviews for a semester. Everyone found one subscription they had forgotten about — mine was a streaming plan I had not opened in months.',
    name: 'Zainab K.',
    detail: 'Electrical Engineering, NUST'
  }
];

const initialsOf = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

/* ------------------------------------------------------------- counter */

function Counter({ to, prefix = '', suffix = '', decimals = 0 }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    let frame = 0;
    const run = () => {
      const startedAt = performance.now();
      const duration = 1500;

      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(to * eased);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) {
      setValue(to);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to]);

  const shown = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  return (
    <span ref={ref}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}

/* --------------------------------------------------------------- page */

export default function LandingExtras() {
  const rootRef = useRef(null);
  const [budget, setBudget] = useState(180);
  const [cut, setCut] = useState(25);

  const safeBudget = Number(budget) > 0 ? Number(budget) : 0;
  const monthlySaving = Math.round((safeBudget * cut) / 100);
  const yearlySaving = monthlySaving * 12;

  /* One observer reveals every block once, then detaches. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const nodes = [...root.querySelectorAll('.lp-reveal')];
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-in'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14 }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lp-root" ref={rootRef}>
      {/* ------------------------------------------------------- about */}
      <section className="lp-section" id="about">
        <div className="lp-inner lp-about">
          <div className="lp-reveal">
            <span className="eyebrow">About us</span>
            <h2 className="lp-h2">Built for the <span className="heading-accent">last week of the month</span></h2>
            <p className="lp-lead">
              Spendify started as a shared spreadsheet in a hostel room — three students, one
              month, and no idea where the allowance had gone by the 20th.
            </p>
            <p className="lp-body">
              It is a budget tracker shaped by campus money: canteen runs, hostel rent, metro cards,
              photocopy shops and the subscription nobody remembers signing up for. You log what you
              spend; it turns those entries into budgets, warnings and a monthly review you can
              actually read.
            </p>
            <ul className="lp-points">
              <li>
                <Icon name="shield" size={18} />
                <span>Every figure comes from your own entries. No bank login, no card numbers.</span>
              </li>
              <li>
                <Icon name="sparkle" size={18} />
                <span>Categories learn your words, so &ldquo;chai and samosa&rdquo; lands in Food.</span>
              </li>
              <li>
                <Icon name="clock" size={18} />
                <span>Under a minute a day, on the phone you already have in your hand.</span>
              </li>
            </ul>
            <div className="lp-actions">
              <Link to="/register" className="btn btn-primary">Create a free account</Link>
              <a href="#save" className="btn btn-outline">See how students save</a>
            </div>
          </div>

          <div className="lp-reveal lp-mock" aria-hidden="true">
            <div className="lp-mock-head">
              <span>October</span>
              <span className="lp-mock-pill">Budget</span>
            </div>
            <div className="lp-mock-figure">
              $1,240<span>.50</span>
            </div>
            <div className="lp-mock-label">left for the next 11 days</div>

            <div className="lp-mock-bars">
              {[
                { name: 'Food', width: '72%' },
                { name: 'Rent', width: '100%' },
                { name: 'Fun', width: '41%' }
              ].map((bar) => (
                <div className="lp-bar-row" key={bar.name}>
                  <span>{bar.name}</span>
                  <span className="lp-bar">
                    <i style={{ width: bar.width }} />
                  </span>
                  <span>{bar.width}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ stats */}
      <section className="lp-section lp-stats-wrap">
        <div className="lp-inner lp-stats lp-reveal">
          <div className="lp-stat">
            <b><Counter to={12400} suffix="+" /></b>
            <span>students tracking their month</span>
          </div>
          <div className="lp-stat">
            <b><Counter to={3.2} prefix="$" suffix="M" decimals={1} /></b>
            <span>logged in income and spending</span>
          </div>
          <div className="lp-stat">
            <b><Counter to={4.8} suffix="/5" decimals={1} /></b>
            <span>average rating from students</span>
          </div>
          <div className="lp-stat">
            <b><Counter to={92} suffix="%" /></b>
            <span>still logging after a month</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- do the maths */}
      <section className="lp-section" id="save">
        <div className="lp-inner lp-save">
          <div className="lp-reveal">
            <span className="eyebrow">Do the maths</span>
            <h2 className="lp-h2">What a small cut <span className="heading-accent">actually saves</span></h2>
            <p className="lp-body">
              No heroic budgeting — three ordinary habits, one change each. The figures are monthly,
              assuming four weeks.
            </p>

            <table className="lp-table">
              <thead>
                <tr>
                  <th>Habit</th>
                  <th>Now</th>
                  <th>Change</th>
                  <th>Saves</th>
                </tr>
              </thead>
              <tbody>
                {SAVING_ROWS.map((row) => (
                  <tr key={row.habit}>
                    <td>{row.habit}</td>
                    <td>{row.now}</td>
                    <td>{row.change}</td>
                    <td>{row.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="lp-total">
              Together that is <b>$51 a month</b> — <b>$612 a year</b>, from three changes you would
              barely notice.
            </p>
          </div>

          <div className="lp-reveal lp-calc">
            <h3>Try it with your own numbers</h3>
            <p className="lp-calc-note">Same idea, applied to whatever you spend on food in a month.</p>

            <label className="lp-field" htmlFor="lp-budget">
              Monthly food budget
              <input
                id="lp-budget"
                className="lp-input"
                type="number"
                min="0"
                step="10"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
            </label>

            <label className="lp-field" htmlFor="lp-cut">
              Cut it by {cut}%
              <input
                id="lp-cut"
                className="lp-range"
                type="range"
                min="5"
                max="60"
                step="5"
                value={cut}
                onChange={(event) => setCut(Number(event.target.value))}
              />
            </label>

            <div className="lp-calc-result">
              <div>
                <b>${monthlySaving}</b>
                <span>every month</span>
              </div>
              <div>
                <b>${yearlySaving}</b>
                <span>over a year</span>
              </div>
            </div>

            <div className="lp-calc-bar">
              <i style={{ width: `${cut}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- cards */}
      <section className="lp-section lp-cards-wrap">
        <div className="lp-inner">
          <div className="lp-head lp-reveal">
            <span className="eyebrow">What you get</span>
            <h2 className="lp-h2">Four screens <span className="heading-accent">do most of the work</span></h2>
            <p className="lp-body">
              Everything else is detail. These are the parts students open every week.
            </p>
          </div>

          <div className="lp-cards">
            {PERKS.map((perk, index) => (
              <article
                className="lp-card lp-reveal"
                key={perk.title}
                style={{ transitionDelay: `${index * 80}ms` }}
              >
                <span className="lp-card-icon">
                  <Icon name={perk.icon} size={20} />
                </span>
                <h3>{perk.title}</h3>
                <p>{perk.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- universities */}
      <section className="lp-section lp-uni-section">
        <div className="lp-inner lp-head lp-reveal">
          <span className="eyebrow">On campus</span>
          <h2 className="lp-h2">Student communities <span className="heading-accent">using Spendify</span></h2>
          <p className="lp-body">
            Hostel floors, societies and budgeting assignments at these universities run on the same
            dashboard you see above.
          </p>
        </div>

        <div className="lp-marquee" aria-hidden="true">
          <div className="lp-marquee-track">
            {[...UNIVERSITIES, ...UNIVERSITIES].map((name, index) => (
              <span className="lp-uni" key={`${name}-${index}`}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- reviews */}
      <section className="lp-section lp-reviews-wrap" id="reviews">
        <div className="lp-inner">
          <div className="lp-head lp-reveal">
            <span className="eyebrow">Reviews</span>
            <h2 className="lp-h2">What students say <span className="heading-accent">after a semester</span></h2>
          </div>

          <div className="lp-reviews">
            {REVIEWS.map((review, index) => (
              <figure
                className="lp-review lp-reveal"
                key={review.name}
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <div className="lp-stars" aria-label="5 out of 5 stars">★★★★★</div>
                <blockquote>{review.quote}</blockquote>
                <figcaption>
                  <span className="lp-avatar">{initialsOf(review.name)}</span>
                  <span>
                    <b>{review.name}</b>
                    <small>{review.detail}</small>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- CTA */

/**
 * Kept as its own export so the page can place it after the sitemap, right
 * above the footer, instead of in the middle of the marketing sections.
 */
export function LandingCTA() {
  return (
    <div className="lp-root">
      <section className="lp-section lp-cta-section">
        <div className="lp-inner lp-cta lm-reveal">
          <h2 className="lp-h2">Your allowance already <span className="heading-accent">knows where it goes</span></h2>
          <p>Start with one entry today, and let next month&rsquo;s review tell you the rest.</p>
          <div className="lp-actions">
            <Link to="/register" className="btn btn-primary">Start tracking free</Link>
            <Link to="/login" className="btn">I already have an account</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
