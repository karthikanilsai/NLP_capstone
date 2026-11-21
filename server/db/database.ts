import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type {
  ConversationMessage,
  InsuranceCategory,
  PolicyRecord,
  RecommendationRunResult,
  SavedPlanRecord,
  SessionSummary,
  StructuredRequirements,
  UserProfile,
} from '../../shared/types.ts';
import { DEMO_POLICIES } from './seedPolicies.ts';

const DB_PATH = path.resolve(process.cwd(), 'insuremate.db');

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db);
    seedDatabase(db);
  }
  return db;
}

function initSchema(database: DatabaseSync): void {
  // PostgreSQL-compatible relational structure
  database.exec(`
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      is_demo_dataset INTEGER NOT NULL DEFAULT 1,
      overview TEXT NOT NULL,
      min_coverage REAL NOT NULL,
      max_coverage REAL NOT NULL,
      default_coverage REAL NOT NULL,
      tenure_options_json TEXT NOT NULL,
      estimated_annual_premium REAL,
      premium_verified INTEGER NOT NULL DEFAULT 0,
      premium_note TEXT NOT NULL,
      official_url TEXT,
      important_waiting_period TEXT NOT NULL,
      room_rent_or_limit_summary TEXT NOT NULL,
      copayment_or_deductible_summary TEXT NOT NULL,
      eligibility_summary TEXT NOT NULL,
      min_age INTEGER NOT NULL,
      max_age INTEGER NOT NULL,
      supported_regions_json TEXT NOT NULL,
      max_vehicle_age_years INTEGER,
      max_trip_days INTEGER,
      benefits_json TEXT NOT NULL,
      exclusions_json TEXT NOT NULL,
      cashless_network_info TEXT,
      features_json TEXT NOT NULL,
      clauses_json TEXT NOT NULL,
      document_title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      age INTEGER,
      city TEXT NOT NULL DEFAULT '',
      family_size INTEGER,
      annual_income_range TEXT NOT NULL DEFAULT '',
      preferred_categories_json TEXT NOT NULL DEFAULT '[]',
      priority_notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recommendation_sessions (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      structured_json TEXT NOT NULL,
      recommendations_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES recommendation_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_plans (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL UNIQUE,
      session_id TEXT,
      notes TEXT NOT NULL DEFAULT '',
      saved_at TEXT NOT NULL,
      FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS policy_embeddings (
      policy_id TEXT PRIMARY KEY,
      clause_text TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      model_name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
    );
  `);
}

