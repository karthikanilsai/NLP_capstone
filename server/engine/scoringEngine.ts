import type {
  MatchExplanationItem,
  PolicyRecord,
  RequirementItem,
  RequirementStatus,
  StructuredRequirements,
} from '../../shared/types.ts';

export interface PolicyEvaluation {
  policy: PolicyRecord;
  eligible: boolean;
  eligibilityIssues: string[];
  hasUnmetMandatory: boolean;
  unmetMandatoryCount: number;
  clauseMatchScore: number;
  coverageFitScore: number;
  budgetFitScore: number;
  semanticSimilarityScore: number;
  eligibilityPenalty: number;
  matchPercentage: number;
  itemEvaluations: Array<{
    req: RequirementItem;
    status: RequirementStatus;
    policyCondition: string;
    explanation: string;
    sectionRef: string | null;
    verified: boolean;
  }>;
}

function findClauseRef(policy: PolicyRecord, canonicalKey: string): string | null {
  const match = policy.clauses.find((c) => c.canonicalKeys.includes(canonicalKey));
  return match ? match.sectionRef : null;
}

function evaluateSingleRequirement(
  req: RequirementItem,
  policy: PolicyRecord
): {
  status: RequirementStatus;
  policyCondition: string;
  explanation: string;
  sectionRef: string | null;
  verified: boolean;
} {
  const f = policy.features;
  const key = req.canonicalKey;
  const sectionRef = findClauseRef(policy, key);

  // HEALTH
  if (key === 'ped_waiting_period') {
    if (f.pedWaitingYears === undefined || f.pedWaitingYears === null) {
      return {
        status: 'unverified',
        policyCondition: 'PED waiting period unverified',
        explanation: 'Pre-existing disease waiting period is not confirmed in the policy schedule.',
        sectionRef,
        verified: false,
      };
    }
    const wantsOneYear = /\b1\b|one year/.test(req.preference);
    if (f.pedWaitingYears <= 1) {
      return {
        status: 'satisfied',
        policyCondition: `${f.pedWaitingYears}-year PED waiting period`,
        explanation: `Very short ${f.pedWaitingYears}-year PED waiting period satisfies your preference.`,
        sectionRef,
        verified: true,
      };
    }
    if (f.pedWaitingYears === 2) {
      return {
        status: wantsOneYear ? 'partial' : 'satisfied',
        policyCondition: '2-year PED waiting period',
        explanation: wantsOneYear
          ? 'Has a 2-year PED waiting period, longer than your strict 1-year target.'
          : 'Shorter 2-year PED waiting period (compared to standard 3–4 year plans).',
        sectionRef,
        verified: true,
      };
    }
    return {
      status: 'unmet',
      policyCondition: `${f.pedWaitingYears}-year PED waiting period`,
      explanation: `${f.pedWaitingYears}-year PED waiting period does not meet your shorter waiting preference.`,
      sectionRef,
      verified: true,
    };
  }

  if (key === 'room_rent_limit') {
    if (f.noRoomRentLimit === true) {
      return {
        status: 'satisfied',
        policyCondition: f.roomRentLimit ?? 'No room rent limit',
        explanation: 'No room rent restriction applies up to your sum insured.',
        sectionRef,
        verified: true,
      };
    }
    if (f.noRoomRentLimit === false) {
      return {
        status: 'unmet',
        policyCondition: f.roomRentLimit ?? 'Room rent capped',
        explanation: `Room rent is restricted (${f.roomRentLimit ?? 'percentage cap applies'}), which can trigger proportionate deductions.`,
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'maternity_benefits') {
    if (f.maternityIncluded === true) {
      const wait = f.maternityWaitingMonths ?? 24;
      return {
        status: wait <= 24 ? 'satisfied' : 'partial',
        policyCondition: `Maternity covered (${wait}-month waiting period)`,
        explanation:
          wait <= 24
            ? `Maternity benefits included after a ${wait}-month waiting period.`
            : `Maternity is included, but carries a longer ${wait}-month waiting period.`,
        sectionRef,
        verified: true,
      };
    }
    if (f.maternityIncluded === false) {
      return {
        status: 'unmet',
        policyCondition: 'Maternity benefits not included',
        explanation: 'Maternity and childbirth hospitalization expenses are excluded in this plan.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'copayment') {
    if (f.copaymentPercent === 0) {
      return {
        status: 'satisfied',
        policyCondition: '0% co-payment',
        explanation: 'Zero mandatory co-payment across admissible network claims.',
        sectionRef,
        verified: true,
      };
    }
    if (typeof f.copaymentPercent === 'number' && f.copaymentPercent > 0) {
      return {
        status: f.copaymentPercent <= 10 ? 'partial' : 'unmet',
        policyCondition: `${f.copaymentPercent}% co-payment applies`,
        explanation: `${f.copaymentPercent}% co-payment applies under specific age or claim conditions.`,
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'cashless_hospitals') {
    if (typeof f.cashlessHospitalsCount === 'number' && f.cashlessHospitalsCount > 0) {
      return {
        status: f.cashlessHospitalsCount >= 8000 ? 'satisfied' : 'partial',
        policyCondition: `${f.cashlessHospitalsCount.toLocaleString('en-US')}+ cashless hospitals`,
        explanation:
          f.cashlessHospitalsCount >= 8000
            ? `Wide cashless network (${f.cashlessHospitalsCount.toLocaleString('en-US')}+ hospitals).`
            : `Moderate cashless network (${f.cashlessHospitalsCount.toLocaleString('en-US')}+ hospitals).`,
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'opd_cover') {
    if (f.opdCover === true) {
      return {
        status: 'satisfied',
        policyCondition: 'OPD consultations covered',
        explanation: 'Outpatient consultations and teleconsultations are included.',
        sectionRef,
        verified: true,
      };
    }
    if (f.opdCover === false) {
      return {
        status: 'unmet',
        policyCondition: 'OPD not included',
        explanation: 'Routine outpatient visits are excluded under this base plan.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'restore_benefit') {
    if (f.restoreBenefit === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Sum insured restoration included',
        explanation: 'Restores sum insured automatically within the policy year.',
        sectionRef,
        verified: true,
      };
    }
    if (f.restoreBenefit === false) {
      return {
        status: 'unmet',
        policyCondition: 'No sum insured restoration',
        explanation: 'Does not automatically replenish exhausted sum insured.',
        sectionRef,
        verified: true,
      };
    }
  }

  // CAR
  if (key === 'zero_depreciation') {
    if (f.zeroDepreciation === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Zero depreciation cover included',
        explanation: 'Covers 100% of replaced parts without depreciation deduction.',
        sectionRef,
        verified: true,
      };
    }
    if (f.zeroDepreciation === false) {
      return {
        status: 'unmet',
        policyCondition: 'Zero depreciation not included',
        explanation: 'Standard depreciation applies on plastic, rubber, and metal components.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'roadside_assistance') {
    if (f.roadsideAssistance === true) {
      return {
        status: 'satisfied',
        policyCondition: '24x7 Roadside Assistance included',
        explanation: 'Includes emergency towing, battery jump-start, and flat-tire support.',
        sectionRef,
        verified: true,
      };
    }
    if (f.roadsideAssistance === false) {
      return {
        status: 'unmet',
        policyCondition: 'Roadside assistance not included',
        explanation: 'Breakdown and towing assistance is not part of this policy.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'engine_protection') {
    if (f.engineProtection === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Engine & gearbox protection included',
        explanation: 'Protects internal engine assembly against hydrostatic water lock and oil leakage.',
        sectionRef,
        verified: true,
      };
    }
    if (f.engineProtection === false) {
      return {
        status: 'unmet',
        policyCondition: 'Engine protection excluded',
        explanation: 'Water ingression or consequential engine damage is not covered.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'deductible') {
    if (f.lowDeductible === true) {
      return {
        status: 'satisfied',
        policyCondition: `Low statutory deductible (${f.deductibleAmount ? `₹${f.deductibleAmount.toLocaleString('en-IN')}` : 'standard'})`,
        explanation: 'Only standard compulsory deductible applies without high voluntary excess.',
        sectionRef,
        verified: true,
      };
    }
    if (f.lowDeductible === false) {
      return {
        status: 'unmet',
        policyCondition: f.deductibleAmount
          ? `Higher deductible (₹${f.deductibleAmount.toLocaleString('en-IN')})`
          : 'Own-damage deductible N/A',
        explanation: f.deductibleAmount
          ? `Includes a mandatory voluntary deductible raising out-of-pocket cost per claim.`
          : 'Third-party policy does not cover own-vehicle damage.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'consumables_cover') {
    if (f.consumablesCover === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Consumables covered',
        explanation: 'Covers engine oil, coolant, nuts, bolts, and washers during repairs.',
        sectionRef,
        verified: true,
      };
    }
    if (f.consumablesCover === false) {
      return {
        status: 'unmet',
        policyCondition: 'Consumables excluded',
        explanation: 'Consumable items are borne out of pocket during repairs.',
        sectionRef,
        verified: true,
      };
    }
  }

  // LIFE
  if (key === 'large_life_cover') {
    if (policy.maxCoverage >= 50000000) {
      return {
        status: 'satisfied',
        policyCondition: `Supports cover up to ₹${(policy.maxCoverage / 10000000).toFixed(0)} Cr`,
        explanation: 'Offers high sum assured ceiling suitable for comprehensive income replacement.',
        sectionRef,
        verified: true,
      };
    }
    return {
      status: 'partial',
      policyCondition: `Cover capped at ₹${(policy.maxCoverage / 10000000).toFixed(1)} Cr`,
      explanation: 'Moderate maximum life cover ceiling compared to pure-term flagship plans.',
      sectionRef,
      verified: true,
    };
  }

  if (key === 'long_tenure') {
    const maxTenure = Math.max(...policy.tenureOptionsYears);
    if (maxTenure >= 30) {
      return {
        status: 'satisfied',
        policyCondition: `Tenure up to ${maxTenure} years (to age ${f.maxCoverAge ?? 85})`,
        explanation: `Supports long protection duration up to ${maxTenure} years.`,
        sectionRef,
        verified: true,
      };
    }
    return {
      status: 'partial',
      policyCondition: `Max tenure ${maxTenure} years`,
      explanation: `Policy tenure caps at ${maxTenure} years.`,
      sectionRef,
      verified: true,
    };
  }

  if (key === 'affordable_premium') {
    if (!policy.premiumVerified || policy.estimatedAnnualPremium === null) {
      return {
        status: 'unverified',
        policyCondition: 'Premium unverified (underwriting required)',
        explanation: 'Exact premium is not verified in the schedule until financial underwriting.',
        sectionRef,
        verified: false,
      };
    }
    if (f.returnOfPremium === false && policy.estimatedAnnualPremium <= 15000) {
      return {
        status: 'satisfied',
        policyCondition: `Pure term rate (₹${policy.estimatedAnnualPremium.toLocaleString('en-IN')}/yr indicative)`,
        explanation: 'Pure-term structure delivers high protection at an affordable annual cost.',
        sectionRef,
        verified: true,
      };
    }
    return {
      status: 'partial',
      policyCondition: `₹${policy.estimatedAnnualPremium.toLocaleString('en-IN')}/yr indicative`,
      explanation: f.returnOfPremium
        ? 'Return-of-premium structure carries a higher premium than pure term.'
        : 'Moderate annual premium for this cover tier.',
      sectionRef,
      verified: true,
    };
  }

  if (key === 'critical_illness_rider') {
    if (f.criticalIllnessRider === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Critical illness rider available',
        explanation: 'Optional critical illness lump-sum rider is supported.',
        sectionRef,
        verified: true,
      };
    }
    if (f.criticalIllnessRider === false) {
      return {
        status: 'unmet',
        policyCondition: 'Critical illness rider unavailable',
        explanation: 'Does not offer a critical illness rider.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'return_of_premium') {
    if (f.returnOfPremium === true) {
      return {
        status: 'satisfied',
        policyCondition: '100% base premium refund at maturity',
        explanation: 'Returns total base premiums paid if you survive the policy term.',
        sectionRef,
        verified: true,
      };
    }
    if (f.returnOfPremium === false) {
      return {
        status: 'unmet',
        policyCondition: 'Pure protection (no maturity refund)',
        explanation: 'Pure term plan with no survival maturity payout.',
        sectionRef,
        verified: true,
      };
    }
  }

  // TRAVEL
  if (key === 'medical_emergency') {
    if (f.medicalEmergencyCover === true) {
      return {
        status: 'satisfied',
        policyCondition: `Emergency medical up to $${policy.maxCoverage.toLocaleString('en-US')}`,
        explanation: 'Covers emergency hospitalization and medical evacuation abroad.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'baggage_protection') {
    if (f.baggageProtection === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Checked baggage loss & delay covered',
        explanation: 'Reimburses permanent loss and carrier delay of checked-in baggage.',
        sectionRef,
        verified: true,
      };
    }
    if (f.baggageProtection === false) {
      return {
        status: 'unmet',
        policyCondition: 'Baggage protection excluded',
        explanation: 'Checked baggage loss is not covered under this plan.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'schengen_compliant') {
    if (f.schengenCompliant === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Schengen embassy visa compliant',
        explanation: 'Meets EUR 30,000+ minimum medical & repatriation mandate.',
        sectionRef,
        verified: true,
      };
    }
    if (f.schengenCompliant === false) {
      return {
        status: 'unmet',
        policyCondition: 'Not Schengen compliant',
        explanation: 'Regional plan does not cover Schengen or European destinations.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'trip_cancellation') {
    if (f.tripCancellationCover === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Trip cancellation covered',
        explanation: 'Covers non-refundable bookings for covered emergencies.',
        sectionRef,
        verified: true,
      };
    }
    if (f.tripCancellationCover === false) {
      return {
        status: 'unmet',
        policyCondition: 'Trip cancellation excluded',
        explanation: 'Trip cancellation is not covered under this plan.',
        sectionRef,
        verified: true,
      };
    }
  }

  if (key === 'pre_existing_emergency') {
    if (f.preExistingEmergencyCover === true) {
      return {
        status: 'satisfied',
        policyCondition: 'Life-threatening PED emergency covered',
        explanation: 'Includes sub-limit coverage for sudden life-threatening PED emergencies.',
        sectionRef,
        verified: true,
      };
    }
    if (f.preExistingEmergencyCover === false) {
      return {
        status: 'unmet',
        policyCondition: 'Pre-existing conditions excluded',
        explanation: 'Pre-existing medical emergencies are excluded.',
        sectionRef,
        verified: true,
      };
    }
  }

  // Generic clause/benefit text fallback if an unrecognized requirement key was extracted
  const textCorpus = `${policy.overview} ${policy.benefits.join(' ')} ${policy.clauses.map((c) => c.summary).join(' ')}`.toLowerCase();
  const term = req.name.toLowerCase();
  if (textCorpus.includes(term)) {
    return {
      status: 'partial',
      policyCondition: 'Mentioned in policy schedule (verify exact sub-limit)',
      explanation: `Policy text references "${req.name}", though exact sub-limits should be checked in policy wording.`,
      sectionRef,
      verified: true,
    };
  }

  return {
    status: 'unverified',
    policyCondition: 'Information unavailable in demonstration schedule',
    explanation: `Verified details for "${req.name}" are not present in this policy's structured schedule.`,
    sectionRef: null,
    verified: false,
  };
}

export function evaluatePolicies(
  structured: StructuredRequirements,
  policies: PolicyRecord[],
  semanticScores: Map<string, number>
): PolicyEvaluation[] {
  const results: PolicyEvaluation[] = [];

  for (const policy of policies) {
    // 1. Eligibility checks
    const eligibilityIssues: string[] = [];
    const details = structured.basic_details;

    if (typeof details.age === 'number') {
      if (details.age < policy.minAge || details.age > policy.maxAge) {
        eligibilityIssues.push(
          `Applicant age (${details.age}) is outside policy entry range (${policy.minAge}–${policy.maxAge} yrs).`
        );
      }
    }

    if (
      structured.insurance_type === 'car' &&
      typeof details.manufacturingYear === 'number' &&
      policy.maxVehicleAgeYears !== null &&
      policy.maxVehicleAgeYears !== undefined
    ) {
      const currentYear = new Date().getFullYear();
      const vehicleAge = Math.max(0, currentYear - details.manufacturingYear);
      if (vehicleAge > policy.maxVehicleAgeYears) {
        eligibilityIssues.push(
          `Vehicle age (${vehicleAge} yrs) exceeds ${policy.maxVehicleAgeYears}-year eligibility cap.`
        );
      }
    }

    if (
      structured.insurance_type === 'car' &&
      details.carInsuranceType &&
      policy.features.carCoverType &&
      details.carInsuranceType !== policy.features.carCoverType
    ) {
      eligibilityIssues.push(
        `Requested ${details.carInsuranceType.replace('_', ' ')} cover, whereas this plan is ${policy.features.carCoverType.replace('_', ' ')}.`
      );
    }

    if (
      structured.insurance_type === 'travel' &&
      typeof details.travelDurationDays === 'number' &&
      policy.maxTripDays &&
      details.travelDurationDays > policy.maxTripDays
    ) {
      eligibilityIssues.push(
        `Trip duration (${details.travelDurationDays} days) exceeds ${policy.maxTripDays}-day limit.`
      );
    }

    if (structured.insurance_type === 'travel' && details.destination) {
      const destLower = details.destination.toLowerCase();
      const regionsLower = policy.supportedRegions.map((r) => r.toLowerCase());
      const matchesRegion =
        regionsLower.includes('worldwide') ||
        regionsLower.some((r) => destLower.includes(r) || r.includes(destLower));
      if (!matchesRegion) {
        eligibilityIssues.push(
          `Destination "${details.destination}" is outside covered regions (${policy.supportedRegions.join(', ')}).`
        );
      }
    }

    const eligible = eligibilityIssues.length === 0;

    // 2. Per-requirement clause evaluation
    const itemEvaluations = structured.requirements.map((req) => ({
      req,
      ...evaluateSingleRequirement(req, policy),
    }));

    const mandatoryItems = itemEvaluations.filter((e) => e.req.priority === 'mandatory');
    const unmetMandatoryCount = mandatoryItems.filter(
      (e) => e.status === 'unmet' || e.status === 'unverified'
    ).length;
    const hasUnmetMandatory = unmetMandatoryCount > 0;

    // 3. Weighted clause match score (0..100)
    let clauseMatchScore = 78;
    if (itemEvaluations.length > 0) {
      let weightedAchieved = 0;
      let totalWeight = 0;
      for (const item of itemEvaluations) {
        const w =
          item.req.priority === 'mandatory' ? 3 : item.req.priority === 'preferred' ? 1.5 : 0.75;
        totalWeight += w;
        if (item.status === 'satisfied') weightedAchieved += w * 1.0;
        else if (item.status === 'partial') weightedAchieved += w * 0.55;
        else if (item.status === 'unverified') weightedAchieved += w * 0.25;
        else weightedAchieved += 0;
      }
      clauseMatchScore = totalWeight > 0 ? Math.round((weightedAchieved / totalWeight) * 100) : 78;
    }

    // 4. Coverage fit score (0..100)
    let coverageFitScore = 85;
    if (structured.coverage && structured.coverage > 0) {
      if (structured.coverage >= policy.minCoverage && structured.coverage <= policy.maxCoverage) {
        coverageFitScore = 100;
      } else if (structured.coverage > policy.maxCoverage) {
        const ratio = policy.maxCoverage / structured.coverage;
        coverageFitScore = Math.max(20, Math.round(ratio * 85));
      } else {
        coverageFitScore = 75;
      }
    }

    // 5. Budget fit score (0..100)
    let budgetFitScore = 80;
    if (structured.budget && structured.budget > 0) {
      if (policy.premiumVerified && policy.estimatedAnnualPremium !== null) {
        if (policy.estimatedAnnualPremium <= structured.budget) {
          budgetFitScore = 100;
        } else {
          const overRatio = (policy.estimatedAnnualPremium - structured.budget) / structured.budget;
          budgetFitScore = Math.max(25, Math.round(100 - overRatio * 75));
        }
      } else {
        budgetFitScore = 60; // Unverified premium gets neutral-cautious score
      }
    }

    const semanticSimilarityScore = semanticScores.get(policy.id) ?? 0;
    const eligibilityPenalty = eligible ? 0 : 18;

    // Requirement fit remains the strongest signal. Budget receives a larger
    // share so changing the user's stated budget can affect the ranking.
    const rawWeighted =
      clauseMatchScore * 0.50 +
      semanticSimilarityScore * 0.20 +
      coverageFitScore * 0.15 +
      budgetFitScore * 0.15 -
      eligibilityPenalty;

    const matchPercentage = Math.max(12, Math.min(99, Math.round(rawWeighted)));

    results.push({
      policy,
      eligible,
      eligibilityIssues,
      hasUnmetMandatory,
      unmetMandatoryCount,
      clauseMatchScore,
      coverageFitScore,
      budgetFitScore,
      semanticSimilarityScore,
      eligibilityPenalty,
      matchPercentage,
      itemEvaluations,
    });
  }

  // Sort: Eligible + All Mandatory Met plans first, then by Match Percentage descending
  results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.hasUnmetMandatory !== b.hasUnmetMandatory) return a.hasUnmetMandatory ? 1 : -1;
    return b.matchPercentage - a.matchPercentage;
  });

  return results;
}
