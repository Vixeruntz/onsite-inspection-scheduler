import * as fs from "node:fs";
import * as path from "node:path";
import { BadRequestException } from "@nestjs/common";
import type {
  AssigneePoolMode,
  Person,
  Project,
  RuleDecisionDraft,
  RuleRegistryGroup,
  RuleRegistryItem,
  RuleSet,
  RuleSuggestionBatch,
  RuleSimulationResult,
  SchedulingRun,
  TagDefinition,
  TagScope,
  Task
} from "@inspection/domain";
import {
  applyPersonTagIds,
  applyProjectTagIds,
  applyRuleDecisionDrafts,
  businessRuleByTechnicalId,
  businessRuleOrders,
  createRuleDecisionDraft,
  createIssueBoard,
  createRuleImpact,
  createRuleSystemMap,
  createTagCoverageSummary,
  createTagTaxonomy,
  createDecisionExplanations,
  createPlanningYearWorkspace,
  createFiftyProjectWorkspace,
  defaultRuleSet,
  defaultTagLibrary,
  diffRuns,
  evidenceForRule,
  evidenceLibrary,
  extendTagLibraryWithRelationships,
  generateRun,
  generateRuleSuggestions,
  importProjectsFromXlsxBuffer,
  isRunLocked,
  latestRunEndDate,
  overrideDecision,
  publish,
  isResolvedRuleDraft,
  normalizePendingDecisionId,
  syncPersonTags,
  syncProjectTags,
  tagsForScope,
  validateTagLibrary
} from "@inspection/scheduler";

type EnergyFieldKey = "gridConnected" | "accountMonitored" | "repayClean3y";
type EnergyFieldUpdates = Partial<Record<EnergyFieldKey, boolean>>;

