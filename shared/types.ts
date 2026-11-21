export type InsuranceCategory = 'health' | 'car' | 'life' | 'travel';

export type RequirementPriority = 'mandatory' | 'preferred' | 'optional';

export type RequirementStatus = 'satisfied' | 'partial' | 'unmet' | 'unverified';

export interface RequirementItem {
  id: string;
  canonicalKey: string;
  name: string;
  preference: string;
  priority: RequirementPriority;
  sourceText?: string;
}

export interface BasicDetails {
  // Health
  age?: number;
  familyMembers?: number;
  city?: string;
  coverageAmount?: number;
  annualBudget?: number;
  policyTenureYears?: number;
  // Car
  vehicleType?: string;
  vehicleModel?: string;
  manufacturingYear?: number;
  fuelType?: string;
  vehicleValue?: number;
  carInsuranceType?: 'comprehensive' | 'third_party' | 'own_damage';
  // Life
  desiredLifeCover?: number;
  incomeRange?: string;
  // Travel
  destination?: string;
  travelDurationDays?: number;
  travellersCount?: number;
  travelPurpose?: string;
}

export interface StructuredRequirements {
  insurance_type: InsuranceCategory;
  coverage: number | null;
  budget: number | null;
  tenure_years: number | null;
  basic_details: BasicDetails;
  requirements: RequirementItem[];
  conflicts: ConflictDetection[];
  missing_info: string[];
}

export interface ConflictDetection {
  id: string;
  title: string;
  description: string;
  involvedKeys: string[];
  severity: 'warning' | 'blocking';
}

export interface FollowUpQuestion {
  id: string;
  question: string;
  reason: string;
  targetField?: string;
  suggestedReplies?: string[];
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: {
    intent?: string;
    extractedCount?: number;
    abbreviationsExpanded?: Array<{ abbr: string; expanded: string }>;
  };
}

export interface NLPAnalysisResponse {
  sessionId: string;
  intent: string;
  normalizedText: string;
  abbreviationsExpanded: Array<{ abbr: string; expanded: string }>;
  structured: StructuredRequirements;
  followUpQuestions: FollowUpQuestion[];
  assistantReply: string;
  readyForRecommendations: boolean;
}

export interface PolicyClause {
  sectionRef: string;
  title: string;
  category:
    | 'coverage'
    | 'benefits'
    | 'waiting_period'
    | 'exclusions'
    | 'copayment'
    | 'room_rent'
    | 'eligibility'
    | 'cashless'
    | 'deductible';
  canonicalKeys: string[];
  summary: string;
  verified: boolean;
}

export interface PolicyFeatures {
  // Health
  pedWaitingYears?: number | null;
  initialWaitingDays?: number | null;
  specificIllnessWaitingYears?: number | null;
  roomRentLimit?: string | null;
  noRoomRentLimit?: boolean | null;
  maternityIncluded?: boolean | null;
  maternityWaitingMonths?: number | null;
  copaymentPercent?: number | null;
  cashlessHospitalsCount?: number | null;
  restoreBenefit?: boolean | null;
  daycareCovered?: boolean | null;
  noClaimBonusPercent?: number | null;
  opdCover?: boolean | null;
  // Car
  zeroDepreciation?: boolean | null;
  roadsideAssistance?: boolean | null;
  engineProtection?: boolean | null;
  consumablesCover?: boolean | null;
  returnToInvoice?: boolean | null;
  deductibleAmount?: number | null;
  lowDeductible?: boolean | null;
  cashlessGaragesCount?: number | null;
  carCoverType?: 'comprehensive' | 'third_party' | 'own_damage' | null;
  // Life
  claimSettlementRatio?: number | null;
  criticalIllnessRider?: boolean | null;
  accidentalDeathRider?: boolean | null;
  waiverOfPremium?: boolean | null;
  returnOfPremium?: boolean | null;
  maxCoverAge?: number | null;
  minEntryAge?: number | null;
  maxEntryAge?: number | null;
  // Travel
  medicalEmergencyCover?: boolean | null;
  baggageProtection?: boolean | null;
  tripCancellationCover?: boolean | null;
  flightDelayCover?: boolean | null;
  preExistingEmergencyCover?: boolean | null;
  adventureSportsCover?: boolean | null;
  schengenCompliant?: boolean | null;
  passportLossCover?: boolean | null;
  cashlessHospitalizationAbroad?: boolean | null;
}

export interface PolicyRecord {
  id: string;
  name: string;
  category: InsuranceCategory;
  isDemoDataset: boolean;
  overview: string;
  minCoverage: number;
  maxCoverage: number;
  defaultCoverage: number;
  tenureOptionsYears: number[];
  estimatedAnnualPremium: number | null;
  premiumVerified: boolean;
  premiumNote: string;
  officialUrl: string | null;
  importantWaitingPeriod: string;
  roomRentOrLimitSummary: string;
  copaymentOrDeductibleSummary: string;
  eligibilitySummary: string;
  minAge: number;
  maxAge: number;
  supportedRegions: string[];
  maxVehicleAgeYears?: number | null;
  maxTripDays?: number | null;
  benefits: string[];
  exclusions: string[];
  cashlessNetworkInfo: string | null;
  features: PolicyFeatures;
  clauses: PolicyClause[];
  documentTitle: string;
}

export interface MatchExplanationItem {
  requirementId: string;
  requirementName: string;
  priority: RequirementPriority;
  preference: string;
  status: RequirementStatus;
  policyCondition: string;
  explanation: string;
  sectionRef: string | null;
  verified: boolean;
}

export interface PolicyRecommendation {
  policy: PolicyRecord;
  matchPercentage: number;
  scoreBreakdown: {
    clauseMatchScore: number;
    semanticSimilarityScore: number;
    coverageFitScore: number;
    budgetFitScore: number;
    eligibilityPenalty: number;
  };
  eligible: boolean;
  eligibilityIssues: string[];
  hasUnmetMandatory: boolean;
  unmetMandatoryCount: number;
  explanations: MatchExplanationItem[];
  highlightSummary: string;
}

export interface RecommendationRunResult {
  sessionId: string;
  structured: StructuredRequirements;
  recommendations: PolicyRecommendation[];
  generatedAt: string;
  semanticEngineUsed: string;
  knowledgeMatches?: Array<{
    title: string;
    sourceUrl: string;
    providerDomain: string;
    category: string;
    snippet: string;
    relevance: number;
  }>;
  scrapedPagesAvailable?: number;
  policyLinkedScrapedPages?: number;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  age: number | null;
  city: string;
  familySize: number | null;
  annualIncomeRange: string;
  preferredCategories: InsuranceCategory[];
  priorityNotes: string;
  updatedAt: string;
}

export interface SessionSummary {
  id: string;
  category: InsuranceCategory;
  title: string;
  coverage: number | null;
  requirementsCount: number;
  topPolicyName: string | null;
  topMatchPercentage: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedPlanRecord {
  id: string;
  policyId: string;
  sessionId: string | null;
  savedAt: string;
  notes: string;
  policy: PolicyRecord;
}

export interface ComparisonAttributeRow {
  key: string;
  label: string;
  values: Array<{
    policyId: string;
    displayValue: string;
    verified: boolean;
    isDifferent: boolean;
  }>;
}

export interface ComparisonResponse {
  policies: PolicyRecord[];
  recommendations: PolicyRecommendation[] | null;
  rows: ComparisonAttributeRow[];
  hasAnyUnmetMandatory: boolean;
  leadingEligiblePolicyId: string | null;
  summaryNote: string;
}
