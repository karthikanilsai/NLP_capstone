import type { MatchExplanationItem, PolicyRecommendation } from '../../shared/types.ts';
import type { PolicyEvaluation } from './scoringEngine.ts';

export function generateRecommendationsWithExplanations(
  evaluations: PolicyEvaluation[]
): PolicyRecommendation[] {
  return evaluations.map((ev) => {
    const explanations: MatchExplanationItem[] = ev.itemEvaluations.map((item) => ({
      requirementId: item.req.id,
      requirementName: item.req.name,
      priority: item.req.priority,
      preference: item.req.preference,
      status: item.status,
      policyCondition: item.policyCondition,
      explanation: item.explanation,
      sectionRef: item.sectionRef,
      verified: item.verified,
    }));

    // If no explicit NLP requirements were added yet, generate baseline verified highlights
    if (explanations.length === 0) {
      explanations.push({
        requirementId: 'baseline-coverage',
        requirementName: 'Coverage & Eligibility',
        priority: 'mandatory',
        preference: 'within range',
        status: ev.eligible ? 'satisfied' : 'unmet',
        policyCondition: ev.policy.eligibilitySummary,
        explanation: ev.eligible
          ? 'Matches your basic profile eligibility and coverage tier.'
          : ev.eligibilityIssues.join(' '),
        sectionRef: ev.policy.clauses[0]?.sectionRef ?? null,
        verified: true,
      });
      explanations.push({
        requirementId: 'baseline-waiting',
        requirementName: 'Waiting / Claim Terms',
        priority: 'preferred',
        preference: 'transparent',
        status: 'satisfied',
        policyCondition: ev.policy.importantWaitingPeriod,
        explanation: ev.policy.roomRentOrLimitSummary,
        sectionRef: ev.policy.clauses[1]?.sectionRef ?? null,
        verified: true,
      });
    }

    const satisfiedCount = explanations.filter((e) => e.status === 'satisfied').length;
    const highlightSummary = ev.hasUnmetMandatory
      ? `${ev.unmetMandatoryCount} mandatory requirement${ev.unmetMandatoryCount > 1 ? 's' : ''} unmet — review carefully before selecting.`
      : !ev.eligible
        ? ev.eligibilityIssues[0] ?? 'Eligibility limitation detected.'
        : `Satisfies ${satisfiedCount} of ${explanations.length} evaluated criteria with verified policy clauses.`;

    return {
      policy: ev.policy,
      matchPercentage: ev.matchPercentage,
      scoreBreakdown: {
        clauseMatchScore: ev.clauseMatchScore,
        semanticSimilarityScore: ev.semanticSimilarityScore,
        coverageFitScore: ev.coverageFitScore,
        budgetFitScore: ev.budgetFitScore,
        eligibilityPenalty: ev.eligibilityPenalty,
      },
      eligible: ev.eligible,
      eligibilityIssues: ev.eligibilityIssues,
      hasUnmetMandatory: ev.hasUnmetMandatory,
      unmetMandatoryCount: ev.unmetMandatoryCount,
      explanations,
      highlightSummary,
    };
  });
}
