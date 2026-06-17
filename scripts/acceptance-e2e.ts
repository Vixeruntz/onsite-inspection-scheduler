import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  applyRuleDecisionDrafts,
  createAcceptanceFixture,
  createIssueBoard,
  createDecisionExplanations,
  createRuleDecisionDraft,
  createTagCoverageSummary,
  defaultRuleSet,
  generateRuleSuggestions,
  generateRun,
  overrideDecision,
  runToWorkbook,
  syncProjectTags
} from "../packages/scheduler/src/index.js";
import type { Project, SchedulingRun, TagDefinition, Task } from "@inspection/domain";

type AcceptanceCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type MatrixRow = {
  projectId: string;
  projectName: string;
  scopeRule: string;
  frequencyRule: string;
  tagCodes: string;
  onsiteTasks: number;
  offsiteTasks: number;
  issueKind: string;
  primaryAssignee: string;
  assigneeReason: string;
  publishImpact: string;
  actionTarget: string;
  result: string;
};

type EffectivenessRow = {
  projectId: string;
  projectName: string;
  projectTags: string[];
  hitRule: string;
  expectedOnsiteTasks: number | null;
  expectedOffsiteTasks: number | null;
  actualOnsiteTasks: number;
  actualOffsiteTasks: number;
  assignee: string;
  assigneeBasis: string;
  pendingType: string;
  finalOutput: string;
  exportResult: string;
};

const now = "2026-05-29T08:00:00.000Z";
const period = { year: 2026, scope: "full_year" as const };
const outputPath = path.resolve(process.cwd(), "outputs/acceptance-matrix.json");
const effectivenessPath = path.resolve(process.cwd(), "outputs/rule-person-tag-effectiveness.json");

const assert = (condition: boolean, detail: string) => {
  if (!condition) throw new Error(detail);
};

const frequencyLog = (run: SchedulingRun, projectId: string) =>
  run.decisionLogs.find((log) => log.projectId === projectId && log.step === "frequency");

const scopeLog = (run: SchedulingRun, projectId: string) =>
  run.decisionLogs.find((log) => log.projectId === projectId && log.step === "scope");

const assigneeLog = (run: SchedulingRun, projectId: string) =>
  run.decisionLogs.find((log) => log.projectId === projectId && log.step === "assignee");

const tasksFor = (run: SchedulingRun, projectId: string) =>
  run.tasks.filter((task) => task.projectId === projectId);

const countTasks = (run: SchedulingRun, projectId: string, checkType: Task["checkType"]) =>
  tasksFor(run, projectId).filter((task) => task.checkType === checkType).length;

const tagCodesFor = (tagIds: string[] | undefined, tagLibrary: TagDefinition[]) => {
  const byId = new Map(tagLibrary.map((tag) => [tag.id, tag.code]));
  return (tagIds ?? []).map((id) => byId.get(id)).filter((code): code is string => Boolean(code)).sort();
};

const currentRuleIds = () => [...new Set(["IN-5", ...defaultRuleSet.rules.map((rule) => rule.id)])].sort();

const requiredTagCodes = [
  "customer.external",
  "customer.internal",
  "customer.collab_a",
  "risk.npl",
  "industry.energy",
  "hospital.public",
  "hospital.private",
  "biz.direct_lease",
  "biz.factoring",
  "party.group",
  "party.guarantor",
  "exposure.balance.gt_300m",
  "exposure.balance.100m_300m",
  "exposure.balance.30m_100m",
  "exposure.balance.le_30m",
  "related_party.stock.gt_3",
  "related_party.stock.le_3",
  "related_party.stock.unknown",
  "schedule.exempted",
  "schedule.manual_needed",
  "schedule.publish_blocked",
  "rule.asset_department_decides"
];

const requiredAssigneeReasons = [
  "A-1 长期负责项目",
  "A-1 长期负责集团",
  "A-1 长期负责集团缺失，需人工确认",
  "A-2 直租专员",
  "A-2 问题项目专员",
  "A-3 历史维护人",
  "A-4 负荷参考"
];

const assertCheck = (checks: AcceptanceCheck[], name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(2_500) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
};

