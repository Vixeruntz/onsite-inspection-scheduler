import { describe, expect, it } from "vitest";
import type { Person } from "@inspection/domain";
import { createDemoWorkspace, demoProjects } from "./sample-data.js";
import { china2026HolidayCalendar, isCompleteWorkWeek } from "./calendar.js";
import { evaluateCondition } from "./rule-engine.js";
import { generateRun, isRunLocked, latestRunEndDate, overrideDecision, publish } from "./scheduler.js";
import { businessRuleByTechnicalId, evidenceForRule } from "./business-rules.js";
import { defaultRuleSet } from "./rulesets.js";
import {
  applyPersonTagIds,
  applyProjectTagIds,
  defaultTagLibrary,
  extendTagLibraryWithRelationships,
  syncPersonTags,
  syncProjectTags,
  tagIdsByCodes,
  tagNamesByIds,
  validateTagLibrary
} from "./tags.js";
import { pickAssignee } from "./people.js";
import { createDecisionExplanations } from "./decision-explanations.js";
import { createRuleSystemMap, createTagTaxonomy } from "./rule-system.js";
import { applyRuleDecisionDrafts, createRuleDecisionDraft } from "./rule-drafts.js";
import { generateRuleSuggestions } from "./rule-suggestions.js";
import { createTagCoverageSummary } from "./tag-coverage.js";
import { createPlanningYearWorkspace } from "./planning.js";
import { rowToProject } from "./importer.js";
import { createIssueBoard } from "./issue-board.js";

describe("rule condition AST", () => {
  it("supports nested all/any/not and comparison operators", () => {
    const ctx = {
      exposureBalance: 120,
      customerType: "external",
      hospitalType: null
    } as never;

    expect(
      evaluateCondition(ctx, {
        all: [
          { field: "exposureBalance", op: ">", value: 100 },
          {
            any: [
              { field: "customerType", op: "=", value: "external" },
              { field: "hospitalType", op: "not_null" }
            ]
          },
          { not: { field: "customerType", op: "=", value: "internal" } }
        ]
      })
    ).toBe(true);
  });
});