function seedDatabase(database: DatabaseSync): void {
  const upsertPolicy = database.prepare(`
    INSERT INTO policies (
      id, name, category, is_demo_dataset, overview,
      min_coverage, max_coverage, default_coverage, tenure_options_json,
      estimated_annual_premium, premium_verified, premium_note, official_url,
      important_waiting_period, room_rent_or_limit_summary, copayment_or_deductible_summary,
      eligibility_summary, min_age, max_age, supported_regions_json,
      max_vehicle_age_years, max_trip_days, benefits_json, exclusions_json,
      cashless_network_info, features_json, clauses_json, document_title
    ) VALUES (
      @id, @name, @category, @is_demo_dataset, @overview,
      @min_coverage, @max_coverage, @default_coverage, @tenure_options_json,
      @estimated_annual_premium, @premium_verified, @premium_note, @official_url,
      @important_waiting_period, @room_rent_or_limit_summary, @copayment_or_deductible_summary,
      @eligibility_summary, @min_age, @max_age, @supported_regions_json,
      @max_vehicle_age_years, @max_trip_days, @benefits_json, @exclusions_json,
      @cashless_network_info, @features_json, @clauses_json, @document_title
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      overview = excluded.overview,
      min_coverage = excluded.min_coverage,
      max_coverage = excluded.max_coverage,
      default_coverage = excluded.default_coverage,
      tenure_options_json = excluded.tenure_options_json,
      estimated_annual_premium = excluded.estimated_annual_premium,
      premium_verified = excluded.premium_verified,
      premium_note = excluded.premium_note,
      official_url = excluded.official_url,
      important_waiting_period = excluded.important_waiting_period,
      room_rent_or_limit_summary = excluded.room_rent_or_limit_summary,
      copayment_or_deductible_summary = excluded.copayment_or_deductible_summary,
      eligibility_summary = excluded.eligibility_summary,
      min_age = excluded.min_age,
      max_age = excluded.max_age,
      supported_regions_json = excluded.supported_regions_json,
      max_vehicle_age_years = excluded.max_vehicle_age_years,
      max_trip_days = excluded.max_trip_days,
      benefits_json = excluded.benefits_json,
      exclusions_json = excluded.exclusions_json,
      cashless_network_info = excluded.cashless_network_info,
      features_json = excluded.features_json,
      clauses_json = excluded.clauses_json,
      document_title = excluded.document_title
  `);

  for (const policy of DEMO_POLICIES) {
    upsertPolicy.run({
      id: policy.id,
      name: policy.name,
      category: policy.category,
      is_demo_dataset: policy.isDemoDataset ? 1 : 0,
      overview: policy.overview,
      min_coverage: policy.minCoverage,
      max_coverage: policy.maxCoverage,
      default_coverage: policy.defaultCoverage,
      tenure_options_json: JSON.stringify(policy.tenureOptionsYears),
      estimated_annual_premium: policy.estimatedAnnualPremium,
      premium_verified: policy.premiumVerified ? 1 : 0,
      premium_note: policy.premiumNote,
      official_url: policy.officialUrl,
      important_waiting_period: policy.importantWaitingPeriod,
      room_rent_or_limit_summary: policy.roomRentOrLimitSummary,
      copayment_or_deductible_summary: policy.copaymentOrDeductibleSummary,
      eligibility_summary: policy.eligibilitySummary,
      min_age: policy.minAge,
      max_age: policy.maxAge,
      supported_regions_json: JSON.stringify(policy.supportedRegions),
      max_vehicle_age_years: policy.maxVehicleAgeYears ?? null,
      max_trip_days: policy.maxTripDays ?? null,
      benefits_json: JSON.stringify(policy.benefits),
      exclusions_json: JSON.stringify(policy.exclusions),
      cashless_network_info: policy.cashlessNetworkInfo,
      features_json: JSON.stringify(policy.features),
      clauses_json: JSON.stringify(policy.clauses),
      document_title: policy.documentTitle,
    });
  }

  const profileCount = database
    .prepare('SELECT COUNT(*) as cnt FROM user_profile')
    .get() as { cnt: number };

  if (profileCount.cnt === 0) {
    database
      .prepare(
        `INSERT INTO user_profile (id, full_name, email, age, city, family_size, annual_income_range, preferred_categories_json, priority_notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'default-user',
        'Alex Morgan',
        'alex.morgan@example.com',
        32,
        'Bengaluru',
        3,
        '15L - 25L',
        JSON.stringify(['health', 'car']),
        'Prefer low waiting periods, transparent sub-limits, and zero depreciation on motor policies.',
        new Date().toISOString()
      );
  }
}

function rowToPolicy(row: Record<string, unknown>): PolicyRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category) as InsuranceCategory,
    isDemoDataset: Boolean(row.is_demo_dataset),
    overview: String(row.overview),
    minCoverage: Number(row.min_coverage),
    maxCoverage: Number(row.max_coverage),
    defaultCoverage: Number(row.default_coverage),
    tenureOptionsYears: JSON.parse(String(row.tenure_options_json)),
    estimatedAnnualPremium:
      row.estimated_annual_premium === null || row.estimated_annual_premium === undefined
        ? null
        : Number(row.estimated_annual_premium),
    premiumVerified: Boolean(row.premium_verified),
    premiumNote: String(row.premium_note),
    officialUrl: row.official_url ? String(row.official_url) : null,
    importantWaitingPeriod: String(row.important_waiting_period),
    roomRentOrLimitSummary: String(row.room_rent_or_limit_summary),
    copaymentOrDeductibleSummary: String(row.copayment_or_deductible_summary),
    eligibilitySummary: String(row.eligibility_summary),
    minAge: Number(row.min_age),
    maxAge: Number(row.max_age),
    supportedRegions: JSON.parse(String(row.supported_regions_json)),
    maxVehicleAgeYears:
      row.max_vehicle_age_years === null || row.max_vehicle_age_years === undefined
        ? null
        : Number(row.max_vehicle_age_years),
    maxTripDays:
      row.max_trip_days === null || row.max_trip_days === undefined
        ? null
        : Number(row.max_trip_days),
    benefits: JSON.parse(String(row.benefits_json)),
    exclusions: JSON.parse(String(row.exclusions_json)),
    cashlessNetworkInfo: row.cashless_network_info ? String(row.cashless_network_info) : null,
    features: JSON.parse(String(row.features_json)),
    clauses: JSON.parse(String(row.clauses_json)),
    documentTitle: String(row.document_title),
  };
}

export function listPolicies(category?: string, search?: string): PolicyRecord[] {
  const database = getDb();
  let query = 'SELECT * FROM policies WHERE 1=1';
  const params: string[] = [];
  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }
  if (search && search.trim().length > 0) {
    query += ' AND (LOWER(name) LIKE ? OR LOWER(overview) LIKE ? OR LOWER(benefits_json) LIKE ?)';
    const term = `%${search.trim().toLowerCase()}%`;
    params.push(term, term, term);
  }
  query += ' ORDER BY category ASC, name ASC';
  const rows = database.prepare(query).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToPolicy);
}

export function getPolicyById(id: string): PolicyRecord | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM policies WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToPolicy(row) : null;
}

export function ingestPolicy(policy: PolicyRecord): PolicyRecord {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO policies (
        id, name, category, is_demo_dataset, overview,
        min_coverage, max_coverage, default_coverage, tenure_options_json,
        estimated_annual_premium, premium_verified, premium_note, official_url,
        important_waiting_period, room_rent_or_limit_summary, copayment_or_deductible_summary,
        eligibility_summary, min_age, max_age, supported_regions_json,
        max_vehicle_age_years, max_trip_days, benefits_json, exclusions_json,
        cashless_network_info, features_json, clauses_json, document_title
      ) VALUES (
        @id, @name, @category, @is_demo_dataset, @overview,
        @min_coverage, @max_coverage, @default_coverage, @tenure_options_json,
        @estimated_annual_premium, @premium_verified, @premium_note, @official_url,
        @important_waiting_period, @room_rent_or_limit_summary, @copayment_or_deductible_summary,
        @eligibility_summary, @min_age, @max_age, @supported_regions_json,
        @max_vehicle_age_years, @max_trip_days, @benefits_json, @exclusions_json,
        @cashless_network_info, @features_json, @clauses_json, @document_title
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        overview = excluded.overview,
        features_json = excluded.features_json,
        clauses_json = excluded.clauses_json`
    )
    .run({
      id: policy.id,
      name: policy.name,
      category: policy.category,
      is_demo_dataset: policy.isDemoDataset ? 1 : 0,
      overview: policy.overview,
      min_coverage: policy.minCoverage,
      max_coverage: policy.maxCoverage,
      default_coverage: policy.defaultCoverage,
      tenure_options_json: JSON.stringify(policy.tenureOptionsYears),
      estimated_annual_premium: policy.estimatedAnnualPremium,
      premium_verified: policy.premiumVerified ? 1 : 0,
      premium_note: policy.premiumNote,
      official_url: policy.officialUrl,
      important_waiting_period: policy.importantWaitingPeriod,
      room_rent_or_limit_summary: policy.roomRentOrLimitSummary,
      copayment_or_deductible_summary: policy.copaymentOrDeductibleSummary,
      eligibility_summary: policy.eligibilitySummary,
      min_age: policy.minAge,
      max_age: policy.maxAge,
      supported_regions_json: JSON.stringify(policy.supportedRegions),
      max_vehicle_age_years: policy.maxVehicleAgeYears ?? null,
      max_trip_days: policy.maxTripDays ?? null,
      benefits_json: JSON.stringify(policy.benefits),
      exclusions_json: JSON.stringify(policy.exclusions),
      cashless_network_info: policy.cashlessNetworkInfo,
      features_json: JSON.stringify(policy.features),
      clauses_json: JSON.stringify(policy.clauses),
      document_title: policy.documentTitle,
    });
  return getPolicyById(policy.id)!;
}

export function saveSessionState(
  sessionId: string,
  title: string,
  structured: StructuredRequirements,
  recommendations?: RecommendationRunResult | null
): void {
  const database = getDb();
  const now = new Date().toISOString();
  const existing = database
    .prepare('SELECT id, recommendations_json FROM recommendation_sessions WHERE id = ?')
    .get(sessionId) as { id: string; recommendations_json: string | null } | undefined;

  if (existing) {
    database
      .prepare(
        `UPDATE recommendation_sessions
         SET category = ?, title = ?, structured_json = ?, recommendations_json = COALESCE(?, recommendations_json), updated_at = ?
         WHERE id = ?`
      )
      .run(
        structured.insurance_type,
        title,
        JSON.stringify(structured),
        recommendations ? JSON.stringify(recommendations) : null,
        now,
        sessionId
      );
  } else {
    database
      .prepare(
        `INSERT INTO recommendation_sessions (id, category, title, structured_json, recommendations_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        sessionId,
        structured.insurance_type,
        title,
        JSON.stringify(structured),
        recommendations ? JSON.stringify(recommendations) : null,
        now,
        now
      );
  }
}

export function appendConversationMessage(sessionId: string, message: ConversationMessage): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO conversation_messages (id, session_id, role, content, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      message.id,
      sessionId,
      message.role,
      message.content,
      message.metadata ? JSON.stringify(message.metadata) : null,
      message.createdAt
    );
}

export function getSessionById(sessionId: string): {
  id: string;
  category: InsuranceCategory;
  title: string;
  structured: StructuredRequirements;
  recommendations: RecommendationRunResult | null;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
} | null {
  const database = getDb();
  const row = database
    .prepare('SELECT * FROM recommendation_sessions WHERE id = ?')
    .get(sessionId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const msgRows = database
    .prepare('SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as Array<Record<string, unknown>>;

  return {
    id: String(row.id),
    category: String(row.category) as InsuranceCategory,
    title: String(row.title),
    structured: JSON.parse(String(row.structured_json)),
    recommendations: row.recommendations_json
      ? JSON.parse(String(row.recommendations_json))
      : null,
    messages: msgRows.map((m) => ({
      id: String(m.id),
      role: String(m.role) as 'user' | 'assistant',
      content: String(m.content),
      createdAt: String(m.created_at),
      metadata: m.metadata_json ? JSON.parse(String(m.metadata_json)) : undefined,
    })),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listSessions(): SessionSummary[] {
  const database = getDb();
  const rows = database
    .prepare('SELECT * FROM recommendation_sessions ORDER BY updated_at DESC LIMIT 25')
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const structured = JSON.parse(String(row.structured_json)) as StructuredRequirements;
    const recs = row.recommendations_json
      ? (JSON.parse(String(row.recommendations_json)) as RecommendationRunResult)
      : null;
    const topRec = recs?.recommendations?.[0] ?? null;

    return {
      id: String(row.id),
      category: String(row.category) as InsuranceCategory,
      title: String(row.title),
      coverage: structured.coverage,
      requirementsCount: structured.requirements.length,
      topPolicyName: topRec ? topRec.policy.name : null,
      topMatchPercentage: topRec ? topRec.matchPercentage : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  });
}

export function listSavedPlans(): SavedPlanRecord[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT s.id as saved_id, s.policy_id, s.session_id, s.notes, s.saved_at, p.*
       FROM saved_plans s
       JOIN policies p ON p.id = s.policy_id
       ORDER BY s.saved_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.saved_id),
    policyId: String(row.policy_id),
    sessionId: row.session_id ? String(row.session_id) : null,
    notes: String(row.notes ?? ''),
    savedAt: String(row.saved_at),
    policy: rowToPolicy({ ...row, id: row.policy_id }),
  }));
}

export function savePlan(policyId: string, sessionId: string | null = null, notes = ''): SavedPlanRecord | null {
  const policy = getPolicyById(policyId);
  if (!policy) return null;
  const database = getDb();
  const now = new Date().toISOString();
  const id = `saved-${policyId}`;
  database
    .prepare(
      `INSERT INTO saved_plans (id, policy_id, session_id, notes, saved_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(policy_id) DO UPDATE SET
         session_id = COALESCE(excluded.session_id, saved_plans.session_id),
         notes = CASE WHEN excluded.notes <> '' THEN excluded.notes ELSE saved_plans.notes END,
         saved_at = excluded.saved_at`
    )
    .run(id, policyId, sessionId, notes, now);

  return {
    id,
    policyId,
    sessionId,
    notes,
    savedAt: now,
    policy,
  };
}

export function removeSavedPlan(policyId: string): boolean {
  const database = getDb();
  const result = database.prepare('DELETE FROM saved_plans WHERE policy_id = ?').run(policyId);
  return Number(result.changes) > 0;
}

export function getUserProfile(): UserProfile {
  const database = getDb();
  const row = database
    .prepare('SELECT * FROM user_profile WHERE id = ?')
    .get('default-user') as Record<string, unknown>;
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email),
    age: row.age === null ? null : Number(row.age),
    city: String(row.city),
    familySize: row.family_size === null ? null : Number(row.family_size),
    annualIncomeRange: String(row.annual_income_range),
    preferredCategories: JSON.parse(String(row.preferred_categories_json)),
    priorityNotes: String(row.priority_notes),
    updatedAt: String(row.updated_at),
  };
}

export function updateUserProfile(updates: Partial<UserProfile>): UserProfile {
  const current = getUserProfile();
  const merged: UserProfile = {
    ...current,
    ...updates,
    id: 'default-user',
    updatedAt: new Date().toISOString(),
  };
  const database = getDb();
  database
    .prepare(
      `UPDATE user_profile
       SET full_name = ?, email = ?, age = ?, city = ?, family_size = ?,
           annual_income_range = ?, preferred_categories_json = ?, priority_notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      merged.fullName,
      merged.email,
      merged.age,
      merged.city,
      merged.familySize,
      merged.annualIncomeRange,
      JSON.stringify(merged.preferredCategories),
      merged.priorityNotes,
      merged.updatedAt,
      'default-user'
    );
  return merged;
}

export function getCachedPolicyEmbedding(policyId: string): { clauseText: string; embedding: number[]; modelName: string } | null {
  const database = getDb();
  const row = database
    .prepare('SELECT clause_text, embedding_json, model_name FROM policy_embeddings WHERE policy_id = ?')
    .get(policyId) as { clause_text: string; embedding_json: string; model_name: string } | undefined;
  if (!row) return null;
  return {
    clauseText: row.clause_text,
    embedding: JSON.parse(row.embedding_json),
    modelName: row.model_name,
  };
}

export function saveCachedPolicyEmbedding(
  policyId: string,
  clauseText: string,
  embedding: number[],
  modelName: string
): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO policy_embeddings (policy_id, clause_text, embedding_json, model_name, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(policy_id) DO UPDATE SET
         clause_text = excluded.clause_text,
         embedding_json = excluded.embedding_json,
         model_name = excluded.model_name,
         updated_at = excluded.updated_at`
    )
    .run(policyId, clauseText, JSON.stringify(embedding), modelName, new Date().toISOString());
}
