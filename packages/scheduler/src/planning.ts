import type {
  AssigneePoolMode,
  DataQualityIssue,
  Person,
  PlanningYearWorkspace,
  Project,
  ProjectChangeItem,
  ProjectChangeSet,
  ProjectInputBatch,
  ReadinessGate,
  RosterVersion,
  RuleReadinessReport,
  RuleSet,
  SchedulingRun
} from "@inspection/domain";

type PlanningWorkspaceOptions = {
  year: number;
  projects: Project[];
  people: Person[];
  ruleset: RuleSet;
  currentRun: SchedulingRun;
  sampleDataRows?: number;
  worksheetRows?: number;
  sourceFilename?: string;
  poolMode?: AssigneePoolMode;
  expectedOnsiteTotal?: number;
  expectedOffsiteTotal?: number;
  projectFrozen?: boolean;
  rosterConfirmed?: boolean;
  snapshotVersion?: number;
  rosterVersionNumber?: number;
  now?: string;
};

const planningRuleGapIds = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"] as const;
const defaultNow = "2026-05-29T08:00:00.000Z";

const countPeopleForPool = (people: Person[], poolMode: AssigneePoolMode) =>
  people.filter((person) => person.isActive && person.pool.includes(poolMode)).length;

const stockCountAffectsFrequency = (project: Project) =>
  (project.partyType === "group" || project.partyType === "guarantor") &&
  project.exposureBalance > 0 &&
  !project.isSettledThisYear &&
  !project.isNewWithin1y &&
  !project.isWarning &&
  !project.isNpl &&
  project.customerType !== "internal" &&
  project.customerType !== "collab_a" &&
  project.industry !== "energy" &&
  !project.hospitalType &&
  project.bizType !== "factoring";

const projectDataIssues = (projects: Project[]): DataQualityIssue[] => {
  const issues: DataQualityIssue[] = [];
  const missingRequired = projects.filter((project) => !project.name || !project.dept || !project.creditStart || !project.creditEnd);
  if (missingRequired.length) {
    issues.push({
      id: "project-required-fields",
      scope: "project",
      severity: "block",
      title: "项目必填字段缺失",
      message: `${missingRequired.length} 个项目缺少名称、部门或授信日期，不能冻结年度项目池。`,
      field: null,
      recordId: null,
      suggestedAction: "补齐字段后重新校验"
    });
  }

  const energyNeedsReview = projects.filter(
    (project) =>
      project.industry === "energy" &&
      project.exposureBalance <= 300_000_000 &&
      (project.gridConnected === null || project.accountMonitored === null || project.repayClean3y === null)
  );
  if (energyNeedsReview.length) {
    issues.push({
      id: "project-energy-exemption-fields",
      scope: "project",
      severity: "warn",
      title: "能源环保豁免字段待确认",
      message: `${energyNeedsReview.length} 个能源环保项目缺少并网、账户监管或近三年还款字段，可能影响 R5 命中。`,
      field: "gridConnected/accountMonitored/repayClean3y",
      recordId: energyNeedsReview[0]?.id ?? null,
      suggestedAction: "在项目维护页补充字段或转人工标注"
    });
  }

  const seenNames = new Set<string>();
  const duplicateNames = new Set<string>();
  for (const project of projects) {
    if (seenNames.has(project.name)) duplicateNames.add(project.name);
    seenNames.add(project.name);
  }
  if (duplicateNames.size) {
    issues.push({
      id: "project-duplicate-name",
      scope: "project",
      severity: "warn",
      title: "疑似重复项目",
      message: `${duplicateNames.size} 个项目名称重复，需要在差异确认时核对。`,
      field: "name",
      recordId: null,
      suggestedAction: "合并或保留为不同融资主体"
    });
  }

  const groupMemberCountMissing = projects.filter(
    (project) => project.partyType === "group" && stockCountAffectsFrequency(project) && (project.memberCount === null || project.memberCount === undefined)
  );
  if (groupMemberCountMissing.length) {
    issues.push({
      id: "project-group-member-count-missing",
      scope: "project",
      severity: "block",
      title: "集团旗下存量客户数缺失",
      message: `${groupMemberCountMissing.length} 个集团检查对象缺少 member_count（旗下我司存量客户数），无法判断 R8/R9 频次。`,
      field: "memberCount",
      recordId: groupMemberCountMissing[0]?.id ?? null,
      suggestedAction: "在项目维护页补齐集团旗下存量客户数"
    });
  }

  const relatedPartyMissing = projects.filter(
    (project) => project.partyType === "guarantor" && stockCountAffectsFrequency(project) && (project.relatedPartyStockCount === null || project.relatedPartyStockCount === undefined)
  );
  if (relatedPartyMissing.length) {
    issues.push({
      id: "project-related-party-stock-missing",
      scope: "project",
      severity: "block",
      title: "担保人/母公司旗下存量客户数缺失",
      message: `${relatedPartyMissing.length} 个担保人、实控人或母公司检查对象缺少旗下存量客户数，无法判断 R13/R14 频次。`,
      field: "relatedPartyStockCount",
      recordId: relatedPartyMissing[0]?.id ?? null,
      suggestedAction: "在项目维护页补齐担保人/母公司旗下存量客户数"
    });
  }

  return issues;
};