describe("scheduler pipeline", () => {
  it("marks P1/P4 rule gaps and blocks publish", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects, {
      now: "2026-05-29T08:00:00.000Z"
    });
    expect(run.audit.ruleGap).toBeGreaterThan(0);
    expect(run.audit.publishable).toBe(false);
    expect(() => publish(run)).toThrow(/不能发布/);
  });

  it("keeps R3 manual-needed publish semantics separate from RULE_GAP", () => {
    const internalOnly = demoProjects.filter((project) => project.id === "P007");
    const run = generateRun({ year: 2026, scope: "full_year" }, internalOnly, {
      now: "2026-05-29T08:00:00.000Z"
    });
    expect(run.audit.ruleGap).toBe(0);
    expect(run.audit.pendingManual).toBeGreaterThan(0);
    expect(run.decisionLogs.find((log) => log.step === "frequency")?.result).toBe("warn");
  });

  it("keeps rule gaps out of generated tasks and time conflicts", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const ruleGapProjectIds = new Set(["P006", "P012"]);
    expect(run.tasks.filter((task) => ruleGapProjectIds.has(task.projectId))).toEqual([]);
    expect(run.conflicts.some((conflict) => conflict.kind === "RULE_GAP")).toBe(false);
    expect(run.audit.pendingManual).toBe(1);
  });

  it("places onsite tasks on complete work weeks only", () => {
    const eligible = demoProjects.filter((project) => ["P001", "P002", "P004", "P005"].includes(project.id));
    const run = generateRun({ year: 2026, scope: "full_year" }, eligible, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const onsite = run.tasks.filter((task) => task.checkType === "onsite" && task.scheduledDate);
    expect(onsite.length).toBeGreaterThan(0);
    for (const task of onsite) {
      expect(isCompleteWorkWeek(task.scheduledDate!, china2026HolidayCalendar)).toBe(true);
    }
  });

  it("places two-year onsite checks when the 24-month due date falls inside the plan year", () => {
    const base = demoProjects.find((project) => project.id === "P001")!;
    const r12Project = {
      ...base,
      id: "PX-R12",
      name: "两年一次边界",
      groupId: null,
      groupName: null,
      partyType: "lessee" as const,
      customerType: "external" as const,
      industry: "other" as const,
      hospitalType: null,
      bizType: "leaseback" as const,
      isWarning: false,
      isNpl: false,
      isSettledThisYear: false,
      isNewWithin1y: false,
      exposureBalance: 60_000_000,
      exposureInit: 60_000_000
    };

    const dueThisYear = generateRun({ year: 2026, scope: "full_year" }, [{ ...r12Project, lastOnsiteDate: "2024-06-01" }], {
      now: "2026-05-29T08:00:00.000Z"
    });
    const onsite = dueThisYear.tasks.find((task) => task.checkType === "onsite");
    expect(onsite?.scheduledDate).toBeTruthy();
    expect(onsite!.scheduledDate! >= "2026-06-01").toBe(true);

    const notDue = generateRun({ year: 2026, scope: "full_year" }, [{ ...r12Project, lastOnsiteDate: "2025-01-01" }], {
      now: "2026-05-29T08:00:00.000Z"
    });
    expect(notDue.tasks.some((task) => task.checkType === "onsite")).toBe(false);
  });

  it("avoids offsite soft-gap warnings when a clean window exists", () => {
    const project = demoProjects.find((item) => item.id === "P001")!;
    const run = generateRun({ year: 2026, scope: "full_year" }, [project], {
      now: "2026-05-29T08:00:00.000Z"
    });
    expect(run.conflicts.some((conflict) => conflict.kind === "S-1")).toBe(false);
  });

  it("appends override logs without replacing original decisions", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects.slice(0, 2), {
      now: "2026-05-29T08:00:00.000Z"
    });
    const task = run.tasks.find((candidate) => candidate.scheduledDate);
    expect(task).toBeDefined();
    const next = overrideDecision(run, task!.id, "scheduledDate", "2026-08-03", "人工改期验收");
    expect(next.decisionLogs.length).toBe(run.decisionLogs.length + 1);
    expect(next.decisionLogs.at(-1)?.step).toBe("override");
    expect(run.decisionLogs.some((log) => log.step === "override")).toBe(false);
  });

  it("keeps manually dated tasks pending manual review until an assignee is present", () => {
    const project = demoProjects.find((item) => item.id === "P001")!;
    const run = generateRun({ year: 2026, scope: "full_year" }, [project], {
      people: [],
      assigneePoolMode: "asset7",
      now: "2026-05-29T08:00:00.000Z"
    });
    const task = run.tasks.find((candidate) => candidate.status === "manual_needed")!;
    const dated = overrideDecision(run, task.id, "scheduledDate", "2026-08-03", "人工确认时间");
    const datedTask = dated.tasks.find((candidate) => candidate.id === task.id)!;
    expect(datedTask.status).toBe("manual_needed");
    expect(datedTask.isPlaced).toBe(false);

    const assigned = overrideDecision(dated, task.id, "assigneeId", "asset-001", "人工确认负责人");
    const assignedTask = assigned.tasks.find((candidate) => candidate.id === task.id)!;
    expect(assignedTask.status).toBe("pending");
    expect(assignedTask.isPlaced).toBe(true);
  });

  it("lets employees confirm a manual task will not be arranged this year", () => {
    const project = demoProjects.find((item) => item.id === "P007")!;
    const run = generateRun({ year: 2026, scope: "full_year" }, [project], {
      now: "2026-05-29T08:00:00.000Z"
    });
    const task = run.tasks.find((candidate) => candidate.status === "manual_needed")!;

    const skipped = overrideDecision(run, task.id, "manualDisposition", "skip", "发布前人工确认：本年不安排检查");
    const skippedTask = skipped.tasks.find((candidate) => candidate.id === task.id)!;
    expect(skippedTask.status).toBe("exempted");
    expect(skippedTask.slotSource).toBe("manual");
    expect(skippedTask.scheduledDate).toBeNull();
    expect(skippedTask.isPlaced).toBe(false);
    expect(skipped.audit.pendingManual).toBe(0);
    expect(skipped.audit.onsiteTasks).toBe(0);
    expect(skipped.audit.excluded).toBe(0);
    expect(skipped.decisionLogs.at(-1)?.override?.reason).toBe("发布前人工确认：本年不安排检查");

    const reopened = overrideDecision(skipped, task.id, "manualDisposition", "reopen", "发布前人工确认：重新安排检查");
    const reopenedTask = reopened.tasks.find((candidate) => candidate.id === task.id)!;
    expect(reopenedTask.status).toBe("manual_needed");
    expect(reopenedTask.isPlaced).toBe(false);
    expect(reopened.audit.pendingManual).toBe(1);
  });

  it("locks a run only after the latest executable task end date", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const latestEnd = latestRunEndDate(run);

    expect(latestEnd).toBeTruthy();
    expect(isRunLocked(run, `${latestEnd}T12:00:00.000Z`)).toBe(false);
    expect(isRunLocked(run, "2027-01-01T00:00:00.000Z")).toBe(true);
  });

  it("does not auto-lock runs with only manually skipped or undated tasks", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const noExecutableEndDates = {
      ...run,
      tasks: run.tasks.map((task, index) =>
        index % 2 === 0
          ? { ...task, status: "exempted" as const, scheduledDate: null, endDate: null }
          : { ...task, scheduledDate: null, endDate: null }
      )
    };

    expect(latestRunEndDate(noExecutableEndDates)).toBeNull();
    expect(isRunLocked(noExecutableEndDates, "2027-01-01T00:00:00.000Z")).toBe(false);
  });
});

