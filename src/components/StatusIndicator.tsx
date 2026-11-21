import { AlertTriangle, Check, HelpCircle, X } from 'lucide-react';
import type { RequirementStatus } from '../../shared/types';

interface StatusIndicatorProps {
  status: RequirementStatus;
  showLabel?: boolean;
}

export function StatusIndicator({ status, showLabel = false }: StatusIndicatorProps) {
  if (status === 'satisfied') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[#16A34A] shrink-0">
        <Check className="w-4 h-4 stroke-[2.25]" aria-hidden="true" />
        {showLabel && <span className="text-xs font-medium">Satisfied</span>}
      </span>
    );
  }

  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[#D97706] shrink-0">
        <AlertTriangle className="w-4 h-4 stroke-[2]" aria-hidden="true" />
        {showLabel && <span className="text-xs font-medium">Partial / Limitation</span>}
      </span>
    );
  }

  if (status === 'unmet') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[#DC2626] shrink-0">
        <X className="w-4 h-4 stroke-[2.25]" aria-hidden="true" />
        {showLabel && <span className="text-xs font-medium">Not Satisfied</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[#737373] shrink-0">
      <HelpCircle className="w-4 h-4 stroke-[2]" aria-hidden="true" />
      {showLabel && <span className="text-xs font-medium">Unverified</span>}
    </span>
  );
}
