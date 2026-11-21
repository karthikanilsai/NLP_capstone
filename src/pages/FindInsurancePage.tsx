import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Car,
  Code2,
  HeartPulse,
  Loader2,
  Plane,
  RotateCcw,
  Send,
  Shield,
  Umbrella,
} from 'lucide-react';
import type {
  BasicDetails,
  ConversationMessage,
  FollowUpQuestion,
  InsuranceCategory,
  NLPAnalysisResponse,
  RecommendationRunResult,
  StructuredRequirements,
} from '../../shared/types';
import { useInsureMate } from '../context/InsureMateContext';
import { categoryLabel, formatMoney } from '../utils/formatters';

const EXAMPLE_INPUTS: Record<InsuranceCategory, string[]> = {
  health: [
    'I need coverage for pre-existing diseases with a shorter waiting period. I prefer no room rent limit, maternity benefits, minimal co-payment and cashless hospitals.',
    'Looking for a 1-year PED waiting period and OPD consultations with zero room rent cap.',
  ],
  car: [
    "I want zero depreciation, roadside assistance and engine protection. I don't want a high deductible.",
    'I need bumper to bumper cover with RSA and consumables cover.',
  ],
  life: [
    'I need a large life cover for a long period with affordable premiums.',
    'Looking for pure term protection with critical illness rider and waiver of premium.',
  ],
  travel: [
    'I need international medical emergency coverage and baggage protection.',
    'Need Schengen visa compliant medical cover with trip cancellation and zero deductible.',
  ],
};

function defaultDetailsForCategory(
  category: InsuranceCategory,
  profileAge?: number | null,
  profileCity?: string,
  profileFamily?: number | null
): BasicDetails {
  if (category === 'health') {
    return {
      age: profileAge ?? 30,
      familyMembers: profileFamily ?? 2,
      city: profileCity || 'Bengaluru',
      coverageAmount: 1000000,
      annualBudget: 24000,
      policyTenureYears: 1,
    };
  }
  if (category === 'car') {
    return {
      vehicleType: 'SUV / Sedan',
      vehicleModel: 'Hyundai Creta',
      manufacturingYear: 2022,
      fuelType: 'Petrol',
      vehicleValue: 1000000,
      carInsuranceType: 'comprehensive',
    };
  }
  if (category === 'life') {
    return {
      age: profileAge ?? 30,
      desiredLifeCover: 10000000,
      policyTenureYears: 30,
      annualBudget: 15000,
      incomeRange: '15L - 25L',
    };
  }
  return {
    destination: 'Europe / Schengen',
    travelDurationDays: 14,
    travellersCount: 1,
    coverageAmount: 250000,
    travelPurpose: 'Leisure',
  };
}

function buildEmptyStructured(category: InsuranceCategory, details: BasicDetails): StructuredRequirements {
  return {
    insurance_type: category,
    coverage: details.coverageAmount ?? details.vehicleValue ?? details.desiredLifeCover ?? null,
    budget: details.annualBudget ?? null,
    tenure_years: details.policyTenureYears ?? null,
    basic_details: details,
    requirements: [],
    conflicts: [],
    missing_info: [],
  };
}

