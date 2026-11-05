import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { Card, Button, Empty, Chip, CategoryMark, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { money, monthLabel, longDate } from '../lib/format';

export default function Bookmarks() {
  const { currency } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get('/bookmarks'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const unsaveTip = async (id) => {
    try {
      await api.patch(`/tips/${id}`, { action: 'bookmark' });
      toast.success('Tip removed from saved.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const unsaveInsight = async (id) => {
    try {
      await api.patch(`/insights/${id}/bookmark`);
      toast.success('Monthly summary removed from saved.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading && !data) {
    return (
      <>
        <div className="page-head"><h1 className="page-title">Saved</h1></div>
        <div className="stack gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={110} radius={12} />)}</div>
      </>
    );
  }

  const tips = data?.tips || [];
  const insights = data?.insights || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Saved</h1>
          <p className="page-sub">Tips you pinned or saved, and the monthly summaries you kept.</p>
        </div>
        <Chip tone="honey">{data?.total || 0} items</Chip>
      </div>

      {tips.length === 0 && insights.length === 0 ? (
        <Card>
          <Empty
            icon="bookmark"
            title="Nothing saved yet"
            action={
              <div className="row gap-2" style={{ justifyContent: 'center' }}>
                <Link to="/app/tips"><Button variant="primary" icon="bulb">Browse tips</Button></Link>
                <Link to="/app/insights"><Button icon="book">Monthly insights</Button></Link>
              </div>
            }
          >
            Use the save or pin button on any tip or monthly summary and it will be kept here for later.
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-split">
          <div className="stack gap-3">
            <Card title="Saved tips" note={`${tips.length} kept`}>
              {tips.length === 0 ? (
                <Empty icon="bulb" title="No tips saved">Pin or save a tip and it appears here.</Empty>
              ) : (
                <div className="stack gap-2">
                  {tips.map((tip) => (
                    <article key={tip._id} className={`tip ${tip.status === 'pinned' ? 'pinned' : ''}`}>
                      <span className="tip-rank">
                        <Icon name={tip.status === 'pinned' ? 'pin' : 'bookmark'} size={14} />
                      </span>
                      <div className="grow">
                        <div className="row-between wrap gap-2">
                          <span className="strong small">{tip.title}</span>
                          {tip.potentialSaving > 0 && (
                            <span className="saving-badge">{money(tip.potentialSaving, currency)}</span>
                          )}
                        </div>
                        <p className="tiny muted mt-1">{tip.body}</p>
                        <div className="row-between mt-2">
                          {tip.category ? (
                            <span className="row gap-1">
                              <CategoryMark category={tip.category} size={18} />
                              <span className="tiny muted">{tip.category.name}</span>
                            </span>
                          ) : <span />}
                          <Button size="sm" variant="quiet" icon="x" onClick={() => unsaveTip(tip._id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="stack gap-3">
            <Card title="Saved summaries" note={`${insights.length} kept`}>
              {insights.length === 0 ? (
                <Empty icon="book" title="No summaries saved">
                  Save a monthly summary and it is kept here.
                </Empty>
              ) : (
                <div className="stack gap-2">
                  {insights.map((insight) => (
                    <article key={insight._id} className="tip">
                      <span className="tip-rank"><Icon name="book" size={14} /></span>
                      <div className="grow">
                        <div className="row-between gap-2">
                          <span className="strong small">{insight.monthLabel || monthLabel(insight.month)}</span>
                          <span className={`tiny tabular strong ${insight.stats?.balance >= 0 ? 'money-in' : 'money-out'}`}>
                            {money(insight.stats?.balance || 0, currency)}
                          </span>
                        </div>
                        <p className="tiny muted mt-1">{insight.summaryText}</p>
                        {insight.tipText && <p className="insight-quote tiny mt-2">{insight.tipText}</p>}
                        <div className="row-between mt-2">
                          <span className="tiny dim">Saved {longDate(insight.updatedAt || insight.generatedAt)}</span>
                          <Button size="sm" variant="quiet" icon="x" onClick={() => unsaveInsight(insight._id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