describe("planning year workspace", () => {
  it("loads cold-start sample readiness before official scheduling", () => {
    const workspace = createDemoWorkspace();
    const planning = workspace.planningYear;
    expect(planning.projectBatch.dataRows).toBe(304);
    expect(planning.projectBatch.worksheetRows).toBe(305);
    expect(planning.readiness.find((gate) => gate.key === "projects")?.passed).toBe(true);
    expect(planning.readiness.find((gate) => gate.key === "people")?.passed).toBe(true);
    expect(planning.readiness.find((gate) => gate.key === "rules")?.passed).toBe(false);
    expect(planning.canGenerateSandbox).toBe(true);
    expect(planning.canGenerateOfficial).toBe(false);
  });

  it("keeps canGenerateOfficial scoped to annual readiness gates", () => {
    const workspace = createDemoWorkspace();
    const project = demoProjects.find((item) => item.id === "P007")!;
    const run = generateRun({ year: 2026, scope: "full_year" }, [project], {
      people: workspace.people,
      now: "2026-05-29T08:00:00.000Z"
    });
    const runWithCurrentAuditBlock = {
      ...run,
      audit: {
        ...run.audit,
        hardConflicts: 1,
        publishable: false
      }
    };

    const planning = createPlanningYearWorkspace({
      year: 2026,
      projects: [project],
      people: workspace.people,
      ruleset: defaultRuleSet,
      currentRun: runWithCurrentAuditBlock,
      now: "2026-05-29T08:00:00.000Z"
    });

    expect(planning.readiness.find((gate) => gate.key === "rules")?.passed).toBe(true);
    expect(planning.canGenerateOfficial).toBe(true);
    expect(runWithCurrentAuditBlock.audit.publishable).toBe(false);
  });
});

describe("publish issue board", () => {
  it("shows only current candidate issues for the demo run", () => {
    const workspace = createDemoWorkspace();
    const board = createIssueBoard({
      run: workspace.currentRun,
      projects: workspace.projects,
      ruleDrafts: []
    });
    const ruleGapIds = board.issues.filter((issue) => issue.kind === "rule_gap").map((issue) => issue.technicalRuleId).sort();
    expect(ruleGapIds).toEqual(["P1", "P4"]);
    expect(board.issues.some((issue) => issue.kind === "manual_confirm" && issue.technicalRuleId === "R3")).toBe(true);
    expect(board.issues.some((issue) => issue.kind === "manual_confirm" && issue.technicalRuleId?.startsWith("P"))).toBe(false);
    expect(board.issues.some((issue) => issue.kind === "time_conflict" && issue.technicalRuleId === "RULE_GAP")).toBe(false);
    expect(board.issues.some((issue) => ["P2", "P3", "P5", "P6"].includes(issue.technicalRuleId ?? ""))).toBe(false);
  });

  it("turns P5/P6 into project data gaps only when the candidate project truly lacks the field", () => {
    const base = demoProjects.find((project) => project.id === "P001")!;
    const groupProject = {
      ...base,
      id: "PX01",
      name: "集团存量待补测试",
      partyType: "group" as const,
      groupId: "GX",
      groupName: "测试集团",
      customerType: "external" as const,
      industry: "other" as const,
      hospitalType: null,
      bizType: "leaseback" as const,
      isWarning: false,
      isNpl: false,
      isSettledThisYear: false,
      isNewWithin1y: false,
      memberCount: null
    };
    const blockedRun = generateRun({ year: 2026, scope: "full_year" }, [groupProject], { now: "2026-05-29T08:00:00.000Z" });
    const blockedBoard = createIssueBoard({ run: blockedRun, projects: [groupProject] });
    expect(blockedBoard.issues.find((issue) => issue.technicalRuleId === "P5")?.kind).toBe("project_data_gap");

    const fixedProject = { ...groupProject, memberCount: 3 };
    const fixedRun = generateRun({ year: 2026, scope: "full_year" }, [fixedProject], { now: "2026-05-29T08:00:00.000Z" });
    const fixedBoard = createIssueBoard({ run: fixedRun, projects: [fixedProject] });
    expect(fixedBoard.issues.some((issue) => issue.technicalRuleId === "P5")).toBe(false);
  });

  it("does not surface submitted rule drafts as current rule gaps", () => {
    const workspace = createDemoWorkspace();
    const submittedP1 = createRuleDecisionDraft("P1", {
      status: "submitted",
      onsite: { count: 1, period: "two_years" },
      offsite: { count: 1, period: "year" },
      submittedAt: "2026-06-13T00:00:00.000Z"
    });
    const board = createIssueBoard({
      run: workspace.currentRun,
      projects: workspace.projects,
      ruleDrafts: [submittedP1]
    });
    expect(board.issues.some((issue) => issue.kind === "rule_gap" && issue.technicalRuleId === "P1")).toBe(false);
    expect(board.issues.some((issue) => issue.kind === "rule_gap" && issue.technicalRuleId === "P4")).toBe(true);
  });

  it("shows only P4 as a rule blocker after P1 is covered in the candidate run", () => {
    const workspace = createDemoWorkspace();
    const submittedP1 = createRuleDecisionDraft("P1", {
      status: "submitted",
      onsite: { count: 1, period: "two_years" },
      offsite: { count: 1, period: "year" },
      submittedAt: "2026-06-13T00:00:00.000Z"
    });
    const candidateRuleset = applyRuleDecisionDrafts(defaultRuleSet, [submittedP1], "submitted");
    const candidateRun = generateRun({ year: 2026, scope: "full_year" }, workspace.projects, {
      ruleset: candidateRuleset,
      people: workspace.people,
      assigneePoolMode: workspace.planningYear.rosterVersion.poolMode,
      now: "2026-06-13T00:00:00.000Z"
    });
    const board = createIssueBoard({
      run: candidateRun,
      projects: workspace.projects,
      ruleDrafts: [submittedP1]
    });
    expect(board.issues.filter((issue) => issue.kind === "rule_gap").map((issue) => issue.technicalRuleId)).toEqual(["P4"]);
  });
});

