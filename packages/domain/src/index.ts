import { z } from "zod";

export const PartyTypeSchema = z.enum(["lessee", "group", "guarantor"]);
export const RiskGradeSchema = z.enum(["normal", "watch", "substandard", "doubtful", "loss"]);
export const CustomerTypeSchema = z.enum(["internal", "collab_a", "collab_b", "external"]);
export const IndustrySchema = z.enum(["energy", "healthcare", "public_services", "other"]);
export const HospitalTypeSchema = z.enum(["public_hospital", "private_hospital"]);
export const BizTypeSchema = z.enum(["leaseback", "direct_lease", "factoring"]);
export const CheckTypeSchema = z.enum(["onsite", "offsite"]);
export const RunTypeSchema = z.enum(["official", "manual_recompute", "what_if"]);
export const RunStatusSchema = z.enum(["draft", "published", "archived", "abandoned"]);
export const TaskStatusSchema = z.enum(["pending", "completed", "delayed", "exempted", "unplaceable", "manual_needed"]);
export const DecisionStepSchema = z.enum(["scope", "frequency", "assignee", "time", "validation", "override"]);
export const DecisionResultSchema = z.enum(["pass", "warn", "block", "excluded"]);
export const RuleGroupSchema = z.enum(["in_scope", "frequency", "time", "assignee", "conflict"]);
export const RuleStatusSchema = z.enum(["draft", "published", "archived"]);
export const AssigneePoolModeSchema = z.enum(["sampleMaintainers", "asset5", "asset7", "all26", "businessSupport"]);
export const PlanScopeSchema = z.enum(["full_year", "h2"]);
export const ProjectRecordStatusSchema = z.enum(["draft", "needs_fix", "validated", "in_pool", "excluded", "archived"]);
export const InputBatchStatusSchema = z.enum(["uploaded", "imported", "validated", "failed"]);
export const DataQualitySeveritySchema = z.enum(["info", "warn", "block"]);
export const ProjectChangeTypeSchema = z.enum(["added", "changed", "removed", "duplicate", "unchanged"]);
export const RosterVersionStatusSchema = z.enum(["draft", "confirmed", "archived"]);
export const ReadinessGateKeySchema = z.enum(["projects", "people", "rules"]);
export const ReadinessGateStatusSchema = z.enum(["not_started", "needs_attention", "ready", "blocked"]);
export const TagScopeSchema = z.enum(["project", "person", "rule"]);
export const TagCategorySchema = z.enum([
  "customer_type",
  "risk",
  "industry",
  "business_type",
  "party",
  "special_condition",
  "person_pool",
  "person_specialty",
  "responsibility",
  "ownership",
  "rule_applicability",
  "rule_stage",
  "rule_outcome",
  "derived",
  "schedule_output",
  "manual"
]);

export type PartyType = z.infer<typeof PartyTypeSchema>;
export type RiskGrade = z.infer<typeof RiskGradeSchema>;
export type CustomerType = z.infer<typeof CustomerTypeSchema>;
export type Industry = z.infer<typeof IndustrySchema>;
export type HospitalType = z.infer<typeof HospitalTypeSchema>;
export type BizType = z.infer<typeof BizTypeSchema>;
export type CheckType = z.infer<typeof CheckTypeSchema>;
export type RunType = z.infer<typeof RunTypeSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type DecisionStep = z.infer<typeof DecisionStepSchema>;
export type DecisionResult = z.infer<typeof DecisionResultSchema>;
export type RuleGroup = z.infer<typeof RuleGroupSchema>;
export type RuleStatus = z.infer<typeof RuleStatusSchema>;
export type AssigneePoolMode = z.infer<typeof AssigneePoolModeSchema>;
export type PlanScope = z.infer<typeof PlanScopeSchema>;
export type ProjectRecordStatus = z.infer<typeof ProjectRecordStatusSchema>;
export type InputBatchStatus = z.infer<typeof InputBatchStatusSchema>;
export type DataQualitySeverity = z.infer<typeof DataQualitySeveritySchema>;
export type ProjectChangeType = z.infer<typeof ProjectChangeTypeSchema>;
export type RosterVersionStatus = z.infer<typeof RosterVersionStatusSchema>;
export type ReadinessGateKey = z.infer<typeof ReadinessGateKeySchema>;
export type ReadinessGateStatus = z.infer<typeof ReadinessGateStatusSchema>;
export type TagScope = z.infer<typeof TagScopeSchema>;
export type TagCategory = z.infer<typeof TagCategorySchema>;

