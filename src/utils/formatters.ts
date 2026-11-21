import type { InsuranceCategory } from '../../shared/types';

export function categoryLabel(category: InsuranceCategory): string {
  switch (category) {
    case 'health':
      return 'Health Insurance';
    case 'car':
      return 'Car Insurance';
    case 'life':
      return 'Life Insurance';
    case 'travel':
      return 'Travel Insurance';
  }
}

export function formatMoney(amount: number | null | undefined, category: InsuranceCategory): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return 'Not specified';
  }
  if (category === 'travel') {
    return `$${amount.toLocaleString('en-US')}`;
  }
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2).replace(/\.?0+$/, '')} Cr`;
  }
  if (amount >= 100000) {
    const l = amount / 100000;
    return `₹${Number.isInteger(l) ? l : l.toFixed(1).replace(/\.0$/, '')} Lakh`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return 'Unverified';
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