describe("xlsx importer normalization", () => {
  it("recognizes source customer type wording without misclassifying external customers", () => {
    expect(rowToProject({ 商业伙伴名称: "外部客户样例", 客户类型: "外部项目(内部客户、协同客户以外的授信客户)" }, 1).customerType).toBe(
      "external"
    );
    expect(rowToProject({ 商业伙伴名称: "协同A样例", 客户类型: "协同项目A(与华润集团下属企业存在股权关系)" }, 2).customerType).toBe(
      "collab_a"
    );
    expect(rowToProject({ 商业伙伴名称: "协同B样例", 客户类型: "协同项目B(与华润集团下属企业存在股权关系)" }, 3).customerType).toBe(
      "collab_b"
    );
    expect(rowToProject({ 商业伙伴名称: "内部客户样例", 客户类型: "内部项目(华润集团及下属控股企业)" }, 4).customerType).toBe("internal");
  });

  it("keeps business test-data fields needed by rule and assignee scenarios", () => {
    const project = rowToProject(
      {
        项目编号: "T10",
        商业伙伴名称: "能源豁免样例",
        类型: "集团",
        所属集团编号: "G-ENERGY",
        所属集团: "能源集团",
        客户类型: "外部项目",
        行业: "能源环保",
        业务类型: "回租",
        五级分类: "正常",
        初始风险敞口: 88_000_000,
        计划时剩余风险敞口: 88_000_000,
        最早授信开始日: "2024-01-01",
        最晚授信结束日: "2028-12-31",
        期限过半时: "2026-07-01",
        是否并网: "是",
        是否账户监管: "是",
        近三年还款正常: "是",
        最近现场检查日期: "2024-06-01",
        现场维护人ID: "qa-maintainer",
        非现场维护人ID: "qa-maintainer",
        集团旗下存量客户数: 4,
        主责部门: "资产管理部主责/业务部门配合",
        不可排月份: "7,8",
        非现场资料渠道: "征信、财报"
      },
      10,
      { desensitize: false }
    );

    expect(project.id).toBe("T10");
    expect(project.groupId).toBe("G-ENERGY");
    expect(project.gridConnected).toBe(true);
    expect(project.accountMonitored).toBe(true);
    expect(project.repayClean3y).toBe(true);
    expect(project.lastOnsiteDate).toBe("2024-06-01");
    expect(project.onsiteMaintainerId).toBe("qa-maintainer");
    expect(project.memberCount).toBe(4);
    expect(project.primaryResponsibleDept).toBe("joint");
    expect(project.unavailableMonths).toEqual([7, 8]);
    expect(project.offsiteInfoChannels).toEqual(["征信", "财报"]);
  });
});

