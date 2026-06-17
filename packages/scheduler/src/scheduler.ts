import type {
  AssigneePoolMode,
  Conflict,
  DecisionLog,
  FrequencyDecision,
  Person,
  PlanPeriod,
  Project,
  RuleSet,
  AssignmentPriorityKey,
  SchedulingRun,
  Task
} from "@inspection/domain";
import { nanoid } from "nanoid";
import { createAuditReport } from "./audit.js";
import {
  availableWeeks,
  china2026HolidayCalendar,
  daysApart,
  endOfFiveWorkdayWindow,
  formatIsoDate,
  halfOf,
  isCompleteWorkWeek,
  monthOf,
  parseIsoDate,
  sortWeeksNearMonth
} from "./calendar.js";
import { buildGroupMemberCounts } from "./importer.js";
import { buildPeopleFromProjects, pickAssignee } from "./people.js";
import { evaluateFrequency, evaluateInScope, ruleToHumanText, type RuleEvaluationContext } from "./rule-engine.js";
import { defaultRuleSet } from "./rulesets.js";

export type GenerateRunOptions = {
  runType?: "official" | "manual_recompute" | "what_if";
  ruleset?: RuleSet;
  people?: Person[];
  createdBy?: string;
  assigneePoolMode?: AssigneePoolMode;
  supersedes?: string | null;
  now?: string;
};

type ProjectPlan = {
  project: Project;
  frequency: FrequencyDecision | null;
  assignee: Person | null;
  assigneeBasis: string | null;
  assigneeRequiresManual: boolean;
};

const newId = (prefix: string) => `${prefix}_${nanoid(10)}`;

const log = (entry: Omit<DecisionLog, "id" | "chainPrev" | "chainNext" | "createdAt">, now: string): DecisionLog => ({
  id: newId("log"),
  chainPrev: null,
  chainNext: null,
  createdAt: now,
  ...entry
});

const linkDecisionChains = (logs: DecisionLog[]) => {
  const byProject = new Map<string, DecisionLog[]>();
  for (const entry of logs) {
    const group = byProject.get(entry.projectId) ?? [];
    group.push(entry);
    byProject.set(entry.projectId, group);
  }
  for (const group of byProject.values()) {
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (let index = 0; index < group.length; index += 1) {
      group[index]!.chainPrev = group[index - 1]?.id ?? null;
      group[index]!.chainNext = group[index + 1]?.id ?? null;
    }
  }
};

const addMonthsIso = (value: string, months: number) => {
  const source = parseIsoDate(value);
  const result = new Date(source);
  const expectedDay = source.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== expectedDay) result.setDate(0);
  return formatIsoDate(result);
};

const isOnOrAfter = (candidate: string, threshold: string) =>
  parseIsoDate(candidate).getTime() >= parseIsoDate(threshold).getTime();

const twoYearDueDate = (project: Project) => (project.lastOnsiteDate ? addMonthsIso(project.lastOnsiteDate, 24) : null);

const normalizeCount = (frequency: FrequencyDecision["onsite"], project: Project, period: PlanPeriod) => {
  if (frequency.special) return null;
  if (!frequency.count) return 0;
  if (frequency.period === "two_years") {
    if (!project.lastOnsiteDate) return 1;
    const periodEnd = `${period.year}-12-31`;
    return isOnOrAfter(periodEnd, twoYearDueDate(project)!) ? 1 : 0;
  }
  if (period.scope === "h2") return Math.ceil(frequency.count / 2);
  return frequency.count;
};

const pickAnchorMonth = (project: Project) => {
  if (project.termHalf?.startsWith("2026")) {
    return { month: monthOf(project.termHalf), basis: "term_half" as const };
  }
  if (project.creditStart) {
    return { month: monthOf(project.creditStart), basis: "credit_anniversary" as const };
  }
  return { month: 6, basis: "balanced" as const };
};

const weekKey = (assigneeId: string | null, week: string) => `${assigneeId ?? "self"}:${week}`;

const createTask = (
  runId: string,
  project: Project,
  input: Omit<Task, "id" | "runId" | "projectId" | "projectName" | "durationDays" | "reportRef" | "actualCompletedAt" | "slotSource">
): Task => ({
  id: newId("task"),
  runId,
  projectId: project.id,
  projectName: project.name,
  durationDays: 5,
  reportRef: null,
  actualCompletedAt: null,
  slotSource: "system",
  ...input
});