const rosterIssues = (people: Person[], poolMode: AssigneePoolMode): DataQualityIssue[] => {
  const activePeople = countPeopleForPool(people, poolMode);
  if (activePeople === 0) {
    return [
      {
        id: "roster-empty-pool",
        scope: "person",
        severity: "block",
        title: "可用人员池为空",
        message: "当前人员池没有可分派人员，不能生成排期。",
        field: "pool",
        recordId: null,
        suggestedAction: "确认人员版本或切换人员池模式"
      }
    ];
  }
  return [];
};

const ruleIssues = (run: SchedulingRun): DataQualityIssue[] => {
  const issues: DataQualityIssue[] = [];
  if (run.audit.ruleGap > 0) {
    issues.push({
      id: "rules-rule-gap",
      scope: "rule",
      severity: "block",
      title: "待补全业务口径",
      message: `${run.audit.ruleGap} 个项目命中制度写明“以资产管理部要求为准”或尚未量化的检查口径，正式发布前必须补全业务规则。`,
      field: "frequency",
      recordId: null,
      suggestedAction: "进入规则维护页，在“制度依据”中确认业务口径并配置量化次数"
    });
  }
  if (run.audit.pendingManual > 0) {
    issues.push({
      id: "rules-manual-needed",
      scope: "rule",
      severity: "warn",
      title: "存在待人工项",
      message: `${run.audit.pendingManual} 个任务可生成草案，但需要人工确认人员、次数或时间。`,
      field: null,
      recordId: null,
      suggestedAction: "发布前在排期方案中处理待人工项"
    });
  }
  return issues;
};

const buildProjectBatch = (options: PlanningWorkspaceOptions): ProjectInputBatch => {
  const dataRows = options.sampleDataRows ?? options.projects.length;
  return {
    id: `batch-${options.year}-sample`,
    year: options.year,
    filename: options.sourceFilename ?? "1、2026（资产部）授信检查计划（样表）.xlsx",
    source: "sample_xlsx",
    status: "validated",
    worksheetRows: options.worksheetRows ?? dataRows + 1,
    dataRows,
    normalizedRows: dataRows,
    importedBy: "system",
    importedAt: options.now ?? defaultNow,
    regressionBaseline: {
      onsiteExpectedTotal: options.expectedOnsiteTotal ?? options.currentRun.audit.onsiteTasks,
      offsiteExpectedTotal: options.expectedOffsiteTotal ?? options.currentRun.audit.offsiteTasks
    }
  };
};

const buildProjectChanges = (options: PlanningWorkspaceOptions, batch: ProjectInputBatch, issues: DataQualityIssue[]): ProjectChangeSet => {
  const hasBlock = issues.some((issue) => issue.severity === "block");
  const frozen = (options.projectFrozen ?? true) && !hasBlock;
  const representativeItems: ProjectChangeItem[] = options.projects.slice(0, 6).map((project, index) => ({
    id: `change-${options.year}-${project.id}`,
    projectId: project.id,
    projectName: project.name,
    type: index < 4 ? "added" : "changed",
    field: index < 4 ? null : "exposureBalance",
    before: index < 4 ? null : Math.round(project.exposureBalance * 0.94),
    after: index < 4 ? null : project.exposureBalance,
    severity: hasBlock ? "block" : index === 5 ? "warn" : "info",
    status: hasBlock ? "needs_fix" : frozen ? "in_pool" : "validated"
  }));

  return {
    id: `changeset-${options.year}-sample`,
    year: options.year,
    baseSnapshotId: null,
    importBatchId: batch.id,
    added: batch.dataRows,
    changed: Math.min(12, Math.max(0, Math.round(batch.dataRows * 0.04))),
    removed: 0,
    duplicateSuspects: issues.some((issue) => issue.id === "project-duplicate-name") ? 1 : 0,
    reviewed: frozen,
    frozenAt: frozen ? options.now ?? defaultNow : null,
    snapshotId: frozen ? `snapshot-${options.year}-sample-v${options.snapshotVersion ?? 1}` : null,
    items: representativeItems,
    issues
  };
};