describe("business-language rule ordering", () => {
  it("maps R1-R12 and P1-P7 to business text and policy evidence", () => {
    const expected = [
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "R8",
      "R9",
      "R10",
      "R11",
      "R12",
      "P1",
      "P2",
      "P3",
      "P4",
      "P5",
      "P6",
      "P7"
    ];
    for (const id of expected) {
      const businessRule = businessRuleByTechnicalId(id);
      expect(businessRule?.businessTitle).toBeTruthy();
      expect(businessRule?.businessCondition).toBeTruthy();
      expect(businessRule?.businessOutcome).toBeTruthy();
      expect(businessRule?.tagRefs.length).toBeGreaterThan(0);
      expect(evidenceForRule(id).length).toBeGreaterThan(0);
      expect(evidenceForRule(id).every((entry) => !entry.sourceParagraph.includes("段落"))).toBe(true);
      expect(evidenceForRule(id).every((entry) => entry.policyCitation.citationLabel.includes("第") || entry.policyCitation.articleNo === "红线要求")).toBe(true);
      expect(defaultRuleSet.rules.find((rule) => rule.id === id)?.businessTitle).toBe(businessRule?.businessTitle);
      expect(defaultRuleSet.rules.find((rule) => rule.id === id)?.tagRefs?.length).toBeGreaterThan(0);
    }
  });

  it("keeps rule-gap wording in business language while preserving blocking semantics", () => {
    const ruleGap = businessRuleByTechnicalId("P1");
    expect(ruleGap?.businessTitle).toContain("待资产部明确");
    expect(ruleGap?.businessOutcome).toContain("制度写明以资产管理部要求为准");
    expect(ruleGap?.publishImpact).toBe("blocks_publish");
  });
});

describe("unified tag system", () => {
  it("keeps controlled tag codes unique", () => {
    expect(() => validateTagLibrary(defaultTagLibrary)).not.toThrow();
    expect(new Set(defaultTagLibrary.map((tag) => tag.code)).size).toBe(defaultTagLibrary.length);
  });

  it("syncs project field tags with stable scheduler fields", () => {
    const project = demoProjects.find((item) => item.id === "P001")!;
    const [collabA, energy] = tagIdsByCodes(["customer.collab_a", "industry.energy"]);
    const next = applyProjectTagIds(project, [...(project.tagIds ?? []), collabA!, energy!]);
    expect(next.customerType).toBe("collab_a");
    expect(next.industry).toBe("energy");
    expect(next.tagIds).toContain(collabA);
    expect(next.tagIds).toContain(energy);
  });

  it("syncs person tags with specialty and pool fields", () => {
    const workspace = createDemoWorkspace();
    const person = workspace.people.find((item) => item.name === "徐珺")!;
    const [directSpecialist, asset5] = tagIdsByCodes(["person.specialist.direct_lease", "person.pool.asset5"]);
    const next = applyPersonTagIds(person, [...(person.tagIds ?? []), directSpecialist!, asset5!]);
    expect(next.specialTags).toContain("直租专员");
    expect(next.pool).toContain("asset5");
    expect(next.tagIds).toContain(directSpecialist);
    expect(next.tagIds).toContain(asset5);
  });

  it("uses specialty tags when assigning people", () => {
    const workspace = createDemoWorkspace();
    const [directSpecialist, problemSpecialist, asset7] = tagIdsByCodes([
      "person.specialist.direct_lease",
      "person.specialist.npl",
      "person.pool.asset7"
    ]);
    const directPerson = applyPersonTagIds({ ...workspace.people.find((item) => item.name === "徐珺")!, specialTags: [], tagIds: [] }, [
      directSpecialist!,
      asset7!
    ]);
    const problemPerson = applyPersonTagIds({ ...workspace.people.find((item) => item.name === "姚浩")!, specialTags: [], tagIds: [] }, [
      problemSpecialist!,
      asset7!
    ]);
    const neutralPerson = { ...workspace.people.find((item) => item.name === "杨天荣")!, specialTags: [], tagIds: [] };

    const directProject = { ...demoProjects.find((item) => item.id === "P010")!, bizType: "direct_lease" as const, isNpl: false };
    const nplProject = { ...demoProjects.find((item) => item.id === "P004")!, bizType: "leaseback" as const, isNpl: true };

    expect(pickAssignee(directProject, [neutralPerson, directPerson], "asset7", new Map()).person?.id).toBe(directPerson.id);
    expect(pickAssignee(nplProject, [neutralPerson, problemPerson], "asset7", new Map()).person?.id).toBe(problemPerson.id);
  });

  it("maps project group tags to long-term responsible group tags before normal assignment", () => {
    const workspace = createDemoWorkspace();
    const project = { ...demoProjects.find((item) => item.id === "P001")!, groupId: "G001", groupName: "崖州湾集团", tagIds: [] };
    const owner = {
      ...workspace.people.find((item) => item.name === "徐珺")!,
      pool: ["asset7", "all26"] as Person["pool"],
      longTermGroupIds: ["G001"],
      tagIds: []
    };
    const neutral = {
      ...workspace.people.find((item) => item.name === "姚浩")!,
      pool: ["asset7", "all26"] as Person["pool"],
      longTermGroupIds: [],
      tagIds: []
    };
    const tagLibrary = extendTagLibraryWithRelationships(defaultTagLibrary, [project], [owner, neutral]);
    const syncedProject = syncProjectTags(project, tagLibrary);
    const syncedOwner = syncPersonTags(owner, tagLibrary);

    expect(tagNamesByIds(syncedProject.tagIds, tagLibrary)).toContain("归属集团：崖州湾集团");
    expect(tagNamesByIds(syncedOwner.tagIds, tagLibrary)).toContain("长期负责集团：崖州湾集团");
    expect(pickAssignee(syncedProject, [neutral, syncedOwner], "asset7", new Map()).person?.id).toBe(syncedOwner.id);
    expect(pickAssignee(syncedProject, [neutral, syncedOwner], "asset7", new Map()).basis).toContain("A-1");
  });

  it("generates project identity and maintainer relationship tags", () => {
    const workspace = createDemoWorkspace();
    const project = workspace.projects.find((item) => item.id === "P001")!;
    const maintainer = workspace.people.find((person) => person.id === project.onsiteMaintainerId)!;
    const projectTagNamesForP001 = tagNamesByIds(project.tagIds ?? [], workspace.tagLibrary);
    const maintainerTagNames = tagNamesByIds(maintainer.tagIds ?? [], workspace.tagLibrary);

    expect(projectTagNamesForP001).toContain("项目身份：三亚崖州湾科技城");
    expect(projectTagNamesForP001).toContain(`维护人：${maintainer.name}`);
    expect(maintainerTagNames).toContain(`人员身份：${maintainer.name}`);
  });

  it("lets rule-level assignment priority change assignee choice", () => {
    const workspace = createDemoWorkspace();
    const project = {
      ...demoProjects.find((item) => item.id === "P010")!,
      onsiteMaintainerId: "sample-004",
      onsiteMaintainerName: "徐珺",
      bizType: "direct_lease" as const
    };
    const maintainer = {
      ...workspace.people.find((person) => person.id === "sample-004")!,
      pool: ["asset7", "all26"] as Person["pool"],
      specialTags: []
    };
    const specialist = {
      ...workspace.people.find((person) => person.id === "sample-003")!,
      pool: ["asset7", "all26"] as Person["pool"],
      specialTags: ["直租专员"]
    };

    expect(pickAssignee(project, [maintainer, specialist], "asset7", new Map(), ["capability", "maintainer", "load_balance"]).person?.id).toBe(specialist.id);
    expect(pickAssignee(project, [maintainer, specialist], "asset7", new Map(), ["maintainer", "capability", "load_balance"]).person?.id).toBe(maintainer.id);
  });
});

