import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import type {
  BasicDetails,
  ComparisonAttributeRow,
  ComparisonResponse,
  InsuranceCategory,
  NLPAnalysisResponse,
  PolicyRecord,
  RecommendationRunResult,
  StructuredRequirements,
} from './shared/types.ts';
import {
  appendConversationMessage,
  getDb,
  getPolicyById,
  getSessionById,
  getUserProfile,
  ingestPolicy,
  listPolicies,
  listSavedPlans,
  listSessions,
  removeSavedPlan,
  savePlan,
  saveSessionState,
  updateUserProfile,
} from './server/db/database.ts';
import { generatePolicyPdfBuffer } from './server/engine/policyDocumentProcessor.ts';
import { evaluatePolicies } from './server/engine/scoringEngine.ts';
import { generateRecommendationsWithExplanations } from './server/engine/explanationGenerator.ts';

const PORT = Number(process.env.PORT || 3000);
const PYTHON_NLP_PORT = Number(process.env.PYTHON_NLP_PORT || 8001);
const PYTHON_NLP_URL = `http://127.0.0.1:${PYTHON_NLP_PORT}`;
let pythonNlpProcess: ChildProcess | null = null;
const AI_RATE_WINDOW_MS = 60 * 1000;
const AI_RATE_MAX_REQUESTS = 10;
const aiRequestWindows = new Map<string, { startedAt: number; count: number }>();
const aiRateLimitCleanup = setInterval(() => {
  const cutoff = Date.now() - AI_RATE_WINDOW_MS;
  for (const [ip, window] of aiRequestWindows) {
    if (window.startedAt <= cutoff) aiRequestWindows.delete(ip);
  }
}, AI_RATE_WINDOW_MS);
aiRateLimitCleanup.unref();

class PythonNlpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PythonNlpError';
  }
}

function limitAiRequests(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  let window = aiRequestWindows.get(ip);
  if (!window || now - window.startedAt >= AI_RATE_WINDOW_MS) {
    window = { startedAt: now, count: 0 };
    aiRequestWindows.set(ip, window);
  }
  if (window.count >= AI_RATE_MAX_REQUESTS) {
    res.setHeader('Retry-After', String(Math.ceil((AI_RATE_WINDOW_MS - (now - window.startedAt)) / 1000)));
    res.status(429).json({ error: 'AI request limit reached. Wait a minute before trying again.' });
    return;
  }
  window.count += 1;
  next();
}

async function pythonNlpRequest<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${PYTHON_NLP_URL}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === 'string' ? payload.detail : `Python NLP service returned ${response.status}`;
    throw new PythonNlpError(detail, response.status);
  }
  return payload as T;
}