const placeOnsite = (
  project: Project,
  assignee: Person | null,
  targetMonth: number,
  halfReq: "H1" | "H2" | null,
  weeks: string[],
  personWeek: Map<string, string>
) => {
  const candidates = sortWeeksNearMonth(weeks, targetMonth);
  const dueDate = twoYearDueDate(project);
  for (const week of candidates) {
    if (halfReq && halfOf(week) !== halfReq) continue;
    if (personWeek.has(weekKey(assignee?.id ?? null, week))) continue;
    if (dueDate && !isOnOrAfter(week, dueDate)) continue;
    return week;
  }
  return null;
};

const defaultAssignmentPriority: AssignmentPriorityKey[] = [
  "ownership_project",
  "ownership_group",
  "capability",
  "maintainer",
  "load_balance"
];

const assignmentPriorityForRule = (ruleset: RuleSet, ruleId: string | null | undefined) =>
  ruleset.rules.find((rule) => rule.id === ruleId)?.assignmentPriority ?? defaultAssignmentPriority;

const ruleTagSnapshot = (ruleset: RuleSet, ruleId: string | null | undefined) =>
  ruleId ? ruleset.rules.find((rule) => rule.id === ruleId)?.tagRefs ?? [] : [];

const hasRunnableAssignee = (task: Pick<Task, "assigneeId" | "assigneeName">) =>
  Boolean(task.assigneeId) || task.assigneeName === "上海分公司自检";

const normalizeManualTaskState = <T extends Task>(task: T): T => {
  const ready = Boolean(task.scheduledDate) && hasRunnableAssignee(task);
  return {
    ...task,
    status: ready ? "pending" : "manual_needed",
    isPlaced: ready
  };
};

const skipManualTask = <T extends Task>(task: T): T => ({
  ...task,
  scheduledDate: null,
  endDate: null,
  dateBasis: "manual_override",
  slotSource: "manual",
  status: "exempted",
  isPlaced: false
});

const reopenManualTask = <T extends Task>(task: T): T => ({
  ...task,
  scheduledDate: null,
  endDate: null,
  dateBasis: "manual_needed",
  slotSource: "manual",
  status: "manual_needed",
  isPlaced: false
});

export const latestRunEndDate = (run: SchedulingRun) => {
  const dates = run.tasks
    .filter((task) => task.status !== "exempted" && task.endDate)
    .map((task) => task.endDate!)
    .sort();
  return dates.at(-1) ?? null;
};

export const isRunLocked = (run: SchedulingRun, now = new Date().toISOString()) => {
  const latestEndDate = latestRunEndDate(run);
  if (!latestEndDate) return false;
  return parseIsoDate(now.slice(0, 10)).getTime() > parseIsoDate(latestEndDate).getTime();
};

const offsiteGapScore = (week: string, onsiteDates: string[]) => {
  if (onsiteDates.length === 0) return { hard: false, soft: false };
  const gaps = onsiteDates.map((date) => daysApart(date, week));
  return {
    hard: gaps.some((gap) => gap < 28),
    soft: gaps.some((gap) => gap < 84)
  };
};

