import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, Columns2, Search, Trash2 } from 'lucide-react';
import type { InsuranceCategory } from '../../shared/types';
import { useInsureMate } from '../context/InsureMateContext';
import { categoryLabel, formatDateShort, formatINR, formatMoney } from '../utils/formatters';

export function SavedPlansPage() {
  const navigate = useNavigate();
  const { savedPlans, toggleSavePlan, comparePolicyIds, toggleComparePolicy } = useInsureMate();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | InsuranceCategory>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return savedPlans.filter((sp) => {
      if (categoryFilter !== 'all' && sp.policy.category !== categoryFilter) return false;
      if (!q) return true;
      return `${sp.policy.name} ${sp.policy.overview}`.toLowerCase().includes(q);
    });
  }, [savedPlans, search, categoryFilter]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <header className="pb-5 border-b border-[#E5E5E5] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#171717]">
            Saved Plans
          </h1>
          <p className="mt-1 text-sm text-[#737373]">
            Bookmarked insurance policies stored in your workspace for quick review and comparison.
          </p>
        </div>

        <Link
          to="/find"
          className="px-4 py-2 text-xs font-medium bg-[#171717] text-[#FFFFFF] rounded-lg hover:bg-[#2E2E2E] transition-colors whitespace-nowrap"
        >
          Find More Plans
        </Link>
      </header>

      {savedPlans.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search saved plans..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#FFFFFF] border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg">
            {(['all', 'health', 'car', 'life', 'travel'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  categoryFilter === cat
                    ? 'bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5]'
                    : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {savedPlans.length === 0 ? (
        <div className="border border-[#E5E5E5] rounded-lg p-12 text-center space-y-3">
          <Bookmark className="w-6 h-6 mx-auto text-[#737373]" aria-hidden="true" />
          <h2 className="text-base font-semibold text-[#171717]">No saved plans yet</h2>
          <p className="text-sm text-[#737373] max-w-md mx-auto">
            Bookmark policies from your personalized recommendations or the policy catalog to keep track of them here.
          </p>
          <div className="pt-2">
            <Link
              to="/find"
              className="inline-flex items-center px-5 py-2.5 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] transition-colors"
            >
              Start Finding Insurance
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-[#E5E5E5] rounded-lg p-8 text-center text-sm text-[#737373]">
          No saved plans match your search filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const p = item.policy;
            const isCompared = comparePolicyIds.includes(p.id);
            return (
              <div
                key={item.id}
                className="border border-[#E5E5E5] rounded-lg p-5 bg-[#FFFFFF] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="text-xs text-[#737373] flex items-center gap-2">
                    <span>{categoryLabel(p.category)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Saved {formatDateShort(item.savedAt)}</span>
                  </div>
                  <h2 className="text-base font-semibold text-[#171717]">{p.name}</h2>
                  <div className="text-xs text-[#525252] tabular-nums flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Coverage: {formatMoney(p.minCoverage, p.category)} –{' '}
                      {formatMoney(p.maxCoverage, p.category)}
                    </span>
                    <span>
                      Premium:{' '}
                      {p.premiumVerified && p.estimatedAnnualPremium !== null
                        ? `${formatINR(p.estimatedAnnualPremium)}/yr`
                        : 'Unverified'}
                    </span>
                    <span>{p.importantWaitingPeriod}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/policies/${p.id}`)}
                    className="px-4 py-2 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] transition-colors whitespace-nowrap"
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleComparePolicy(p.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      isCompared
                        ? 'bg-[#F7F7F7] text-[#171717] border-[#171717]'
                        : 'bg-[#FFFFFF] text-[#171717] border-[#E5E5E5] hover:bg-[#F7F7F7]'
                    }`}
                  >
                    <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isCompared ? 'Selected' : 'Compare'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSavePlan(p.id)}
                    aria-label={`Remove ${p.name} from saved plans`}
                    className="p-2 text-[#737373] hover:text-[#DC2626] border border-[#E5E5E5] rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
