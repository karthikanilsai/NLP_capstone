export function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-10">
      <header className="pb-6 border-b border-[#E5E5E5]">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#171717]">
          About InsureMate
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[#737373] leading-relaxed">
          InsureMate translates ordinary, everyday language into structured insurance criteria and matches them transparently against indexed policy clauses.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#171717]">01. Purpose</h2>
        <p className="text-sm text-[#525252] leading-relaxed">
          Insurance policy wordings are often dense with exclusions, waiting periods, co-payments, and sub-limits. InsureMate replaces rigid multi-page forms with a focused conversational interface so you can state priorities in your own words—such as shorter PED waiting periods, zero depreciation, or no room rent capping—and immediately see which clauses satisfy or conflict with your goals.
        </p>
      </section>

      <section className="space-y-4 pt-6 border-t border-[#E5E5E5]">
        <h2 className="text-lg font-semibold text-[#171717]">02. How NLP Is Used</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-[#E5E5E5] rounded-lg p-4 space-y-1.5">
            <div className="text-sm font-semibold text-[#171717]">
              Input Normalization &amp; Abbreviations
            </div>
            <p className="text-xs text-[#525252] leading-relaxed">
              Expands domain shorthand automatically (e.g., PED to Pre-Existing Disease, Zero Dep to Zero Depreciation, RSA to Roadside Assistance, OPD to Outpatient Cover).
            </p>
          </div>
          <div className="border border-[#E5E5E5] rounded-lg p-4 space-y-1.5">
            <div className="text-sm font-semibold text-[#171717]">
              Structured Entity &amp; Priority Extraction
            </div>
            <p className="text-xs text-[#525252] leading-relaxed">
              Converts free-form text into canonical JSON requirements classified as Mandatory, Preferred, or Optional while preserving multi-turn conversation context.
            </p>
          </div>
          <div className="border border-[#E5E5E5] rounded-lg p-4 space-y-1.5">
            <div className="text-sm font-semibold text-[#171717]">
              Conflict &amp; Gap Detection
            </div>
            <p className="text-xs text-[#525252] leading-relaxed">
              Identifies missing details or contradictory constraints (such as requesting zero depreciation on a third-party-only policy) and asks targeted follow-up questions.
            </p>
          </div>
          <div className="border border-[#E5E5E5] rounded-lg p-4 space-y-1.5">
            <div className="text-sm font-semibold text-[#171717]">
              Semantic Clause Matching
            </div>
            <p className="text-xs text-[#525252] leading-relaxed">
              Generates dense semantic vector embeddings for your structured requirement profile and compares them against indexed policy clauses using cosine similarity.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3 pt-6 border-t border-[#E5E5E5]">
        <h2 className="text-lg font-semibold text-[#171717]">
          03. How Recommendations Are Calculated
        </h2>
        <p className="text-sm text-[#525252] leading-relaxed">
          Match percentages are never randomized. Every candidate policy is evaluated deterministically across four weighted dimensions:
        </p>
        <ul className="space-y-2 text-sm text-[#171717] pl-1">
          <li className="flex items-start gap-2.5">
            <span className="font-mono-tabular text-xs font-semibold pt-0.5">55%</span>
            <span>
              <strong>Weighted Clause Verification</strong> — Mandatory requirements carry 3x weight, preferred 1.5x, and optional 0.75x against verified policy rules.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="font-mono-tabular text-xs font-semibold pt-0.5">20%</span>
            <span>
              <strong>Semantic Clause Similarity</strong> — Vector cosine similarity between your requirement profile and full policy clause text.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="font-mono-tabular text-xs font-semibold pt-0.5">15%</span>
            <span>
              <strong>Coverage Range Fit</strong> — Checks whether your desired sum insured falls inside the policy&apos;s supported limits.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="font-mono-tabular text-xs font-semibold pt-0.5">10%</span>
            <span>
              <strong>Budget Alignment</strong> — Evaluates verified indicative premiums against your stated annual budget without guessing unverified rates.
            </span>
          </li>
        </ul>
        <p className="text-xs text-[#737373] pt-2">
          Mandatory requirement gatekeeping: A high overall score never hides an unmet mandatory requirement or eligibility restriction—plans with unmet mandatory criteria are flagged explicitly and separated in rankings and comparisons.
        </p>
      </section>

      <section className="space-y-2 pt-6 border-t border-[#E5E5E5]">
        <h2 className="text-lg font-semibold text-[#171717]">
          04. Demonstration Dataset Transparency
        </h2>
        <p className="text-sm text-[#525252] leading-relaxed">
          Policies currently loaded in SQLite represent a clearly labeled demonstration dataset with structured clauses, waiting periods, exclusions, and downloadable wording summaries. Official website links point to real insurer category pages or the insurance regulator where applicable; they are supporting sources and do not claim to be exact product pages for the demonstration plans. InsureMate does not fabricate insurer logos or unverified premiums.
        </p>
      </section>
    </div>
  );
}
