import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Columns2,
  ExternalLink,
  FileDown,
  FileText,
} from 'lucide-react';
import type { PolicyRecord } from '../../shared/types';
import { useInsureMate } from '../context/InsureMateContext';
import { StatusIndicator } from '../components/StatusIndicator';
import { categoryLabel, formatINR, formatMoney } from '../utils/formatters';

export function PolicyDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    recommendations,
    savedPolicyIds,
    comparePolicyIds,
    toggleSavePlan,
    toggleComparePolicy,
  } = useInsureMate();

  const [policy, setPolicy] = useState<PolicyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/policies/${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Policy not found.');
        return r.json();
      })
      .then((d: { policy: PolicyRecord }) => setPolicy(d.policy))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load policy.'))
      .finally(() => setLoading(false));
  }, [id]);

  const matchedRecommendation = useMemo(() => {
    if (!policy || !recommendations?.recommendations) return null;
    return recommendations.recommendations.find((r) => r.policy.id === policy.id) ?? null;
  }, [policy, recommendations]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        <div className="h-40 bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 space-y-4">
        <p className="text-sm text-[#DC2626]">{error || 'Policy not found.'}</p>
        <button
          type="button"
          onClick={() => navigate('/recommendations')}
          className="px-4 py-2 text-xs font-medium bg-[#171717] text-[#FFFFFF] rounded-lg"
        >
          Back to Recommendations
        </button>
      </div>
    );
  }

  const isSaved = savedPolicyIds.has(policy.id);
  const isCompared = comparePolicyIds.includes(policy.id);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      {/* Breadcrumb */}
      <div>
        <Link
          to="/recommendations"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#737373] hover:text-[#171717] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to Recommendations</span>
        </Link>
      </div>

      {/* Header Overview */}
      <header className="pb-6 border-b border-[#E5E5E5] flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs text-[#737373] flex items-center gap-2">
            <span>{categoryLabel(policy.category)}</span>
            {policy.isDemoDataset && (
              <>
                <span aria-hidden="true">·</span>
                <span>Demonstration Policy Schedule</span>
              </>
            )}
            {matchedRecommendation && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#171717] tabular-nums">
                  {matchedRecommendation.matchPercentage}% Match
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#171717]">
            {policy.name}
          </h1>
          <p className="text-sm text-[#525252] leading-relaxed">{policy.overview}</p>
        </div>

        <div className="flex flex-wrap lg:flex-col gap-2 shrink-0 lg:w-56">
          <a
            href={`/api/policies/${encodeURIComponent(policy.id)}/pdf`}
            download={policy.documentTitle}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] transition-colors whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Policy Document PDF</span>
          </a>

          {policy.officialUrl ? (
            <a
              href={policy.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FFFFFF] text-[#171717] text-xs font-medium rounded-lg border border-[#E5E5E5] hover:bg-[#F7F7F7] transition-colors whitespace-nowrap"
            >
              <span>Go to Official Website</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : (
            <div className="px-4 py-2.5 bg-[#F7F7F7] text-[#737373] text-xs font-medium rounded-lg border border-[#E5E5E5] text-center">
              Official link unavailable
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => toggleSavePlan(policy.id)}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
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
              onClick={() => toggleComparePolicy(policy.id)}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                isCompared
                  ? 'bg-[#F7F7F7] text-[#171717] border-[#171717]'
                  : 'bg-[#FFFFFF] text-[#525252] border-[#E5E5E5] hover:text-[#171717]'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isCompared ? 'Added' : 'Compare'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Section: How this policy matches your requirements */}
      <section className="border border-[#E5E5E5] rounded-lg bg-[#FFFFFF] overflow-hidden">
        <div className="px-5 py-4 bg-[#F7F7F7] border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#171717]">
              How this policy matches your requirements
            </h2>
            <p className="text-xs text-[#737373] mt-0.5">
              Each requirement is checked against verified clauses with source document references.
            </p>
          </div>
          {matchedRecommendation && (
            <div className="text-xs font-medium text-[#171717] tabular-nums">
              Clause Score: {matchedRecommendation.scoreBreakdown.clauseMatchScore}% · Semantic
              Score: {matchedRecommendation.scoreBreakdown.semanticSimilarityScore}%
            </div>
          )}
        </div>

        {matchedRecommendation ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E5E5E5] text-xs text-[#737373]">
                  <th className="py-3 px-5 font-medium">Your Requirement</th>
                  <th className="py-3 px-4 font-medium">Priority</th>
                  <th className="py-3 px-4 font-medium">Policy Condition</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-5 font-medium">Source Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {matchedRecommendation.explanations.map((item) => (
                  <tr key={item.requirementId} className="align-top">
                    <td className="py-3.5 px-5 font-medium text-[#171717]">
                      {item.requirementName}
                      <div className="text-xs font-normal text-[#737373] mt-0.5">
                        Preference: {item.preference.replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs capitalize text-[#525252]">
                      {item.priority}
                    </td>
                    <td className="py-3.5 px-4 text-sm text-[#171717]">
                      <div>{item.policyCondition}</div>
                      <div className="text-xs text-[#737373] mt-0.5">{item.explanation}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusIndicator status={item.status} showLabel />
                    </td>
                    <td className="py-3.5 px-5 text-xs text-[#525252]">
                      {item.sectionRef ? (
                        <span>{item.sectionRef}</span>
                      ) : (
                        <span className="text-[#737373]">Unverified / Not cited</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-[#737373] flex flex-wrap items-center justify-between gap-4">
            <span>
              No active requirement session is linked to this policy view yet.
            </span>
            <Link
              to={`/find?category=${policy.category}`}
              className="px-4 py-2 text-xs font-medium bg-[#171717] text-[#FFFFFF] rounded-lg"
            >
              Evaluate Against Your Needs
            </Link>
          </div>
        )}
      </section>

      {/* Core Policy Specifications Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-[#E5E5E5] rounded-lg p-5 space-y-4">
          <h2 className="text-base font-semibold text-[#171717]">
            Coverage, Pricing &amp; Restrictions
          </h2>
          <dl className="space-y-3 text-sm divide-y divide-[#E5E5E5]">
            <div className="pt-2 flex justify-between gap-4">
              <dt className="text-[#737373]">Coverage Range</dt>
              <dd className="font-medium text-[#171717] tabular-nums text-right">
                {formatMoney(policy.minCoverage, policy.category)} –{' '}
                {formatMoney(policy.maxCoverage, policy.category)}
              </dd>
            </div>
            <div className="pt-3 flex justify-between gap-4">
              <dt className="text-[#737373]">Premium Information</dt>
              <dd className="text-right">
                {policy.premiumVerified && policy.estimatedAnnualPremium !== null ? (
                  <div>
                    <div className="font-medium text-[#171717] tabular-nums">
                      {formatINR(policy.estimatedAnnualPremium)} / year
                    </div>
                    <div className="text-xs text-[#16A34A]">
                      Verified · {policy.premiumNote}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium text-[#737373]">Unavailable / Unverified</div>
                    <div className="text-xs text-[#737373]">{policy.premiumNote}</div>
                  </div>
                )}
              </dd>
            </div>
            <div className="pt-3 flex justify-between gap-4">
              <dt className="text-[#737373]">Waiting Periods</dt>
              <dd className="font-medium text-[#171717] text-right">
                {policy.importantWaitingPeriod}
              </dd>
            </div>
            <div className="pt-3 flex justify-between gap-4">
              <dt className="text-[#737373]">Room Rent / Cover Limits</dt>
              <dd className="font-medium text-[#171717] text-right">
                {policy.roomRentOrLimitSummary}
              </dd>
            </div>
            <div className="pt-3 flex justify-between gap-4">
              <dt className="text-[#737373]">Co-payment / Deductible</dt>
              <dd className="font-medium text-[#171717] text-right">
                {policy.copaymentOrDeductibleSummary}
              </dd>
            </div>
            <div className="pt-3 flex justify-between gap-4">
              <dt className="text-[#737373]">Eligibility</dt>
              <dd className="font-medium text-[#171717] text-right">
                {policy.eligibilitySummary}
              </dd>
            </div>
            <div className="pt-3 flex justify-between gap-4">
              <dt className="text-[#737373]">Cashless Network</dt>
              <dd className="font-medium text-[#171717] text-right">
                {policy.cashlessNetworkInfo ?? (
                  <span className="text-[#737373]">Not applicable / Unavailable</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="border border-[#E5E5E5] rounded-lg p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-[#171717] mb-3">
              Confirmed Benefits
            </h2>
            <ul className="space-y-2 text-sm text-[#171717]">
              {policy.benefits.map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <span className="text-[#16A34A] font-semibold mt-0.5" aria-hidden="true">
                    ✓
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-[#E5E5E5]">
            <h2 className="text-base font-semibold text-[#171717] mb-3">
              Key Exclusions &amp; Limitations
            </h2>
            <ul className="space-y-2 text-sm text-[#525252]">
              {policy.exclusions.map((ex) => (
                <li key={ex} className="flex items-start gap-2.5">
                  <span className="text-[#DC2626] font-semibold mt-0.5" aria-hidden="true">
                    ✕
                  </span>
                  <span>{ex}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Indexed Policy Document Clauses */}
      <section className="border border-[#E5E5E5] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#171717]" aria-hidden="true" />
            <h2 className="text-base font-semibold text-[#171717]">
              Policy Document Clauses ({policy.documentTitle})
            </h2>
          </div>
          <a
            href={`/api/policies/${encodeURIComponent(policy.id)}/pdf`}
            download={policy.documentTitle}
            className="text-xs font-medium text-[#171717] underline hover:text-[#525252]"
          >
            Download PDF Wording Summary
          </a>
        </div>

        <div className="divide-y divide-[#E5E5E5] border-t border-[#E5E5E5]">
          {policy.clauses.map((clause) => (
            <div key={clause.sectionRef} className="py-3.5 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="sm:w-64 shrink-0">
                <div className="text-xs font-semibold text-[#171717]">{clause.sectionRef}</div>
                <div className="text-xs text-[#737373] mt-0.5">
                  {clause.verified ? 'Confirmed in schedule' : 'Unverified'}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-[#171717]">{clause.title}</div>
                <p className="text-xs text-[#525252] mt-1 leading-relaxed">{clause.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