const optionalLiveApiCheck = async (checks: AcceptanceCheck[]) => {
  const apiBase = process.env.ACCEPTANCE_API_URL ?? "http://localhost:4000";
  try {
    const workspace = await fetchJson<{
      publishCandidateRun?: SchedulingRun;
      currentRun: SchedulingRun;
      issueBoard?: {
        summary: Record<string, number>;
        issues: Array<{ kind: string; affectedProjectCount: number }>;
      };
      projects: unknown[];
      people: unknown[];
      tagCoverageSummary?: { projectTagCoverageRate: number; relationPairs: unknown[] };
    }>(`${apiBase}/workspace`);
    const candidate = workspace.publishCandidateRun ?? workspace.currentRun;
    const issues = workspace.issueBoard?.issues ?? [];
    const ruleGap = issues
      .filter((issue) => issue.kind === "rule_gap" || issue.kind === "project_data_gap")
      .reduce((sum, issue) => sum + issue.affectedProjectCount, 0);
    const manual = issues
      .filter((issue) => issue.kind === "manual_confirm")
      .reduce((sum, issue) => sum + issue.affectedProjectCount, 0);
    checks.push({
      name: "live-api-workspace",
      ok:
        workspace.projects.length > 0 &&
        workspace.people.length > 0 &&
        Boolean(candidate.id) &&
        ruleGap === candidate.audit.ruleGap &&
        manual === candidate.audit.pendingManual,
      detail: `${workspace.projects.length} projects, ${workspace.people.length} people, ruleGap=${candidate.audit.ruleGap}, pendingManual=${candidate.audit.pendingManual}`
    });
    checks.push({
      name: "live-api-tag-coverage",
      ok:
        (workspace.tagCoverageSummary?.projectTagCoverageRate ?? 0) > 0 &&
        (workspace.tagCoverageSummary?.relationPairs.length ?? 0) > 0,
      detail: `projectCoverage=${workspace.tagCoverageSummary?.projectTagCoverageRate ?? 0}%, relationPairs=${workspace.tagCoverageSummary?.relationPairs.length ?? 0}`
    });
  } catch (error) {
    checks.push({
      name: "live-api-workspace",
      ok: true,
      detail: `skipped: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

const optionalWebExportCheck = async (checks: AcceptanceCheck[]) => {
  const webBase = process.env.ACCEPTANCE_WEB_URL ?? "http://localhost:3333";
  const apiBase = process.env.ACCEPTANCE_API_URL ?? "http://localhost:4000";
  try {
    const workspace = await fetchJson<{
      publishCandidateRun?: SchedulingRun;
      currentRun: SchedulingRun;
      projects: Array<{ id: string; name: string }>;
    }>(`${apiBase}/workspace`);
    const candidate = workspace.publishCandidateRun ?? workspace.currentRun;
    const response = await fetch(`${webBase}/api/export`, { signal: AbortSignal.timeout(4_000) });
    const bytes = await response.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const summaryRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["发布摘要"]!);
    const scheduleRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["正式排期"]!);
    const summaryValue = (label: string) => Number(summaryRows.find((row) => row["项目"] === label)?.["内容"] ?? Number.NaN);
    const scheduledProjectIds = new Set(candidate.tasks.map((task) => task.projectId));
    const scheduledProjectNames = workspace.projects.filter((project) => scheduledProjectIds.has(project.id)).map((project) => project.name);
    const scheduleText = JSON.stringify(scheduleRows);
    const hasCurrentProjectName = scheduledProjectNames.length === 0 || scheduledProjectNames.some((name) => scheduleText.includes(name));
    checks.push({
      name: "live-web-export",
      ok:
        response.ok &&
        response.headers.get("content-type")?.includes("spreadsheetml.sheet") === true &&
        bytes.byteLength > 1_000 &&
        summaryValue("项目总数") === candidate.audit.inputProjects &&
        summaryValue("免检/不纳入项目") === candidate.audit.excluded &&
        summaryValue("待人工任务") === candidate.audit.pendingManual &&
        hasCurrentProjectName,
      detail:
        `${response.status} ${response.headers.get("content-type") ?? ""} ${bytes.byteLength} bytes, ` +
        `summary projects=${summaryValue("项目总数")}/${candidate.audit.inputProjects}, ` +
        `manual=${summaryValue("待人工任务")}/${candidate.audit.pendingManual}, currentNames=${hasCurrentProjectName}`
    });
  } catch (error) {
    checks.push({
      name: "live-web-export",
      ok: true,
      detail: `skipped: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

const main = async () => {
  const fixture = createAcceptanceFixture();
  const run = generateRun(period, fixture.projects, {
    people: fixture.people,
    assigneePoolMode: "sampleMaintainers",
    now
  });
  const issueBoard = createIssueBoard({ run, projects: fixture.projects });
  const coverage = createTagCoverageSummary({
    projects: fixture.projects,
    people: fixture.people,
    run,
    tagLibrary: fixture.tagLibrary
  });
  const issuesByProject = new Map(issueBoard.issues.map((issue) => [issue.projectId, issue]));

  const matrix: MatrixRow[] = fixture.projects.map((project) => {
    const tasks = tasksFor(run, project.id);
    const issue = issuesByProject.get(project.id);
    const assignee = assigneeLog(run, project.id);
    const primaryAssignee =
      assignee?.output.assigneeName ??
      tasks.find((task) => task.assigneeName)?.assigneeName ??
      "无";
    const frequencyRule = frequencyLog(run, project.id)?.ruleHit ?? "无频次任务";
    const issueKind = issue?.kind ?? "none";
    return {
      projectId: project.id,
      projectName: project.name,
      scopeRule: scopeLog(run, project.id)?.ruleHit ?? "无",
      frequencyRule,
      tagCodes: tagCodesFor(project.tagIds, fixture.tagLibrary).join("、"),
      onsiteTasks: countTasks(run, project.id, "onsite"),
      offsiteTasks: countTasks(run, project.id, "offsite"),
      issueKind,
      primaryAssignee,
      assigneeReason: assignee?.reason ?? "无",
      publishImpact:
        issueKind === "rule_gap"
          ? "规则口径待补"
          : issueKind === "project_data_gap"
            ? "项目字段待补"
            : issueKind === "manual_confirm"
              ? "人工确认提醒"
              : "不影响发布",
      actionTarget:
        issueKind === "rule_gap"
          ? "规则维护"
          : issueKind === "project_data_gap"
            ? "项目维护"
            : issueKind === "manual_confirm" || issueKind === "time_conflict"
              ? "排期方案"
              : "无",
      result: issueKind === "none" ? "通过" : "待处理"
    };
  });

  const checks: AcceptanceCheck[] = [];
  assertCheck(
    checks,
    "fixture-matrix",
    matrix.length === 24 &&
      matrix.some((row) => row.projectId === "T07" && row.frequencyRule === "P1" && row.issueKind === "rule_gap" && row.actionTarget === "规则维护") &&
      matrix.some((row) => row.projectId === "T08" && row.frequencyRule === "R3" && row.issueKind === "manual_confirm" && row.actionTarget === "排期方案") &&
      matrix.some((row) => row.projectId === "T14" && row.frequencyRule === "P5" && row.issueKind === "project_data_gap" && row.actionTarget === "项目维护") &&
      matrix.some((row) => row.projectId === "T16" && row.frequencyRule === "P4" && row.issueKind === "rule_gap" && row.actionTarget === "规则维护") &&
      matrix.some((row) => row.projectId === "T21" && row.frequencyRule === "P2" && row.issueKind === "rule_gap") &&
      matrix.some((row) => row.projectId === "T23" && row.frequencyRule === "P6" && row.issueKind === "project_data_gap") &&
      matrix.some((row) => row.projectId === "T24" && row.frequencyRule === "P7" && row.issueKind === "rule_gap"),
    `${matrix.length} project rows, issues=${issueBoard.issues.length}`
  );
  assertCheck(
    checks,
    "audit-issue-consistency",
    issueBoard.issues
      .filter((issue) => issue.kind === "rule_gap" || issue.kind === "project_data_gap")
      .reduce((sum, issue) => sum + issue.affectedProjectCount, 0) === run.audit.ruleGap &&
      issueBoard.issues
        .filter((issue) => issue.kind === "manual_confirm")
        .reduce((sum, issue) => sum + issue.affectedProjectCount, 0) === run.audit.pendingManual &&
      issueBoard.issues
        .filter((issue) => issue.kind === "time_conflict")
        .every((issue) => issue.technicalRuleId !== "P1" && issue.technicalRuleId !== "P4"),
    `audit.ruleGap=${run.audit.ruleGap}, issue.ruleGap=${issueBoard.summary.rule_gap}, issue.projectDataGap=${issueBoard.summary.project_data_gap}, pendingManual=${run.audit.pendingManual}`
  );
  assertCheck(
    checks,
    "tag-coverage",
    fixture.projects.length === 24 &&
      coverage.projectTagCoverageRate > 0 &&
      coverage.ruleHitDistribution.P1 === 1 &&
      coverage.ruleHitDistribution.P2 === 1 &&
      coverage.ruleHitDistribution.P3 === 1 &&
      coverage.ruleHitDistribution.P4 === 1 &&
      coverage.ruleHitDistribution.P5 === 1 &&
      coverage.ruleHitDistribution.P6 === 1 &&
      coverage.ruleHitDistribution.P7 === 1 &&
      matrix.find((row) => row.projectId === "T13")?.tagCodes.includes("project.group.g-large") === true,
    `projectCoverage=${coverage.projectTagCoverageRate}%, personRelationCoverage=${coverage.personRelationshipCoverageRate}%`
  );
  assertCheck(
    checks,
    "scenario-coverage",
    [
      ["免检/不纳入", ["T01", "T02", "T03"]],
      ["通用频次", ["T04", "T05", "T06", "T07"]],
      ["客户类型", ["T08", "T09", "T17", "T18"]],
      ["行业专项", ["T10", "T11", "T12", "T21", "T22"]],
      ["关系匹配", ["T13", "T15", "T19", "T20"]],
      ["数据缺口", ["T14", "T23"]],
      ["规则缺口", ["T07", "T16", "T21", "T22", "T24"]]
    ].every(([, ids]) => (ids as string[]).every((id) => matrix.some((row) => row.projectId === id))),
    "business dimensions covered by project ids T01-T24"
  );

  const manualTask = run.tasks.find((task) => task.projectId === "T08" && task.status === "manual_needed");
  assert(Boolean(manualTask), "T08 should produce a manual task");
  const skipped = overrideDecision(run, manualTask!.id, "manualDisposition", "skip", "验收：本年不安排检查");
  const reopened = overrideDecision(skipped, manualTask!.id, "manualDisposition", "reopen", "验收：重新安排检查");
  const dated = overrideDecision(reopened, manualTask!.id, "scheduledDate", "2026-08-03", "验收：补充开始日期");
  const arranged = overrideDecision(dated, manualTask!.id, "assigneeId", "qa-maintainer", "验收：补充负责人");
  assertCheck(
    checks,
    "manual-action-impact",
    skipped.audit.pendingManual === run.audit.pendingManual - 1 &&
      skipped.tasks.find((task) => task.id === manualTask!.id)?.status === "exempted" &&
      reopened.audit.pendingManual === run.audit.pendingManual &&
      arranged.tasks.find((task) => task.id === manualTask!.id)?.status === "pending" &&
      arranged.audit.pendingManual === run.audit.pendingManual - 1,
    `baseline=${run.audit.pendingManual}, skip=${skipped.audit.pendingManual}, reopen=${reopened.audit.pendingManual}, arranged=${arranged.audit.pendingManual}`
  );

  const suggestions = generateRuleSuggestions({ run, projects: fixture.projects, existingDrafts: [], now });
  assertCheck(
    checks,
    "rule-suggestions",
    suggestions.batch.summary.generatedDrafts === 2 &&
      suggestions.batch.summary.manualSuggestions === 2 &&
      suggestions.batch.summary.skipped === 3 &&
      suggestions.batch.ruleSuggestions.some((item) => item.technicalRuleId === "P1") &&
      suggestions.batch.ruleSuggestions.some((item) => item.technicalRuleId === "P4") &&
      suggestions.batch.manualSuggestions.some((item) => item.projectId === "T08") &&
      suggestions.batch.manualSuggestions.some((item) => item.projectId === "T17") &&
      ["P2", "P3", "P7"].every((ruleId) => suggestions.batch.skippedItems.some((item) => item.technicalRuleId === ruleId)),
    `drafts=${suggestions.batch.summary.generatedDrafts}, manual=${suggestions.batch.summary.manualSuggestions}, skipped=${suggestions.batch.summary.skipped ?? 0}`
  );

  const fixedProjects: Project[] = fixture.projects.map((project) =>
    project.id === "T14"
      ? syncProjectTags({ ...project, memberCount: 4, tagIds: [] }, fixture.tagLibrary)
      : project.id === "T23"
        ? syncProjectTags({ ...project, relatedPartyStockCount: 4, tagIds: [] }, fixture.tagLibrary)
        : project
  );
  const submittedDrafts = [
    createRuleDecisionDraft("P1", {
      status: "submitted",
      onsite: { count: 1, period: "two_years" },
      offsite: { count: 1, period: "year" },
      businessNote: "验收：外部小额按两年一次现场，每年一次非现场。",
      confirmerNote: "验收提交",
      submittedAt: now
    }, now),
    createRuleDecisionDraft("P2", {
      status: "submitted",
      onsite: { count: 0, period: "year" },
      offsite: { count: 1, period: "year" },
      businessNote: "验收：公立医院小额保留年度非现场检查。",
      confirmerNote: "验收提交",
      submittedAt: now
    }, now),
    createRuleDecisionDraft("P3", {
      status: "submitted",
      onsite: { count: 1, period: "year" },
      offsite: { count: 1, period: "year" },
      businessNote: "验收：民营医院沿用普通医院口径。",
      confirmerNote: "验收提交",
      submittedAt: now
    }, now),
    createRuleDecisionDraft("P4", {
      status: "submitted",
      onsite: { count: 1, period: "year" },
      offsite: { count: 1, period: "year" },
      businessNote: "验收：保理沿用中额敞口口径。",
      confirmerNote: "验收提交",
      submittedAt: now
    }, now),
    createRuleDecisionDraft("P7", {
      status: "submitted",
      onsite: { count: 1, period: "year" },
      offsite: { count: 1, period: "year" },
      businessNote: "验收：资产部酌情增减项目按确认次数执行。",
      confirmerNote: "验收提交",
      submittedAt: now
    }, now)
  ];
  const fixedRuleset = applyRuleDecisionDrafts(defaultRuleSet, submittedDrafts, "submitted");
  const publishableRun = generateRun(period, fixedProjects, {
    people: fixture.people,
    assigneePoolMode: "sampleMaintainers",
    ruleset: fixedRuleset,
    runType: "official",
    now
  });
  const publishableIssueBoard = createIssueBoard({ run: publishableRun, projects: fixedProjects, ruleDrafts: submittedDrafts });
  assertCheck(
    checks,
    "publishable-after-data-and-rule-actions",
    publishableRun.audit.publishable === true &&
      publishableRun.audit.ruleGap === 0 &&
      publishableIssueBoard.summary.rule_gap === 0 &&
      publishableIssueBoard.summary.project_data_gap === 0 &&
      publishableRun.audit.pendingManual > 0,
    `publishable=${publishableRun.audit.publishable}, ruleGap=${publishableRun.audit.ruleGap}, pendingManual=${publishableRun.audit.pendingManual}`
  );
  assertCheck(
    checks,
    "decision-chain-readability",
    fixedProjects
      .filter((project) => scopeLog(publishableRun, project.id)?.result !== "excluded")
      .every((project) =>
        createDecisionExplanations({
          project,
          logs: publishableRun.decisionLogs.filter((log) => log.projectId === project.id),
          tasks: tasksFor(publishableRun, project.id),
          conflicts: publishableRun.conflicts
        }).every((item) => item.businessQuestion && item.businessAnswer && item.trace.rawLog.projectId === project.id)
      ),
    "all in-scope projects expose business-readable decision explanations"
  );

  const workbook = runToWorkbook(run, { projects: fixture.projects });
  const summaryRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["发布摘要"]!);
  const scheduleRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["正式排期"]!);
  const issueRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["异常与待人工"]!);
  const traceRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["审计留痕"]!);
  assertCheck(
    checks,
    "workbook-consistency",
    summaryRows.find((row) => row.项目 === "项目总数")?.内容 === 24 &&
      summaryRows.find((row) => row.项目 === "待人工任务")?.内容 === run.audit.pendingManual &&
      scheduleRows.some((row) => row.项目编号 === "T08" && row.任务状态 === "待人工确认") &&
      scheduleRows.some((row) => row.项目编号 === "T17" && row.任务状态 === "待人工确认") &&
      issueRows.some((row) => row.项目编号 === "T08") &&
      traceRows.some((row) => row.项目编号 === "T16" && String(row.命中规则).includes("保理")) &&
      traceRows.some((row) => row.项目编号 === "T24" && String(row.命中规则).includes("资产部负责人酌情增减")),
    `summary=${summaryRows.length}, schedule=${scheduleRows.length}, issues=${issueRows.length}, trace=${traceRows.length}`
  );

  const scheduleText = JSON.stringify(scheduleRows);
  const issueText = JSON.stringify(issueRows);
  const traceText = JSON.stringify(traceRows);
  const effectivenessRows: EffectivenessRow[] = fixture.projects.map((project) => {
    const issue = issuesByProject.get(project.id);
    const tasks = tasksFor(run, project.id);
    const ruleId = frequencyLog(run, project.id)?.ruleHit ?? scopeLog(run, project.id)?.ruleHit ?? "无";
    const finalOutput =
      issue?.kind ??
      (scopeLog(run, project.id)?.result === "excluded"
        ? "免检/不纳入"
        : tasks.some((task) => task.status === "manual_needed" || task.status === "unplaceable")
          ? "待人工确认"
          : tasks.length > 0
            ? "已生成排期任务"
            : "仅审计留痕");
    const exportResult = [
      scheduleText.includes(project.id) ? "正式排期" : "",
      issueText.includes(project.id) ? "异常与待人工" : "",
      traceText.includes(project.id) ? "审计留痕" : ""
    ].filter(Boolean).join("、") || "未进入导出";
    return {
      projectId: project.id,
      projectName: project.name,
      projectTags: tagCodesFor(project.tagIds, fixture.tagLibrary),
      hitRule: ruleId,
      expectedOnsiteTasks: project.expectedOnsiteCount ?? null,
      expectedOffsiteTasks: project.expectedOffsiteCount ?? null,
      actualOnsiteTasks: countTasks(run, project.id, "onsite"),
      actualOffsiteTasks: countTasks(run, project.id, "offsite"),
      assignee: assigneeLog(run, project.id)?.output.assigneeName ?? tasks.find((task) => task.assigneeName)?.assigneeName ?? "无",
      assigneeBasis: assigneeLog(run, project.id)?.reason ?? "无",
      pendingType: issue?.kind ?? "none",
      finalOutput,
      exportResult
    };
  });
  const coveredRuleIds = new Set(matrix.flatMap((row) => [row.scopeRule, row.frequencyRule]).filter((ruleId) => ruleId !== "无频次任务" && ruleId !== "无"));
  const missingRuleIds = currentRuleIds().filter((ruleId) => !coveredRuleIds.has(ruleId));
  const coveredTagCodes = new Set(effectivenessRows.flatMap((row) => row.projectTags));
  const missingTagCodes = requiredTagCodes.filter((code) => !coveredTagCodes.has(code));
  const coveredAssigneeReasons = new Set(effectivenessRows.map((row) => row.assigneeBasis));
  const missingAssigneeReasons = requiredAssigneeReasons.filter((reason) => !coveredAssigneeReasons.has(reason));

  assertCheck(
    checks,
    "rule-person-tag-effectiveness",
    missingRuleIds.length === 0 &&
      missingTagCodes.length === 0 &&
      missingAssigneeReasons.length === 0 &&
      effectivenessRows.every((row) => row.exportResult !== "未进入导出") &&
      effectivenessRows.some((row) => row.projectId === "T18" && row.assigneeBasis === "A-2 问题项目专员" && row.actualOnsiteTasks === 2) &&
      effectivenessRows.some((row) => row.projectId === "T24" && row.hitRule === "P7" && row.pendingType === "rule_gap"),
    `missingRules=${missingRuleIds.join("、") || "无"}, missingTags=${missingTagCodes.join("、") || "无"}, missingAssigneeReasons=${missingAssigneeReasons.join("、") || "无"}`
  );

  await optionalLiveApiCheck(checks);
  await optionalWebExportCheck(checks);

  const failed = checks.filter((check) => !check.ok);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        period,
        checks,
        audit: run.audit,
        publishableAudit: publishableRun.audit,
        issueSummary: issueBoard.summary,
        publishableIssueSummary: publishableIssueBoard.summary,
        matrix
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    effectivenessPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        period,
        checks: checks.filter((check) => check.name === "rule-person-tag-effectiveness"),
        ruleCoverage: {
          required: currentRuleIds(),
          covered: [...coveredRuleIds].sort(),
          missing: missingRuleIds
        },
        projectTagCoverage: {
          required: requiredTagCodes,
          missing: missingTagCodes
        },
        personAttributeCoverage: {
          requiredAssigneeReasons,
          missing: missingAssigneeReasons
        },
        rows: effectivenessRows
      },
      null,
      2
    )}\n`
  );

  console.table(matrix);
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  console.log(`Acceptance matrix written to ${outputPath}`);
  console.log(`Rule/person/tag effectiveness matrix written to ${effectivenessPath}`);
  if (failed.length > 0) {
    throw new Error(`${failed.length} acceptance checks failed: ${failed.map((check) => check.name).join(", ")}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