export const TagFieldBindingSchema = z.object({
  entity: z.enum(["project", "person"]),
  field: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  mode: z.enum(["equals", "includes"]).default("equals")
});

export const TagDefinitionSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: TagCategorySchema,
  scopes: z.array(TagScopeSchema),
  exclusiveGroup: z.string().nullable().optional(),
  fieldBinding: TagFieldBindingSchema.nullable().optional(),
  relationMeta: z.object({
    subject: z.enum(["project", "person", "rule", "schedule"]),
    relation: z.string(),
    objectType: z.enum(["group", "project", "person", "org", "rule", "schedule"]),
    objectId: z.string(),
    objectName: z.string().optional(),
    counterpartCode: z.string().optional()
  }).nullable().optional(),
  description: z.string(),
  isSystem: z.boolean(),
  active: z.boolean()
});

export type TagFieldBinding = z.infer<typeof TagFieldBindingSchema>;
export type TagDefinition = z.infer<typeof TagDefinitionSchema>;

export const FrequencyValueSchema = z.object({
  count: z.number().int().nonnegative().optional(),
  period: z.enum(["year", "two_years"]).optional(),
  special: z.enum(["manual_warning_plan", "not_mandatory", "asset_department_decides"]).optional(),
  note: z.string().optional()
});

export type FrequencyValue = z.infer<typeof FrequencyValueSchema>;

export const FrequencyDecisionSchema = z.object({
  onsite: FrequencyValueSchema,
  offsite: FrequencyValueSchema,
  ruleId: z.string(),
  ruleName: z.string(),
  source: z.string(),
  status: z.enum(["covered", "manual_needed", "rule_gap", "excluded"])
});

export type FrequencyDecision = z.infer<typeof FrequencyDecisionSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  partyType: PartyTypeSchema,
  groupId: z.string().nullable(),
  groupName: z.string().nullable().optional(),
  dept: z.string(),
  riskGrade: RiskGradeSchema,
  isNpl: z.boolean(),
  customerType: CustomerTypeSchema,
  industry: IndustrySchema,
  hospitalType: HospitalTypeSchema.nullable(),
  bizType: BizTypeSchema,
  exposureInit: z.number().nonnegative(),
  exposureBalance: z.number().nonnegative(),
  creditStart: z.string(),
  creditEnd: z.string(),
  termHalf: z.string().nullable(),
  gridConnected: z.boolean().nullable(),
  accountMonitored: z.boolean().nullable(),
  realtimeMonitored: z.boolean().nullable(),
  repayClean3y: z.boolean().nullable(),
  isWarning: z.boolean(),
  isSettledThisYear: z.boolean(),
  isNewWithin1y: z.boolean(),
  lastOnsiteDate: z.string().nullable(),
  expectedOnsiteCount: z.number().int().nonnegative().optional(),
  expectedOffsiteCount: z.number().int().nonnegative().optional(),
  onsiteMaintainerName: z.string().nullable().optional(),
  offsiteMaintainerName: z.string().nullable().optional(),
  onsiteMaintainerId: z.string().nullable().optional(),
  offsiteMaintainerId: z.string().nullable().optional(),
  memberCount: z.number().int().nonnegative().nullable().optional(),
  relatedPartyStockCount: z.number().int().nonnegative().nullable().optional(),
  primaryResponsibleDept: z.enum(["asset_management", "business_department", "joint"]).optional(),
  assistingDept: z.string().nullable().optional(),
  approvalRequirement: z.string().nullable().optional(),
  companySpecialRequirement: z.boolean().optional(),
  manualFrequencyRequested: z.boolean().optional(),
  warningPlan: z.string().nullable().optional(),
  inspectionContactName: z.string().nullable().optional(),
  reportOwnerName: z.string().nullable().optional(),
  rectificationOwnerName: z.string().nullable().optional(),
  preferredInspectionMonth: z.number().int().min(1).max(12).nullable().optional(),
  unavailableMonths: z.array(z.number().int().min(1).max(12)).optional(),
  offsiteInfoChannels: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional()
});

