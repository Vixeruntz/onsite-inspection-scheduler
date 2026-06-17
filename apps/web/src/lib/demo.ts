import type { DecisionResult, SchedulingRun, Task } from "@inspection/domain";
import { businessRuleByTechnicalId, businessRuleOrders, diffRuns, evidenceForRule, evidenceLibrary, createDemoWorkspace } from "@inspection/scheduler";

export const workspace = createDemoWorkspace();

export const primaryRun = workspace.currentRun;
export const asset7Run = workspace.asset7Run;
export const planningYear = workspace.planningYear;
export const runDiff = diffRuns(primaryRun, asset7Run);
export { businessRuleByTechnicalId, businessRuleOrders, evidenceForRule, evidenceLibrary };

export const resultRank: Record<DecisionResult, number> = {
  block: 4,
  warn: 3,
  pass: 2,
  excluded: 1
};

export const projectIds = [...new Set(primaryRun.decisionLogs.map((entry) => entry.projectId))];

export const projectStatus = (run: SchedulingRun, projectId: string) => {
  const logs = run.decisionLogs.filter((entry) => entry.projectId === projectId);
  const sorted = [...logs].sort((a, b) => resultRank[b.result] - resultRank[a.result]);
  return sorted[0]?.result ?? "pass";
};

export const stepStatus = (run: SchedulingRun, projectId: string) => {
  const byStep = new Map<string, DecisionResult>();
  for (const step of ["scope", "frequency", "assignee", "time", "validation"] as const) {
    const logs = run.decisionLogs.filter((entry) => entry.projectId === projectId && entry.step === step);
    const sorted = logs.sort((a, b) => resultRank[b.result] - resultRank[a.result]);
    byStep.set(step, sorted[0]?.result ?? "pass");
  }
  return byStep;
};

export const tasksForProject = (run: SchedulingRun, projectId: string) =>
  run.tasks.filter((task) => task.projectId === projectId);

export const projectById = new Map(workspace.projects.map((project) => [project.id, project]));

export const monthTaskClasses = (tasks: Task[]) => {
  const classes = Array.from({ length: 12 }, () => "");
  for (const task of tasks) {
    if (task.status === "exempted") continue;
    if (!task.scheduledDate) continue;
    const month = Number(task.scheduledDate.slice(5, 7)) - 1;
    classes[month] = task.checkType === "onsite" ? "onsite" : classes[month] === "onsite" ? "onsite" : "offsite";
  }
  if (tasks.some((task) => task.status !== "exempted" && !task.isPlaced)) {
    classes[0] = "conflict";
  }
  return classes;
};

export const peopleCapacity = (run: SchedulingRun) => {
  const rows = new Map<string, { name: string; onsite: number; offsite: number; unplaced: number; months: number[] }>();
  for (const task of run.tasks.filter((item) => item.status !== "exempted")) {
    const name = task.assigneeName ?? "待人工";
    const row = rows.get(name) ?? { name, onsite: 0, offsite: 0, unplaced: 0, months: Array.from({ length: 12 }, () => 0) };
    if (task.checkType === "onsite") {
      row.onsite += 1;
      if (task.scheduledDate) row.months[Number(task.scheduledDate.slice(5, 7)) - 1]! += 1;
    }
    if (task.checkType === "offsite") row.offsite += 1;
    if (!task.isPlaced) row.unplaced += 1;
    rows.set(name, row);
  }
  return [...rows.values()].sort((a, b) => b.onsite - a.onsite || a.name.localeCompare(b.name, "zh-CN"));
};

export const statusLabel = {
  pass: "已覆盖",
  warn: "待确认",
  block: "阻断",
  excluded: "免检"
} as const;

export const stepLabel = {
  scope: "入池",
  frequency: "频次",
  assignee: "人员",
  time: "时间",
  validation: "校验",
  override: "覆写"
} as const;