async function ensurePythonNlpService(): Promise<void> {
  try {
    await pythonNlpRequest('/health');
    return;
  } catch {
    // Start the bundled Python service when it is not already running.
  }
  const executable = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
  pythonNlpProcess = spawn(executable, ['-m', 'uvicorn', 'ml.service:app', '--host', '127.0.0.1', '--port', String(PYTHON_NLP_PORT)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
  });
  pythonNlpProcess.on('error', (error) => console.error('[Python NLP Service]', error));
  for (let attempt = 0; attempt < 40; attempt++) {
    if (pythonNlpProcess.exitCode !== null) throw new Error('Python NLP service exited before it became ready. Install ml/requirements.txt.');
    try {
      await pythonNlpRequest('/health');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('Python NLP service did not become ready. Check Python and ml/requirements.txt.');
}


function buildSessionTitle(structured: StructuredRequirements): string {
  const catLabel =
    structured.insurance_type.charAt(0).toUpperCase() + structured.insurance_type.slice(1);
  const coverPart = structured.coverage
    ? structured.insurance_type === 'travel'
      ? `$${structured.coverage.toLocaleString('en-US')}`
      : `₹${(structured.coverage / 100000).toFixed(structured.coverage % 100000 === 0 ? 0 : 1)}L`
    : 'Custom Cover';
  const reqCount = structured.requirements.length;
  return `${catLabel} Insurance · ${coverPart} (${reqCount} req${reqCount === 1 ? '' : 's'})`;
}

function formatCurrency(value: number | null, category: InsuranceCategory): string {
  if (value === null) return 'Not specified';
  if (category === 'travel') return `$${value.toLocaleString('en-US')}`;
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2).replace(/\.00$/, '')} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatNlpError(
  err: unknown,
  fallbackMessage: string
): { status: number; message: string; upstreamStatus?: number } {
  const raw = err instanceof Error ? err.message : fallbackMessage;
  const status = err instanceof PythonNlpError ? err.status : undefined;

  if (status === 429) {
    return { status: 429, upstreamStatus: 429, message: raw };
  }
  if (status === 503) {
    return { status: 503, message: raw };
  }
  return { status: 502, upstreamStatus: status, message: raw || fallbackMessage };
}

async function startServer(): Promise<void> {
  // Start the Python NLP/ML service and initialize the existing SQLite database.
  await ensurePythonNlpService();
  getDb();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', database: 'sqlite' });
  });

  // Policies Catalog & Search
  app.get('/api/policies', (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const policies = listPolicies(category, search);
    res.json({ policies });
  });

  app.get('/api/policies/:id', (req, res) => {
    const policy = getPolicyById(req.params.id);
    if (!policy) {
      res.status(404).json({ error: 'Policy not found.' });
      return;
    }
    res.json({ policy });
  });

  app.get('/api/policies/:id/pdf', (req, res) => {
    const policy = getPolicyById(req.params.id);
    if (!policy) {
      res.status(404).json({ error: 'Policy not found.' });
      return;
    }
    const pdfBuffer = generatePolicyPdfBuffer(policy);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${policy.documentTitle}"`);
    res.send(pdfBuffer);
  });

  app.post('/api/policies/ingest', (req, res) => {
    try {
      const policy = req.body as PolicyRecord;
      if (!policy?.id || !policy?.name || !policy?.category) {
        res.status(400).json({ error: 'Policy id, name, and category are required.' });
        return;
      }
      const saved = ingestPolicy(policy);
      res.status(201).json({ policy: saved });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to ingest policy record.',
      });
    }
  });

  // NLP Analysis Pipeline (Modules 1 - 6)
  app.post('/api/nlp/analyze', limitAiRequests, async (req, res) => {
    try {
      const {
        sessionId: incomingSessionId,
        category,
        message,
        basicDetails,
        currentStructured,
      } = req.body as {
        sessionId?: string;
        category: InsuranceCategory;
        message: string;
        basicDetails?: Partial<BasicDetails>;
        currentStructured?: StructuredRequirements;
      };

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Please enter your requirements in natural language.' });
        return;
      }

      const sessionId = incomingSessionId || `sess-${Date.now().toString(36)}`;
      const existingSession = incomingSessionId ? getSessionById(incomingSessionId) : null;

      const workingState: StructuredRequirements =
        currentStructured ??
        existingSession?.structured ??
        {
          insurance_type: category || 'health',
          coverage: basicDetails?.coverageAmount ?? basicDetails?.vehicleValue ?? basicDetails?.desiredLifeCover ?? null,
          budget: basicDetails?.annualBudget ?? null,
          tenure_years: basicDetails?.policyTenureYears ?? null,
          basic_details: basicDetails ?? {},
          requirements: [],
          conflicts: [],
          missing_info: [],
        };

      // All NLP processing now runs in the Python service.
      const nlpResult = await pythonNlpRequest<{
        intent: string;
        normalizedText: string;
        abbreviationsExpanded: Array<{ abbr: string; expanded: string }>;
        structured: StructuredRequirements;
        followUpQuestions: Array<{ id: string; question: string; reason: string; targetField?: string; suggestedReplies?: string[] }>;
        assistantReply: string;
        readyForRecommendations: boolean;
      }>('/analyze', {
        category: category || 'health',
        message,
        currentStructured: workingState,
        basicDetails,
      });

      const intent = nlpResult.intent;
      const finalStructured = nlpResult.structured;
      const followUpQuestions = nlpResult.followUpQuestions;

      const title = buildSessionTitle(finalStructured);
      saveSessionState(sessionId, title, finalStructured);

      const now = new Date().toISOString();
      appendConversationMessage(sessionId, {
        id: `msg-u-${Date.now().toString(36)}`,
        role: 'user',
        content: message.trim(),
        createdAt: now,
        metadata: {
          intent,
          abbreviationsExpanded: nlpResult.abbreviationsExpanded,
        },
      });

      const assistantReply = nlpResult.assistantReply;
      appendConversationMessage(sessionId, {
        id: `msg-a-${Date.now().toString(36)}`,
        role: 'assistant',
        content: assistantReply,
        createdAt: new Date().toISOString(),
        metadata: {
          intent,
          extractedCount: finalStructured.requirements.length,
        },
      });

      const responsePayload: NLPAnalysisResponse = {
        sessionId,
        intent,
        normalizedText: nlpResult.normalizedText,
        abbreviationsExpanded: nlpResult.abbreviationsExpanded,
        structured: finalStructured,
        followUpQuestions,
        assistantReply,
        readyForRecommendations: nlpResult.readyForRecommendations,
      };

      res.json(responsePayload);
    } catch (err) {
      const formatted = formatNlpError(err, 'NLP analysis failed.');
      if (!formatted.upstreamStatus) {
        console.error('[NLP Analyze Error]', err);
      }
      res.status(formatted.status).json({
        error: formatted.message,
        upstreamStatus: formatted.upstreamStatus,
      });
    }
  });

  // Recommendation Engine (Modules 7 - 10)
  app.post('/api/recommendations', async (req, res) => {
    try {
      const { sessionId: incomingSessionId, structured: incomingStructured } = req.body as {
        sessionId?: string;
        structured: StructuredRequirements;
      };

      if (!incomingStructured || !incomingStructured.insurance_type) {
        res.status(400).json({ error: 'Structured requirements payload is required.' });
        return;
      }

      const sessionId = incomingSessionId || `sess-${Date.now().toString(36)}`;
      const candidatePolicies = listPolicies(incomingStructured.insurance_type);

      // Module 8: Local TF-IDF policy matching
      const semanticResult = await pythonNlpRequest<{
        scores: Record<string, number>;
        engineUsed: string;
        knowledgeMatches: Array<{ title: string; sourceUrl: string; providerDomain: string; category: string; snippet: string; relevance: number }>;
        scrapedPagesAvailable: number;
        policyLinkedScrapedPages: number;
      }>(
        '/semantic-scores',
        { structured: incomingStructured, policies: candidatePolicies }
      );
      const semanticScores = new Map<string, number>(Object.entries(semanticResult.scores));
      const engineUsed = semanticResult.engineUsed;

      // Module 9: Recommendation Scoring Engine
      const evaluations = evaluatePolicies(
        incomingStructured,
        candidatePolicies,
        semanticScores
      );

      // Module 10: Explanation Generator
      const recommendations = generateRecommendationsWithExplanations(evaluations);

      const result: RecommendationRunResult = {
        sessionId,
        structured: incomingStructured,
        recommendations,
        generatedAt: new Date().toISOString(),
        semanticEngineUsed: engineUsed,
        knowledgeMatches: semanticResult.knowledgeMatches ?? [],
        scrapedPagesAvailable: semanticResult.scrapedPagesAvailable ?? 0,
        policyLinkedScrapedPages: semanticResult.policyLinkedScrapedPages ?? 0,
      };

      saveSessionState(
        sessionId,
        buildSessionTitle(incomingStructured),
        incomingStructured,
        result
      );

      res.json(result);
    } catch (err) {
      const formatted = formatNlpError(err, 'Recommendation engine failed.');
      if (!formatted.upstreamStatus) {
        console.error('[Recommendation Error]', err);
      }
      res.status(formatted.status).json({
        error: formatted.message,
        upstreamStatus: formatted.upstreamStatus,
      });
    }
  });

  // Sessions
  app.get('/api/sessions', (_req, res) => {
    res.json({ sessions: listSessions() });
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = getSessionById(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Recommendation session not found.' });
      return;
    }
    res.json({ session });
  });

  // Saved Plans
  app.get('/api/saved', (_req, res) => {
    res.json({ savedPlans: listSavedPlans() });
  });

  app.post('/api/saved', (req, res) => {
    const { policyId, sessionId, notes } = req.body as {
      policyId: string;
      sessionId?: string | null;
      notes?: string;
    };
    if (!policyId) {
      res.status(400).json({ error: 'policyId is required.' });
      return;
    }
    const saved = savePlan(policyId, sessionId ?? null, notes ?? '');
    if (!saved) {
      res.status(404).json({ error: 'Policy not found.' });
      return;
    }
    res.status(201).json({ savedPlan: saved });
  });

  app.delete('/api/saved/:policyId', (req, res) => {
    const removed = removeSavedPlan(req.params.policyId);
    res.json({ removed });
  });

  // Profile
  app.get('/api/profile', (_req, res) => {
    res.json({ profile: getUserProfile() });
  });

  app.put('/api/profile', (req, res) => {
    const updated = updateUserProfile(req.body);
    res.json({ profile: updated });
  });

  // Policy Comparison
  app.post('/api/compare', (req, res) => {
    const { policyIds, sessionId } = req.body as {
      policyIds: string[];
      sessionId?: string | null;
    };

    if (!Array.isArray(policyIds) || policyIds.length === 0) {
      res.status(400).json({ error: 'Provide at least one policyId to compare.' });
      return;
    }

    const policies = policyIds
      .slice(0, 4)
      .map((id) => getPolicyById(id))
      .filter((p): p is PolicyRecord => p !== null);

    if (policies.length === 0) {
      res.status(404).json({ error: 'No matching policies found.' });
      return;
    }

    const session = sessionId ? getSessionById(sessionId) : null;
    let evaluations = null;

    if (session?.structured) {
      const neutralSemantic = new Map<string, number>(policies.map((p) => [p.id, 75]));
      const scored = evaluatePolicies(session.structured, policies, neutralSemantic);
      evaluations = generateRecommendationsWithExplanations(scored);
    }

    const evalMap = new Map(evaluations?.map((e) => [e.policy.id, e]) ?? []);

    const makeRow = (
      key: string,
      label: string,
      extractor: (p: PolicyRecord) => { display: string; verified: boolean }
    ): ComparisonAttributeRow => {
      const rawVals = policies.map((p) => ({
        policyId: p.id,
        ...extractor(p),
      }));
      const uniqueDisplays = new Set(rawVals.map((v) => v.display));
      const isDiff = uniqueDisplays.size > 1;
      return {
        key,
        label,
        values: rawVals.map((v) => ({
          policyId: v.policyId,
          displayValue: v.display,
          verified: v.verified,
          isDifferent: isDiff,
        })),
      };
    };

    const rows: ComparisonAttributeRow[] = [
      makeRow('coverage', 'Coverage Amount', (p) => ({
        display: `${formatCurrency(p.minCoverage, p.category)} – ${formatCurrency(p.maxCoverage, p.category)}`,
        verified: true,
      })),
      makeRow('premium', 'Annual Premium', (p) => ({
        display:
          p.premiumVerified && p.estimatedAnnualPremium !== null
            ? `${formatCurrency(p.estimatedAnnualPremium, 'health')}/yr (Demo schedule)`
            : 'Unavailable / Quote required',
        verified: p.premiumVerified && p.estimatedAnnualPremium !== null,
      })),
      makeRow('waiting', 'Waiting Periods', (p) => ({
        display: p.importantWaitingPeriod,
        verified: true,
      })),
      makeRow('limits', 'Room Rent / Cover Limits', (p) => ({
        display: p.roomRentOrLimitSummary,
        verified: true,
      })),
      makeRow('copay', 'Co-payment / Deductible', (p) => ({
        display: p.copaymentOrDeductibleSummary,
        verified: true,
      })),
      makeRow('eligibility', 'Eligibility', (p) => ({
        display: p.eligibilitySummary,
        verified: true,
      })),
      makeRow('benefits', 'Key Benefits', (p) => ({
        display: p.benefits.slice(0, 3).join(' · '),
        verified: true,
      })),
      makeRow('exclusions', 'Key Exclusions', (p) => ({
        display: p.exclusions.slice(0, 2).join(' · '),
        verified: true,
      })),
      makeRow('cashless', 'Cashless Network', (p) => ({
        display: p.cashlessNetworkInfo ?? 'Unavailable / Not applicable',
        verified: Boolean(p.cashlessNetworkInfo),
      })),
    ];

    if (evaluations) {
      rows.unshift(
        makeRow('match', 'User Requirement Match', (p) => {
          const ev = evalMap.get(p.id);
          if (!ev) return { display: 'Not evaluated', verified: false };
          const suffix = ev.hasUnmetMandatory
            ? ` (${ev.unmetMandatoryCount} mandatory unmet)`
            : !ev.eligible
              ? ' (Eligibility issue)'
              : ' (All mandatory met)';
          return { display: `${ev.matchPercentage}%${suffix}`, verified: true };
        })
      );
    }

    const hasAnyUnmetMandatory = evaluations
      ? evaluations.some((e) => e.hasUnmetMandatory || !e.eligible)
      : false;

    const fullyCompliant = evaluations
      ? evaluations
          .filter((e) => !e.hasUnmetMandatory && e.eligible)
          .sort((a, b) => b.matchPercentage - a.matchPercentage)
      : [];

    const leadingEligiblePolicyId =
      !hasAnyUnmetMandatory && fullyCompliant.length > 0
        ? fullyCompliant[0].policy.id
        : fullyCompliant.length > 0 && !evaluations?.some((e) => e.hasUnmetMandatory)
          ? fullyCompliant[0].policy.id
          : null;

    const summaryNote = hasAnyUnmetMandatory
      ? 'One or more compared plans have unmet mandatory requirements or eligibility limits. No plan is automatically declared best—inspect the requirement breakdown carefully.'
      : evaluations
        ? 'Comparison evaluated against your active session requirements. Highlighted rows mark key differences between plans.'
        : 'Side-by-side comparison of verified demonstration policy specifications. Start a requirement session to score against your personal criteria.';

    const payload: ComparisonResponse = {
      policies,
      recommendations: evaluations,
      rows,
      hasAnyUnmetMandatory,
      leadingEligiblePolicyId,
      summaryNote,
    };

    res.json(payload);
  });

  const httpServer = http.createServer(app);

  // Vite Dev Middleware or Static Prod Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`InsureMate server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
