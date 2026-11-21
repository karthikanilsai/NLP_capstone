import type { PolicyRecord } from '../../shared/types.ts';

export function buildPolicySearchDocument(policy: PolicyRecord): string {
  const clauseText = policy.clauses
    .map((c) => `${c.sectionRef} ${c.title}: ${c.summary}`)
    .join(' | ');

  return [
    `Plan: ${policy.name}`,
    `Category: ${policy.category}`,
    `Overview: ${policy.overview}`,
    `Waiting period: ${policy.importantWaitingPeriod}`,
    `Limits: ${policy.roomRentOrLimitSummary}`,
    `Co-payment or Deductible: ${policy.copaymentOrDeductibleSummary}`,
    `Benefits: ${policy.benefits.join('; ')}`,
    `Exclusions: ${policy.exclusions.join('; ')}`,
    `Clauses: ${clauseText}`,
  ].join('\n');
}

function escapePdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, (ch) => {
      if (ch === '₹') return 'INR ';
      if (ch === '·') return '-';
      if (ch === '–' || ch === '—') return '-';
      return ' ';
    })
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars = 84): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

/**
 * Generates a valid single/multi-page PDF buffer from structured policy data
 * without requiring native binary dependencies.
 */
export function generatePolicyPdfBuffer(policy: PolicyRecord): Buffer {
  const lines: Array<{ text: string; bold?: boolean; size?: number }> = [
    { text: `${policy.name} (${policy.category.toUpperCase()} INSURANCE)`, bold: true, size: 15 },
    {
      text: policy.isDemoDataset
        ? 'DEMONSTRATION POLICY WORDING SUMMARY - NOT AN INSURER CONTRACT'
        : 'VERIFIED POLICY SUMMARY',
      bold: true,
      size: 9,
    },
    { text: '------------------------------------------------------------------------------------' },
    { text: '1. OVERVIEW', bold: true, size: 11 },
    ...wrapText(policy.overview).map((t) => ({ text: t, size: 10 })),
    { text: '' },
    { text: '2. COVERAGE, LIMITS & PRICING', bold: true, size: 11 },
    {
      text: `Coverage Range: ${policy.category === 'travel' ? '$' : 'INR '}${policy.minCoverage.toLocaleString('en-US')} - ${policy.category === 'travel' ? '$' : 'INR '}${policy.maxCoverage.toLocaleString('en-US')}`,
      size: 10,
    },
    {
      text:
        policy.premiumVerified && policy.estimatedAnnualPremium !== null
          ? `Indicative Annual Premium: INR ${policy.estimatedAnnualPremium.toLocaleString('en-IN')} (${policy.premiumNote})`
          : `Annual Premium: Unverified / Quote Required (${policy.premiumNote})`,
      size: 10,
    },
    { text: `Waiting Period: ${policy.importantWaitingPeriod}`, size: 10 },
    { text: `Room Rent / Cover Limit: ${policy.roomRentOrLimitSummary}`, size: 10 },
    { text: `Co-payment / Deductible: ${policy.copaymentOrDeductibleSummary}`, size: 10 },
    { text: `Eligibility: ${policy.eligibilitySummary}`, size: 10 },
    {
      text: `Cashless Network: ${policy.cashlessNetworkInfo ?? 'Information unavailable / not applicable'}`,
      size: 10,
    },
    { text: '' },
    { text: '3. KEY BENEFITS', bold: true, size: 11 },
    ...policy.benefits.flatMap((b) => wrapText(`- ${b}`).map((t) => ({ text: t, size: 10 }))),
    { text: '' },
    { text: '4. MAJOR EXCLUSIONS', bold: true, size: 11 },
    ...policy.exclusions.flatMap((e) => wrapText(`- ${e}`).map((t) => ({ text: t, size: 10 }))),
    { text: '' },
    { text: '5. INDEXED POLICY CLAUSES & SECTION REFERENCES', bold: true, size: 11 },
    ...policy.clauses.flatMap((c) => [
      { text: `${c.sectionRef} - ${c.title} (${c.verified ? 'Verified' : 'Unverified'})`, bold: true, size: 10 },
      ...wrapText(c.summary).map((t) => ({ text: `  ${t}`, size: 9 })),
    ]),
  ];

  // Paginate lines (approx 48 lines per page)
  const pages: Array<typeof lines> = [];
  const linesPerPage = 46;
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }

  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: Font Regular, 4: Font Bold
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');

  const pageObjStart = 5;
  const pageRefs: string[] = [];
  for (let p = 0; p < pages.length; p++) {
    pageRefs.push(`${pageObjStart + p * 2} 0 R`);
  }
  objects.push(`2 0 obj << /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >> endobj`);
  objects.push('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj');

  pages.forEach((pageLines, idx) => {
    const pageObjId = pageObjStart + idx * 2;
    const contentObjId = pageObjId + 1;

    let stream = 'BT\n';
    let y = 760;
    for (const line of pageLines) {
      const font = line.bold ? '/F2' : '/F1';
      const size = line.size ?? 10;
      stream += `${font} ${size} Tf\n1 0 0 1 48 ${y} Tm\n(${escapePdfText(line.text)}) Tj\n`;
      y -= size + 5;
    }
    stream += 'ET';

    objects.push(
      `${pageObjId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >> endobj`
    );
    objects.push(
      `${contentObjId} 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj + '\n';
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}