export function FindInsurancePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    sessionId,
    structured,
    messages,
    profile,
    setActiveSession,
    setRecommendationsResult,
    resetSession,
  } = useInsureMate();

  const paramCategory = searchParams.get('category') as InsuranceCategory | null;

  const [selectedCategory, setSelectedCategory] = useState<InsuranceCategory | null>(
    paramCategory ?? structured?.insurance_type ?? null
  );
  const [stage, setStage] = useState<'category' | 'details' | 'nlp'>(() => {
    if (structured && structured.requirements.length > 0) return 'nlp';
    if (paramCategory) return 'details';
    if (structured) return 'nlp';
    return 'category';
  });

  const [details, setDetails] = useState<BasicDetails>(() =>
    structured?.basic_details
      ? structured.basic_details
      : defaultDetailsForCategory(
          paramCategory ?? 'health',
          profile?.age,
          profile?.city,
          profile?.familySize
        )
  );

  const [localSessionId, setLocalSessionId] = useState<string | null>(sessionId);
  const [localStructured, setLocalStructured] = useState<StructuredRequirements | null>(structured);
  const [localMessages, setLocalMessages] = useState<ConversationMessage[]>(messages);
  const [followUps, setFollowUps] = useState<FollowUpQuestion[]>([]);
  const [nlInput, setNlInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingRecs, setIsGeneratingRecs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [detailsStepIdx, setDetailsStepIdx] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paramCategory && paramCategory !== selectedCategory) {
      const freshDetails = defaultDetailsForCategory(
        paramCategory,
        profile?.age,
        profile?.city,
        profile?.familySize
      );
      setSelectedCategory(paramCategory);
      setDetails(freshDetails);
      setLocalStructured(buildEmptyStructured(paramCategory, freshDetails));
      setLocalMessages([]);
      setFollowUps([]);
      setLocalSessionId(null);
      setDetailsStepIdx(0);
      setStage('details');
      setErrorMsg(null);
    }
  }, [paramCategory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages, followUps]);

  const activeCategory: InsuranceCategory = selectedCategory ?? 'health';

  const handleChooseCategory = (cat: InsuranceCategory) => {
    const freshDetails = defaultDetailsForCategory(
      cat,
      profile?.age,
      profile?.city,
      profile?.familySize
    );
    setSelectedCategory(cat);
    setDetails(freshDetails);
    setLocalStructured(buildEmptyStructured(cat, freshDetails));
    setLocalMessages([]);
    setFollowUps([]);
    setLocalSessionId(null);
    setDetailsStepIdx(0);
    setStage('details');
    setErrorMsg(null);
  };

  const handleConfirmDetails = () => {
    const updatedStruct = buildEmptyStructured(activeCategory, details);
    const merged: StructuredRequirements = localStructured
      ? {
          ...localStructured,
          insurance_type: activeCategory,
          coverage: updatedStruct.coverage,
          budget: updatedStruct.budget,
          tenure_years: updatedStruct.tenure_years,
          basic_details: details,
        }
      : updatedStruct;
    setLocalStructured(merged);
    setStage('nlp');

    if (localMessages.length === 0) {
      setLocalMessages([
        {
          id: 'intro-prompt',
          role: 'assistant',
          content:
            "Thanks! I've noted your core details. Do you have any additional requirements? Describe what you're looking for in your own words.",
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleSendNlp = async (textOverride?: string) => {
    const text = (textOverride ?? nlInput).trim();
    if (!text || isAnalyzing) return;
    setErrorMsg(null);
    setIsAnalyzing(true);
    if (!textOverride) setNlInput('');

    const optimisticUserMsg: ConversationMessage = {
      id: `temp-u-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const currentStruct =
        localStructured ?? buildEmptyStructured(activeCategory, details);

      const res = await fetch('/api/nlp/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: localSessionId ?? undefined,
          category: activeCategory,
          message: text,
          basicDetails: details,
          currentStructured: currentStruct,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze natural-language requirements.');
      }

      const nlpResp = data as NLPAnalysisResponse;
      setLocalSessionId(nlpResp.sessionId);
      setLocalStructured(nlpResp.structured);
      setDetails(nlpResp.structured.basic_details);
      setFollowUps(nlpResp.followUpQuestions);

      const assistantMsg: ConversationMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: nlpResp.assistantReply,
        createdAt: new Date().toISOString(),
        metadata: {
          intent: nlpResp.intent,
          abbreviationsExpanded: nlpResp.abbreviationsExpanded,
        },
      };

      const nextMessages = [...localMessages, optimisticUserMsg, assistantMsg];
      setLocalMessages(nextMessages);
      setActiveSession({
        sessionId: nlpResp.sessionId,
        structured: nlpResp.structured,
        messages: nextMessages,
      });
    } catch (err) {
      setLocalMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
      if (!textOverride) setNlInput(text);
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process message.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateRecommendations = async () => {
    const payload = localStructured ?? buildEmptyStructured(activeCategory, details);
    setIsGeneratingRecs(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: localSessionId ?? undefined,
          structured: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate recommendations.');
      }
      const recResult = data as RecommendationRunResult;
      setRecommendationsResult(recResult);
      navigate(`/recommendations/${recResult.sessionId}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Recommendation engine failed.');
    } finally {
      setIsGeneratingRecs(false);
    }
  };

  const handleStartOver = () => {
    resetSession();
    setSelectedCategory(null);
    setLocalSessionId(null);
    setLocalStructured(null);
    setLocalMessages([]);
    setFollowUps([]);
    setStage('category');
    setErrorMsg(null);
  };

  // Conversational question steps per category (2 concise conversational groups per category)
  const questionGroups = useMemo(() => {
    if (activeCategory === 'health') {
      return [
        {
          prompt: 'Who are we covering, and where are you located?',
          fields: ['age', 'familyMembers', 'city'],
        },
        {
          prompt: 'What coverage amount, annual budget, and tenure are you aiming for?',
          fields: ['coverageAmount', 'annualBudget', 'policyTenureYears'],
        },
      ];
    }
    if (activeCategory === 'car') {
      return [
        {
          prompt: 'Tell me a bit about your vehicle.',
          fields: ['vehicleType', 'vehicleModel', 'manufacturingYear', 'fuelType'],
        },
        {
          prompt: 'What is the approximate vehicle value (IDV) and cover type you need?',
          fields: ['vehicleValue', 'carInsuranceType'],
        },
      ];
    }
    if (activeCategory === 'life') {
      return [
        {
          prompt: 'What is your age and approximate annual income range?',
          fields: ['age', 'incomeRange'],
        },
        {
          prompt: 'How much life cover, policy tenure, and annual budget are you targeting?',
          fields: ['desiredLifeCover', 'policyTenureYears', 'annualBudget'],
        },
      ];
    }
    return [
      {
        prompt: 'Where are you travelling, for how long, and with how many travellers?',
        fields: ['destination', 'travelDurationDays', 'travellersCount'],
      },
      {
        prompt: 'What medical coverage limit and travel purpose apply to this trip?',
        fields: ['coverageAmount', 'travelPurpose'],
      },
    ];
  }, [activeCategory]);

  const effectiveStructured = localStructured ?? buildEmptyStructured(activeCategory, details);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#E5E5E5]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">
            Find Insurance
          </h1>
          <p className="mt-1 text-sm text-[#737373]">
            {selectedCategory
              ? `${categoryLabel(selectedCategory)} · Conversational requirement assistant`
              : 'Select an insurance category to start your guided conversation'}
          </p>
        </div>

        {selectedCategory && (
          <div className="flex items-center gap-2">
            {stage === 'nlp' && (
              <button
                type="button"
                onClick={() => {
                  setDetailsStepIdx(0);
                  setStage('details');
                }}
                className="px-3.5 py-2 text-xs font-medium bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5] rounded-lg hover:bg-[#F7F7F7] transition-colors whitespace-nowrap"
              >
                Edit Basic Details
              </button>
            )}
            <button
              type="button"
              onClick={handleStartOver}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#FFFFFF] text-[#525252] border border-[#E5E5E5] rounded-lg hover:bg-[#F7F7F7] hover:text-[#171717] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>New Session</span>
            </button>
          </div>
        )}
      </div>

      {/* Stage 1: Category Picker */}
      {stage === 'category' && (
        <div className="max-w-3xl mx-auto py-10">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-[#171717] text-[#FFFFFF] flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg px-4 py-3 text-sm text-[#171717]">
              Hi! What type of insurance are you looking for today? Pick a category below and I&apos;ll ask a few quick questions before capturing your specific requirements.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-0 sm:pl-11">
            {(
              [
                { id: 'health', label: 'Health Insurance', desc: 'Medical, family floater, PED & maternity', icon: HeartPulse },
                { id: 'car', label: 'Car Insurance', desc: 'Zero dep, engine shield, roadside help', icon: Car },
                { id: 'life', label: 'Life Insurance', desc: 'Term life cover & income protection', icon: Umbrella },
                { id: 'travel', label: 'Travel Insurance', desc: 'Overseas medical & baggage cover', icon: Plane },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleChooseCategory(item.id)}
                  className="text-left p-4 bg-[#FFFFFF] border border-[#E5E5E5] rounded-lg hover:border-[#171717] transition-colors flex items-start gap-3"
                >
                  <Icon className="w-5 h-5 text-[#171717] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-semibold text-[#171717]">{item.label}</div>
                    <div className="text-xs text-[#737373] mt-0.5">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stage 2: Conversational Basic Details */}
      {stage === 'details' && selectedCategory && (
        <div className="max-w-3xl mx-auto py-8 space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#171717] text-[#FFFFFF] flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="flex-1 space-y-4">
              <div className="bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg px-4 py-3 text-sm text-[#171717]">
                <span className="text-xs text-[#737373] block mb-1">
                  Step {detailsStepIdx + 1} of {questionGroups.length} · {categoryLabel(activeCategory)}
                </span>
                {questionGroups[detailsStepIdx].prompt}
              </div>

              <div className="bg-[#FFFFFF] border border-[#E5E5E5] rounded-lg p-5 space-y-5">
                {/* HEALTH CONTROLS */}
                {activeCategory === 'health' && detailsStepIdx === 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Your Age</span>
                      <input
                        type="number"
                        min={18}
                        max={99}
                        value={details.age ?? ''}
                        onChange={(e) =>
                          setDetails((d) => ({ ...d, age: Number(e.target.value) || undefined }))
                        }
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Family Members</span>
                      <select
                        value={details.familyMembers ?? 1}
                        onChange={(e) =>
                          setDetails((d) => ({ ...d, familyMembers: Number(e.target.value) }))
                        }
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-[#171717]"
                      >
                        <option value={1}>1 (Individual)</option>
                        <option value={2}>2 (Couple)</option>
                        <option value={3}>3 Members</option>
                        <option value={4}>4 Members</option>
                        <option value={5}>5+ Members</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">City</span>
                      <input
                        type="text"
                        value={details.city ?? ''}
                        onChange={(e) => setDetails((d) => ({ ...d, city: e.target.value }))}
                        placeholder="e.g. Bengaluru"
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                  </div>
                )}

                {activeCategory === 'health' && detailsStepIdx === 1 && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-medium text-[#525252] block mb-2">
                        Required Coverage Amount
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[500000, 1000000, 1500000, 2500000, 5000000].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setDetails((d) => ({ ...d, coverageAmount: amt }))}
                            className={`px-3.5 py-2 text-xs font-medium rounded-lg border tabular-nums transition-colors ${
                              details.coverageAmount === amt
                                ? 'bg-[#171717] text-[#FFFFFF] border-[#171717]'
                                : 'bg-[#FFFFFF] text-[#171717] border-[#E5E5E5] hover:bg-[#F7F7F7]'
                            }`}
                          >
                            {formatMoney(amt, 'health')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs font-medium text-[#525252]">
                          Approximate Annual Budget (₹)
                        </span>
                        <input
                          type="number"
                          step={500}
                          value={details.annualBudget ?? ''}
                          onChange={(e) =>
                            setDetails((d) => ({
                              ...d,
                              annualBudget: Number(e.target.value) || undefined,
                            }))
                          }
                          className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-[#525252]">
                          Preferred Policy Tenure
                        </span>
                        <select
                          value={details.policyTenureYears ?? 1}
                          onChange={(e) =>
                            setDetails((d) => ({
                              ...d,
                              policyTenureYears: Number(e.target.value),
                            }))
                          }
                          className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-[#171717]"
                        >
                          <option value={1}>1 Year</option>
                          <option value={2}>2 Years</option>
                          <option value={3}>3 Years</option>
                        </select>
                      </label>
                    </div>
                  </div>
                )}

                {/* CAR CONTROLS */}
                {activeCategory === 'car' && detailsStepIdx === 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Vehicle Type</span>
                      <select
                        value={details.vehicleType ?? 'Hatchback'}
                        onChange={(e) => setDetails((d) => ({ ...d, vehicleType: e.target.value }))}
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-[#171717]"
                      >
                        <option value="Hatchback">Hatchback</option>
                        <option value="Sedan">Sedan</option>
                        <option value="SUV / Compact SUV">SUV / Compact SUV</option>
                        <option value="Electric / Hybrid">Electric / Hybrid</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Vehicle Model</span>
                      <input
                        type="text"
                        value={details.vehicleModel ?? ''}
                        onChange={(e) =>
                          setDetails((d) => ({ ...d, vehicleModel: e.target.value }))
                        }
                        placeholder="e.g. Hyundai Creta"
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Manufacturing Year</span>
                      <input
                        type="number"
                        min={2005}
                        max={2026}
                        value={details.manufacturingYear ?? ''}
                        onChange={(e) =>
                          setDetails((d) => ({
                            ...d,
                            manufacturingYear: Number(e.target.value) || undefined,
                          }))
                        }
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Fuel Type</span>
                      <select
                        value={details.fuelType ?? 'Petrol'}
                        onChange={(e) => setDetails((d) => ({ ...d, fuelType: e.target.value }))}
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-[#171717]"
                      >
                        <option value="Petrol">Petrol</option>
                        <option value="Diesel">Diesel</option>
                        <option value="Electric">Electric</option>
                        <option value="CNG / Hybrid">CNG / Hybrid</option>
                      </select>
                    </label>
                  </div>
                )}

                {activeCategory === 'car' && detailsStepIdx === 1 && (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">
                        Approximate Vehicle Value / IDV (₹)
                      </span>
                      <input
                        type="number"
                        step={50000}
                        value={details.vehicleValue ?? ''}
                        onChange={(e) =>
                          setDetails((d) => ({
                            ...d,
                            vehicleValue: Number(e.target.value) || undefined,
                          }))
                        }
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                    <div>
                      <span className="text-xs font-medium text-[#525252] block mb-2">
                        Insurance Type
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'comprehensive', label: 'Comprehensive' },
                          { id: 'third_party', label: 'Third-Party Only' },
                          { id: 'own_damage', label: 'Own Damage' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setDetails((d) => ({
                                ...d,
                                carInsuranceType: opt.id as BasicDetails['carInsuranceType'],
                              }))
                            }
                            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                              details.carInsuranceType === opt.id
                                ? 'bg-[#171717] text-[#FFFFFF] border-[#171717]'
                                : 'bg-[#FFFFFF] text-[#171717] border-[#E5E5E5] hover:bg-[#F7F7F7]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* LIFE CONTROLS */}
                {activeCategory === 'life' && detailsStepIdx === 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Your Age</span>
                      <input
                        type="number"
                        min={18}
                        max={75}
                        value={details.age ?? ''}
                        onChange={(e) =>
                          setDetails((d) => ({ ...d, age: Number(e.target.value) || undefined }))
                        }
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Annual Income Range</span>
                      <select
                        value={details.incomeRange ?? '15L - 25L'}
                        onChange={(e) => setDetails((d) => ({ ...d, incomeRange: e.target.value }))}
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-[#171717]"
                      >
                        <option value="Under 5L">Under ₹5 Lakh</option>
                        <option value="5L - 15L">₹5 Lakh – ₹15 Lakh</option>
                        <option value="15L - 25L">₹15 Lakh – ₹25 Lakh</option>
                        <option value="25L+">₹25 Lakh+</option>
                      </select>
                    </label>
                  </div>
                )}

                {activeCategory === 'life' && detailsStepIdx === 1 && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-medium text-[#525252] block mb-2">
                        Desired Life Cover
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[5000000, 10000000, 20000000, 50000000].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setDetails((d) => ({ ...d, desiredLifeCover: amt }))}
                            className={`px-3.5 py-2 text-xs font-medium rounded-lg border tabular-nums transition-colors ${
                              details.desiredLifeCover === amt
                                ? 'bg-[#171717] text-[#FFFFFF] border-[#171717]'
                                : 'bg-[#FFFFFF] text-[#171717] border-[#E5E5E5] hover:bg-[#F7F7F7]'
                            }`}
                          >
                            {formatMoney(amt, 'life')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs font-medium text-[#525252]">
                          Policy Tenure (Years)
                        </span>
                        <select
                          value={details.policyTenureYears ?? 30}
                          onChange={(e) =>
                            setDetails((d) => ({
                              ...d,
                              policyTenureYears: Number(e.target.value),
                            }))
                          }
                          className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-[#171717]"
                        >
                          <option value={15}>15 Years</option>
                          <option value={20}>20 Years</option>
                          <option value={30}>30 Years</option>
                          <option value={40}>40 Years</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-[#525252]">
                          Approximate Annual Budget (₹)
                        </span>
                        <input
                          type="number"
                          step={1000}
                          value={details.annualBudget ?? ''}
                          onChange={(e) =>
                            setDetails((d) => ({
                              ...d,
                              annualBudget: Number(e.target.value) || undefined,
                            }))
                          }
                          className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* TRAVEL CONTROLS */}
                {activeCategory === 'travel' && detailsStepIdx === 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Destination</span>
                      <input
                        type="text"
                        value={details.destination ?? ''}
                        onChange={(e) =>
                          setDetails((d) => ({ ...d, destination: e.target.value }))
                        }
                        placeholder="e.g. Europe / Schengen"
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">
                        Duration (Days)
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={details.travelDurationDays ?? ''}
                        onChange={(e) =>
                          setDetails((d) => ({
                            ...d,
                            travelDurationDays: Number(e.target.value) || undefined,
                          }))
                        }
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Travellers</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={details.travellersCount ?? 1}
                        onChange={(e) =>
                          setDetails((d) => ({
                            ...d,
                            travellersCount: Number(e.target.value) || 1,
                          }))
                        }
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
                      />
                    </label>
                  </div>
                )}

                {activeCategory === 'travel' && detailsStepIdx === 1 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-medium text-[#525252] block mb-2">
                        Required Medical Coverage (USD)
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[50000, 100000, 250000, 500000].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setDetails((d) => ({ ...d, coverageAmount: amt }))}
                            className={`px-3 py-2 text-xs font-medium rounded-lg border tabular-nums transition-colors ${
                              details.coverageAmount === amt
                                ? 'bg-[#171717] text-[#FFFFFF] border-[#171717]'
                                : 'bg-[#FFFFFF] text-[#171717] border-[#E5E5E5] hover:bg-[#F7F7F7]'
                            }`}
                          >
                            ${amt.toLocaleString('en-US')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-xs font-medium text-[#525252]">Travel Purpose</span>
                      <select
                        value={details.travelPurpose ?? 'Leisure'}
                        onChange={(e) =>
                          setDetails((d) => ({ ...d, travelPurpose: e.target.value }))
                        }
                        className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-[#171717]"
                      >
                        <option value="Leisure">Leisure / Vacation</option>
                        <option value="Business">Business</option>
                        <option value="Student">Student / Study Abroad</option>
                        <option value="Family Visit">Family Visit</option>
                      </select>
                    </label>
                  </div>
                )}

                <div className="pt-3 border-t border-[#E5E5E5] flex items-center justify-between gap-3">
                  {detailsStepIdx > 0 ? (
                    <button
                      type="button"
                      onClick={() => setDetailsStepIdx((i) => i - 1)}
                      className="px-4 py-2 text-xs font-medium bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5] rounded-lg hover:bg-[#F7F7F7] transition-colors"
                    >
                      Back
                    </button>
                  ) : (
                    <span className="text-xs text-[#737373]">
                      You can adjust any detail later in the conversation.
                    </span>
                  )}

                  {detailsStepIdx < questionGroups.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setDetailsStepIdx((i) => i + 1)}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] transition-colors"
                    >
                      <span>Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConfirmDetails}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] transition-colors"
                    >
                      <span>Continue to Natural Language Input</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 3: Natural Language Conversation + Extracted Requirements Summary */}
      {stage === 'nlp' && selectedCategory && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6">
          {/* Left: ChatGPT-style Conversation Workspace */}
          <div className="lg:col-span-7 flex flex-col min-h-[520px] border border-[#E5E5E5] rounded-lg bg-[#FFFFFF]">
            <div className="flex-1 p-5 space-y-5 overflow-y-auto max-h-[540px]">
              {localMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-[#171717] text-[#FFFFFF] flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#171717] text-[#FFFFFF]'
                        : 'bg-[#F7F7F7] border border-[#E5E5E5] text-[#171717]'
                    }`}
                  >
                    <p>{msg.content}</p>
                    {msg.metadata?.abbreviationsExpanded &&
                      msg.metadata.abbreviationsExpanded.length > 0 && (
                        <p className="mt-2 pt-2 border-t border-white/20 text-xs opacity-80">
                          Understood:{' '}
                          {msg.metadata.abbreviationsExpanded
                            .map((a) => `${a.abbr} → ${a.expanded}`)
                            .join(' · ')}
                        </p>
                      )}
                  </div>
                </div>
              ))}

              {/* Follow-up Question Quick Replies */}
              {followUps.length > 0 && (
                <div className="pl-10 space-y-2">
                  {followUps.map((fq) => (
                    <div key={fq.id} className="space-y-2">
                      <div className="text-xs text-[#737373]">
                        Follow-up · {fq.reason}
                      </div>
                      {fq.suggestedReplies && fq.suggestedReplies.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {fq.suggestedReplies.map((reply) => (
                            <button
                              key={reply}
                              type="button"
                              disabled={isAnalyzing}
                              onClick={() => handleSendNlp(reply)}
                              className="px-3 py-1.5 text-xs font-medium bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5] rounded-lg hover:border-[#171717] transition-colors"
                            >
                              {reply}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isAnalyzing && (
                <div className="flex items-center gap-3 text-xs text-[#737373]">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Analyzing requirements and extracting structured entities...</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Example Prompt Starters (when user hasn't typed requirements yet) */}
            {effectiveStructured.requirements.length === 0 && (
              <div className="px-5 py-3 border-t border-[#E5E5E5] bg-[#FAFAFA]">
                <div className="text-xs font-medium text-[#737373] mb-2">
                  Try an example or type your own words below:
                </div>
                <div className="flex flex-col gap-1.5">
                  {EXAMPLE_INPUTS[activeCategory].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setNlInput(example)}
                      className="text-left text-xs text-[#171717] hover:underline py-1"
                    >
                      &ldquo;{example}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mx-5 mt-3 p-3 rounded-lg border border-[#DC2626]/30 bg-[#FEF2F2] text-xs text-[#DC2626]">
                {errorMsg}
              </div>
            )}

            {/* Chat Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendNlp();
              }}
              className="p-4 border-t border-[#E5E5E5] bg-[#FFFFFF] rounded-b-lg"
            >
              <label htmlFor="nlp-input" className="sr-only">
                Describe your insurance requirements in your own words
              </label>
              <textarea
                id="nlp-input"
                rows={3}
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendNlp();
                  }
                }}
                placeholder="Describe what you need in your own words (e.g., shorter PED waiting, no room rent cap, zero dep, low deductible)..."
                className="w-full resize-none text-sm text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-[#737373]">
                  Press Enter to analyze · Shift+Enter for new line
                </span>
                <button
                  type="submit"
                  disabled={isAnalyzing || !nlInput.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Extract Requirements</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right: Structured Requirements Summary */}
          <aside className="lg:col-span-5 space-y-4">
            <div className="border border-[#E5E5E5] rounded-lg bg-[#FFFFFF] p-5 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[#171717]">
                  Extracted Requirements Summary
                </h2>
                <button
                  type="button"
                  onClick={() => setShowJson((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#737373] hover:text-[#171717] transition-colors whitespace-nowrap"
                >
                  <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{showJson ? 'Hide JSON' : 'View JSON'}</span>
                </button>
              </div>

              {/* Core Structured Parameters */}
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm pb-4 border-b border-[#E5E5E5]">
                <div>
                  <div className="text-xs text-[#737373]">Category</div>
                  <div className="font-medium text-[#171717] capitalize">
                    {effectiveStructured.insurance_type}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#737373]">Target Coverage</div>
                  <div className="font-medium text-[#171717] tabular-nums">
                    {formatMoney(effectiveStructured.coverage, activeCategory)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#737373]">Annual Budget</div>
                  <div className="font-medium text-[#171717] tabular-nums">
                    {effectiveStructured.budget
                      ? `₹${effectiveStructured.budget.toLocaleString('en-IN')}`
                      : 'Flexible'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#737373]">Tenure</div>
                  <div className="font-medium text-[#171717] tabular-nums">
                    {effectiveStructured.tenure_years
                      ? `${effectiveStructured.tenure_years} yr${effectiveStructured.tenure_years > 1 ? 's' : ''}`
                      : activeCategory === 'travel'
                        ? `${details.travelDurationDays ?? 14} days`
                        : 'Standard'}
                  </div>
                </div>
              </div>

              {/* Conflict Alerts */}
              {effectiveStructured.conflicts.length > 0 && (
                <div className="space-y-2">
                  {effectiveStructured.conflicts.map((conflict) => (
                    <div
                      key={conflict.id}
                      className="p-3 rounded-lg border border-[#D97706]/40 bg-[#FFFBEB] text-xs text-[#92400E] flex items-start gap-2.5"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" aria-hidden="true" />
                      <div>
                        <div className="font-semibold">{conflict.title}</div>
                        <div className="mt-0.5 leading-relaxed">{conflict.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Extracted Requirements List */}
              <div>
                <div className="text-xs font-medium text-[#737373] mb-2.5">
                  Structured Preferences ({effectiveStructured.requirements.length})
                </div>

                {effectiveStructured.requirements.length === 0 ? (
                  <p className="text-xs text-[#737373] py-3">
                    No natural-language requirements extracted yet. Describe your priorities in the chat box to extract mandatory and preferred criteria.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E5E5E5] border-t border-b border-[#E5E5E5]">
                    {effectiveStructured.requirements.map((req) => (
                      <li
                        key={req.id}
                        className="py-2.5 flex items-baseline justify-between gap-3 text-sm"
                      >
                        <div>
                          <div className="font-medium text-[#171717]">{req.name}</div>
                          <div className="text-xs text-[#737373]">
                            Preference: {req.preference.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-medium capitalize shrink-0 ${
                            req.priority === 'mandatory'
                              ? 'text-[#171717]'
                              : req.priority === 'preferred'
                                ? 'text-[#525252]'
                                : 'text-[#737373]'
                          }`}
                        >
                          {req.priority}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {showJson && (
                <pre className="p-3 rounded-lg bg-[#F7F7F7] border border-[#E5E5E5] text-[11px] font-mono-tabular overflow-x-auto text-[#171717]">
                  {JSON.stringify(
                    {
                      insurance_type: effectiveStructured.insurance_type,
                      coverage: effectiveStructured.coverage,
                      requirements: effectiveStructured.requirements.map((r) => ({
                        name: r.name,
                        preference: r.preference,
                        priority: r.priority,
                      })),
                    },
                    null,
                    2
                  )}
                </pre>
              )}

              <button
                type="button"
                disabled={isGeneratingRecs}
                onClick={handleGenerateRecommendations}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#171717] text-[#FFFFFF] text-sm font-medium rounded-lg hover:bg-[#2E2E2E] disabled:opacity-50 transition-colors"
              >
                {isGeneratingRecs ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Matching Policies...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Recommendations</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