describe("tag coverage summary", () => {
  it("reports relation coverage and output tags for workspace", () => {
    const workspace = createDemoWorkspace();
    const summary = createTagCoverageSummary({
      projects: workspace.projects,
      people: workspace.people,
      run: workspace.currentRun,
      tagLibrary: workspace.tagLibrary
    });

    expect(summary.projectTagCoverageRate).toBeGreaterThan(0);
    expect(summary.outputTags.some((tag) => tag.code === "schedule.publish_blocked" && tag.count > 0)).toBe(true);
    expect(summary.relationPairs.some((pair) => pair.type === "maintainer" && pair.status === "matched")).toBe(true);
  });
});

describe("related party stock count rules", () => {
  const groupBase = {
    ...demoProjects.find((project) => project.id === "P001")!,
    id: "PX-GROUP",
    name: "集团检查对象",
    partyType: "group" as const,
    groupId: null,
    groupName: null,
    customerType: "external" as const,
    bizType: "leaseback" as const,
    exposureBalance: 150_000_000,
    memberCount: null,
    relatedPartyStockCount: null
  };
  const guarantorBase = {
    ...demoProjects.find((project) => project.id === "P001")!,
    id: "PX-G",
    name: "担保人检查对象",
    partyType: "guarantor" as const,
    groupId: "G999",
    groupName: "担保集团",
    customerType: "external" as const,
    bizType: "leaseback" as const,
    exposureBalance: 150_000_000
  };

  it("blocks as P5 only when group member_count is missing", () => {
    const missing = generateRun({ year: 2026, scope: "full_year" }, [{ ...groupBase, memberCount: null }], {
      now: "2026-05-29T08:00:00.000Z"
    });
    const large = generateRun({ year: 2026, scope: "full_year" }, [{ ...groupBase, memberCount: 4 }], {
      now: "2026-05-29T08:00:00.000Z"
    });
    const small = generateRun({ year: 2026, scope: "full_year" }, [{ ...groupBase, memberCount: 3 }], {
      now: "2026-05-29T08:00:00.000Z"
    });

    expect(missing.audit.ruleGap).toBe(1);
    expect(missing.decisionLogs.find((log) => log.step === "frequency")?.ruleHit).toBe("P5");
    expect(large.audit.ruleGap).toBe(0);
    expect(large.decisionLogs.find((log) => log.step === "frequency")?.ruleHit).toBe("R8");
    expect(large.audit.onsiteTasks).toBe(2);
    expect(small.audit.ruleGap).toBe(0);
    expect(small.decisionLogs.find((log) => log.step === "frequency")?.ruleHit).toBe("R9");
    expect(small.audit.onsiteTasks).toBe(1);
  });

  it("blocks as P6 only when related-party stock count is missing", () => {
    const missing = generateRun({ year: 2026, scope: "full_year" }, [{ ...guarantorBase, relatedPartyStockCount: null }], {
      now: "2026-05-29T08:00:00.000Z"
    });
    expect(missing.audit.ruleGap).toBe(1);
    expect(missing.decisionLogs.find((log) => log.step === "frequency")?.ruleHit).toBe("P6");
  });

  it("turns P6 into executable frequency when related-party stock count is present", () => {
    const large = generateRun({ year: 2026, scope: "full_year" }, [{ ...guarantorBase, relatedPartyStockCount: 4 }], {
      now: "2026-05-29T08:00:00.000Z"
    });
    const small = generateRun({ year: 2026, scope: "full_year" }, [{ ...guarantorBase, relatedPartyStockCount: 3 }], {
      now: "2026-05-29T08:00:00.000Z"
    });

    expect(large.audit.ruleGap).toBe(0);
    expect(large.decisionLogs.find((log) => log.step === "frequency")?.ruleHit).toBe("R13");
    expect(large.audit.onsiteTasks).toBe(2);
    expect(small.audit.ruleGap).toBe(0);
    expect(small.decisionLogs.find((log) => log.step === "frequency")?.ruleHit).toBe("R14");
    expect(small.audit.onsiteTasks).toBe(1);
  });
});