const buildRosterVersion = (options: PlanningWorkspaceOptions): RosterVersion => {
  const poolMode = options.poolMode ?? "asset7";
  const issues = rosterIssues(options.people, poolMode);
  const confirmed = (options.rosterConfirmed ?? true) && !issues.some((issue) => issue.severity === "block");
  return {
    id: `roster-${options.year}-${poolMode}-v1`,
    year: options.year,
    version: `${options.year}.asset-people.v${options.rosterVersionNumber ?? 1}`,
    status: confirmed ? "confirmed" : "draft",
    poolMode,
    activePeople: countPeopleForPool(options.people, poolMode),
    totalPeople: options.people.length,
    effectiveFrom: `${options.year}-01-01`,
    effectiveTo: `${options.year}-12-31`,
    confirmedBy: confirmed ? "system" : null,
    confirmedAt: confirmed ? options.now ?? defaultNow : null,
    issues
  };
};

const buildRuleReport = (options: PlanningWorkspaceOptions): RuleReadinessReport => {
  const ruleIssuesForRun = ruleIssues(options.currentRun);
  const pGapCount = Object.entries(options.currentRun.audit.ruleHitDistribution)
    .filter(([ruleId]) => planningRuleGapIds.includes(ruleId as (typeof planningRuleGapIds)[number]))
    .reduce((total, [, count]) => total + count, 0);
  const covered = Math.max(0, options.currentRun.audit.inputProjects - options.currentRun.audit.ruleGap);
  const coverageRate = options.currentRun.audit.inputProjects ? Math.round((covered / options.currentRun.audit.inputProjects) * 1000) / 10 : 0;

  return {
    rulesetVersion: options.ruleset.version,
    status: ruleIssuesForRun.some((issue) => issue.severity === "block") ? "blocked" : "ready",
    coverageRate,
    ruleGap: options.currentRun.audit.ruleGap,
    pGapCount,
    draftFromVersion: options.ruleset.version,
    whatIfRunId: options.currentRun.id,
    lastCheckedAt: options.now ?? defaultNow,
    issues: ruleIssuesForRun
  };
};

const gate = (input: Omit<ReadinessGate, "updatedAt">, now: string): ReadinessGate => ({
  ...input,
  updatedAt: now
});

export const createPlanningYearWorkspace = (options: PlanningWorkspaceOptions): PlanningYearWorkspace => {
  const now = options.now ?? defaultNow;
  const projectIssuesForWorkspace = projectDataIssues(options.projects);
  const projectBatch = buildProjectBatch({ ...options, now });
  const projectChangeSet = buildProjectChanges({ ...options, now }, projectBatch, projectIssuesForWorkspace);
  const rosterVersion = buildRosterVersion({ ...options, now });
  const ruleReport = buildRuleReport({ ...options, now });
  const projectPassed = Boolean(projectChangeSet.reviewed && projectChangeSet.snapshotId);
  const peoplePassed = rosterVersion.status === "confirmed";
  const projectValid = !projectChangeSet.issues.some((issue) => issue.severity === "block");
  const peopleValid = !rosterVersion.issues.some((issue) => issue.severity === "block");
  const rulesPassed = ruleReport.status === "ready";
  const readiness = [
    gate(
      {
        key: "projects",
        label: "项目信息",
        status: projectPassed ? "ready" : projectValid ? "needs_attention" : "blocked",
        passed: projectPassed,
        summary: projectPassed
          ? `已导入 ${projectBatch.dataRows} 条并冻结年度项目池`
          : projectValid ? "项目已维护，需重新冻结年度项目池" : "年度项目池尚未冻结",
        issues: projectChangeSet.issues
      },
      now
    ),
    gate(
      {
        key: "people",
        label: "人员信息",
        status: peoplePassed ? "ready" : peopleValid ? "needs_attention" : "blocked",
        passed: peoplePassed,
        summary: peoplePassed
          ? `${rosterVersion.activePeople} 名可用人员，${rosterVersion.poolMode} 场景已确认`
          : peopleValid ? "人员版本已有维护，需重新确认" : "人员版本尚未确认",
        issues: rosterVersion.issues
      },
      now
    ),
    gate(
      {
        key: "rules",
        label: "排期规则",
        status: rulesPassed ? "ready" : "blocked",
        passed: rulesPassed,
        summary: rulesPassed
          ? `规则覆盖率 ${ruleReport.coverageRate}%`
          : `${ruleReport.ruleGap} 个待补全业务口径阻断正式发布`,
        issues: ruleReport.issues
      },
      now
    )
  ] satisfies ReadinessGate[];

  return {
    year: options.year,
    periodLabel: `${options.year} 全年`,
    projectBatch,
    projectChangeSet,
    rosterVersion,
    ruleset: options.ruleset,
    ruleReport,
    readiness,
    canGenerateSandbox: projectValid && peopleValid,
    canGenerateOfficial: projectPassed && peoplePassed && rulesPassed,
    activeSnapshotId: projectChangeSet.snapshotId,
    currentRunId: options.currentRun.id
  };
};
