import type { SchedulingRun } from "@inspection/domain";

export type RunDiffItem = {
  projectId: string;
  projectName: string;
  kind: "frequency" | "assignee" | "time" | "new_in_scope" | "removed" | "status";
  before: unknown;
  after: unknown;
  reason: string;
};

const taskSignature = (run: SchedulingRun, projectId: string) =>
  run.tasks
    .filter((task) => task.projectId === projectId)
    .map((task) => `${task.checkType}:${task.occurrenceIndex}/${task.occurrenceTotal}:${task.assigneeName}:${task.scheduledDate}`)
    .sort();

const frequencySignature = (run: SchedulingRun, projectId: string) => {
  const log = run.decisionLogs.find((entry) => entry.projectId === projectId && entry.step === "frequency");
  return log?.output ?? null;
};

const assigneeSignature = (run: SchedulingRun, projectId: string) => {
  const log = run.decisionLogs.find((entry) => entry.projectId === projectId && entry.step === "assignee");
  return log?.output ?? null;
};

const projectName = (run: SchedulingRun, projectId: string) =>
  run.tasks.find((task) => task.projectId === projectId)?.projectName ?? projectId;

export const diffRuns = (from: SchedulingRun, to: SchedulingRun): RunDiffItem[] => {
  const ids = new Set([...from.decisionLogs.map((entry) => entry.projectId), ...to.decisionLogs.map((entry) => entry.projectId)]);
  const items: RunDiffItem[] = [];

  for (const projectId of ids) {
    const beforeFreq = frequencySignature(from, projectId);
    const afterFreq = frequencySignature(to, projectId);
    if (JSON.stringify(beforeFreq) !== JSON.stringify(afterFreq)) {
      items.push({
        projectId,
        projectName: projectName(to, projectId),
        kind: beforeFreq ? "frequency" : "new_in_scope",
        before: beforeFreq,
        after: afterFreq,
        reason: to.decisionLogs.find((entry) => entry.projectId === projectId && entry.step === "frequency")?.reason ?? "频次变化"
      });
    }

    const beforeAssignee = assigneeSignature(from, projectId);
    const afterAssignee = assigneeSignature(to, projectId);
    if (JSON.stringify(beforeAssignee) !== JSON.stringify(afterAssignee)) {
      items.push({
        projectId,
        projectName: projectName(to, projectId),
        kind: "assignee",
        before: beforeAssignee,
        after: afterAssignee,
        reason: to.decisionLogs.find((entry) => entry.projectId === projectId && entry.step === "assignee")?.reason ?? "人员变化"
      });
    }

    const beforeTasks = taskSignature(from, projectId);
    const afterTasks = taskSignature(to, projectId);
    if (JSON.stringify(beforeTasks) !== JSON.stringify(afterTasks)) {
      items.push({
        projectId,
        projectName: projectName(to, projectId),
        kind: "time",
        before: beforeTasks,
        after: afterTasks,
        reason: "任务、负责人或建议时间发生变化"
      });
    }
  }

  return items;
};