describe("rule system map and tag taxonomy", () => {
  it("connects status, evidence and result across the five scheduling steps", () => {
    const workspace = createDemoWorkspace();
    const systemMap = createRuleSystemMap({
      projects: workspace.projects,
      people: workspace.people,
      run: workspace.currentRun,
      tagLibrary: workspace.tagLibrary
    });

    expect(systemMap.steps.map((step) => step.id)).toEqual(["scope", "frequency", "assignee", "time", "validation"]);
    for (const step of systemMap.steps) {
      expect(step.currentStateTitle).toBe("当前状况");
      expect(step.judgmentBasisTitle).toBe("判断依据");
      expect(step.decisionResultTitle).toBe("判断结果");
      expect(step.influences.length).toBeGreaterThan(0);
    }
    expect(systemMap.pendingDecisions.some((decision) => decision.technicalRuleId === "P1" && decision.publishImpact === "blocks_publish")).toBe(true);
  });

  it("groups tags by business object and shows affected rules", () => {
    const workspace = createDemoWorkspace();
    const taxonomy = createTagTaxonomy({
      projects: workspace.projects,
      people: workspace.people,
      run: workspace.currentRun,
      tagLibrary: workspace.tagLibrary
    });
    const projectRoot = taxonomy.find((node) => node.id === "taxonomy-project");
    const personRoot = taxonomy.find((node) => node.id === "taxonomy-person");
    const ruleRoot = taxonomy.find((node) => node.id === "taxonomy-rule");

    expect(projectRoot?.children.some((node) => node.title === "客户类型" && node.impact.ruleCount > 0)).toBe(true);
    expect(personRoot?.children.some((node) => node.title === "专项能力" && node.impact.schedulerSteps.includes("人员安排"))).toBe(true);
    expect(ruleRoot?.children.some((node) => node.title === "待补口径" && node.impact.ruleCount > 0)).toBe(true);
  });
});