const validateTasks = (runId: string, tasks: Task[], calendar = china2026HolidayCalendar) => {
  const conflicts: Conflict[] = [];
  const onsite = tasks.filter((task) => task.checkType === "onsite" && task.scheduledDate && task.isPlaced);
  const byPersonWeek = new Map<string, Task[]>();
  for (const task of onsite) {
    const key = weekKey(task.assigneeId, task.scheduledDate!);
    const group = byPersonWeek.get(key) ?? [];
    group.push(task);
    byPersonWeek.set(key, group);
    if (!isCompleteWorkWeek(task.scheduledDate!, calendar)) {
      conflicts.push({
        id: newId("conflict"),
        runId,
        taskIds: [task.id],
        kind: "H-5",
        severity: "hard",
        message: `${task.projectName} 现场周 ${task.scheduledDate} 被法定节假日打断`,
        status: "open",
        resolution: null
      });
    }
  }

  for (const group of byPersonWeek.values()) {
    if (group.length <= 1) continue;
    conflicts.push({
      id: newId("conflict"),
      runId,
      taskIds: group.map((task) => task.id),
      kind: "H-4",
      severity: "hard",
      message: `${group[0]!.assigneeName} 同周存在 ${group.length} 个现场任务`,
      status: "open",
      resolution: null
    });
  }

  const byProject = new Map<string, Task[]>();
  for (const task of tasks) {
    const group = byProject.get(task.projectId) ?? [];
    group.push(task);
    byProject.set(task.projectId, group);
  }

  for (const group of byProject.values()) {
    const onsiteTasks = group.filter((task) => task.checkType === "onsite" && task.scheduledDate);
    const offsiteTasks = group.filter((task) => task.checkType === "offsite" && task.scheduledDate);
    if (onsiteTasks.length === 2 && new Set(onsiteTasks.map((task) => halfOf(task.scheduledDate!))).size !== 2) {
      conflicts.push({
        id: newId("conflict"),
        runId,
        taskIds: onsiteTasks.map((task) => task.id),
        kind: "H-1",
        severity: "hard",
        message: `${onsiteTasks[0]!.projectName} 现场 2 次未拆分到上下半年`,
        status: "open",
        resolution: null
      });
    }
    for (const site of onsiteTasks) {
      for (const offsiteTask of offsiteTasks) {
        const gap = daysApart(site.scheduledDate!, offsiteTask.scheduledDate!);
        if (gap < 28) {
          conflicts.push({
            id: newId("conflict"),
            runId,
            taskIds: [site.id, offsiteTask.id],
            kind: "H-2",
            severity: "hard",
            message: `${site.projectName} 现场与非现场间隔 ${gap} 天，不足 28 天`,
            status: "open",
            resolution: null
          });
        } else if (gap < 84) {
          conflicts.push({
            id: newId("conflict"),
            runId,
            taskIds: [site.id, offsiteTask.id],
            kind: "S-1",
            severity: "soft",
            message: `${site.projectName} 现场与非现场间隔不足一季度`,
            status: "open",
            resolution: null
          });
        }
      }
    }
  }

  return conflicts;
};

