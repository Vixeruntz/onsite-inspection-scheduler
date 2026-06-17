import { describe, expect, it } from "vitest";
import type { SchedulingRun, Task } from "@inspection/domain";
import { createAcceptanceFixture } from "./acceptance-fixtures.js";
import { china2026HolidayCalendar, isCompleteWorkWeek } from "./calendar.js";
import { createDecisionExplanations } from "./decision-explanations.js";
import { createIssueBoard } from "./issue-board.js";
import { applyRuleDecisionDrafts, createRuleDecisionDraft } from "./rule-drafts.js";
import { generateRuleSuggestions } from "./rule-suggestions.js";
import { defaultRuleSet } from "./rulesets.js";
import { generateRun, overrideDecision } from "./scheduler.js";
import { createTagCoverageSummary } from "./tag-coverage.js";
import { syncProjectTags } from "./tags.js";

const now = "2026-05-29T08:00:00.000Z";
const period = { year: 2026, scope: "full_year" as const };

const createRun = () => {
  const fixture = createAcceptanceFixture();
  const run = generateRun(period, fixture.projects, {
    people: fixture.people,
    assigneePoolMode: "sampleMaintainers",
    now
  });
  return { ...fixture, run };
};

const logsForProject = (run: SchedulingRun, projectId: string) =>
  run.decisionLogs.filter((log) => log.projectId === projectId);

const frequencyLog = (run: SchedulingRun, projectId: string) =>
  logsForProject(run, projectId).find((log) => log.step === "frequency");

const scopeLog = (run: SchedulingRun, projectId: string) =>
  logsForProject(run, projectId).find((log) => log.step === "scope");

const assigneeLog = (run: SchedulingRun, projectId: string) =>
  logsForProject(run, projectId).find((log) => log.step === "assignee");

const tasksFor = (run: SchedulingRun, projectId: string) =>
  run.tasks.filter((task) => task.projectId === projectId);

const countTasks = (run: SchedulingRun, projectId: string, checkType: Task["checkType"]) =>
  tasksFor(run, projectId).filter((task) => task.checkType === checkType).length;

const tagCodesFor = (tagIds: string[] | undefined, tagLibrary: ReturnType<typeof createAcceptanceFixture>["tagLibrary"]) => {
  const byId = new Map(tagLibrary.map((tag) => [tag.id, tag.code]));
  return new Set((tagIds ?? []).map((id) => byId.get(id)).filter((code): code is string => Boolean(code)));
};

const expectRule = (run: SchedulingRun, projectId: string, ruleId: string) => {
  expect(frequencyLog(run, projectId)?.ruleHit).toBe(ruleId);
};