describe("rule decision drafts", () => {
  it("generates reviewable rule suggestions for current hard blockers", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const result = generateRuleSuggestions({
      run,
      projects: demoProjects,
      existingDrafts: [],
      now: "2026-05-29T08:00:00.000Z"
    });

    expect(result.batch.summary.generatedDrafts).toBe(2);
    expect(result.batch.summary.manualSuggestions).toBe(1);
    expect(run.audit.pendingManual).toBe(1);
    expect(result.drafts.map((draft) => draft.technicalRuleId).sort()).toEqual(["P1", "P4"]);
    const p1 = result.drafts.find((draft) => draft.technicalRuleId === "P1")!;
    expect(p1.onsite).toEqual({ count: 1, period: "two_years" });
    expect(p1.offsite).toEqual({ count: 1, period: "year" });
    expect(p1.suggestionMeta?.reviewStatus).toBe("needs_review");
  });

  it("does not overwrite employee edited suggestion drafts", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const edited = createRuleDecisionDraft(
      "P1",
      {
        onsite: { count: 0, period: "year" },
        offsite: { count: 1, period: "year" },
        businessNote: "员工已调整口径",
        suggestionMeta: {
          batchId: "rule_suggest_test",
          source: "system_template",
          confidence: 0.84,
          reviewStatus: "edited",
          generatedAt: "2026-05-29T08:00:00.000Z"
        }
      },
      "2026-05-29T08:00:00.000Z"
    );
    const result = generateRuleSuggestions({
      run,
      projects: demoProjects,
      existingDrafts: [edited],
      now: "2026-05-29T08:00:00.000Z"
    });

    expect(result.drafts.some((draft) => draft.technicalRuleId === "P1")).toBe(false);
    expect(result.batch.skippedItems.some((item) => item.technicalRuleId === "P1" && item.reason.includes("员工已编辑"))).toBe(true);
  });

  it("turns a P1 rule gap into a concrete frequency rule for what-if runs", () => {
    const p1Project = demoProjects.filter((project) => project.id === "P006");
    const before = generateRun({ year: 2026, scope: "full_year" }, p1Project, {
      now: "2026-05-29T08:00:00.000Z"
    });
    expect(before.audit.ruleGap).toBe(1);

    const draft = createRuleDecisionDraft("P1", {
      onsite: { count: 0, period: "year" },
      offsite: { count: 1, period: "year" },
      businessNote: "小额外部/协同B客户本年度不安排现场，保留一次非现场检查。",
      confirmerNote: "测试确认"
    }, "2026-05-29T08:00:00.000Z");
    const draftRuleset = applyRuleDecisionDrafts(defaultRuleSet, [draft], "draft");
    const after = generateRun({ year: 2026, scope: "full_year" }, p1Project, {
      ruleset: draftRuleset,
      now: "2026-05-29T08:00:00.000Z"
    });

    expect(after.audit.ruleGap).toBe(0);
    expect(after.audit.offsiteTasks).toBe(1);
    expect(after.decisionLogs.find((log) => log.step === "frequency")?.ruleHit).toBe("P1");
  });

  it("keeps unresolved P2 drafts from changing publish blocking semantics", () => {
    const p2Project = demoProjects.filter((project) => project.id === "P012");
    const before = generateRun({ year: 2026, scope: "full_year" }, p2Project, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const unresolved = createRuleDecisionDraft("P2", {}, "2026-05-29T08:00:00.000Z");
    const draftRuleset = applyRuleDecisionDrafts(defaultRuleSet, [unresolved], "draft");
    const after = generateRun({ year: 2026, scope: "full_year" }, p2Project, {
      ruleset: draftRuleset,
      now: "2026-05-29T08:00:00.000Z"
    });

    expect(before.audit.ruleGap).toBe(1);
    expect(after.audit.ruleGap).toBe(1);
    expect(after.audit.publishable).toBe(false);
  });
});

describe("business-readable decision chain", () => {
  it("generates business questions and answers for every decision step", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const task = run.tasks.find((candidate) => candidate.projectId === "P001" && candidate.scheduledDate)!;
    const next = overrideDecision(run, task.id, "scheduledDate", "2026-08-03", "人工确认时间窗口");
    const explanations = createDecisionExplanations({
      project: demoProjects.find((project) => project.id === "P001")!,
      logs: next.decisionLogs.filter((log) => log.projectId === "P001"),
      tasks: next.tasks.filter((candidate) => candidate.projectId === "P001")
    });

    expect(new Set(explanations.map((item) => item.step))).toEqual(new Set(["scope", "frequency", "assignee", "time", "validation", "override"]));
    for (const item of explanations) {
      expect(item.businessQuestion).toBeTruthy();
      expect(item.businessAnswer).toBeTruthy();
      expect(item.trace.rawLog.id).toBe(item.id);
    }
  });

  it("keeps rule-gap wording business-first while preserving traceability", () => {
    const run = generateRun({ year: 2026, scope: "full_year" }, demoProjects, {
      now: "2026-05-29T08:00:00.000Z"
    });
    const explanations = createDecisionExplanations({
      project: demoProjects.find((project) => project.id === "P006")!,
      logs: run.decisionLogs.filter((log) => log.projectId === "P006"),
      tasks: run.tasks.filter((task) => task.projectId === "P006")
    });
    const ruleGap = explanations.find((item) => item.impact === "blocks_publish")!;

    expect(ruleGap.businessStepTitle).not.toContain("P1");
    expect(ruleGap.businessAnswer).not.toContain("P1");
    expect(ruleGap.businessAnswer).toContain("不允许正式发布");
    expect(ruleGap.trace.technicalRuleId).toBe("P1");
  });
});