export const generateRun = (
  period: PlanPeriod,
  projects: Project[],
  options: GenerateRunOptions = {}
): SchedulingRun => {
  const now = options.now ?? new Date().toISOString();
  const runId = newId("run");
  const ruleset = options.ruleset ?? defaultRuleSet;
  const runType = options.runType ?? "official";
  const people = options.people ?? buildPeopleFromProjects(projects);
  const assigneePoolMode = options.assigneePoolMode ?? "sampleMaintainers";
  const groupCounts = buildGroupMemberCounts(projects);
  const weeks = availableWeeks(period.year);
  const logs: DecisionLog[] = [];
  const tasks: Task[] = [];
  const conflicts: Conflict[] = [];
  const plans: ProjectPlan[] = [];
  const onsiteLoad = new Map<string, number>();

  for (const project of projects) {
    const groupMemberCount =
      project.partyType === "group"
        ? project.memberCount ?? null
        : project.groupId ? groupCounts.get(project.groupId) ?? null : null;
    const ctx: RuleEvaluationContext = {
      ...project,
      groupMemberCount,
      manualFrequencyRequested: Boolean(project.manualFrequencyRequested)
    };

    const scope = evaluateInScope(ruleset, ctx);
    logs.push(
      log(
        {
          runId,
          projectId: project.id,
          taskId: null,
          step: "scope",
          ruleHit: scope.ruleId,
          ruleText: ruleToHumanText(scope.ruleId, scope.ruleName, scope.source),
          inputs: {
            exposureBalance: project.exposureBalance,
            isSettledThisYear: project.isSettledThisYear,
            isNewWithin1y: project.isNewWithin1y
          },
          output: { inScope: scope.inScope },
          result: scope.inScope ? "pass" : "excluded",
          reason: scope.reason,
          override: null,
          tagSnapshot: {
            projectTagIds: project.tagIds ?? [],
            ruleTagIds: ruleTagSnapshot(ruleset, scope.ruleId)
          }
        },
        now
      )
    );

    if (!scope.inScope) {
      plans.push({ project, frequency: null, assignee: null, assigneeBasis: null, assigneeRequiresManual: false });
      continue;
    }

    const frequency = evaluateFrequency(ruleset, ctx);
    const frequencyResult = frequency.status === "rule_gap" ? "block" : frequency.status === "manual_needed" ? "warn" : "pass";
    logs.push(
      log(
        {
          runId,
          projectId: project.id,
          taskId: null,
          step: "frequency",
          ruleHit: frequency.ruleId,
          ruleText: ruleToHumanText(frequency.ruleId, frequency.ruleName, frequency.source),
          inputs: {
            riskGrade: project.riskGrade,
            customerType: project.customerType,
            industry: project.industry,
            exposureBalance: project.exposureBalance,
            exposureInit: project.exposureInit,
            hospitalType: project.hospitalType,
            groupMemberCount: ctx.groupMemberCount,
            memberCount: project.memberCount,
            relatedPartyStockCount: project.relatedPartyStockCount,
            manualFrequencyRequested: project.manualFrequencyRequested ?? false,
            projectTags: project.tagIds ?? []
          },
          output: {
            onsite: frequency.onsite,
            offsite: frequency.offsite,
            status: frequency.status
          },
          result: frequencyResult,
          reason: frequency.status === "rule_gap" ? frequency.onsite.note ?? "待规则补全" : "频次规则已覆盖",
          override: null,
          tagSnapshot: {
            projectTagIds: project.tagIds ?? [],
            ruleTagIds: ruleTagSnapshot(ruleset, frequency.ruleId)
          }
        },
        now
      )
    );

    const assigneePriority = assignmentPriorityForRule(ruleset, frequency.ruleId);
    const forceOwnershipMatch = ["R8", "R9", "R13", "R14", "P5", "P6"].includes(frequency.ruleId);
    const assigneeDecision = pickAssignee(project, people, assigneePoolMode, onsiteLoad, assigneePriority, forceOwnershipMatch);
    if (assigneeDecision.person) {
      onsiteLoad.set(assigneeDecision.person.id, onsiteLoad.get(assigneeDecision.person.id) ?? 0);
    }
    logs.push(
      log(
        {
          runId,
          projectId: project.id,
          taskId: null,
          step: "assignee",
          ruleHit: assigneeDecision.basis.split(" ")[0] ?? "A-4",
          ruleText: assigneeDecision.basis,
          inputs: {
            dept: project.dept,
            bizType: project.bizType,
            isNpl: project.isNpl,
            maintainer: project.onsiteMaintainerName,
            maintainerId: project.onsiteMaintainerId ?? project.offsiteMaintainerId ?? null,
            groupId: project.groupId,
            priority: assigneePriority,
            projectTags: project.tagIds ?? []
          },
          output: {
            assigneeId: assigneeDecision.person?.id ?? null,
            assigneeName: assigneeDecision.person?.name ?? (project.dept.includes("上海") ? "上海分公司自检" : "待人工"),
            assigneeTags: assigneeDecision.person?.tagIds ?? []
          },
          result: assigneeDecision.person || project.dept.includes("上海") ? "pass" : "warn",
          reason: assigneeDecision.basis,
          override: null,
          tagSnapshot: {
            projectTagIds: project.tagIds ?? [],
            personTagIds: assigneeDecision.person?.tagIds ?? [],
            ruleTagIds: ruleTagSnapshot(ruleset, frequency.ruleId)
          }
        },
        now
      )
    );

    plans.push({
      project,
      frequency,
      assignee: assigneeDecision.person,
      assigneeBasis: assigneeDecision.basis,
      assigneeRequiresManual: Boolean(assigneeDecision.requiresManual)
    });
  }

  const personWeek = new Map<string, string>();
  const inScopePlans = plans.filter((plan) => plan.frequency && plan.frequency.status !== "rule_gap");
  const sortedForOnsite = [...inScopePlans].sort((a, b) => {
    const aCount = normalizeCount(a.frequency!.onsite, a.project, period) ?? 0;
    const bCount = normalizeCount(b.frequency!.onsite, b.project, period) ?? 0;
    return bCount - aCount || a.project.name.localeCompare(b.project.name, "zh-CN");
  });

  for (const plan of sortedForOnsite) {
    const onsiteCount = normalizeCount(plan.frequency!.onsite, plan.project, period);
    if (onsiteCount === null) {
      const task = createTask(runId, plan.project, {
        checkType: "onsite",
        occurrenceIndex: 1,
        occurrenceTotal: 1,
        assigneeId: plan.assignee?.id ?? null,
        assigneeName: plan.assignee?.name ?? "待人工",
        scheduledDate: null,
        endDate: null,
        dateBasis: "manual_needed",
        status: "manual_needed",
        isPlaced: false
      });
      tasks.push(task);
      logs.push(
        log(
          {
            runId,
            projectId: plan.project.id,
            taskId: task.id,
            step: "time",
            ruleHit: plan.frequency!.ruleId,
            ruleText: "按预警方案/不强制项目需人工确定时间",
            inputs: {},
            output: { status: "manual_needed" },
            result: "warn",
            reason: "规则已覆盖但次数需人工确定",
            override: null
          },
          now
        )
      );
      continue;
    }
    if (onsiteCount <= 0) continue;

    if (plan.assigneeRequiresManual) {
      for (let index = 0; index < onsiteCount; index += 1) {
        const task = createTask(runId, plan.project, {
          checkType: "onsite",
          occurrenceIndex: index + 1,
          occurrenceTotal: onsiteCount,
          assigneeId: null,
          assigneeName: "待人工",
          scheduledDate: null,
          endDate: null,
          dateBasis: "manual_needed",
          status: "manual_needed",
          isPlaced: false
        });
        tasks.push(task);
        logs.push(
          log(
            {
              runId,
              projectId: plan.project.id,
              taskId: task.id,
              step: "time",
              ruleHit: "A-1",
              ruleText: "人员关系标签缺失，需人工确认负责人和时间",
              inputs: { assigneeBasis: plan.assigneeBasis, projectTags: plan.project.tagIds ?? [] },
              output: { status: "manual_needed" },
              result: "warn",
              reason: plan.assigneeBasis ?? "人员关系标签缺失",
              override: null,
              tagSnapshot: {
                projectTagIds: plan.project.tagIds ?? [],
                ruleTagIds: ruleTagSnapshot(ruleset, plan.frequency!.ruleId)
              }
            },
            now
          )
        );
      }
      continue;
    }

    const anchor = pickAnchorMonth(plan.project);
    const targets =
      onsiteCount === 1
        ? [{ month: anchor.month, halfReq: null as "H1" | "H2" | null }]
        : [
            { month: Math.min(anchor.month, 5), halfReq: "H1" as const },
            { month: Math.max(Math.min(anchor.month + 6, 12), 7), halfReq: "H2" as const }
          ];

    for (let index = 0; index < onsiteCount; index += 1) {
      const target = targets[index] ?? {
        month: ((index * Math.max(1, Math.floor(12 / onsiteCount))) % 12) + 1,
        halfReq: null
      };
      const placedWeek = placeOnsite(plan.project, plan.assignee, target.month, target.halfReq, weeks, personWeek);
      const task = createTask(runId, plan.project, {
        checkType: "onsite",
        occurrenceIndex: index + 1,
        occurrenceTotal: onsiteCount,
        assigneeId: plan.assignee?.id ?? null,
        assigneeName: plan.assignee?.name ?? "上海分公司自检",
        scheduledDate: placedWeek,
        endDate: placedWeek ? endOfFiveWorkdayWindow(placedWeek) : null,
        dateBasis: placedWeek ? anchor.basis : "unplaceable",
        status: placedWeek ? "pending" : "unplaceable",
        isPlaced: Boolean(placedWeek)
      });
      tasks.push(task);

      if (placedWeek) {
        personWeek.set(weekKey(plan.assignee?.id ?? null, placedWeek), plan.project.id);
        if (plan.assignee) onsiteLoad.set(plan.assignee.id, (onsiteLoad.get(plan.assignee.id) ?? 0) + 1);
      }

      logs.push(
        log(
          {
            runId,
            projectId: plan.project.id,
            taskId: task.id,
            step: "time",
            ruleHit: placedWeek ? "H-1/H-4/H-5" : "UNPLACEABLE",
            ruleText: placedWeek ? "现场按完整工作周排期，同人同周不重叠" : "全年无可用现场整周",
            inputs: { anchorMonth: anchor.month, targetMonth: target.month, halfReq: target.halfReq },
            output: { scheduledDate: placedWeek, endDate: task.endDate },
            result: placedWeek ? "pass" : "warn",
            reason: placedWeek ? `${task.scheduledDate}~${task.endDate}，依据 ${task.dateBasis}` : "负责人全年可用周已满，进入人工队列",
            override: null
          },
          now
        )
      );
    }
  }

  const weekRot = new Map<number, number>();
  const monthLoad = new Map<number, number>();

  for (const plan of [...inScopePlans].sort((a, b) => a.project.name.localeCompare(b.project.name, "zh-CN"))) {
    const offsiteCount = normalizeCount(plan.frequency!.offsite, plan.project, period);
    if (!offsiteCount || offsiteCount < 1) continue;
    if (plan.assigneeRequiresManual) {
      for (let index = 0; index < offsiteCount; index += 1) {
        const task = createTask(runId, plan.project, {
          checkType: "offsite",
          occurrenceIndex: index + 1,
          occurrenceTotal: offsiteCount,
          assigneeId: null,
          assigneeName: "待人工",
          scheduledDate: null,
          endDate: null,
          dateBasis: "manual_needed",
          status: "manual_needed",
          isPlaced: false
        });
        tasks.push(task);
        logs.push(
          log(
            {
              runId,
              projectId: plan.project.id,
              taskId: task.id,
              step: "time",
              ruleHit: "A-1",
              ruleText: "人员关系标签缺失，非现场需人工确认",
              inputs: { assigneeBasis: plan.assigneeBasis, projectTags: plan.project.tagIds ?? [] },
              output: { status: "manual_needed" },
              result: "warn",
              reason: plan.assigneeBasis ?? "人员关系标签缺失",
              override: null,
              tagSnapshot: {
                projectTagIds: plan.project.tagIds ?? [],
                ruleTagIds: ruleTagSnapshot(ruleset, plan.frequency!.ruleId)
              }
            },
            now
          )
        );
      }
      continue;
    }
    const projectOnsiteDates = tasks
      .filter((task) => task.projectId === plan.project.id && task.checkType === "onsite" && task.scheduledDate)
      .map((task) => task.scheduledDate!);

    for (let index = 0; index < offsiteCount; index += 1) {
      const hardSafeWeeks = weeks.filter((week) => !offsiteGapScore(week, projectOnsiteDates).hard);
      const candidateWeeks = hardSafeWeeks.length ? hardSafeWeeks : weeks;
      const week = candidateWeeks
        .map((candidate) => {
          const score = offsiteGapScore(candidate, projectOnsiteDates);
          const month = monthOf(candidate);
          return {
            week: candidate,
            month,
            hard: score.hard,
            soft: score.soft,
            monthLoad: monthLoad.get(month) ?? 0,
            weekRot: weekRot.get(month) ?? 0
          };
        })
        .sort(
          (a, b) =>
            Number(a.hard) - Number(b.hard) ||
            Number(a.soft) - Number(b.soft) ||
            a.monthLoad - b.monthLoad ||
            a.weekRot - b.weekRot ||
            a.week.localeCompare(b.week)
        )[0]!.week;
      const month = monthOf(week);
      const rot = weekRot.get(month) ?? 0;
      monthLoad.set(month, (monthLoad.get(month) ?? 0) + 1);
      weekRot.set(month, rot + 1);

      const task = createTask(runId, plan.project, {
        checkType: "offsite",
        occurrenceIndex: index + 1,
        occurrenceTotal: offsiteCount,
        assigneeId: plan.assignee?.id ?? null,
        assigneeName: plan.assignee?.name ?? "上海分公司自检",
        scheduledDate: week,
        endDate: endOfFiveWorkdayWindow(week),
        dateBasis: "completion_window",
        status: "pending",
        isPlaced: true
      });
      tasks.push(task);
      logs.push(
        log(
          {
            runId,
            projectId: plan.project.id,
            taskId: task.id,
            step: "time",
            ruleHit: "H-2/S-1",
            ruleText: "非现场为 5 工作日完成窗口，全局按月份打散",
            inputs: { siteDates: projectOnsiteDates, monthLoad: Object.fromEntries(monthLoad) },
            output: { scheduledDate: week, endDate: task.endDate },
            result: offsiteGapScore(week, projectOnsiteDates).soft
              ? "warn"
              : "pass",
            reason: "完成窗口，非独占人力",
            override: null
          },
          now
        )
      );
    }
  }

  const validationConflicts = validateTasks(runId, tasks);
  conflicts.push(...validationConflicts);
  for (const project of projects) {
    const projectConflicts = conflicts.filter((conflict) => conflict.message.includes(project.id) || conflict.taskIds.some((taskId) => tasks.find((t) => t.id === taskId)?.projectId === project.id));
    logs.push(
      log(
        {
          runId,
          projectId: project.id,
          taskId: null,
          step: "validation",
          ruleHit: projectConflicts.length ? projectConflicts.map((conflict) => conflict.kind).join(",") : "H-0..H-5/S-1..S-2",
          ruleText: "日级硬/软约束校验",
          inputs: { taskCount: tasks.filter((task) => task.projectId === project.id).length },
          output: { conflicts: projectConflicts.map((conflict) => conflict.kind) },
          result: projectConflicts.some((conflict) => conflict.severity === "hard") ? "block" : projectConflicts.length ? "warn" : "pass",
          reason: projectConflicts.length ? projectConflicts.map((conflict) => conflict.message).join("；") : "无硬冲突",
          override: null
        },
        now
      )
    );
  }

  linkDecisionChains(logs);
  const audit = createAuditReport(projects.length, logs, tasks, conflicts);

  return {
    id: runId,
    runType,
    planPeriod: period,
    rulesetVersion: ruleset.version,
    inputSnapshotId: newId("snapshot"),
    status: "draft",
    supersedes: options.supersedes ?? null,
    isNamed: false,
    expiresAt: runType === "what_if" ? new Date(Date.parse(now) + 30 * 86_400_000).toISOString() : null,
    createdBy: options.createdBy ?? "dev-user",
    createdAt: now,
    publishedAt: null,
    tasks,
    decisionLogs: logs,
    conflicts,
    audit
  };
};