export type Project = z.infer<typeof ProjectSchema>;

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseCity: z.string(),
  dept: z.string(),
  specialTags: z.array(z.string()),
  longTermGroupIds: z.array(z.string()),
  longTermProjectIds: z.array(z.string()),
  isActive: z.boolean(),
  activeFrom: z.string().nullable(),
  activeTo: z.string().nullable().optional(),
  pool: z.array(AssigneePoolModeSchema),
  responsibilityRoles: z.array(z.string()).optional(),
  annualOnsiteWeekCapacity: z.number().int().nonnegative().optional(),
  monthlyOnsiteLimit: z.number().int().nonnegative().optional(),
  offsiteTaskCapacity: z.number().int().nonnegative().optional(),
  unavailableMonths: z.array(z.number().int().min(1).max(12)).optional(),
  tagIds: z.array(z.string()).optional()
});

export type Person = z.infer<typeof PersonSchema>;

export type RuleOperator =
  | "="
  | "!="
  | "in"
  | "not_in"
  | ">"
  | ">="
  | "<"
  | "<="
  | "between"
  | "is_null"
  | "not_null";

export type FieldCondition = {
  field: string;
  op: RuleOperator;
  value?: unknown;
};

export type RuleCondition =
  | FieldCondition
  | { all: RuleCondition[] }
  | { any: RuleCondition[] }
  | { not: RuleCondition };

export type RuleThen =
  | { inScope: boolean; reason: string }
  | { onsite: FrequencyValue; offsite: FrequencyValue }
  | { gap: true; reason: string }
  | { constraint: string; type: "hard" | "soft" };

export type RuleImpactType =
  | "exclude"
  | "frequency"
  | "method_manual"
  | "assignee_policy"
  | "time_constraint"
  | "publish_block";

export type AssignmentPriorityKey =
  | "ownership_project"
  | "ownership_group"
  | "capability"
  | "maintainer"
  | "load_balance";

export type Rule = {
  id: string;
  rulesetId: string;
  group: z.infer<typeof RuleGroupSchema>;
  priority: number;
  name: string;
  businessTitle?: string;
  businessCondition?: string;
  businessOutcome?: string;
  businessOrderGroup?: string;
  evidenceRefs?: string[];
  technicalRuleId?: string;
  tagRefs?: string[];
  impactType?: RuleImpactType;
  assignmentPriority?: AssignmentPriorityKey[];
  when: RuleCondition;
  then: RuleThen;
  type?: "hard" | "soft";
  source: string;
  enabled: boolean;
};

export type RuleSet = {
  id: string;
  version: string;
  effectiveAt: string;
  status: z.infer<typeof RuleStatusSchema>;
  createdBy: string;
  createdAt: string;
  sourceNote: string;
  rules: Rule[];
};

export const PlanPeriodSchema = z.object({
  year: z.number().int(),
  scope: PlanScopeSchema
});

export type PlanPeriod = z.infer<typeof PlanPeriodSchema>;

export type DecisionLog = {
  id: string;
  runId: string;
  projectId: string;
  taskId: string | null;
  step: z.infer<typeof DecisionStepSchema>;
  ruleHit: string | null;
  ruleText: string;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  result: z.infer<typeof DecisionResultSchema>;
  reason: string;
  override: null | {
    operator: string;
    reason: string;
    prev: unknown;
    next: unknown;
    at: string;
  };
  tagSnapshot?: {
    projectTagIds?: string[];
    personTagIds?: string[];
    ruleTagIds?: string[];
  };
  chainPrev: string | null;
  chainNext: string | null;
  createdAt: string;
};

export type RuleEvidence = {
  id: string;
  sourceDocument: string;
  sourceParagraph: string;
  policyCitation: PolicyCitation;
  sourceExcerpt: string;
  interpretation: string;
};

export type PolicyCitation = {
  sourceDocument: string;
  chapterTitle: string;
  articleNo: string;
  articleTitle: string;
  clauseLabel: string | null;
  citationLabel: string;
  excerpt: string;
};

export type DecisionExplanation = {
  id: string;
  step: DecisionStep;
  result: DecisionResult;
  businessStepTitle: string;
  businessQuestion: string;
  businessAnswer: string;
  keyFacts: Array<{
    label: string;
    value: string;
    tone?: "neutral" | "good" | "warn" | "block";
  }>;
  policyBasis: RuleEvidence[];
  systemAction: string;
  impact: "can_publish" | "manual_needed" | "blocks_publish" | "excluded";
  operatorMessage: string;
  trace: {
    logId: string;
    technicalRuleId: string | null;
    ruleText: string;
    inputs: Record<string, unknown>;
    output: Record<string, unknown>;
    rawLog: DecisionLog;
    chainPrev: string | null;
    chainNext: string | null;
  };
};

