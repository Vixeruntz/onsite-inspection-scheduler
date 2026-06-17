import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { FrequencyValue, Project, RuleDecisionDraft, RuleSuggestionBatch, SchedulingRun, Task } from "@inspection/domain";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

type WorkspaceSummary = {
  projects: Project[];
  people: Array<{ id: string; name: string; longTermGroupIds: string[]; longTermProjectIds: string[]; specialTags: string[] }>;
  currentRun: SchedulingRun;
  publishCandidateRun?: SchedulingRun;
  officialRuns?: SchedulingRun[];
  planningYear: {
    canGenerateOfficial: boolean;
    rosterVersion: { poolMode: string };
    readiness: Array<{ key: string; status: string }>;
    projectChangeSet?: { issues: Array<{ id: string; field: string | null; recordId: string | null; title: string }> };
  };
  ruleDrafts: RuleDecisionDraft[];
  issueBoard?: {
    summary: Record<string, number>;
    issues: Array<{ id: string; kind: string; projectId: string | null; taskId: string | null; technicalRuleId: string | null; affectedProjectCount: number }>;
  };
  tagCoverageSummary?: {
    projectTagCoverageRate: number;
    personRelationshipCoverageRate: number;
    relationPairs: unknown[];
    ruleHitDistribution: Record<string, number>;
  };
};

type EffectivenessSummary = {
  requiredRules: string[];
  coveredRules: string[];
  missingRules: string[];
  assigneeReasons: string[];
  missingAssigneeReasons: string[];
  exportProjects: number;
  exportManualTasks: number;
};

const apiBase = process.env.ACCEPTANCE_API_URL ?? "http://localhost:4000";
const webBase = process.env.ACCEPTANCE_WEB_URL ?? "http://localhost:3333";
const outputDir = path.resolve("outputs");
const workbookPath = path.join(outputDir, "端到端测试数据包.xlsx");
const outputPath = path.join(outputDir, "live-e2e-result.json");

const checks: Check[] = [];

const record = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

const fail = (message: string): never => {
  throw new Error(message);
};

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} returned ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body as T;
};

const workspace = () => json<WorkspaceSummary>(`${apiBase}/workspace`);

const candidateRun = (summary: WorkspaceSummary) => summary.publishCandidateRun ?? summary.currentRun;

const importProjects = async () => {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`缺少 ${workbookPath}，请先运行 npm run data:test`);
  }
  const bytes = fs.readFileSync(workbookPath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "端到端测试数据包.xlsx"
  );
  return json<{ importedProjects: number }>(`${apiBase}/planning-years/2026/projects/import`, {
    method: "POST",
    body: form
  });
};

const saveRuleDraft = async (
  ruleId: string,
  onsite: FrequencyValue,
  offsite: FrequencyValue,
  businessNote: string
) =>
  json<RuleDecisionDraft>(`${apiBase}/rules/pending-decisions/${ruleId}/draft`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      onsite,
      offsite,
      businessNote,
      confirmerNote: "上线验收：业务口径确认"
    })
  });

const simulateAndSubmit = async (ruleId: string) => {
  await json<unknown>(`${apiBase}/rules/pending-decisions/${ruleId}/what-if`, { method: "POST" });
  return json<unknown>(`${apiBase}/rules/pending-decisions/${ruleId}/submit`, { method: "POST" });
};

const overrideTask = async (runId: string, taskId: string, field: "assigneeId" | "scheduledDate" | "manualDisposition", value: string | null, reason: string) =>
  json<SchedulingRun>(`${apiBase}/runs/${runId}/tasks/${taskId}/override`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ field, value, reason })
  });

