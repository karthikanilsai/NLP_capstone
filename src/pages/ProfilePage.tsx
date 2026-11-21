import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Clock } from 'lucide-react';
import type { InsuranceCategory, SessionSummary, UserProfile } from '../../shared/types';
import { useInsureMate } from '../context/InsureMateContext';
import { categoryLabel, formatDateShort, formatMoney } from '../utils/formatters';

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, refreshProfile, loadSessionFromServer } = useInsureMate();

  const [form, setForm] = useState<Partial<UserProfile>>({});
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm(profile);
    }
  }, [profile]);

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((d: { sessions: SessionSummary[] }) => setSessions(d.sessions ?? []));
  }, []);

  const handleTogglePrefCategory = (cat: InsuranceCategory) => {
    const current = form.preferredCategories ?? [];
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    setForm((f) => ({ ...f, preferredCategories: next }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        await refreshProfile();
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenSession = async (sessionId: string) => {
    await loadSessionFromServer(sessionId);
    navigate(`/recommendations/${sessionId}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-10">
      <header className="pb-5 border-b border-[#E5E5E5]">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#171717]">
          Profile &amp; Preferences
        </h1>
        <p className="mt-1 text-sm text-[#737373]">
          Manage your default details, insurance priorities, and previous recommendation sessions.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: User Details & Preferences */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 border border-[#E5E5E5] rounded-lg p-6 bg-[#FFFFFF] space-y-5"
        >
          <h2 className="text-base font-semibold text-[#171717]">Basic Information</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-[#525252]">Full Name</span>
              <input
                type="text"
                value={form.fullName ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#525252]">Email</span>
              <input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#525252]">Age</span>
              <input
                type="number"
                value={form.age ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, age: Number(e.target.value) || null }))
                }
                className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#525252]">City</span>
              <input
                type="text"
                value={form.city ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#525252]">Family Members</span>
              <input
                type="number"
                min={1}
                value={form.familySize ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, familySize: Number(e.target.value) || null }))
                }
                className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg tabular-nums focus:outline-none focus:border-[#171717]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#525252]">Annual Income Range</span>
              <select
                value={form.annualIncomeRange ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, annualIncomeRange: e.target.value }))
                }
                className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-[#171717]"
              >
                <option value="Under 5L">Under ₹5 Lakh</option>
                <option value="5L - 15L">₹5 Lakh – ₹15 Lakh</option>
                <option value="15L - 25L">₹15 Lakh – ₹25 Lakh</option>
                <option value="25L+">₹25 Lakh+</option>
              </select>
            </label>
          </div>

          <div className="pt-2">
            <span className="text-xs font-medium text-[#525252] block mb-2">
              Preferred Insurance Categories
            </span>
            <div className="flex flex-wrap gap-2">
              {(['health', 'car', 'life', 'travel'] as const).map((cat) => {
                const active = (form.preferredCategories ?? []).includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleTogglePrefCategory(cat)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      active
                        ? 'bg-[#171717] text-[#FFFFFF] border-[#171717]'
                        : 'bg-[#FFFFFF] text-[#525252] border-[#E5E5E5] hover:text-[#171717]'
                    }`}
                  >
                    {categoryLabel(cat)}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-[#525252]">Saved Priority Notes</span>
            <textarea
              rows={3}
              value={form.priorityNotes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, priorityNotes: e.target.value }))}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#171717]"
            />
          </label>

          <div className="flex items-center justify-between gap-4 pt-2">
            <div>
              {savedNotice && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16A34A]">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Preferences saved</span>
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-[#171717] text-[#FFFFFF] text-xs font-medium rounded-lg hover:bg-[#2E2E2E] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>

        {/* Right: Previous Recommendation Sessions */}
        <section className="lg:col-span-5 space-y-4">
          <div className="border border-[#E5E5E5] rounded-lg p-6 bg-[#FFFFFF] space-y-4">
            <h2 className="text-base font-semibold text-[#171717]">
              Previous Recommendation Sessions
            </h2>

            {sessions.length === 0 ? (
              <div className="py-6 text-sm text-[#737373] space-y-3">
                <p>No completed or saved recommendation sessions yet.</p>
                <button
                  type="button"
                  onClick={() => navigate('/find')}
                  className="px-4 py-2 text-xs font-medium bg-[#171717] text-[#FFFFFF] rounded-lg"
                >
                  Start First Session
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-[#E5E5E5] border-t border-[#E5E5E5]">
                {sessions.map((s) => (
                  <li key={s.id} className="py-3.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#171717] truncate">
                        {s.title}
                      </div>
                      <div className="text-xs text-[#737373] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {formatDateShort(s.updatedAt)}
                        </span>
                        {s.coverage && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatMoney(s.coverage, s.category)}</span>
                          </>
                        )}
                        {s.topPolicyName && s.topMatchPercentage !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#171717]">
                              Top: {s.topPolicyName} ({s.topMatchPercentage}%)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenSession(s.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5] rounded-lg hover:bg-[#F7F7F7] shrink-0 whitespace-nowrap"
                    >
                      <span>Open</span>
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