export type RuleInterpretation = {
  technicalRuleId: string;
  businessTitle: string;
  businessCondition: string;
  businessOutcome: string;
  businessOrderGroup: string;
  evidenceRefs: string[];
  tagRefs: string[];
  impactType: RuleImpactType;
  assignmentPriority?: AssignmentPriorityKey[];
};

export type BusinessRuleItem = RuleInterpretation & {
  id: string;
  order: number;
  systemAction: "exclude" | "manual" | "covered" | "rule_gap";
  publishImpact: "can_publish" | "manual_needed" | "blocks_publish";
};

export type BusinessRuleOrder = {
  id: string;
  title: string;
  description: string;
  order: number;
  items: BusinessRuleItem[];
};

export type RuleInfluence = {
  target: "project" | "person" | "task" | "schedule" | "publish";
  schedulerStep: DecisionStep;
  description: string;
};

export type RuleFlowStep = {
  id: Exclude<DecisionStep, "override">;
  order: number;
  title: string;
  businessQuestion: string;
  currentStateTitle: string;
  currentState: string;
  judgmentBasisTitle: string;
  judgmentBasis: string;
  decisionResultTitle: string;
  decisionResult: string;
  relatedRuleIds: string[];
  relatedTagIds: string[];
  influences: RuleInfluence[];
};

export type PendingRuleDecision = {
  id: string;
  technicalRuleId: string;
  title: string;
  businessQuestion: string;
  currentGap: string;
  requiredInput: string;
  suggestedAction: string;
  evidenceRefs: string[];
  tagRefs: string[];
  affectedProjectCount: number;
  publishImpact: "manual_needed" | "blocks_publish";
};

export type RuleSuggestionMeta = {
  batchId: string;
  source: "system_template";
  confidence: number;
  reviewStatus: "needs_review" | "accepted" | "edited";
  generatedAt: string;
};

export type RuleDecisionDraft = {
  id: string;
  pendingDecisionId: string;
  technicalRuleId: string;
  status: "draft" | "simulated" | "submitted";
  onsite: FrequencyValue;
  offsite: FrequencyValue;
  businessNote: string;
  confirmerNote: string;
  simulationRunId: string | null;
  updatedAt: string;
  submittedAt: string | null;
  suggestionMeta?: RuleSuggestionMeta;
};

export type RuleRegistryItem = {
  id: string;
  order: number;
  technicalRuleId: string;
  businessTitle: string;
  businessCondition: string;
  businessOutcome: string;
  businessOrderGroup: string;
  evidenceLabels: string[];
  authorityType: "policy_compiled" | "system_builtin" | "manual_confirmed";
  authorityLabel: string;
  authorityDetail: string;
  status: "effective" | "pending_action" | "pending_data" | "draft" | "simulated" | "manual_confirmed";
  statusLabel: string;
  affectedProjectCount: number;
  publishImpact: "can_publish" | "manual_needed" | "blocks_publish";
  impactType: RuleImpactType;
  onsite: FrequencyValue | null;
  offsite: FrequencyValue | null;
  confirmerName: string | null;
  confirmerNote: string | null;
  confirmedAt: string | null;
  rulesetVersion: string;
  tagRefs: string[];
};

export type RuleRegistryGroup = {
  id: string;
  order: number;
  title: string;
  description: string;
  items: RuleRegistryItem[];
  statusSummary: {
    total: number;
    effective: number;
    pendingAction: number;
    pendingData: number;
    draft: number;
    simulated: number;
    manualConfirmed: number;
  };
  affectedProjectCount: number;
  primaryStatus: "ready" | "needs_action" | "needs_data" | "in_progress";
};

export type RuleSupplementSuggestion = {
  id: string;
  pendingDecisionId: string;
  technicalRuleId: string;
  title: string;
  affectedProjectIds: string[];
  affectedProjectNames: string[];
  onsite: FrequencyValue;
  offsite: FrequencyValue;
  businessNote: string;
  confirmerNote: string;
  reason: string;
  evidenceRefs: string[];
  evidenceLabels: string[];
  confidence: number;
  draftId: string;
  status: "draft_generated" | "draft_refreshed";
};

export type ManualReviewSuggestion = {
  taskId: string;
  projectId: string;
  projectName: string;
  checkType: z.infer<typeof CheckTypeSchema>;
  missingItems: string[];
  recommendation: string;
  reason: string;
};

