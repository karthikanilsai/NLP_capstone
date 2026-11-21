import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type {
  ConversationMessage,
  RecommendationRunResult,
  SavedPlanRecord,
  StructuredRequirements,
  UserProfile,
} from '../../shared/types';

interface InsureMateContextValue {
  sessionId: string | null;
  structured: StructuredRequirements | null;
  messages: ConversationMessage[];
  recommendations: RecommendationRunResult | null;
  savedPlans: SavedPlanRecord[];
  savedPolicyIds: Set<string>;
  comparePolicyIds: string[];
  profile: UserProfile | null;
  setActiveSession: (data: {
    sessionId: string;
    structured: StructuredRequirements;
    messages?: ConversationMessage[];
    recommendations?: RecommendationRunResult | null;
  }) => void;
  setRecommendationsResult: (res: RecommendationRunResult) => void;
  loadSessionFromServer: (id: string) => Promise<void>;
  resetSession: () => void;
  toggleSavePlan: (policyId: string) => Promise<void>;
  refreshSavedPlans: () => Promise<void>;
  toggleComparePolicy: (policyId: string) => void;
  setComparePolicyIds: (ids: string[]) => void;
  clearCompare: () => void;
  refreshProfile: () => Promise<void>;
}

const InsureMateContext = createContext<InsureMateContextValue | undefined>(undefined);

const SESSION_STORAGE_KEY = 'insuremate_active_session_id';

export function InsureMateProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [structured, setStructured] = useState<StructuredRequirements | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRunResult | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedPlanRecord[]>([]);
  const [comparePolicyIds, setComparePolicyIds] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const refreshSavedPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/saved');
      if (res.ok) {
        const data = (await res.json()) as { savedPlans: SavedPlanRecord[] };
        setSavedPlans(data.savedPlans);
      }
    } catch {
      // ignore transient startup fetch errors
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = (await res.json()) as { profile: UserProfile };
        setProfile(data.profile);
      }
    } catch {
      // ignore transient startup fetch errors
    }
  }, []);

  const loadSessionFromServer = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      session: {
        id: string;
        structured: StructuredRequirements;
        recommendations: RecommendationRunResult | null;
        messages: ConversationMessage[];
      };
    };
    setSessionId(data.session.id);
    setStructured(data.session.structured);
    setMessages(data.session.messages ?? []);
    setRecommendations(data.session.recommendations ?? null);
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, data.session.id);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    refreshSavedPlans();
    refreshProfile();
    if (sessionId && !structured) {
      loadSessionFromServer(sessionId);
    }
  }, [refreshSavedPlans, refreshProfile, sessionId, structured, loadSessionFromServer]);

  const setActiveSession = useCallback(
    (data: {
      sessionId: string;
      structured: StructuredRequirements;
      messages?: ConversationMessage[];
      recommendations?: RecommendationRunResult | null;
    }) => {
      setSessionId(data.sessionId);
      setStructured(data.structured);
      if (data.messages !== undefined) setMessages(data.messages);
      if (data.recommendations !== undefined) setRecommendations(data.recommendations);
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const setRecommendationsResult = useCallback((res: RecommendationRunResult) => {
    setSessionId(res.sessionId);
    setStructured(res.structured);
    setRecommendations(res);
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, res.sessionId);
    } catch {
      // ignore
    }
  }, []);

  const resetSession = useCallback(() => {
    setSessionId(null);
    setStructured(null);
    setMessages([]);
    setRecommendations(null);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const toggleSavePlan = useCallback(
    async (policyId: string) => {
      const isSaved = savedPlans.some((s) => s.policyId === policyId);
      if (isSaved) {
        const res = await fetch(`/api/saved/${encodeURIComponent(policyId)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setSavedPlans((prev) => prev.filter((s) => s.policyId !== policyId));
        }
      } else {
        const res = await fetch('/api/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policyId, sessionId }),
        });
        if (res.ok) {
          await refreshSavedPlans();
        }
      }
    },
    [savedPlans, sessionId, refreshSavedPlans]
  );

  const toggleComparePolicy = useCallback((policyId: string) => {
    setComparePolicyIds((prev) => {
      if (prev.includes(policyId)) {
        return prev.filter((id) => id !== policyId);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), policyId];
      }
      return [...prev, policyId];
    });
  }, []);

  const clearCompare = useCallback(() => {
    setComparePolicyIds([]);
  }, []);

  const savedPolicyIds = new Set(savedPlans.map((s) => s.policyId));

  return (
    <InsureMateContext.Provider
      value={{
        sessionId,
        structured,
        messages,
        recommendations,
        savedPlans,
        savedPolicyIds,
        comparePolicyIds,
        profile,
        setActiveSession,
        setRecommendationsResult,
        loadSessionFromServer,
        resetSession,
        toggleSavePlan,
        refreshSavedPlans,
        toggleComparePolicy,
        setComparePolicyIds,
        clearCompare,
        refreshProfile,
      }}
    >
      {children}
    </InsureMateContext.Provider>
  );
}

export function useInsureMate(): InsureMateContextValue {
  const ctx = useContext(InsureMateContext);
  if (!ctx) {
    throw new Error('useInsureMate must be used within InsureMateProvider');
  }
  return ctx;
}