const updateProject = async (id: string, body: Partial<Project>) =>
  json<Project>(`${apiBase}/projects/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

const requiredPeople = [
  {
    id: "qa-project-owner",
    name: "陈启明",
    specialTags: [],
    longTermGroupIds: [],
    longTermProjectIds: ["T04"]
  },
  {
    id: "qa-live-group-owner",
    name: "周闻达",
    specialTags: ["集团客户检查能力"],
    longTermGroupIds: ["G-LARGE", "G-MOTHER"],
    longTermProjectIds: []
  },
  {
    id: "qa-npl-specialist",
    name: "赵明川",
    specialTags: ["问题项目专员"],
    longTermGroupIds: [],
    longTermProjectIds: []
  },
  {
    id: "qa-direct-specialist",
    name: "沈嘉宁",
    specialTags: ["直租专员"],
    longTermGroupIds: [],
    longTermProjectIds: []
  },
  {
    id: "qa-maintainer",
    name: "李思远",
    specialTags: [],
    longTermGroupIds: [],
    longTermProjectIds: []
  },
  {
    id: "qa-load-balance",
    name: "王亦然",
    specialTags: [],
    longTermGroupIds: [],
    longTermProjectIds: []
  }
];

const upsertRequiredPeople = async (summary: WorkspaceSummary) => {
  for (const person of requiredPeople) {
    const body = {
      ...person,
      baseCity: "深圳",
      dept: "资产管理部",
      isActive: true,
      activeFrom: null,
      activeTo: null,
      pool: ["sampleMaintainers", "asset7", "all26"],
      responsibilityRoles: ["asset_management_owner", "report_owner", "rectification_owner"],
      annualOnsiteWeekCapacity: 44,
      monthlyOnsiteLimit: 4,
      offsiteTaskCapacity: 36,
      unavailableMonths: []
    };
    const exists = summary.people.some((item) => item.id === person.id);
    await json<unknown>(`${apiBase}/people${exists ? `/${person.id}` : ""}`, {
      method: exists ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }
};

const summaryValue = (rows: Array<Record<string, string | number>>, label: string) =>
  Number(rows.find((row) => row["项目"] === label)?.["内容"] ?? Number.NaN);

const ruleIdsFrom = (run: SchedulingRun) =>
  run.decisionLogs
    .filter((log) => (log.step === "scope" || log.step === "frequency") && Boolean(log.ruleHit))
    .map((log) => log.ruleHit!);

const requiredRules = [
  "IN-1", "IN-2", "IN-3", "IN-5",
  "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12", "R13", "R14",
  "P1", "P2", "P3", "P4", "P5", "P6", "P7"
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

const dataGapRuleIdsFromWorkspace = (summary: WorkspaceSummary) => {
  const issues = summary.planningYear.projectChangeSet?.issues ?? [];
  const rules = new Set<string>();
  if (issues.some((issue) => issue.field === "memberCount")) rules.add("P5");
  if (issues.some((issue) => issue.field === "relatedPartyStockCount")) rules.add("P6");
  return rules;
};

const main = async () => {
  await workspace();
  record("api-available", true, apiBase);

  const imported = await importProjects();
  record("project-import", imported.importedProjects === 50, `${imported.importedProjects} projects imported`);

  let current = await workspace();
  await upsertRequiredPeople(current);
  await json<unknown>(`${apiBase}/planning-years/2026/projects/freeze`, { method: "POST" });
  await json<unknown>(`${apiBase}/planning-years/2026/people/versions/confirm`, { method: "POST" });
  current = await workspace();
  record(
    "data-preparation",
    current.projects.length === 50 &&
      current.planningYear.readiness.some((gate) => gate.key === "people" && gate.status === "ready"),
    `${current.projects.length} projects, readiness=${current.planningYear.readiness.map((gate) => `${gate.key}:${gate.status}`).join(",")}`
  );

  const relationPerson = current.people.find((person) => person.longTermGroupIds.includes("G-LARGE"));
  record("person-relation-tags", Boolean(relationPerson), relationPerson ? `${relationPerson.name} owns G-LARGE` : "missing long-term group owner");
  record(
    "tag-coverage",
    (current.tagCoverageSummary?.projectTagCoverageRate ?? 0) > 0 &&
      (current.tagCoverageSummary?.relationPairs.length ?? 0) > 0,
    `projectCoverage=${current.tagCoverageSummary?.projectTagCoverageRate ?? 0}, relations=${current.tagCoverageSummary?.relationPairs.length ?? 0}`
  );

  const beforeRules = candidateRun(current);
  const initialRuleGap = beforeRules.audit.ruleGap;
  const initialRuleIds = new Set([...ruleIdsFrom(beforeRules), ...dataGapRuleIdsFromWorkspace(current)]);
  record(
    "initial-issues",
    dataGapRuleIdsFromWorkspace(current).has("P5") &&
      dataGapRuleIdsFromWorkspace(current).has("P6"),
    `ruleGap=${initialRuleGap}, pendingManual=${beforeRules.audit.pendingManual}, dataGapRules=${[...dataGapRuleIdsFromWorkspace(current)].join(",")}`
  );

  const suggestions = await json<RuleSuggestionBatch>(`${apiBase}/rules/suggestions/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "current_run", apply: true })
  });
  record(
    "rule-suggestions-generated",
    (initialRuleGap === 0 || suggestions.summary.generatedDrafts + suggestions.summary.skipped >= 1) &&
      suggestions.manualSuggestions.length >= 1,
    `drafts=${suggestions.summary.generatedDrafts}, manual=${suggestions.summary.manualSuggestions}, skipped=${suggestions.summary.skipped}`
  );

  const ruleDraftInputs: Array<[string, FrequencyValue, FrequencyValue, string]> = [
    ["P1", { count: 1, period: "two_years" }, { count: 1, period: "year" }, "上线验收：外部/协同B小额按两年一次现场、每年一次非现场。"],
    ["P2", { count: 0, period: "year" }, { count: 1, period: "year" }, "上线验收：公立医院小额保留年度非现场检查。"],
    ["P3", { count: 1, period: "year" }, { count: 1, period: "year" }, "上线验收：民营医院沿用普通医院口径。"],
    ["P4", { count: 2, period: "year" }, { count: 1, period: "year" }, "上线验收：保理业务统一按较高可比敞口口径执行。"],
    ["P7", { count: 1, period: "year" }, { count: 1, period: "year" }, "上线验收：资产部酌情增减项目按确认次数执行。"]
  ];
  for (const [ruleId, onsite, offsite, businessNote] of ruleDraftInputs) {
    await saveRuleDraft(ruleId, onsite, offsite, businessNote);
    await simulateAndSubmit(ruleId);
  }
  await updateProject("T14", { memberCount: 4 });
  await updateProject("T40", { relatedPartyStockCount: 4 });
  await json<unknown>(`${apiBase}/planning-years/2026/projects/freeze`, { method: "POST" });
  await json<unknown>(`${apiBase}/planning-years/2026/people/versions/confirm`, { method: "POST" });
  await simulateAndSubmit("P7");
  current = await workspace();
  const afterRules = candidateRun(current);
  record(
    "rule-maintenance-impact",
    afterRules.audit.ruleGap <= initialRuleGap &&
      afterRules.audit.ruleGap === 0 &&
      (current.issueBoard?.summary.rule_gap ?? 0) === 0 &&
      (current.issueBoard?.summary.project_data_gap ?? 0) === 0,
    `ruleGap ${initialRuleGap} -> ${afterRules.audit.ruleGap}, board.rule_gap=${current.issueBoard?.summary.rule_gap ?? 0}, board.project_data_gap=${current.issueBoard?.summary.project_data_gap ?? 0}`
  );

  const generated = await json<SchedulingRun>(`${apiBase}/planning-years/2026/runs/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runType: "official", assigneePoolMode: current.planningYear.rosterVersion.poolMode })
  });
  record("official-run-generated", generated.runType === "official" && generated.tasks.length > 0, `${generated.id}, tasks=${generated.tasks.length}`);

  const manualTask = generated.tasks.find((task) => task.status === "manual_needed") ?? fail("official run should include at least one manual task");
  const skipped = await overrideTask(generated.id, manualTask.id, "manualDisposition", "skip", "上线验收：本年不安排检查");
  const reopened = await overrideTask(generated.id, manualTask.id, "manualDisposition", "reopen", "上线验收：重新安排检查");
  const dated = await overrideTask(generated.id, manualTask.id, "scheduledDate", "2026-08-03", "上线验收：补充开始日期");
  const assigneeId = generated.tasks.find((task) => task.assigneeId)?.assigneeId ?? current.people[0]?.id ?? fail("missing assignee");
  const arranged = await overrideTask(generated.id, manualTask.id, "assigneeId", assigneeId, "上线验收：补充负责人");
  const arrangedTask = arranged.tasks.find((task) => task.id === manualTask.id);
  record(
    "manual-task-actions-impact",
    skipped.audit.pendingManual < generated.audit.pendingManual &&
      reopened.audit.pendingManual === generated.audit.pendingManual &&
      dated.tasks.find((task) => task.id === manualTask.id)?.status === "manual_needed" &&
      arrangedTask?.status === "pending" &&
      arranged.audit.pendingManual < generated.audit.pendingManual,
    `baseline=${generated.audit.pendingManual}, skip=${skipped.audit.pendingManual}, reopen=${reopened.audit.pendingManual}, arranged=${arranged.audit.pendingManual}`
  );

  const chain = await json<unknown[]>(`${apiBase}/runs/${generated.id}/projects/${manualTask.projectId}/decision-chain`);
  record("decision-chain", chain.length >= 2, `${manualTask.projectId} explanations=${chain.length}`);

  const archived = await json<SchedulingRun>(`${apiBase}/runs/${generated.id}/archive`, { method: "POST" });
  const officialRuns = await json<SchedulingRun[]>(`${apiBase}/runs?runType=official`);
  record(
    "official-archive",
    archived.status === "archived" && officialRuns.some((run) => run.id === generated.id && run.status === "archived"),
    `${generated.id} status=${archived.status}, officialRuns=${officialRuns.length}`
  );

  const exportWorkspace = await workspace();
  const exportCandidate = candidateRun(exportWorkspace);
  const exportResponse = await fetch(`${webBase}/api/export`, { signal: AbortSignal.timeout(12_000) });
  const exportBytes = await exportResponse.arrayBuffer();
  const workbook = XLSX.read(exportBytes, { type: "array" });
  const summaryRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["发布摘要"]!);
  const scheduleRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["正式排期"]!);
  record(
    "export-current-workspace",
    exportResponse.ok &&
      summaryValue(summaryRows, "项目总数") === 50 &&
      summaryValue(summaryRows, "待人工任务") === exportCandidate.audit.pendingManual &&
      JSON.stringify(scheduleRows).includes("测试项目"),
    `status=${exportResponse.status}, projects=${summaryValue(summaryRows, "项目总数")}, manual=${summaryValue(summaryRows, "待人工任务")}/${exportCandidate.audit.pendingManual}, rows=${scheduleRows.length}`
  );

  const coveredRules = [...new Set([...initialRuleIds, ...ruleIdsFrom(generated), ...ruleIdsFrom(exportCandidate)])].sort();
  const missingRules = requiredRules.filter((ruleId) => !coveredRules.includes(ruleId));
  const assigneeReasons = [
    ...new Set(
      generated.decisionLogs
        .filter((log) => log.step === "assignee")
        .map((log) => log.reason)
    )
  ].sort();
  const missingAssigneeReasons = requiredAssigneeReasons.filter((reason) => !assigneeReasons.includes(reason));
  const effectivenessSummary: EffectivenessSummary = {
    requiredRules,
    coveredRules,
    missingRules,
    assigneeReasons,
    missingAssigneeReasons,
    exportProjects: summaryValue(summaryRows, "项目总数"),
    exportManualTasks: summaryValue(summaryRows, "待人工任务")
  };
  record(
    "rule-person-tag-effectiveness-live",
    missingRules.length === 0 &&
      missingAssigneeReasons.length === 0 &&
      summaryValue(summaryRows, "项目总数") === 50 &&
      JSON.stringify(scheduleRows).includes("测试项目"),
    `missingRules=${missingRules.join(",") || "none"}, missingAssigneeReasons=${missingAssigneeReasons.join(",") || "none"}`
  );

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apiBase,
        webBase,
        checks,
        officialRunId: generated.id,
        manualTaskId: manualTask.id,
        finalAudit: arranged.audit,
        effectivenessSummary
      },
      null,
      2
    )}\n`
  );
  console.log(`Live E2E result written to ${outputPath}`);

  const failed = checks.filter((check) => !check.ok);
  if (failed.length) throw new Error(`${failed.length} live e2e checks failed: ${failed.map((check) => check.name).join(", ")}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