export type RuleSuggestionSkippedItem = {
  technicalRuleId?: string;
  projectId?: string;
  title: string;
  reason: string;
};

export type RuleSuggestionBatch = {
  id: string;
  runId: string;
  createdAt: string;
  summary: {
    generatedDrafts: number;
    manualSuggestions: number;
    skipped: number;
  };
  ruleSuggestions: RuleSupplementSuggestion[];
  manualSuggestions: ManualReviewSuggestion[];
  skippedItems: RuleSuggestionSkippedItem[];
};

export type RuleSimulationResult = {
  id: string;
  pendingDecisionId: string;
  technicalRuleId: string;
  runId: string;
  createdAt: string;
  before: AuditReport;
  after: AuditReport;
  delta: {
    ruleGap: number;
    onsiteTasks: number;
    offsiteTasks: number;
    hardConflicts: number;
    pendingManual: number;
  };
  publishable: boolean;
  blockers: string[];
};

export type RuleSystemMap = {
  title: string;
  summary: string;
  sourceDocuments: string[];
  steps: RuleFlowStep[];
  pendingDecisions: PendingRuleDecision[];
};

export type PublishIssueKind = "rule_gap" | "project_data_gap" | "manual_confirm" | "time_conflict" | "hint";

export type PublishIssue = {
  id: string;
  kind: PublishIssueKind;
  severity: "block" | "warn" | "info";
  title: string;
  objectLabel: string;
  description: string;
  requiredAction: string;
  technicalRuleId: string | null;
  projectIds: string[];
  projectNames: string[];
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  checkType: z.infer<typeof CheckTypeSchema> | null;
  field: string | null;
  affectedProjectCount: number;
};

export type IssueBoard = {
  runId: string;
  summary: Record<PublishIssueKind, number>;
  issues: PublishIssue[];
};

export type TagTaxonomyNode = {
  id: string;
  title: string;
  description: string;
  level: number;
  scope: TagScope | null;
  category: TagCategory | null;
  tagIds: string[];
  impact: {
    projectCount: number;
    personCount: number;
    ruleCount: number;
    schedulerSteps: string[];
  };
  children: TagTaxonomyNode[];
};

export type TagCoverageIssue = {
  id: string;
  scope: "project" | "person" | "rule" | "schedule";
  severity: DataQualitySeverity;
  title: string;
  message: string;
  recordId: string | null;
  field: string | null;
  suggestedAction: string;
};

export type TagRelationCoverage = {
  type: "group" | "project" | "maintainer";
  objectId: string;
  objectName: string;
  projectTagCode: string | null;
  personTagCode: string | null;
  projectCount: number;
  personCount: number;
  status: "matched" | "project_only" | "person_only" | "missing";
};

export type TagCoverageSummary = {
  projectTagCoverageRate: number;
  personRelationshipCoverageRate: number;
  ruleHitDistribution: Record<string, number>;
  missingFields: TagCoverageIssue[];
  relationPairs: TagRelationCoverage[];
  outputTags: Array<{
    code: string;
    name: string;
    count: number;
  }>;
};

export type EnrichedDecisionLog = DecisionLog & {
  businessRule: BusinessRuleItem | null;
  evidence: RuleEvidence[];
};

export type Task = {
  id: string;
  runId: string;
  projectId: string;
  projectName: string;
  checkType: z.infer<typeof CheckTypeSchema>;
  occurrenceIndex: number;
  occurrenceTotal: number;
  assigneeId: string | null;
  assigneeName: string | null;
  scheduledDate: string | null;
  durationDays: number;
  endDate: string | null;
  dateBasis:
    | "history"
    | "term_half"
    | "credit_anniversary"
    | "balanced"
    | "balanced_shift"
    | "completion_window"
    | "unplaceable"
    | "manual_needed"
    | "manual_override";
  slotSource: "system" | "manual";
  status: z.infer<typeof TaskStatusSchema>;
  actualCompletedAt: string | null;
  reportRef: string | null;
  isPlaced: boolean;
};

export type Conflict = {
  id: string;
  runId: string;
  taskIds: string[];
  kind: "H-0" | "H-1" | "H-2" | "H-3" | "H-4" | "H-5" | "S-1" | "S-2" | "RULE_GAP";
  severity: "hard" | "soft";
  message: string;
  status: "open" | "resolved" | "overridden";
  resolution: Record<string, unknown> | null;
};

