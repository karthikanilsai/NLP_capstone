import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Plus, X } from 'lucide-react';
import type { ComparisonResponse, PolicyRecord } from '../../shared/types';
import { useInsureMate } from '../context/InsureMateContext';
import { categoryLabel } from '../utils/formatters';

export function ComparePage() {
  const { comparePolicyIds, setComparePolicyIds, toggleComparePolicy, sessionId } =
    useInsureMate();

  const [allPolicies, setAllPolicies] = useState<PolicyRecord[]>([]);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerValue, setPickerValue] = useState('');

  useEffect(() => {
    fetch('/api/policies')
      .then((r) => r.json())
      .then((d: { policies: PolicyRecord[] }) => {
        const policies = d.policies ?? [];
        setAllPolicies(policies);
        if (comparePolicyIds.length === 0 && policies.length >= 2) {
          // Preload first 2 health demo policies only if user opened Compare empty
          const defaults = policies.filter((p) => p.category === 'health').slice(0, 2);
          if (defaults.length >= 2) {
            setComparePolicyIds(defaults.map((p) => p.id));
          }
        }
      });
  }, []);

  useEffect(() => {
    if (comparePolicyIds.length === 0) {
      setComparison(null);
      return;
    }
    setLoading(true);
    fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policyIds: comparePolicyIds,
        sessionId,
      }),
    })
      .then((r) => r.json())
      .then((d: ComparisonResponse) => setComparison(d))
      .finally(() => setLoading(false));
  }, [comparePolicyIds, sessionId]);

  const handleAddPolicy = () => {
    if (!pickerValue || comparePolicyIds.includes(pickerValue)) return;
    toggleComparePolicy(pickerValue);
    setPickerValue('');
  };

  const availableToAdd = allPolicies.filter((p) => !comparePolicyIds.includes(p.id));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <header className="pb-5 border-b border-[#E5E5E5] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#171717]">
            Compare Policies Side by Side
          </h1>
          <p className="mt-1 text-sm text-[#737373]">
            Compare up to 4 plans across coverage, waiting periods, co-payment, exclusions, and your requirement match.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={pickerValue}
            onChange={(e) => setPickerValue(e.target.value)}
            aria-label="Select a policy to add to comparison"
            className="px-3 py-2 text-xs bg-[#FFFFFF] border border-[#E5E5E5] rounded-lg max-w-[240px] focus:outline-none focus:border-[#171717]"
          >
            <option value="">Add a plan to compare...</option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.category.toUpperCase()}] {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickerValue || comparePolicyIds.length >= 4}
            onClick={handleAddPolicy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>
      </header>

      {comparison && (
        <div
          className={`p-4 rounded-lg border text-sm flex items-start gap-3 ${
            comparison.hasAnyUnmetMandatory
              ? 'border-[#D97706]/40 bg-[#FFFBEB] text-[#92400E]'
              : 'border-[#E5E5E5] bg-[#F7F7F7] text-[#525252]'
          }`}
        >
          {comparison.hasAnyUnmetMandatory && (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" aria-hidden="true" />
          )}
          <div>{comparison.summaryNote}</div>
        </div>
      )}

      {loading && (
        <div className="h-64 bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg animate-pulse" />
      )}

      {!loading && comparison && comparison.policies.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-lg overflow-x-auto bg-[#FFFFFF]">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E5E5E5] bg-[#F7F7F7]">
                <th className="py-4 px-4 font-medium text-xs text-[#737373] w-48 align-top">
                  Comparison Attribute
                </th>
                {comparison.policies.map((p) => {
                  const isWinner =
                    !comparison.hasAnyUnmetMandatory &&
                    comparison.leadingEligiblePolicyId === p.id;
                  return (
                    <th key={p.id} className="py-4 px-4 align-top min-w-[220px]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-normal text-[#737373]">
                            {categoryLabel(p.category)}
                            {isWinner ? ' · Leading Eligible Match' : ''}
                          </div>
                          <Link
                            to={`/policies/${p.id}`}
                            className="mt-1 block text-sm font-semibold text-[#171717] hover:underline"
                          >
                            {p.name}
                          </Link>
                          {p.officialUrl && (
                            <a
                              href={p.officialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#525252] hover:text-[#171717] hover:underline"
                            >
                              Official Website
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleComparePolicy(p.id)}
                          aria-label={`Remove ${p.name} from comparison`}
                          className="p-1 text-[#737373] hover:text-[#171717] rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {comparison.rows.map((row) => (
                <tr key={row.key} className="align-top">
                  <td className="py-3.5 px-4 text-xs font-medium text-[#525252] bg-[#FAFAFA]">
                    <div>{row.label}</div>
                    {row.values.some((v) => v.isDifferent) && (
                      <div className="text-[11px] font-normal text-[#737373] mt-0.5">
                        Key difference
                      </div>
                    )}
                  </td>
                  {row.values.map((cell) => (
                    <td
                      key={`${row.key}-${cell.policyId}`}
                      className={`py-3.5 px-4 text-sm tabular-nums ${
                        cell.isDifferent ? 'bg-[#FDFDFD] text-[#171717]' : 'text-[#525252]'
                      } ${!cell.verified ? 'text-[#737373]' : ''}`}
                    >
                      {cell.displayValue}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
