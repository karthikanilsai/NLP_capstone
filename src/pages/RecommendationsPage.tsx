import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bookmark,
  CheckSquare,
  ExternalLink,
  Search,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import type { InsuranceCategory, PolicyRecord, PolicyRecommendation } from '../../shared/types';
import { useInsureMate } from '../context/InsureMateContext';
import { StatusIndicator } from '../components/StatusIndicator';
import { categoryLabel, formatINR, formatMoney } from '../utils/formatters';

export function RecommendationsPage() {
  const { sessionId: paramSessionId } = useParams();
  const navigate = useNavigate();
  const {
    recommendations,
    structured,
    savedPolicyIds,
    comparePolicyIds,
    loadSessionFromServer,
    toggleSavePlan,
    toggleComparePolicy,
  } = useInsureMate();

  const [catalogPolicies, setCatalogPolicies] = useState<PolicyRecord[]>([]);
  const [catalogCategory, setCatalogCategory] = useState<'all' | InsuranceCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'match' | 'coverage' | 'premium'>('match');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (paramSessionId) {
      setLoading(true);
      loadSessionFromServer(paramSessionId).finally(() => setLoading(false));
    }
  }, [paramSessionId, loadSessionFromServer]);

  useEffect(() => {
    if (!recommendations && !paramSessionId) {
      setLoading(true);
      fetch('/api/policies')
        .then((r) => r.json())
        .then((d: { policies: PolicyRecord[] }) => setCatalogPolicies(d.policies ?? []))
        .finally(() => setLoading(false));
    }
  }, [recommendations, paramSessionId]);

  const activeRecs: PolicyRecommendation[] = useMemo(() => {
    if (recommendations?.recommendations) {
      return recommendations.recommendations;
    }
    // Catalog fallback view when user clicks "Browse Policy Catalog" before starting NLP
    return catalogPolicies
      .filter((p) => (catalogCategory === 'all' ? true : p.category === catalogCategory))
      .map((policy) => ({
        policy,
        matchPercentage: 0,
        scoreBreakdown: {
          clauseMatchScore: 0,
          semanticSimilarityScore: 0,
          coverageFitScore: 0,
          budgetFitScore: 0,
          eligibilityPenalty: 0,
        },
        eligible: true,
        eligibilityIssues: [],
        hasUnmetMandatory: false,
        unmetMandatoryCount: 0,
        explanations: policy.benefits.slice(0, 3).map((b, i) => ({
          requirementId: `cat-${policy.id}-${i}`,
          requirementName: b,
          priority: 'preferred',
          preference: 'included',
          status: 'satisfied',
          policyCondition: b,
          explanation: b,
          sectionRef: policy.clauses[i]?.sectionRef ?? null,
          verified: true,
        })),
        highlightSummary: policy.overview,
      }));
  }, [recommendations, catalogPolicies, catalogCategory]);

  const filteredRecs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = activeRecs.filter((rec) => {
      if (mandatoryOnly && (rec.hasUnmetMandatory || !rec.eligible)) return false;
      if (!q) return true;
      const haystack = `${rec.policy.name} ${rec.policy.overview} ${rec.policy.benefits.join(' ')} ${rec.explanations.map((e) => e.policyCondition).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });

    if (recommendations) {
      list = [...list].sort((a, b) => {
        if (sortBy === 'coverage') return b.policy.maxCoverage - a.policy.maxCoverage;
        if (sortBy === 'premium') {
          const pa = a.policy.estimatedAnnualPremium ?? Number.MAX_SAFE_INTEGER;
          const pb = b.policy.estimatedAnnualPremium ?? Number.MAX_SAFE_INTEGER;
          return pa - pb;
        }
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        if (a.hasUnmetMandatory !== b.hasUnmetMandatory) return a.hasUnmetMandatory ? 1 : -1;
        return b.matchPercentage - a.matchPercentage;
      });
    }

    return list;
  }, [activeRecs, searchQuery, mandatoryOnly, sortBy, recommendations]);

  const isPersonalized = Boolean(recommendations);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
      {/* Page Title & Requirement Summary */}
      <div className="pb-6 border-b border-[#E5E5E5]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#171717]">
              {isPersonalized ? 'Your Personalized Recommendations' : 'Demonstration Policy Catalog'}
            </h1>
            {isPersonalized && structured ? (
              <div className="mt-2 text-sm text-[#737373] flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-[#171717]">
                  {categoryLabel(structured.insurance_type)}
                </span>
                {structured.coverage && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      Target Cover: {formatMoney(structured.coverage, structured.insurance_type)}
                    </span>
                  </>
                )}
                {structured.budget && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      Budget: ₹{structured.budget.toLocaleString('en-IN')}/yr
                    </span>
                  </>
                )}
                {structured.requirements.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Criteria:{' '}
                      {structured.requirements
                        .map((r) => `${r.name} (${r.priority})`)
                        .join(', ')}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[#737373]">
                Browsing the demonstration policy dataset. Start a conversational session to compute personalized match scores and requirement explanations.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/find"
              className="px-4 py-2 text-xs font-medium bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5] rounded-lg hover:bg-[#F7F7F7] transition-colors whitespace-nowrap"
            >
              {isPersonalized ? 'Refine Requirements' : 'Start Personalized Match'}
            </Link>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="py-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plans, waiting periods, or benefits..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#FFFFFF] border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isPersonalized && (
            <div className="flex items-center gap-1 p-1 bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg">
              {(['all', 'health', 'car', 'life', 'travel'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatalogCategory(cat)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                    catalogCategory === cat
                      ? 'bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5]'
                      : 'text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {isPersonalized && (
            <>
              <button
                type="button"
                onClick={() => setMandatoryOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  mandatoryOnly
                    ? 'bg-[#171717] text-[#FFFFFF] border-[#171717]'
                    : 'bg-[#FFFFFF] text-[#171717] border-[#E5E5E5] hover:bg-[#F7F7F7]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mandatory Met Only</span>
              </button>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'match' | 'coverage' | 'premium')}
                aria-label="Sort recommendations"
                className="px-3 py-2 text-xs font-medium bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
              >
                <option value="match">Sort: Best Match</option>
                <option value="coverage">Sort: Highest Coverage</option>
                <option value="premium">Sort: Lowest Verified Premium</option>
              </select>
            </>
          )}
        </div>
      </div>

      {isPersonalized && recommendations && (
        <section className="mb-5 rounded-lg border border-[#E5E5E5] bg-[#FAFAFA] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#171717]">Retrieved insurance website information</h2>
            <span className="text-xs text-[#737373]">
              {recommendations.scrapedPagesAvailable ?? 0} scraped page(s) available · {recommendations.knowledgeMatches?.length ?? 0} relevant passage(s) retrieved
            </span>
          </div>
          {(recommendations.knowledgeMatches?.length ?? 0) > 0 ? (
            <div className="mt-3 space-y-3">
              {recommendations.knowledgeMatches!.map((item, index) => (
                <div key={`${item.sourceUrl}-${index}`} className="border-t border-[#E5E5E5] pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#171717] underline underline-offset-2">
                      {item.title || item.providerDomain}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <span className="text-[11px] text-[#737373]">{item.category} · relevance {item.relevance}%</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#525252]">{item.snippet}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-[#737373]">
              No scraped pages were found for this category. Add permitted URLs to ml/urls.txt, run the scraper and cleaner, then generate recommendations again.
            </p>
          )}
          {(recommendations.policyLinkedScrapedPages ?? 0) === 0 && (recommendations.scrapedPagesAvailable ?? 0) > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-[#737373]">
              These passages are supporting research only. Official links below point to insurer or regulator websites, not to exact products in the demonstration dataset.
            </p>
          )}
        </section>
      )}

      {/* Recommendations List (Stacked 3-Column Cards) */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-52 border border-[#E5E5E5] rounded-lg bg-[#F7F7F7] animate-pulse"
            />
          ))}
        </div>
      ) : filteredRecs.length === 0 ? (
        <div className="border border-[#E5E5E5] rounded-lg p-10 text-center">
          <p className="text-sm text-[#737373]">
            No plans match your current filter criteria.
          </p>
          {mandatoryOnly && (
            <button
              type="button"
              onClick={() => setMandatoryOnly(false)}
              className="mt-4 px-4 py-2 text-xs font-medium bg-[#171717] text-[#FFFFFF] rounded-lg"
            >
              Show All Plans (Including Unmet Mandatory)
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRecs.map((rec) => {
            const p = rec.policy;
            const isSaved = savedPolicyIds.has(p.id);
            const isCompared = comparePolicyIds.includes(p.id);

            return (
              <article
                key={p.id}
                className="border border-[#E5E5E5] rounded-lg bg-[#FFFFFF] p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
              >
                {/* LEFT SECTION: Plan Information */}
                <div className="lg:col-span-4 space-y-3">
                  <div>
                    <div className="text-xs text-[#737373] flex items-center gap-2">
                      <span>{categoryLabel(p.category)}</span>
                      {p.isDemoDataset && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Demonstration Plan</span>
                        </>
                      )}
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-[#171717] leading-snug">
                      {p.name}
                    </h2>
                  </div>

                  <dl className="space-y-2 text-xs pt-1 border-t border-[#E5E5E5]">
                    <div className="flex justify-between gap-2 pt-1">
                      <dt className="text-[#737373]">Coverage</dt>
                      <dd className="font-medium text-[#171717] tabular-nums text-right">
                        {formatMoney(p.minCoverage, p.category)} –{' '}
                        {formatMoney(p.maxCoverage, p.category)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#737373]">Waiting Period</dt>
                      <dd className="font-medium text-[#171717] text-right">
                        {p.importantWaitingPeriod}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#737373]">
                        {p.category === 'health' ? 'Room Rent Limit' : 'Cover Limits'}
                      </dt>
                      <dd className="font-medium text-[#171717] text-right">
                        {p.roomRentOrLimitSummary}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#737373]">Annual Premium</dt>
                      <dd className="font-medium text-[#171717] tabular-nums text-right">
                        {p.premiumVerified && p.estimatedAnnualPremium !== null
                          ? `${formatINR(p.estimatedAnnualPremium)} / yr`
                          : 'Unverified (Quote required)'}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* MIDDLE SECTION: Match Information */}
                <div className="lg:col-span-5 lg:border-l lg:border-[#E5E5E5] lg:pl-6 space-y-3">
                  {isPersonalized ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-2xl font-semibold text-[#171717] tabular-nums">
                        {rec.matchPercentage}% Match
                      </div>
                      {rec.hasUnmetMandatory && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626]">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {rec.unmetMandatoryCount} mandatory requirement
                            {rec.unmetMandatoryCount > 1 ? 's' : ''} unmet
                          </span>
                        </span>
                      )}
                      {!rec.eligible && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626]">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Eligibility limit</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-[#171717]">
                      Verified Schedule Highlights
                    </div>
                  )}

                  <div>
                    <h3 className="text-xs font-semibold text-[#525252] mb-2">
                      {isPersonalized ? 'Why this plan matches you?' : 'Key Highlights'}
                    </h3>
                    <ul className="space-y-2">
                      {rec.explanations.map((item) => (
                        <li
                          key={item.requirementId}
                          className="flex items-start gap-2.5 text-sm text-[#171717]"
                        >
                          <span className="mt-0.5">
                            <StatusIndicator status={item.status} />
                          </span>
                          <div className="leading-snug">
                            <span className="font-medium">{item.policyCondition}</span>
                            {isPersonalized && item.priority === 'mandatory' && (
                              <span className="ml-1.5 text-xs text-[#737373]">(Mandatory)</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {!rec.eligible && rec.eligibilityIssues.length > 0 && (
                    <p className="text-xs text-[#DC2626] pt-1">
                      Eligibility note: {rec.eligibilityIssues[0]}
                    </p>
                  )}
                </div>

                {/* RIGHT SECTION: Action Buttons */}
                <div className="lg:col-span-3 lg:border-l lg:border-[#E5E5E5] lg:pl-6 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => navigate(`/policies/${p.id}`)}
                    className="w-full px-4 py-2.5 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] transition-colors whitespace-nowrap"
                  >
                    View Details
                  </button>

                  {p.officialUrl ? (
                    <a
                      href={p.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#FFFFFF] text-[#171717] text-xs font-medium rounded-lg border border-[#E5E5E5] hover:bg-[#F7F7F7] transition-colors whitespace-nowrap"
                    >
                      <span>Go to Official Website</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <div
                      title="No verified external insurer URL is attached to this demonstration plan"
                      className="w-full px-4 py-2.5 bg-[#F7F7F7] text-[#737373] text-xs font-medium rounded-lg border border-[#E5E5E5] text-center"
                    >
                      Official link unavailable
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => toggleSavePlan(p.id)}
                      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        isSaved
                          ? 'bg-[#F7F7F7] text-[#171717] border-[#171717]'
                          : 'bg-[#FFFFFF] text-[#525252] border-[#E5E5E5] hover:text-[#171717]'
                      }`}
                    >
                      <Bookmark
                        className={`w-3.5 h-3.5 ${isSaved ? 'fill-[#171717]' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{isSaved ? 'Saved' : 'Save'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleComparePolicy(p.id)}
                      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        isCompared
                          ? 'bg-[#F7F7F7] text-[#171717] border-[#171717]'
                          : 'bg-[#FFFFFF] text-[#525252] border-[#E5E5E5] hover:text-[#171717]'
                      }`}
                    >
                      {isCompared ? (
                        <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Square className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{isCompared ? 'Selected' : 'Compare'}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