export type AuditReport = {
  inputProjects: number;
  inScope: number;
  excluded: number;
  onsiteTasks: number;
  offsiteTasks: number;
  ruleHitDistribution: Record<string, number>;
  unmatchedFrequency: number;
  ruleGap: number;
  hardConflicts: number;
  manualOverrides: number;
  pendingManual: number;
  publishable: boolean;
};

export type SchedulingRun = {
  id: string;
  runType: z.infer<typeof RunTypeSchema>;
  planPeriod: PlanPeriod;
  rulesetVersion: string;
  inputSnapshotId: string;
  status: z.infer<typeof RunStatusSchema>;
  supersedes: string | null;
  isNamed: boolean;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  tasks: Task[];
  decisionLogs: DecisionLog[];
  conflicts: Conflict[];
  audit: AuditReport;
};

export type DataQualityIssue = {
  id: string;
  scope: "project" | "person" | "rule";
  severity: DataQualitySeverity;
  title: string;
  message: string;
  field: string | null;
  recordId: string | null;
  suggestedAction: string;
};

export type ProjectInputBatch = {
  id: string;
  year: number;
  filename: string;
  source: "sample_xlsx" | "template_xlsx" | "manual" | "system_export";
  status: InputBatchStatus;
  worksheetRows: number;
  dataRows: number;
  normalizedRows: number;
  importedBy: string;
  importedAt: string;
  regressionBaseline: {
    onsiteExpectedTotal: number;
    offsiteExpectedTotal: number;
  };
};

export type ProjectChangeItem = {
  id: string;
  projectId: string;
  projectName: string;
  type: ProjectChangeType;
  field: string | null;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
  severity: DataQualitySeverity;
  status: ProjectRecordStatus;
};

export type ProjectChangeSet = {
  id: string;
  year: number;
  baseSnapshotId: string | null;
  importBatchId: string;
  added: number;
  changed: number;
  removed: number;
  duplicateSuspects: number;
  reviewed: boolean;
  frozenAt: string | null;
  snapshotId: string | null;
  items: ProjectChangeItem[];
  issues: DataQualityIssue[];
};

export type RosterVersion = {
  id: string;
  year: number;
  version: string;
  status: RosterVersionStatus;
  poolMode: AssigneePoolMode;
  activePeople: number;
  totalPeople: number;
  effectiveFrom: string;
  effectiveTo: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  issues: DataQualityIssue[];
};

export type RuleReadinessReport = {
  rulesetVersion: string;
  status: "draft" | "ready" | "blocked";
  coverageRate: number;
  ruleGap: number;
  pGapCount: number;
  draftFromVersion: string | null;
  whatIfRunId: string | null;
  lastCheckedAt: string;
  issues: DataQualityIssue[];
};

export type ReadinessGate = {
  key: ReadinessGateKey;
  label: string;
  status: ReadinessGateStatus;
  passed: boolean;
  summary: string;
  updatedAt: string;
  issues: DataQualityIssue[];
};

export type PlanningYearWorkspace = {
  year: number;
  periodLabel: string;
  projectBatch: ProjectInputBatch;
  projectChangeSet: ProjectChangeSet;
  rosterVersion: RosterVersion;
  ruleset: RuleSet;
  ruleReport: RuleReadinessReport;
  readiness: ReadinessGate[];
  canGenerateSandbox: boolean;
  canGenerateOfficial: boolean;
  activeSnapshotId: string | null;
  currentRunId: string | null;
};

export const labelMaps = {
  partyType: {
    lessee: "承租人",
    group: "集团",
    guarantor: "担保人"
  },
  riskGrade: {
    normal: "正常",
    watch: "关注",
    substandard: "次级",
    doubtful: "可疑",
    loss: "损失"
  },
  customerType: {
    internal: "内部",
    collab_a: "协同A",
    collab_b: "协同B",
    external: "外部"
  },
  industry: {
    energy: "能源环保",
    healthcare: "医疗健康",
    public_services: "民生公用",
    other: "其他类"
  },
  bizType: {
    leaseback: "回租",
    direct_lease: "直租",
    factoring: "保理"
  },
  checkType: {
    onsite: "现场",
    offsite: "非现场"
  },
  primaryResponsibleDept: {
    asset_management: "资产管理部主责",
    business_department: "业务部门主责",
    joint: "资产管理部主责/业务部门配合"
  }
} as const;

export const ruleGapIds = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"] as const;

export type RuleGapId = (typeof ruleGapIds)[number];
