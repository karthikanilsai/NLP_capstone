import { useNavigate } from 'react-router-dom';
import { ArrowRight, Car, HeartPulse, Plane, Umbrella } from 'lucide-react';
import type { InsuranceCategory } from '../../shared/types';

const CATEGORIES: Array<{
  id: InsuranceCategory;
  title: string;
  description: string;
  icon: typeof HeartPulse;
}> = [
  {
    id: 'health',
    title: 'Health Insurance',
    description: 'Hospitalization, pre-existing disease waiting periods, room limits, and cashless care.',
    icon: HeartPulse,
  },
  {
    id: 'car',
    title: 'Car Insurance',
    description: 'Comprehensive own-damage, zero depreciation, engine protection, and roadside support.',
    icon: Car,
  },
  {
    id: 'life',
    title: 'Life Insurance',
    description: 'Pure-term protection, long-tenure cover, critical illness riders, and family income.',
    icon: Umbrella,
  },
  {
    id: 'travel',
    title: 'Travel Insurance',
    description: 'International medical emergencies, visa compliance, baggage loss, and trip delays.',
    icon: Plane,
  },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto px-6 sm:px-10 py-14 sm:py-20">
      <section className="max-w-2xl">
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#171717] leading-[1.15] text-balance">
          Insurance decisions, made simpler.
        </h1>
        <p className="mt-4 text-base sm:text-lg text-[#737373] leading-relaxed">
          Tell us what you need. We&apos;ll help you understand and compare insurance policies.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/find')}
            className="inline-flex items-center gap-2.5 px-6 py-3 bg-[#171717] text-[#FFFFFF] text-sm font-medium rounded-lg hover:bg-[#2E2E2E] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Find My Insurance</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/recommendations')}
            className="inline-flex items-center px-5 py-3 bg-[#FFFFFF] text-[#171717] text-sm font-medium rounded-lg border border-[#E5E5E5] hover:bg-[#F7F7F7] transition-colors whitespace-nowrap shrink-0"
          >
            Browse Policy Catalog
          </button>
        </div>
      </section>

      <section className="mt-14 pt-10 border-t border-[#E5E5E5]" aria-label="Insurance categories">
        <h2 className="text-sm font-medium text-[#737373] mb-5">
          Choose a category to begin
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => navigate(`/find?category=${cat.id}`)}
                className="group text-left p-6 bg-[#FFFFFF] border border-[#E5E5E5] rounded-lg hover:border-[#A3A3A3] transition-colors flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#F7F7F7] border border-[#E5E5E5] flex items-center justify-center text-[#171717] shrink-0">
                    <Icon className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
                  </div>
                  <ArrowRight
                    className="w-4 h-4 text-[#A3A3A3] group-hover:text-[#171717] group-hover:translate-x-0.5 transition-all"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#171717]">{cat.title}</h3>
                  <p className="mt-1.5 text-sm text-[#737373] leading-relaxed">
                    {cat.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
