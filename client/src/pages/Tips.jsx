import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Card, Button, Empty, Chip, CategoryMark, Skeleton, Banner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money } from '../lib/format';
import '../styles/tips.css';

export default function Tips() {
  const { currency } = useAuth();
  const toast = useToast();

  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/tips', { includeDismissed: showDismissed });
      setTips(data.tips);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [showDismissed, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, action) => {
    try {
      await api.patch(`/tips/${id}`, { action });
      toast.success(action === 'dismiss' ? 'Tip dismissed.' : action === 'save' ? 'Tip saved to bookmarks.' : 'Tip updated.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const visible = tips.filter((t) => (showDismissed ? true : t.status !== 'dismissed'));
  const totalPotential = visible
    .filter((t) => t.status !== 'dismissed')
    .reduce((sum, t) => sum + (t.potentialSaving || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Saving tips</h1>
          <p className="page-sub">
            Built by comparing this month against your own averages and the budgets you set.
          </p>
        </div>

        <div className="row gap-2 hide-print">
          <Button
            icon={showDismissed ? 'eye' : 'history'}
            onClick={() => setShowDismissed((v) => !v)}
          >
            {showDismissed ? 'Hide dismissed' : 'Show dismissed'}
          </Button>
          <Button variant="primary" icon="refresh" onClick={load}>Refresh</Button>
        </div>
      </div>

      {totalPotential > 0 && (
        <div className="hero tips-hero mb-3">
          <div className="tips-hero-copy">
            <span className="eyebrow">If you acted on every suggestion below</span>
            <div className="hero-figure figure">
              {money(totalPotential, currency)}
            </div>
            <p className="small" style={{ color: 'rgba(255,255,255,0.6)' }}>
              An upper estimate, added up across {visible.filter((t) => t.status !== 'dismissed').length} suggestions.
            </p>
          </div>

          <span className="tips-hero-badge" aria-hidden="true">
            <Icon name="bulb" size={34} />
          </span>
        </div>
      )}

      {loading && tips.length === 0 ? (
        <div className="stack gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={110} radius={12} />)}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <Empty icon="bulb" title="No tips yet">
            Tips appear once there is enough history to compare against — usually after two or three weeks of
            logging, or as soon as you set a budget.
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-split">
          <div className="stack gap-2">
            {[...visible]
              .sort((a, b) => {
                if (a.status === 'pinned' && b.status !== 'pinned') return -1;
                if (a.status !== 'pinned' && b.status === 'pinned') return 1;
                return 0;
              })
              .map((tip, index) => (
                <article
                  key={tip._id}
                  className={`tip-tip ${tip.status === 'pinned' ? 'pinned' : ''}`}
                  style={{ opacity: tip.status === 'dismissed' ? 0.6 : 1 }}
                >
                  <div className="tip-tip-top">
                    <div className="tip-tip-left">
                      <span className="tip-tip-rank">{tip.status === 'pinned' ? <Icon name="pin" size={12} /> : index + 1}</span>
                      <span className="tip-tip-title">{tip.title}</span>
                    </div>
                    <div className="tip-tip-actions">
                      {tip.status === 'dismissed' ? (
                        <button
                          className="tip-icon-btn"
                          aria-label="Restore"
                          title="Restore"
                          onClick={() => act(tip._id, 'restore')}
                        >
                          <Icon name="refresh" size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            className={`tip-icon-btn ${tip.bookmarked ? 'active' : ''}`}
                            aria-label={tip.bookmarked ? 'Unsave' : 'Save'}
                            title={tip.bookmarked ? 'Unsave' : 'Save'}
                            onClick={() => act(tip._id, 'bookmark')}
                          >
                            <Icon name="bookmark" size={16} />
                          </button>
                          <button
                            className={`tip-icon-btn ${tip.status === 'pinned' ? 'active' : ''}`}
                            aria-label={tip.status === 'pinned' ? 'Unpin' : 'Pin'}
                            title={tip.status === 'pinned' ? 'Unpin' : 'Pin'}
                            onClick={() => act(tip._id, tip.status === 'pinned' ? 'unpin' : 'pin')}
                          >
                            <Icon name="pin" size={16} />
                          </button>
                          <button
                            className="tip-icon-btn"
                            aria-label="Dismiss"
                            title="Dismiss"
                            onClick={() => act(tip._id, 'dismiss')}
                          >
                            <Icon name="x" size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="tip-tip-meta">
                    {tip.potentialSaving > 0 && (
                      <span className="saving-badge">could save {money(tip.potentialSaving, currency)}</span>
                    )}
                    {tip.category && (
                      <span className="tip-tip-category">
                        <CategoryMark category={tip.category} size={16} />
                        <span className="tiny muted">{tip.category.name}</span>
                      </span>
                    )}
                    {tip.status === 'dismissed' && <span className="tip-tip-chip">Dismissed</span>}
                    {tip.bookmarked && tip.status !== 'dismissed' && <span className="tip-tip-chip"><Icon name="bookmark" size={10} /> Saved</span>}
                  </div>

                  <p className="tip-tip-body">{tip.body}</p>
                </article>
              ))}

            <div className="tiny muted mt-2" style={{ textAlign: 'center' }}>Generated from your entries. Not financial advice.</div>
          </div>

          <div className="stack gap-3">
            <Card title="How tips are ranked">
              <p className="small muted" style={{ lineHeight: 1.4 }}>
                Ranked by potential savings. Pinned stay top.
              </p>

              <ul className="stack gap-2 mt-2">
                {[
                  'Pinned tips stay at the top',
                  'Dismissed tips hidden by default',
                  'Saved tips appear on your Saved page',
                  'Numbers refresh on load'
                ].map((line) => (
                  <li key={line} className="row gap-2 small muted">
                    <Icon name="check" size={13} style={{ color: 'var(--income)', marginTop: 2 }} />
                    {line}
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Where the numbers come from">
              <Banner icon="info" style={{ padding: '0.6rem 0.8rem' }}>
                <span style={{ fontSize: '0.85rem' }}>Your averages, budgets, goal, and frequency. No student comparisons.</span>
              </Banner>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