const energyFieldKeys: EnergyFieldKey[] = ["gridConnected", "accountMonitored", "repayClean3y"];
const energyFieldLabels: Record<EnergyFieldKey, string> = {
  gridConnected: "并网情况",
  accountMonitored: "账户监管",
  repayClean3y: "近三年还款正常"
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type WorkspaceSnapshot = {
  schemaVersion: 1;
  exportedAt: string;
  workspace: ReturnType<typeof createFiftyProjectWorkspace>;
  projectBatch: {
    filename: string;
    dataRows: number;
    worksheetRows: number;
    expectedOnsiteTotal: number;
    expectedOffsiteTotal: number;
  };
  controls: {
    projectFrozen: boolean;
    rosterConfirmed: boolean;
    snapshotVersion: number;
    rosterVersionNumber: number;
  };
  tagLibrary: TagDefinition[];
  publishedRuleSet: RuleSet;
  ruleValidationRun: SchedulingRun | null;
  ruleDrafts: RuleDecisionDraft[];
  latestRuleSimulation: RuleSimulationResult | null;
  latestRuleSuggestionBatch: RuleSuggestionBatch | null;
  runs: SchedulingRun[];
};

export class WorkspaceService {
  private workspace = createFiftyProjectWorkspace();
  private projectBatchFilename = this.workspace.planningYear.projectBatch.filename;
  private projectBatchDataRows = this.workspace.planningYear.projectBatch.dataRows;
  private projectBatchWorksheetRows = this.workspace.planningYear.projectBatch.worksheetRows;
  private projectBatchExpectedOnsiteTotal = this.workspace.planningYear.projectBatch.regressionBaseline.onsiteExpectedTotal;
  private projectBatchExpectedOffsiteTotal = this.workspace.planningYear.projectBatch.regressionBaseline.offsiteExpectedTotal;
  private tagLibrary: TagDefinition[] = [...defaultTagLibrary];
  private projectFrozen = true;
  private rosterConfirmed = true;
  private snapshotVersion = 1;
  private rosterVersionNumber = 1;
  private publishedRuleSet: RuleSet = defaultRuleSet;
  private ruleValidationRun: SchedulingRun | null = null;
  private ruleDrafts = new Map<string, RuleDecisionDraft>();
  private latestRuleSimulation: RuleSimulationResult | null = null;
  private latestRuleSuggestionBatch: RuleSuggestionBatch | null = null;
  private runs = new Map<string, SchedulingRun>([
    [this.workspace.currentRun.id, this.workspace.currentRun],
    [this.workspace.asset7Run.id, this.workspace.asset7Run]
  ]);
  private readonly statePath = process.env.WORKSPACE_STATE_PATH?.trim() || null;

  constructor() {
    this.loadPersistedState();
  }

  workspaceSnapshot(): WorkspaceSnapshot {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      workspace: cloneJson(this.workspace),
      projectBatch: {
        filename: this.projectBatchFilename,
        dataRows: this.projectBatchDataRows,
        worksheetRows: this.projectBatchWorksheetRows,
        expectedOnsiteTotal: this.projectBatchExpectedOnsiteTotal,
        expectedOffsiteTotal: this.projectBatchExpectedOffsiteTotal
      },
      controls: {
        projectFrozen: this.projectFrozen,
        rosterConfirmed: this.rosterConfirmed,
        snapshotVersion: this.snapshotVersion,
        rosterVersionNumber: this.rosterVersionNumber
      },
      tagLibrary: cloneJson(this.tagLibrary),
      publishedRuleSet: cloneJson(this.publishedRuleSet),
      ruleValidationRun: cloneJson(this.ruleValidationRun),
      ruleDrafts: cloneJson(this.listRuleDrafts()),
      latestRuleSimulation: cloneJson(this.latestRuleSimulation),
      latestRuleSuggestionBatch: cloneJson(this.latestRuleSuggestionBatch),
      runs: cloneJson(this.listRuns())
    };
  }

  restoreWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
    this.applyWorkspaceSnapshot(snapshot);
    this.persistState();
    return {
      restoredAt: new Date().toISOString(),
      projects: this.workspace.projects.length,
      people: this.workspace.people.length,
      officialRuns: this.listRuns("official").length,
      archivedRuns: this.listRuns("official").filter((run) => run.status === "archived").length,
      currentRunId: this.workspace.currentRun.id,
      publishCandidateRunId: this.publishCandidateRun().id
    };
  }

  private loadPersistedState() {
    if (!this.statePath || !fs.existsSync(this.statePath)) return;
    try {
      this.applyWorkspaceSnapshot(JSON.parse(fs.readFileSync(this.statePath, "utf8")) as WorkspaceSnapshot);
    } catch (error) {
      throw new Error(`无法读取工作区持久化快照 ${this.statePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
    if (snapshot?.schemaVersion !== 1 || !snapshot.workspace || !Array.isArray(snapshot.runs)) {
      throw new BadRequestException("工作区快照格式不正确");
    }
    this.workspace = snapshot.workspace;
    this.projectBatchFilename = snapshot.projectBatch.filename;
    this.projectBatchDataRows = snapshot.projectBatch.dataRows;
    this.projectBatchWorksheetRows = snapshot.projectBatch.worksheetRows;
    this.projectBatchExpectedOnsiteTotal = snapshot.projectBatch.expectedOnsiteTotal;
    this.projectBatchExpectedOffsiteTotal = snapshot.projectBatch.expectedOffsiteTotal;
    this.projectFrozen = snapshot.controls.projectFrozen;
    this.rosterConfirmed = snapshot.controls.rosterConfirmed;
    this.snapshotVersion = snapshot.controls.snapshotVersion;
    this.rosterVersionNumber = snapshot.controls.rosterVersionNumber;
    this.tagLibrary = snapshot.tagLibrary;
    this.publishedRuleSet = snapshot.publishedRuleSet;
    this.ruleValidationRun = snapshot.ruleValidationRun;
    this.ruleDrafts = new Map(snapshot.ruleDrafts.map((draft) => [draft.technicalRuleId, draft]));
    this.latestRuleSimulation = snapshot.latestRuleSimulation;
    this.latestRuleSuggestionBatch = snapshot.latestRuleSuggestionBatch;
    this.runs = new Map(snapshot.runs.map((run) => [run.id, run]));
    for (const run of [this.workspace.currentRun, this.workspace.asset7Run, this.ruleValidationRun].filter((item): item is SchedulingRun => Boolean(item))) {
      this.runs.set(run.id, run);
    }
  }

  private persistState() {
    if (!this.statePath) return;
    const targetDir = path.dirname(this.statePath);
    fs.mkdirSync(targetDir, { recursive: true });
    const tmpPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(this.workspaceSnapshot(), null, 2)}\n`);
    fs.renameSync(tmpPath, this.statePath);
  }

  private normalizeUploadedFilename(filename: string) {
    return /[Ããïæèäçå¼½]/.test(filename) ? Buffer.from(filename, "latin1").toString("utf8") : filename;
  }

  private normalizeCount(value: unknown) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
  }

  private normalizeProjectPayload(body: Partial<Project> & { member_count?: unknown; related_party_stock_count?: unknown }): Partial<Project> {
    const { member_count: memberCountSnake, related_party_stock_count: relatedPartyStockCountSnake, ...project } = body;
    return {
      ...project,
      ...(Object.prototype.hasOwnProperty.call(body, "member_count") && project.memberCount === undefined
        ? { memberCount: this.normalizeCount(memberCountSnake) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "related_party_stock_count") && project.relatedPartyStockCount === undefined
        ? { relatedPartyStockCount: this.normalizeCount(relatedPartyStockCountSnake) }
        : {})
    };
  }

  private publishCandidateRun() {
    return this.ruleValidationRun ?? this.workspace.currentRun;
  }

  private isEnergyExemptionScope(project: Project) {
    return project.industry === "energy" && project.exposureBalance <= 300_000_000;
  }

  private needsEnergyExemptionReview(project: Project) {
    return this.isEnergyExemptionScope(project) && energyFieldKeys.some((key) => project[key] === null);
  }

  private satisfiesEnergyExemption(project: Project) {
    return (
      this.isEnergyExemptionScope(project) &&
      project.gridConnected === true &&
      project.repayClean3y === true &&
      (project.accountMonitored === true || project.realtimeMonitored === true)
    );
  }

  private energyExemptionSummary(projects = this.workspace.projects) {
    return {
      pendingEnergyProjects: projects.filter((project) => this.needsEnergyExemptionReview(project)).length,
      r5ExemptedProjects: projects.filter((project) => this.satisfiesEnergyExemption(project)).length
    };
  }

  summary() {
    const current = this.workspace.currentRun;
    const publishCandidateRun = this.publishCandidateRun();
    const tagLibrary = this.effectiveTagLibrary();
    return {
      projects: this.workspace.projects,
      people: this.workspace.people,
      currentRun: current,
      publishCandidateRun,
      asset7Run: this.workspace.asset7Run,
      officialRuns: this.listRuns("official"),
      ruleset: this.publishedRuleSet,
      planningYear: this.workspace.planningYear,
      tagLibrary,
      businessRuleOrders,
      evidenceLibrary,
      ruleRegistry: this.ruleRegistry(),
      ruleRegistryGroups: this.ruleRegistryGroups(),
      ruleSystemMap: this.ruleSystemMap(),
      tagTaxonomy: this.tagTaxonomy(),
      tagCoverageSummary: this.tagCoverageSummary(),
      ruleDrafts: this.listRuleDrafts(),
      latestRuleSimulation: this.latestRuleSimulation,
      latestRuleSuggestionBatch: this.latestRuleSuggestionBatch,
      issueBoard: createIssueBoard({
        run: publishCandidateRun,
        projects: this.workspace.projects,
        ruleDrafts: this.listRuleDrafts()
      })
    };
  }

  tags(scope?: TagScope) {
    const tagLibrary = this.effectiveTagLibrary();
    return scope ? tagsForScope(scope, tagLibrary) : tagLibrary;
  }

  createTag(input: Partial<TagDefinition>) {
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code || !name) throw new BadRequestException("标签编码和名称不能为空");
    if (this.effectiveTagLibrary().some((item) => item.code === code)) throw new BadRequestException(`标签编码已存在: ${code}`);
    const tag: TagDefinition = {
      id: input.id ?? `tag-custom-${Date.now()}`,
      code,
      name,
      category: input.category ?? "manual",
      scopes: input.scopes?.length ? input.scopes : ["project"],
      exclusiveGroup: input.exclusiveGroup ?? null,
      fieldBinding: input.fieldBinding ?? null,
      relationMeta: input.relationMeta ?? null,
      description: input.description ?? "人工维护标签",
      isSystem: input.isSystem ?? false,
      active: input.active ?? true
    };
    validateTagLibrary([...this.effectiveTagLibrary(), tag]);
    this.tagLibrary = [...this.tagLibrary, tag];
    this.resyncTags();
    return tag;
  }

  updateTag(id: string, input: Partial<TagDefinition>) {
    const current = this.tagLibrary.find((item) => item.id === id);
    if (!current) throw new BadRequestException(`Tag not found: ${id}`);
    const next = { ...current, ...input, id, code: input.code?.trim() ?? current.code, name: input.name?.trim() ?? current.name };
    validateTagLibrary(this.tagLibrary.map((item) => (item.id === id ? next : item)));
    this.tagLibrary = this.tagLibrary.map((item) => (item.id === id ? next : item));
    this.resyncTags();
    return next;
  }

  businessOrdering() {
    return businessRuleOrders;
  }

  ruleRegistry(): RuleRegistryItem[] {
    const drafts = new Map(this.listRuleDrafts().map((draft) => [draft.technicalRuleId, draft]));
    const seenRuleIds = new Set<string>();
    const ruleItems = businessRuleOrders
      .flatMap((order) => order.items)
      .filter((item) => {
        if (seenRuleIds.has(item.technicalRuleId)) return false;
        seenRuleIds.add(item.technicalRuleId);
        return true;
      });
    return ruleItems
      .sort((a, b) => a.order - b.order)
      .map((item) => {
        const draft = drafts.get(item.technicalRuleId);
        const evidence = evidenceForRule(item.technicalRuleId);
        const evidenceLabels = evidence.map((entry) => entry.policyCitation?.citationLabel ?? entry.sourceParagraph);
        const isManualConfirmed = draft?.status === "submitted";
        const isDataGap = ["P5", "P6"].includes(item.technicalRuleId) && !isManualConfirmed;
        const authorityType: RuleRegistryItem["authorityType"] = isManualConfirmed
          ? "manual_confirmed"
          : item.publishImpact === "can_publish"
            ? "policy_compiled"
            : "system_builtin";
        const status: RuleRegistryItem["status"] = isManualConfirmed
          ? "manual_confirmed"
          : draft?.status === "simulated"
            ? "simulated"
            : draft?.status === "draft"
              ? "draft"
              : item.publishImpact === "can_publish"
                ? "effective"
                : isDataGap
                  ? "pending_data"
                  : "pending_action";
        const authorityDetail = isManualConfirmed
          ? `${draft.confirmerNote || "规则维护岗确认"}${draft.submittedAt ? `｜${draft.submittedAt.slice(0, 19).replace("T", " ")}` : ""}`
          : evidenceLabels.join("；") || this.publishedRuleSet.sourceNote;
        return {
          id: item.id,
          order: item.order,
          technicalRuleId: item.technicalRuleId,
          businessTitle: item.businessTitle,
          businessCondition: item.businessCondition,
          businessOutcome: isManualConfirmed
            ? this.ruleRegistryOutcome(item.businessOutcome, draft)
            : item.businessOutcome,
          businessOrderGroup: item.businessOrderGroup,
          evidenceLabels,
          authorityType,
          authorityLabel: authorityType === "manual_confirmed" ? "人工确认补充" : authorityType === "policy_compiled" ? "制度已编制" : "系统内置",
          authorityDetail,
          status,
          statusLabel: item.publishImpact === "manual_needed" && status !== "manual_confirmed" ? "待确认安排" : this.ruleRegistryStatusLabel(status),
          affectedProjectCount: this.ruleImpact(item.technicalRuleId).affectedProjectCount,
          publishImpact: item.publishImpact,
          impactType: item.impactType,
          onsite: isManualConfirmed && isResolvedRuleDraft(draft) ? draft.onsite : null,
          offsite: isManualConfirmed && isResolvedRuleDraft(draft) ? draft.offsite : null,
          confirmerName: isManualConfirmed ? "规则维护岗" : null,
          confirmerNote: isManualConfirmed ? draft.confirmerNote || null : null,
          confirmedAt: isManualConfirmed ? draft.submittedAt : null,
          rulesetVersion: this.publishedRuleSet.version,
          tagRefs: item.tagRefs
        };
      });
  }

  ruleRegistryGroups(): RuleRegistryGroup[] {
    const registryByRule = new Map(this.ruleRegistry().map((item) => [item.technicalRuleId, item]));
    const assignedRuleIds = new Set<string>();
    return businessRuleOrders.map((group) => {
      const groupRegistryItems = group.items
        .map((item) => registryByRule.get(item.technicalRuleId))
        .filter((item): item is RuleRegistryItem => Boolean(item));
      const isUnquantifiedSummary = group.id === "G7";
      const displayItems = isUnquantifiedSummary
        ? []
        : groupRegistryItems.filter((item) => {
            if (assignedRuleIds.has(item.technicalRuleId)) return false;
            assignedRuleIds.add(item.technicalRuleId);
            return true;
          });
      const summaryItems = isUnquantifiedSummary ? groupRegistryItems : displayItems;
      return {
        id: group.id,
        order: group.order,
        title: group.title,
        description: group.description,
        items: displayItems.sort((a, b) => a.order - b.order),
        statusSummary: this.ruleRegistryStatusSummary(summaryItems),
        affectedProjectCount: summaryItems.reduce((total, item) => total + item.affectedProjectCount, 0),
        primaryStatus: this.ruleRegistryGroupPrimaryStatus(summaryItems)
      };
    });
  }

  ruleSystemMap() {
    const tagLibrary = this.effectiveTagLibrary();
    return createRuleSystemMap({
      projects: this.workspace.projects,
      people: this.workspace.people,
      run: this.publishCandidateRun(),
      tagLibrary
    });
  }

  evidenceLibrary() {
    return evidenceLibrary;
  }

  tagTaxonomy(scope?: TagScope) {
    const tagLibrary = this.effectiveTagLibrary();
    const nodes = createTagTaxonomy({
      projects: this.workspace.projects,
      people: this.workspace.people,
      run: this.publishCandidateRun(),
      tagLibrary
    });
    return scope ? nodes.filter((node) => node.scope === scope) : nodes;
  }

  tagCoverageSummary() {
    const tagLibrary = this.effectiveTagLibrary();
    return createTagCoverageSummary({
      projects: this.workspace.projects,
      people: this.workspace.people,
      run: this.publishCandidateRun(),
      tagLibrary
    });
  }

  pendingRuleDecisions() {
    return this.ruleSystemMap().pendingDecisions;
  }

  ruleImpact(id: string) {
    const tagLibrary = this.effectiveTagLibrary();
    return createRuleImpact(id, {
      projects: this.workspace.projects,
      people: this.workspace.people,
      run: this.publishCandidateRun(),
      tagLibrary
    });
  }

  listRuleDrafts() {
    return [...this.ruleDrafts.values()].sort((a, b) => a.technicalRuleId.localeCompare(b.technicalRuleId));
  }

  saveRuleDecisionDraft(id: string, input: Partial<RuleDecisionDraft>) {
    const technicalRuleId = normalizePendingDecisionId(id);
    const businessRule = businessRuleByTechnicalId(technicalRuleId);
    if (!businessRule) throw new BadRequestException(`Rule not found: ${technicalRuleId}`);
    const now = new Date().toISOString();
    const current = this.ruleDrafts.get(technicalRuleId);
    const draft = createRuleDecisionDraft(
      technicalRuleId,
      {
        ...current,
        ...input,
        id: current?.id ?? `draft-${technicalRuleId}`,
        pendingDecisionId: `pending-${technicalRuleId}`,
        technicalRuleId,
        status: current?.status === "submitted" ? "submitted" : "draft",
        submittedAt: current?.submittedAt ?? null,
        simulationRunId: current?.simulationRunId ?? null
      },
      now
    );
    this.ruleDrafts.set(technicalRuleId, draft);
    this.persistState();
    return draft;
  }

  generateRuleSuggestions(body: { scope: "current_run"; apply: true }) {
    if (body.scope !== "current_run" || body.apply !== true) {
      throw new BadRequestException("当前仅支持 { scope: \"current_run\", apply: true }");
    }
    const result = generateRuleSuggestions({
      run: this.publishCandidateRun(),
      projects: this.workspace.projects,
      existingDrafts: this.listRuleDrafts()
    });
    for (const draft of result.drafts) {
      this.ruleDrafts.set(draft.technicalRuleId, draft);
    }
    this.latestRuleSuggestionBatch = result.batch;
    this.persistState();
    return result.batch;
  }

  simulateRuleDecision(id: string) {
    const technicalRuleId = normalizePendingDecisionId(id);
    const draft = this.requireRuleDraft(technicalRuleId);
    if (!isResolvedRuleDraft(draft)) {
      throw new BadRequestException("请先补充现场和非现场检查次数，再进行沙盘试算");
    }
    const drafts = this.listRuleDrafts();
    const draftRuleSet = applyRuleDecisionDrafts(this.publishedRuleSet, drafts, "draft");
    const run = generateRun(
      { year: 2026, scope: "full_year" },
      this.workspace.projects,
      {
        people: this.workspace.people,
        assigneePoolMode: this.workspace.planningYear.rosterVersion.poolMode,
        runType: "what_if",
        ruleset: draftRuleSet,
        now: new Date().toISOString()
      }
    );
    this.runs.set(run.id, run);
    const updatedDraft: RuleDecisionDraft = { ...draft, status: "simulated", simulationRunId: run.id, updatedAt: new Date().toISOString() };
    this.ruleDrafts.set(technicalRuleId, updatedDraft);
    const result = this.createSimulationResult(`pending-${technicalRuleId}`, technicalRuleId, run);
    this.latestRuleSimulation = result;
    this.persistState();
    return result;
  }

  submitRuleDecision(id: string) {
    const technicalRuleId = normalizePendingDecisionId(id);
    const draft = this.requireRuleDraft(technicalRuleId);
    const businessRule = businessRuleByTechnicalId(technicalRuleId);
    const isManualConfirmation = businessRule?.publishImpact === "manual_needed";
    if (["P5", "P6"].includes(technicalRuleId)) {
      throw new BadRequestException("该事项属于项目基础数据缺口，请先到项目维护补齐数据后再重新校验规则");
    }
    if (isManualConfirmation && (!draft.businessNote.trim() || !draft.confirmerNote.trim())) {
      throw new BadRequestException("请先填写处理说明和确认人说明，再纳入排期规则");
    }
    if (!isManualConfirmation && !isResolvedRuleDraft(draft)) {
      throw new BadRequestException("请先补充并保存量化口径，再提交发布");
    }
    const now = new Date().toISOString();
    const submittedDraft: RuleDecisionDraft = {
      ...draft,
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
      ...(draft.suggestionMeta ? { suggestionMeta: { ...draft.suggestionMeta, reviewStatus: "accepted" } } : {})
    };
    this.ruleDrafts.set(technicalRuleId, submittedDraft);
    this.publishedRuleSet = applyRuleDecisionDrafts(defaultRuleSet, this.listRuleDrafts(), "submitted");
    const validationRun = generateRun(
      { year: 2026, scope: "full_year" },
      this.workspace.projects,
      {
        people: this.workspace.people,
        assigneePoolMode: this.workspace.planningYear.rosterVersion.poolMode,
        runType: "what_if",
        ruleset: this.publishedRuleSet,
        now
      }
    );
    this.runs.set(validationRun.id, validationRun);
    this.ruleValidationRun = validationRun;
    const result = this.createSimulationResult(`pending-${technicalRuleId}`, technicalRuleId, validationRun);
    this.latestRuleSimulation = result;
    this.rebuildPlanning();
    return {
      draft: submittedDraft,
      rulesetVersion: this.publishedRuleSet.version,
      validationRunId: validationRun.id,
      publishable: result.publishable,
      blockers: result.blockers,
      simulation: result,
      readiness: this.workspace.planningYear.readiness.find((gate) => gate.key === "rules")
    };
  }

  ruleEvidence(id: string) {
    const businessRule = businessRuleByTechnicalId(id);
    return {
      technicalRuleId: id,
      businessRule,
      evidence: evidenceForRule(id)
    };
  }

  planningYear(year = 2026) {
    if (year !== this.workspace.planningYear.year) throw new BadRequestException(`Unsupported planning year: ${year}`);
    return this.workspace.planningYear;
  }

  readiness(year = 2026) {
    return this.planningYear(year).readiness;
  }

  projectDiff(year = 2026) {
    return this.planningYear(year).projectChangeSet;
  }

  importProjects(year = 2026, file?: { originalname: string; buffer: Uint8Array; mimetype?: string; size?: number }) {
    if (!file) return this.planningYear(year).projectBatch;
    const filename = this.normalizeUploadedFilename(file.originalname);
    if (!filename.toLowerCase().endsWith(".xlsx")) {
      throw new BadRequestException("请上传 .xlsx 格式的年度项目表");
    }
    const shouldPreserveBusinessNames = filename.includes("端到端测试数据包");
    const importedProjects = importProjectsFromXlsxBuffer(file.buffer, { desensitize: !shouldPreserveBusinessNames, year });
    if (!importedProjects.length) {
      throw new BadRequestException("未识别到可导入的项目数据");
    }
    const tagLibrary = this.effectiveTagLibrary(importedProjects, this.workspace.people);
    this.workspace.projects = importedProjects.map((project) => syncProjectTags(this.normalizeProjectMaintainerIds(project), tagLibrary));
    this.projectBatchFilename = filename;
    this.projectBatchDataRows = importedProjects.length;
    this.projectBatchWorksheetRows = importedProjects.length + 1;
    this.projectBatchExpectedOnsiteTotal = importedProjects.reduce((total, project) => total + (project.expectedOnsiteCount ?? 0), 0);
    this.projectBatchExpectedOffsiteTotal = importedProjects.reduce((total, project) => total + (project.expectedOffsiteCount ?? 0), 0);
    this.projectFrozen = false;
    this.ruleValidationRun = null;
    this.resyncTags();
    return {
      batch: this.workspace.planningYear.projectBatch,
      importedProjects: importedProjects.length
    };
  }

  freezeProjects(year = 2026) {
    this.planningYear(year);
    this.projectFrozen = true;
    this.snapshotVersion += 1;
    this.rebuildPlanning();
    const planning = this.planningYear(year);
    return {
      snapshotId: planning.activeSnapshotId,
      frozenAt: planning.projectChangeSet.frozenAt,
      readiness: planning.readiness.find((gate) => gate.key === "projects")
    };
  }

  createRosterVersion(year = 2026) {
    return this.planningYear(year).rosterVersion;
  }

  confirmRosterVersion(year = 2026) {
    this.planningYear(year);
    this.rosterConfirmed = true;
    this.rosterVersionNumber += 1;
    this.rebuildPlanning();
    return this.workspace.planningYear.rosterVersion;
  }

  createProject(body: Partial<Project> & { member_count?: unknown; related_party_stock_count?: unknown }) {
    const payload = this.normalizeProjectPayload(body);
    const nextId = payload.id ?? `P${String(this.workspace.projects.length + 1).padStart(3, "0")}`;
    const draft: Project = {
      id: nextId,
      name: payload.name ?? "新增项目",
      partyType: payload.partyType ?? "lessee",
      groupId: payload.groupId ?? null,
      groupName: payload.groupName ?? null,
      dept: payload.dept ?? "",
      riskGrade: payload.riskGrade ?? "normal",
      isNpl: payload.isNpl ?? false,
      customerType: payload.customerType ?? "external",
      industry: payload.industry ?? "other",
      hospitalType: payload.hospitalType ?? null,
      bizType: payload.bizType ?? "leaseback",
      exposureInit: payload.exposureInit ?? 0,
      exposureBalance: payload.exposureBalance ?? 0,
      creditStart: payload.creditStart ?? "",
      creditEnd: payload.creditEnd ?? "",
      termHalf: payload.termHalf ?? null,
      gridConnected: payload.gridConnected ?? null,
      accountMonitored: payload.accountMonitored ?? null,
      realtimeMonitored: payload.realtimeMonitored ?? null,
      repayClean3y: payload.repayClean3y ?? null,
      isWarning: payload.isWarning ?? false,
      isSettledThisYear: payload.isSettledThisYear ?? false,
      isNewWithin1y: payload.isNewWithin1y ?? false,
      lastOnsiteDate: payload.lastOnsiteDate ?? null,
      expectedOnsiteCount: payload.expectedOnsiteCount ?? 0,
      expectedOffsiteCount: payload.expectedOffsiteCount ?? 0,
      onsiteMaintainerName: payload.onsiteMaintainerName ?? null,
      offsiteMaintainerName: payload.offsiteMaintainerName ?? null,
      onsiteMaintainerId: payload.onsiteMaintainerId ?? null,
      offsiteMaintainerId: payload.offsiteMaintainerId ?? null,
      memberCount: payload.memberCount ?? null,
      relatedPartyStockCount: payload.relatedPartyStockCount ?? null,
      primaryResponsibleDept: payload.primaryResponsibleDept,
      assistingDept: payload.assistingDept ?? null,
      approvalRequirement: payload.approvalRequirement ?? null,
      companySpecialRequirement: payload.companySpecialRequirement ?? false,
      warningPlan: payload.warningPlan ?? null,
      inspectionContactName: payload.inspectionContactName ?? null,
      reportOwnerName: payload.reportOwnerName ?? null,
      rectificationOwnerName: payload.rectificationOwnerName ?? null,
      preferredInspectionMonth: payload.preferredInspectionMonth ?? null,
      unavailableMonths: payload.unavailableMonths ?? [],
      offsiteInfoChannels: payload.offsiteInfoChannels ?? [],
      tagIds: payload.tagIds ?? []
    };
    const tagLibrary = this.effectiveTagLibrary();
    const normalizedDraft = this.normalizeProjectMaintainerIds(draft);
    const project = payload.tagIds ? applyProjectTagIds(normalizedDraft, payload.tagIds, tagLibrary) : syncProjectTags(normalizedDraft, tagLibrary);
    this.workspace.projects = [...this.workspace.projects, project];
    this.projectFrozen = false;
    this.ruleValidationRun = null;
    this.resyncTags();
    return this.workspace.projects.find((item) => item.id === nextId) ?? project;
  }

  updateProject(id: string, body: Partial<Project> & { member_count?: unknown; related_party_stock_count?: unknown }) {
    const current = this.workspace.projects.find((project) => project.id === id);
    if (!current) throw new BadRequestException(`Project not found: ${id}`);
    const payload = this.normalizeProjectPayload(body);
    const merged = this.normalizeProjectMaintainerIds({ ...current, ...payload });
    const tagLibrary = this.effectiveTagLibrary();
    const next = payload.tagIds ? applyProjectTagIds(merged, payload.tagIds, tagLibrary) : syncProjectTags(merged, tagLibrary);
    this.workspace.projects = this.workspace.projects.map((project) => (project.id === id ? next : project));
    this.projectFrozen = false;
    this.ruleValidationRun = null;
    this.resyncTags();
    return this.workspace.projects.find((project) => project.id === id) ?? next;
  }

  bulkProjectTags(body: { projectIds: string[]; tagIds: string[]; mode: "add" | "remove" }) {
    const ids = new Set(body.projectIds);
    const tagLibrary = this.effectiveTagLibrary();
    this.workspace.projects = this.workspace.projects.map((project) => {
      if (!ids.has(project.id)) return project;
      const current = project.tagIds ?? syncProjectTags(project, tagLibrary).tagIds ?? [];
      const nextTagIds = body.mode === "remove"
        ? current.filter((id) => !body.tagIds.includes(id))
        : [...current, ...body.tagIds];
      return applyProjectTagIds(project, nextTagIds, tagLibrary);
    });
    this.projectFrozen = false;
    this.ruleValidationRun = null;
    this.resyncTags();
    return this.workspace.projects.filter((project) => ids.has(project.id));
  }

  bulkUpdateEnergyFields(body: { projectIds: string[]; updates: Record<string, unknown>; reason?: string }) {
    const requestedIds = [...new Set((body.projectIds ?? []).filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))];
    if (!requestedIds.length) throw new BadRequestException("请选择需要批量确认的能源环保项目");

    const rawUpdates = body.updates ?? {};
    const invalidKeys = Object.keys(rawUpdates).filter((key) => !energyFieldKeys.includes(key as EnergyFieldKey));
    if (invalidKeys.length) throw new BadRequestException(`仅允许更新能源豁免三项字段：${energyFieldKeys.map((key) => energyFieldLabels[key]).join("、")}`);

    const updates = Object.fromEntries(
      energyFieldKeys
        .filter((key) => Object.prototype.hasOwnProperty.call(rawUpdates, key))
        .map((key) => {
          const value = rawUpdates[key];
          if (typeof value !== "boolean") throw new BadRequestException(`${energyFieldLabels[key]}只能填写是或否；保持不变请不要传该字段`);
          return [key, value];
        })
    ) as EnergyFieldUpdates;
    const changedFieldKeys = Object.keys(updates) as EnergyFieldKey[];
    if (!changedFieldKeys.length) throw new BadRequestException("请选择至少一个需要确认的能源字段");

    const requested = new Set(requestedIds);
    const targetIds = this.workspace.projects.filter((project) => requested.has(project.id) && this.isEnergyExemptionScope(project)).map((project) => project.id);
    if (!targetIds.length) throw new BadRequestException("所选项目中没有符合 R5 判断范围的能源环保项目");

    const beforeSummary = this.energyExemptionSummary();
    const targetIdSet = new Set(targetIds);
    const tagLibrary = this.effectiveTagLibrary();
    this.workspace.projects = this.workspace.projects.map((project) => {
      if (!targetIdSet.has(project.id)) return project;
      return syncProjectTags({ ...project, ...updates }, tagLibrary);
    });
    this.projectFrozen = false;

    const validationRun = generateRun(
      { year: this.workspace.planningYear.year, scope: "full_year" },
      this.workspace.projects,
      {
        people: this.workspace.people,
        assigneePoolMode: this.workspace.planningYear.rosterVersion.poolMode,
        runType: "what_if",
        ruleset: this.publishedRuleSet,
        now: new Date().toISOString()
      }
    );
    this.runs.set(validationRun.id, validationRun);
    this.ruleValidationRun = validationRun;
    this.latestRuleSimulation = null;
    this.latestRuleSuggestionBatch = null;
    this.resyncTags();

    const afterSummary = this.energyExemptionSummary();
    const updatedProjects = this.workspace.projects.filter((project) => targetIdSet.has(project.id));

    return {
      updatedCount: updatedProjects.length,
      updatedProjectIds: updatedProjects.map((project) => project.id),
      fieldChanges: changedFieldKeys.map((key) => ({
        field: key,
        label: energyFieldLabels[key],
        value: updates[key]
      })),
      beforeSummary,
      afterSummary,
      r5CandidateProjectIds: updatedProjects.filter((project) => this.satisfiesEnergyExemption(project)).map((project) => project.id),
      stillPendingProjectIds: this.workspace.projects.filter((project) => this.needsEnergyExemptionReview(project)).map((project) => project.id),
      reason: body.reason?.trim() || "导入后批量确认能源豁免条件"
    };
  }

  bulkDeleteProjects(body: { projectIds: string[] }) {
    const requestedIds = [...new Set((body.projectIds ?? []).filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))];
    if (!requestedIds.length) throw new BadRequestException("请选择需要移出项目池的项目");
    const requested = new Set(requestedIds);
    const deletedProjectIds = this.workspace.projects.filter((project) => requested.has(project.id)).map((project) => project.id);
    if (!deletedProjectIds.length) {
      return {
        deletedCount: 0,
        deletedProjectIds,
        remainingProjects: this.workspace.projects.length
      };
    }

    const deleted = new Set(deletedProjectIds);
    this.workspace.projects = this.workspace.projects.filter((project) => !deleted.has(project.id));
    this.projectBatchDataRows = this.workspace.projects.length;
    this.projectBatchWorksheetRows = this.workspace.projects.length + 1;
    this.projectBatchExpectedOnsiteTotal = this.workspace.projects.reduce((total, project) => total + (project.expectedOnsiteCount ?? 0), 0);
    this.projectBatchExpectedOffsiteTotal = this.workspace.projects.reduce((total, project) => total + (project.expectedOffsiteCount ?? 0), 0);
    this.projectFrozen = false;

    const validationRun = generateRun(
      { year: this.workspace.planningYear.year, scope: "full_year" },
      this.workspace.projects,
      {
        people: this.workspace.people,
        assigneePoolMode: this.workspace.planningYear.rosterVersion.poolMode,
        runType: "what_if",
        ruleset: this.publishedRuleSet,
        now: new Date().toISOString()
      }
    );
    this.runs.set(validationRun.id, validationRun);
    this.ruleValidationRun = validationRun;
    this.latestRuleSimulation = null;
    this.latestRuleSuggestionBatch = null;
    this.resyncTags();

    return {
      deletedCount: deletedProjectIds.length,
      deletedProjectIds,
      remainingProjects: this.workspace.projects.length
    };
  }

  createPerson(body: Partial<Person>) {
    const tagLibrary = this.effectiveTagLibrary();
    const person = syncPersonTags({
      id: body.id ?? `person-${String(this.workspace.people.length + 1).padStart(3, "0")}`,
      name: body.name ?? "新增人员",
      baseCity: body.baseCity ?? "深圳",
      dept: body.dept ?? "资产管理部",
      specialTags: body.specialTags ?? [],
      longTermGroupIds: body.longTermGroupIds ?? [],
      longTermProjectIds: body.longTermProjectIds ?? [],
      isActive: body.isActive ?? true,
      activeFrom: body.activeFrom ?? null,
      activeTo: body.activeTo ?? null,
      pool: body.pool ?? ["asset7", "all26"],
      responsibilityRoles: body.responsibilityRoles ?? ["asset_management_owner", "report_owner"],
      annualOnsiteWeekCapacity: body.annualOnsiteWeekCapacity ?? 44,
      monthlyOnsiteLimit: body.monthlyOnsiteLimit ?? 4,
      offsiteTaskCapacity: body.offsiteTaskCapacity ?? 36,
      unavailableMonths: body.unavailableMonths ?? [],
      tagIds: body.tagIds ?? []
    }, tagLibrary);
    this.workspace.people = [...this.workspace.people, person];
    this.rosterConfirmed = false;
    this.ruleValidationRun = null;
    this.resyncTags();
    return this.workspace.people.find((item) => item.id === person.id) ?? person;
  }

  updatePerson(id: string, body: Partial<Person>) {
    const current = this.workspace.people.find((person) => person.id === id);
    if (!current) throw new BadRequestException(`Person not found: ${id}`);
    const merged = { ...current, ...body };
    const tagLibrary = this.effectiveTagLibrary();
    const next = body.tagIds ? applyPersonTagIds(merged, body.tagIds, tagLibrary) : syncPersonTags(merged, tagLibrary);
    this.workspace.people = this.workspace.people.map((person) => (person.id === id ? next : person));
    this.rosterConfirmed = false;
    this.ruleValidationRun = null;
    this.resyncTags();
    return this.workspace.people.find((person) => person.id === id) ?? next;
  }

  bulkPersonTags(body: { personIds: string[]; tagIds: string[]; mode: "add" | "remove" }) {
    const ids = new Set(body.personIds);
    const tagLibrary = this.effectiveTagLibrary();
    this.workspace.people = this.workspace.people.map((person) => {
      if (!ids.has(person.id)) return person;
      const current = person.tagIds ?? syncPersonTags(person, tagLibrary).tagIds ?? [];
      const nextTagIds = body.mode === "remove"
        ? current.filter((id) => !body.tagIds.includes(id))
        : [...current, ...body.tagIds];
      return applyPersonTagIds(person, nextTagIds, tagLibrary);
    });
    this.rosterConfirmed = false;
    this.ruleValidationRun = null;
    this.resyncTags();
    return this.workspace.people.filter((person) => ids.has(person.id));
  }

  copyRuleset(year = 2026) {
    const planning = this.planningYear(year);
    return {
      ...planning.ruleset,
      id: `${planning.ruleset.id}-draft-${year}`,
      version: `${planning.ruleset.version}-draft-${year}`,
      status: "draft" as const,
      sourceNote: `${planning.ruleset.sourceNote}；复制为 ${year} 年度草稿`
    };
  }

  publishRuleset(year = 2026, rulesetId: string) {
    const planning = this.planningYear(year);
    if (planning.ruleReport.ruleGap > 0) {
      throw new BadRequestException(`Ruleset ${rulesetId} has ${planning.ruleReport.ruleGap} RULE_GAP items`);
    }
    return planning.ruleReport;
  }

  listRuns(runType?: SchedulingRun["runType"]) {
    return [...this.runs.values()]
      .filter((run) => (runType ? run.runType === runType : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getRun(id: string) {
    return this.runs.get(id);
  }

  generate(mode: AssigneePoolMode = "sampleMaintainers", runType: "official" | "what_if" = "official") {
    if (runType === "official" && !this.workspace.planningYear.canGenerateOfficial) {
      throw new BadRequestException("年度数据准备闸门未全部通过，不能生成正式排期");
    }
    if (runType === "official" && !this.publishCandidateRun().audit.publishable) {
      throw new BadRequestException("当前候选方案仍有硬阻断，不能生成正式排期");
    }
    if (runType === "what_if" && !this.workspace.planningYear.canGenerateSandbox) {
      throw new BadRequestException("项目或人员准备未通过，不能生成沙盘试算");
    }
    const run = generateRun(
      { year: 2026, scope: "full_year" },
      this.workspace.projects,
      {
        people: this.workspace.people,
        assigneePoolMode: mode,
        runType,
        ruleset: this.publishedRuleSet,
        now: new Date().toISOString()
      }
    );
    this.runs.set(run.id, run);
    if (runType === "official") this.workspace.currentRun = run;
    if (runType === "what_if" && mode === "asset7") this.workspace.asset7Run = run;
    this.rebuildPlanning();
    return run;
  }

  generateForPlanningYear(year = 2026, mode: AssigneePoolMode = "sampleMaintainers", runType: "official" | "what_if" = "official") {
    this.planningYear(year);
    return this.generate(mode, runType);
  }

  publishRun(id: string) {
    const run = this.requireRun(id);
    const published = publish(run);
    this.runs.set(id, published);
    this.workspace.currentRun = published;
    this.rebuildPlanning();
    return published;
  }

  archiveRun(id: string) {
    const run = this.requireRun(id);
    if (run.runType !== "official") throw new BadRequestException("只有正式排期可以归档");
    const archived: SchedulingRun = { ...run, status: "archived" };
    this.runs.set(id, archived);
    if (this.workspace.currentRun.id === id) this.workspace.currentRun = archived;
    this.rebuildPlanning();
    return archived;
  }

  updateTaskStatus(
    id: string,
    taskId: string,
    body: { status?: Task["status"]; actualCompletedAt?: string | null; reportRef?: string | null }
  ) {
    const run = this.requireRun(id);
    this.assertRunEditable(run);
    const currentTask = run.tasks.find((task) => task.id === taskId);
    if (!currentTask) throw new BadRequestException(`Task not found: ${taskId}`);
    const allowedStatuses = new Set<Task["status"]>(["pending", "completed", "delayed"]);
    const nextStatus = body.status ?? currentTask.status;
    if (!allowedStatuses.has(nextStatus)) throw new BadRequestException("执行状态仅支持已排期、已完成或已延期");
    const nextTasks = run.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: nextStatus,
            actualCompletedAt:
              body.actualCompletedAt !== undefined
                ? body.actualCompletedAt
                : nextStatus === "completed"
                  ? task.actualCompletedAt ?? new Date().toISOString().slice(0, 10)
                  : task.actualCompletedAt,
            reportRef: body.reportRef !== undefined ? body.reportRef : task.reportRef
          }
        : task
    );
    const next: SchedulingRun = { ...run, tasks: nextTasks };
    this.runs.set(id, next);
    if (this.workspace.currentRun.id === id) this.workspace.currentRun = next;
    this.persistState();
    return next;
  }

  overrideTask(id: string, taskId: string, body: { field: "assigneeId" | "scheduledDate" | "manualDisposition"; value: string | null; reason: string }) {
    const run = this.requireRun(id);
    this.assertRunEditable(run);
    const overridden = overrideDecision(run, taskId, body.field, body.value, body.reason);
    const next =
      body.field === "assigneeId"
        ? {
            ...overridden,
            tasks: overridden.tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    assigneeName: body.value ? this.workspace.people.find((person) => person.id === body.value)?.name ?? task.assigneeName : null
                  }
                : task
            )
          }
        : overridden;
    this.runs.set(id, next);
    if (this.workspace.currentRun.id === id) this.workspace.currentRun = next;
    this.persistState();
    return next;
  }

  decisionChain(id: string, projectId: string) {
    const run = this.requireRun(id);
    const project = this.workspace.projects.find((item) => item.id === projectId);
    if (!project) throw new BadRequestException(`Project not found: ${projectId}`);
    return createDecisionExplanations({
      project,
      logs: run.decisionLogs.filter((entry) => entry.projectId === projectId),
      tasks: run.tasks.filter((task) => task.projectId === projectId),
      conflicts: run.conflicts
    });
  }

  diff(from: string, to: string) {
    return diffRuns(this.requireRun(from), this.requireRun(to));
  }

  private effectiveTagLibrary(projects = this.workspace.projects, people = this.workspace.people) {
    return extendTagLibraryWithRelationships(this.tagLibrary, projects, people);
  }

  private normalizeProjectMaintainerIds(project: Project): Project {
    const peopleByName = new Map<string, Person[]>();
    for (const person of this.workspace.people) {
      peopleByName.set(person.name, [...(peopleByName.get(person.name) ?? []), person]);
    }
    const resolve = (name: string | null | undefined) => {
      if (!name) return null;
      const matches = peopleByName.get(name) ?? [];
      return matches.length === 1 ? matches[0]!.id : null;
    };
    return {
      ...project,
      onsiteMaintainerId: project.onsiteMaintainerId ?? resolve(project.onsiteMaintainerName),
      offsiteMaintainerId: project.offsiteMaintainerId ?? resolve(project.offsiteMaintainerName)
    };
  }

  private resyncTags() {
    const tagLibrary = this.effectiveTagLibrary();
    this.workspace.projects = this.workspace.projects.map((project) => syncProjectTags(project, tagLibrary));
    this.workspace.people = this.workspace.people.map((person) => syncPersonTags(person, tagLibrary));
    this.rebuildPlanning();
  }

  private rebuildPlanning() {
    this.workspace.planningYear = createPlanningYearWorkspace({
      year: this.workspace.planningYear.year,
      projects: this.workspace.projects,
      people: this.workspace.people,
      ruleset: this.publishedRuleSet,
      currentRun: this.ruleValidationRun ?? this.workspace.currentRun,
      sampleDataRows: this.projectBatchDataRows,
      worksheetRows: this.projectBatchWorksheetRows,
      sourceFilename: this.projectBatchFilename,
      expectedOnsiteTotal: this.projectBatchExpectedOnsiteTotal,
      expectedOffsiteTotal: this.projectBatchExpectedOffsiteTotal,
      projectFrozen: this.projectFrozen,
      rosterConfirmed: this.rosterConfirmed,
      snapshotVersion: this.snapshotVersion,
      rosterVersionNumber: this.rosterVersionNumber,
      now: new Date().toISOString()
    });
    this.persistState();
  }

  private requireRun(id: string) {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run not found: ${id}`);
    return run;
  }

  private assertRunEditable(run: SchedulingRun) {
    if (!isRunLocked(run)) return;
    const latestEndDate = latestRunEndDate(run);
    throw new BadRequestException(`已超过最晚计划结束日${latestEndDate ? ` ${latestEndDate}` : ""}，排期已锁定`);
  }

  private ruleRegistryStatusLabel(status: RuleRegistryItem["status"]) {
    const labels: Record<RuleRegistryItem["status"], string> = {
      effective: "已生效",
      pending_action: "待补口径",
      pending_data: "待补数据",
      draft: "已暂存",
      simulated: "已试算，待纳入",
      manual_confirmed: "人工确认已纳入"
    };
    return labels[status];
  }

  private ruleRegistryStatusSummary(items: RuleRegistryItem[]): RuleRegistryGroup["statusSummary"] {
    return {
      total: items.length,
      effective: items.filter((item) => item.status === "effective").length,
      pendingAction: items.filter((item) => item.status === "pending_action").length,
      pendingData: items.filter((item) => item.status === "pending_data").length,
      draft: items.filter((item) => item.status === "draft").length,
      simulated: items.filter((item) => item.status === "simulated").length,
      manualConfirmed: items.filter((item) => item.status === "manual_confirmed").length
    };
  }

  private ruleRegistryGroupPrimaryStatus(items: RuleRegistryItem[]): RuleRegistryGroup["primaryStatus"] {
    const summary = this.ruleRegistryStatusSummary(items);
    if (summary.pendingData > 0) return "needs_data";
    if (summary.draft > 0 || summary.simulated > 0) return "in_progress";
    if (summary.pendingAction > 0) return "needs_action";
    return "ready";
  }

  private ruleRegistryOutcome(defaultOutcome: string, draft: RuleDecisionDraft) {
    if (!isResolvedRuleDraft(draft)) {
      return `人工确认口径：${draft.businessNote || defaultOutcome}`;
    }
    const onsite = this.registryFrequencyLabel(draft.onsite);
    const offsite = this.registryFrequencyLabel(draft.offsite);
    const note = draft.businessNote ? `；${draft.businessNote}` : "";
    return `人工确认口径：现场${onsite}，非现场${offsite}${note}`;
  }

  private registryFrequencyLabel(value: RuleDecisionDraft["onsite"]) {
    if (value.special) return value.note ?? "人工确认";
    return `${value.count ?? 0}次/${value.period === "two_years" ? "两年" : "年"}`;
  }

  private requireRuleDraft(technicalRuleId: string) {
    const draft = this.ruleDrafts.get(technicalRuleId);
    if (!draft) throw new BadRequestException("请先补充并保存口径草稿");
    return draft;
  }

  private createSimulationResult(pendingDecisionId: string, technicalRuleId: string, run: SchedulingRun): RuleSimulationResult {
    const before = this.workspace.currentRun.audit;
    const after = run.audit;
    const blockers = [
      after.ruleGap > 0 ? `仍有 ${after.ruleGap} 个待补口径` : null,
      after.hardConflicts > 0 ? `仍有 ${after.hardConflicts} 个硬冲突` : null
    ].filter((item): item is string => Boolean(item));
    return {
      id: `sim-${technicalRuleId}-${Date.now()}`,
      pendingDecisionId,
      technicalRuleId,
      runId: run.id,
      createdAt: new Date().toISOString(),
      before,
      after,
      delta: {
        ruleGap: after.ruleGap - before.ruleGap,
        onsiteTasks: after.onsiteTasks - before.onsiteTasks,
        offsiteTasks: after.offsiteTasks - before.offsiteTasks,
        hardConflicts: after.hardConflicts - before.hardConflicts,
        pendingManual: after.pendingManual - before.pendingManual
      },
      publishable: blockers.length === 0,
      blockers
    };
  }
}