export const publish = (run: SchedulingRun): SchedulingRun => {
  if (!run.audit.publishable) {
    throw new Error("方案存在 RULE_GAP 或硬冲突，不能发布");
  }
  return {
    ...run,
    status: "published",
    publishedAt: new Date().toISOString()
  };
};

export const overrideDecision = (
  run: SchedulingRun,
  taskId: string,
  field: "assigneeId" | "scheduledDate" | "manualDisposition",
  value: string | null,
  reason: string,
  operator = "dev-user"
): SchedulingRun => {
  const task = run.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  const prev = field === "manualDisposition" ? task.status : task[field];
  const nextTasks = run.tasks.map((candidate) =>
    candidate.id === taskId
      ? field === "manualDisposition"
        ? value === "skip"
          ? skipManualTask(candidate)
          : reopenManualTask(candidate)
      : field === "scheduledDate"
        ? normalizeManualTaskState({
            ...candidate,
            scheduledDate: value,
            slotSource: "manual" as const,
            endDate: value ? endOfFiveWorkdayWindow(value) : null,
            dateBasis: value ? "manual_override" as const : "manual_needed" as const
          })
        : normalizeManualTaskState({
            ...candidate,
            assigneeId: value,
            slotSource: "manual" as const
          })
      : candidate
  );
  const now = new Date().toISOString();
  const overrideLog = log(
    {
      runId: run.id,
      projectId: task.projectId,
      taskId,
      step: "override",
      ruleHit: "override",
      ruleText: "人工覆写",
      inputs: { field, prev },
      output: { field, next: value },
      result: "warn",
      reason,
      override: { operator, reason, prev, next: value, at: now }
    },
    now
  );
  const conflicts = validateTasks(run.id, nextTasks);
  const decisionLogs = [...run.decisionLogs, overrideLog];
  linkDecisionChains(decisionLogs);
  return {
    ...run,
    tasks: nextTasks,
    decisionLogs,
    conflicts,
    audit: createAuditReport(run.audit.inputProjects, decisionLogs, nextTasks, conflicts)
  };
};

export const recompute = (
  _run: SchedulingRun,
  _fromStep: "scope" | "frequency" | "assignee" | "time" | "validation",
  period: PlanPeriod,
  projects: Project[],
  options: GenerateRunOptions = {}
) =>
  generateRun(period, projects, {
    ...options,
    supersedes: _run.id,
    runType: options.runType ?? "manual_recompute"
  });