describe("acceptance matrix: project-person-rule-schedule", () => {
  it("covers the 24 business project scenarios with expected rules and task outputs", () => {
    const { run } = createRun();
    const expected = [
      { id: "T01", scope: "IN-1", rule: null, onsite: 0, offsite: 0 },
      { id: "T02", scope: "IN-2", rule: null, onsite: 0, offsite: 0 },
      { id: "T03", scope: "IN-3", rule: null, onsite: 0, offsite: 0 },
      { id: "T04", scope: "IN-5", rule: "R10", onsite: 2, offsite: 1 },
      { id: "T05", scope: "IN-5", rule: "R11", onsite: 1, offsite: 1 },
      { id: "T06", scope: "IN-5", rule: "R12", onsite: 1, offsite: 1 },
      { id: "T07", scope: "IN-5", rule: "P1", onsite: 0, offsite: 0 },
      { id: "T08", scope: "IN-5", rule: "R3", onsite: 1, offsite: 0 },
      { id: "T09", scope: "IN-5", rule: "R4", onsite: 0, offsite: 1 },
      { id: "T10", scope: "IN-5", rule: "R5", onsite: 0, offsite: 1 },
      { id: "T11", scope: "IN-5", rule: "R6", onsite: 1, offsite: 1 },
      { id: "T12", scope: "IN-5", rule: "R7", onsite: 1, offsite: 1 },
      { id: "T13", scope: "IN-5", rule: "R8", onsite: 2, offsite: 1 },
      { id: "T14", scope: "IN-5", rule: "P5", onsite: 0, offsite: 0 },
      { id: "T15", scope: "IN-5", rule: "R14", onsite: 1, offsite: 1 },
      { id: "T16", scope: "IN-5", rule: "P4", onsite: 0, offsite: 0 },
      { id: "T17", scope: "IN-5", rule: "R1", onsite: 1, offsite: 0 },
      { id: "T18", scope: "IN-5", rule: "R2", onsite: 2, offsite: 0 },
      { id: "T19", scope: "IN-5", rule: "R9", onsite: 1, offsite: 1 },
      { id: "T20", scope: "IN-5", rule: "R13", onsite: 2, offsite: 1 },
      { id: "T21", scope: "IN-5", rule: "P2", onsite: 0, offsite: 0 },
      { id: "T22", scope: "IN-5", rule: "P3", onsite: 0, offsite: 0 },
      { id: "T23", scope: "IN-5", rule: "P6", onsite: 0, offsite: 0 },
      { id: "T24", scope: "IN-5", rule: "P7", onsite: 0, offsite: 0 }
    ];

    for (const item of expected) {
      expect(scopeLog(run, item.id)?.ruleHit).toBe(item.scope);
      if (item.rule) expectRule(run, item.id, item.rule);
      expect(countTasks(run, item.id, "onsite")).toBe(item.onsite);
      expect(countTasks(run, item.id, "offsite")).toBe(item.offsite);
    }

    const t04OnsiteHalves = new Set(tasksFor(run, "T04").filter((task) => task.checkType === "onsite").map((task) => task.scheduledDate!.slice(5, 7) <= "06" ? "H1" : "H2"));
    expect(t04OnsiteHalves).toEqual(new Set(["H1", "H2"]));
    const t06Onsite = tasksFor(run, "T06").find((task) => task.checkType === "onsite");
    expect(t06Onsite?.scheduledDate && t06Onsite.scheduledDate >= "2026-06-01").toBe(true);
    expect(tasksFor(run, "T12").find((task) => task.checkType === "onsite")?.scheduledDate?.slice(5, 7)).toBe("09");
    for (const task of run.tasks.filter((task) => task.checkType === "onsite" && task.scheduledDate)) {
      expect(isCompleteWorkWeek(task.scheduledDate, china2026HolidayCalendar)).toBe(true);
    }

    expect(run.audit.ruleGap).toBe(7);
    expect(run.audit.pendingManual).toBe(2);
    expect(run.conflicts.filter((conflict) => conflict.severity === "hard")).toHaveLength(0);
  });

  it("keeps tag normalization and publish issue board aligned with field truth", () => {
    const { projects, tagLibrary, run } = createRun();
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const expectedTags: Record<string, string[]> = {
      T01: ["schedule.exempted", "exposure.balance.le_30m"],
      T02: ["schedule.exempted"],
      T03: ["schedule.exempted"],
      T07: ["schedule.publish_blocked", "exposure.balance.le_30m"],
      T08: ["customer.internal", "schedule.manual_needed"],
      T10: ["industry.energy", "energy.grid_connected", "energy.account_monitored", "energy.repay_clean_3y"],
      T13: ["party.group", "related_party.stock.gt_3"],
      T14: ["party.group", "related_party.stock.unknown", "schedule.publish_blocked"],
      T15: ["party.guarantor", "related_party.stock.le_3"],
      T16: ["biz.factoring", "rule.asset_department_decides", "schedule.publish_blocked"],
      T17: ["flag.warning", "schedule.manual_needed"],
      T18: ["risk.npl", "risk.substandard"],
      T19: ["party.group", "related_party.stock.le_3"],
      T20: ["party.guarantor", "related_party.stock.gt_3"],
      T21: ["hospital.public", "exposure.init.le_60m", "rule.asset_department_decides", "schedule.publish_blocked"],
      T22: ["hospital.private", "rule.asset_department_decides", "schedule.publish_blocked"],
      T23: ["party.guarantor", "related_party.stock.unknown", "schedule.publish_blocked"],
      T24: ["rule.asset_department_decides", "schedule.publish_blocked"]
    };

    for (const [projectId, codes] of Object.entries(expectedTags)) {
      const tagCodes = tagCodesFor(projectById.get(projectId)?.tagIds, tagLibrary);
      for (const code of codes) expect(tagCodes.has(code)).toBe(true);
    }
    for (const projectId of ["T01", "T02", "T03"]) {
      const tagCodes = tagCodesFor(projectById.get(projectId)?.tagIds, tagLibrary);
      expect(tagCodes.has("rule.asset_department_decides")).toBe(false);
      expect(tagCodes.has("schedule.publish_blocked")).toBe(false);
      expect(tagCodes.has("schedule.manual_needed")).toBe(false);
    }

    const issueBoard = createIssueBoard({ run, projects });
    expect(issueBoard.summary.rule_gap).toBe(5);
    expect(issueBoard.summary.project_data_gap).toBe(2);
    expect(issueBoard.summary.manual_confirm).toBe(2);
    expect(issueBoard.issues.find((issue) => issue.technicalRuleId === "P5")?.kind).toBe("project_data_gap");
    expect(issueBoard.issues.find((issue) => issue.technicalRuleId === "P6")?.kind).toBe("project_data_gap");
    expect(issueBoard.issues.find((issue) => issue.projectId === "T08")?.kind).toBe("manual_confirm");
    expect(issueBoard.issues.find((issue) => issue.projectId === "T17")?.kind).toBe("manual_confirm");

    const coverage = createTagCoverageSummary({ projects, people: createAcceptanceFixture().people, run, tagLibrary });
    expect(coverage.projectTagCoverageRate).toBeGreaterThan(0);
    expect(coverage.missingFields.find((item) => item.recordId === "T14" && item.field === "memberCount")).toBeTruthy();
    expect(coverage.missingFields.find((item) => item.recordId === "T23" && item.field === "relatedPartyStockCount")).toBeTruthy();
    expect(coverage.ruleHitDistribution.P5).toBe(1);
    expect(coverage.ruleHitDistribution.P6).toBe(1);
  });

  it("uses the intended assignee matching priorities across people dimensions", () => {
    const { run } = createRun();
    expect(assigneeLog(run, "T04")?.reason).toBe("A-1 长期负责项目");
    expect(assigneeLog(run, "T04")?.output.assigneeName).toBe("陈启明");
    expect(assigneeLog(run, "T05")?.reason).toBe("A-2 直租专员");
    expect(assigneeLog(run, "T05")?.output.assigneeName).toBe("沈嘉宁");
    expect(assigneeLog(run, "T13")?.reason).toBe("A-1 长期负责集团");
    expect(assigneeLog(run, "T13")?.output.assigneeName).toBe("周闻达");
    expect(assigneeLog(run, "T15")?.reason).toBe("A-1 长期负责集团");
    expect(assigneeLog(run, "T18")?.reason).toBe("A-2 问题项目专员");
    expect(assigneeLog(run, "T18")?.output.assigneeName).toBe("赵明川");
    expect(assigneeLog(run, "T19")?.reason).toBe("A-1 长期负责集团");
    expect(assigneeLog(run, "T20")?.reason).toBe("A-1 长期负责集团");
    expect(assigneeLog(run, "T14")?.reason).toBe("A-1 长期负责集团缺失，需人工确认");
    expect(assigneeLog(run, "T11")?.reason).toBe("A-4 负荷参考");
  });

  it("proves every current rule id has at least one final-output effectiveness row", () => {
    const { run, projects, tagLibrary } = createRun();
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const coveredRules = new Set(
      run.decisionLogs
        .filter((log) => (log.step === "scope" || log.step === "frequency") && Boolean(log.ruleHit))
        .map((log) => log.ruleHit!)
    );
    expect([...defaultRuleSet.rules.map((rule) => rule.id).filter((ruleId) => !coveredRules.has(ruleId))]).toEqual([]);

    const effectivenessRows = projects.map((project) => {
      const ruleId = frequencyLog(run, project.id)?.ruleHit ?? scopeLog(run, project.id)?.ruleHit ?? "无";
      const issue = createIssueBoard({ run, projects }).issues.find((item) => item.projectId === project.id);
      const tags = tagCodesFor(projectById.get(project.id)?.tagIds, tagLibrary);
      return {
        projectId: project.id,
        ruleId,
        tags,
        onsite: countTasks(run, project.id, "onsite"),
        offsite: countTasks(run, project.id, "offsite"),
        assigneeReason: assigneeLog(run, project.id)?.reason ?? "无",
        outcome:
          issue?.kind ??
          (scopeLog(run, project.id)?.result === "excluded"
            ? "exempted"
            : tasksFor(run, project.id).some((task) => task.status === "manual_needed")
              ? "manual_needed"
              : "scheduled")
      };
    });

    expect(effectivenessRows.some((row) => row.projectId === "T01" && row.outcome === "exempted")).toBe(true);
    expect(effectivenessRows.some((row) => row.projectId === "T08" && row.outcome === "manual_confirm")).toBe(true);
    expect(effectivenessRows.some((row) => row.projectId === "T21" && row.ruleId === "P2" && row.outcome === "rule_gap")).toBe(true);
    expect(effectivenessRows.some((row) => row.projectId === "T23" && row.ruleId === "P6" && row.outcome === "project_data_gap")).toBe(true);
    expect(effectivenessRows.some((row) => row.projectId === "T24" && row.ruleId === "P7" && row.tags.has("rule.asset_department_decides"))).toBe(true);
    expect(effectivenessRows.some((row) => row.assigneeReason === "A-1 长期负责项目")).toBe(true);
    expect(effectivenessRows.some((row) => row.assigneeReason === "A-1 长期负责集团")).toBe(true);
    expect(effectivenessRows.some((row) => row.assigneeReason === "A-2 直租专员")).toBe(true);
    expect(effectivenessRows.some((row) => row.assigneeReason === "A-2 问题项目专员")).toBe(true);
    expect(effectivenessRows.some((row) => row.assigneeReason === "A-3 历史维护人")).toBe(true);
    expect(effectivenessRows.some((row) => row.assigneeReason === "A-4 负荷参考")).toBe(true);
  });

  it("proves pending actions are operable and change audit/output semantics", () => {
    const { run } = createRun();
    const manualTask = tasksFor(run, "T08").find((task) => task.status === "manual_needed")!;
    const skipped = overrideDecision(run, manualTask.id, "manualDisposition", "skip", "验收：本年不安排检查");
    expect(skipped.audit.pendingManual).toBe(run.audit.pendingManual - 1);
    expect(skipped.tasks.find((task) => task.id === manualTask.id)?.status).toBe("exempted");

    const reopened = overrideDecision(skipped, manualTask.id, "manualDisposition", "reopen", "验收：重新安排检查");
    expect(reopened.audit.pendingManual).toBe(run.audit.pendingManual);
    const dated = overrideDecision(reopened, manualTask.id, "scheduledDate", "2026-08-03", "验收：安排检查日期");
    const arranged = overrideDecision(dated, manualTask.id, "assigneeId", "qa-maintainer", "验收：安排负责人");
    const arrangedTask = arranged.tasks.find((task) => task.id === manualTask.id)!;
    expect(arrangedTask.status).toBe("pending");
    expect(arrangedTask.isPlaced).toBe(true);
    expect(arranged.audit.pendingManual).toBe(run.audit.pendingManual - 1);
    expect(arranged.decisionLogs.filter((log) => log.step === "override")).toHaveLength(4);
  });

  it("keeps rule suggestions, drafts, simulations, and submitted rule coverage deterministic", () => {
    const { projects, run } = createRun();
    const suggestions = generateRuleSuggestions({ run, projects, existingDrafts: [], now });
    expect(suggestions.batch.summary.generatedDrafts).toBe(2);
    expect(suggestions.batch.summary.manualSuggestions).toBe(2);
    expect(suggestions.batch.summary.skipped).toBe(3);
    expect(suggestions.drafts.map((draft) => draft.technicalRuleId).sort()).toEqual(["P1", "P4"]);
    expect(suggestions.batch.skippedItems.map((item) => item.technicalRuleId).sort()).toEqual(["P2", "P3", "P7"]);

    const submittedP1 = createRuleDecisionDraft("P1", {
      status: "submitted",
      onsite: { count: 1, period: "two_years" },
      offsite: { count: 1, period: "year" },
      businessNote: "验收：外部小额按两年一次现场，每年一次非现场。",
      confirmerNote: "验收提交",
      submittedAt: now
    }, now);
    const submittedP4 = createRuleDecisionDraft("P4", {
      status: "submitted",
      onsite: { count: 1, period: "year" },
      offsite: { count: 1, period: "year" },
      businessNote: "验收：保理沿用中额敞口口径。",
      confirmerNote: "验收提交",
      submittedAt: now
    }, now);
    const ruleset = applyRuleDecisionDrafts(defaultRuleSet, [submittedP1, submittedP4], "submitted");
    const fixed = generateRun(period, projects, {
      ruleset,
      people: createAcceptanceFixture().people,
      assigneePoolMode: "sampleMaintainers",
      now
    });
    expect(fixed.audit.ruleGap).toBe(5);
    expect(frequencyLog(fixed, "T07")?.ruleHit).toBe("P1");
    expect(frequencyLog(fixed, "T16")?.ruleHit).toBe("P4");
    const fixedIssueBoard = createIssueBoard({ run: fixed, projects, ruleDrafts: [submittedP1, submittedP4] });
    expect(fixedIssueBoard.summary.rule_gap).toBe(3);
    expect(fixedIssueBoard.summary.project_data_gap).toBe(2);

    const submittedDrafts = [
      submittedP1,
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
      submittedP4,
      createRuleDecisionDraft("P7", {
        status: "submitted",
        onsite: { count: 1, period: "year" },
        offsite: { count: 1, period: "year" },
        businessNote: "验收：资产部酌情增减项目按确认次数执行。",
        confirmerNote: "验收提交",
        submittedAt: now
      }, now)
    ];
    const { tagLibrary, people } = createAcceptanceFixture();
    const fixedProjects = projects.map((project) => {
      if (project.id === "T14") return syncProjectTags({ ...project, memberCount: 4, tagIds: [] }, tagLibrary);
      if (project.id === "T23") return syncProjectTags({ ...project, relatedPartyStockCount: 4, tagIds: [] }, tagLibrary);
      return project;
    });
    const publishableRuleset = applyRuleDecisionDrafts(defaultRuleSet, submittedDrafts, "submitted");
    const publishableRun = generateRun(period, fixedProjects, {
      ruleset: publishableRuleset,
      people,
      assigneePoolMode: "sampleMaintainers",
      now
    });
    const publishableIssueBoard = createIssueBoard({ run: publishableRun, projects: fixedProjects, ruleDrafts: submittedDrafts });
    expect(publishableRun.audit.ruleGap).toBe(0);
    expect(publishableRun.audit.publishable).toBe(true);
    expect(publishableIssueBoard.summary.rule_gap).toBe(0);
    expect(publishableIssueBoard.summary.project_data_gap).toBe(0);
    expect(frequencyLog(publishableRun, "T14")?.ruleHit).toBe("R8");
    expect(frequencyLog(publishableRun, "T23")?.ruleHit).toBe("R13");
  });

  it("has a complete business-readable decision chain for every in-scope project", () => {
    const { projects, run } = createRun();
    for (const project of projects.filter((item) => scopeLog(run, item.id)?.result !== "excluded")) {
      const explanations = createDecisionExplanations({
        project,
        logs: logsForProject(run, project.id),
        tasks: tasksFor(run, project.id),
        conflicts: run.conflicts
      });
      expect(explanations.length).toBeGreaterThanOrEqual(2);
      for (const explanation of explanations) {
        expect(explanation.businessQuestion).toBeTruthy();
        expect(explanation.businessAnswer).toBeTruthy();
        expect(explanation.trace.rawLog.projectId).toBe(project.id);
      }
    }
  });

  it("detects hard conflicts when manual overrides create an impossible same-person same-week plan", () => {
    const { run } = createRun();
    const onsiteTasks = run.tasks.filter((task) => task.checkType === "onsite" && task.assigneeId);
    const first = onsiteTasks[0]!;
    const second = onsiteTasks.find((task) => task.id !== first.id && task.assigneeId !== first.assigneeId)!;
    const sameAssignee = overrideDecision(run, second.id, "assigneeId", first.assigneeId, "验收：制造同人同周冲突");
    const sameWeek = overrideDecision(sameAssignee, second.id, "scheduledDate", first.scheduledDate!, "验收：制造同人同周冲突");
    expect(sameWeek.conflicts.some((conflict) => conflict.kind === "H-4" && conflict.severity === "hard")).toBe(true);
  });

  it("runs a 300+ project performance smoke without breaking audit consistency", () => {
    const { projects, people } = createAcceptanceFixture();
    const bigProjects = Array.from({ length: 320 }, (_, index) => {
      const source = projects[index % projects.length]!;
      return {
        ...source,
        id: `P-${String(index + 1).padStart(3, "0")}`,
        name: `${source.name}-${index + 1}`,
        groupId: source.groupId ? `${source.groupId}-${Math.floor(index / projects.length)}` : source.groupId
      };
    });
    const startedAt = Date.now();
    const run = generateRun(period, bigProjects, { people, assigneePoolMode: "sampleMaintainers", now });
    const durationMs = Date.now() - startedAt;
    const issueBoard = createIssueBoard({ run, projects: bigProjects });
    const blockingAffectedCount = issueBoard.issues
      .filter((issue) => issue.kind === "rule_gap" || issue.kind === "project_data_gap")
      .reduce((sum, issue) => sum + issue.affectedProjectCount, 0);
    const manualAffectedCount = issueBoard.issues
      .filter((issue) => issue.kind === "manual_confirm")
      .reduce((sum, issue) => sum + issue.affectedProjectCount, 0);
    expect(durationMs).toBeLessThan(2_000);
    expect(blockingAffectedCount).toBe(run.audit.ruleGap);
    expect(manualAffectedCount).toBe(run.audit.pendingManual);
  });
});
