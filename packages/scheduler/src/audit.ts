import type { AuditReport, Conflict, DecisionLog, Task } from "@inspection/domain";

export const createAuditReport = (inputProjects: number, logs: DecisionLog[], tasks: Task[], conflicts: Conflict[]): AuditReport => {
  const executableTasks = tasks.filter((task) => task.status !== "exempted");
  const excluded = new Set(logs.filter((log) => log.step === "scope" && log.result === "excluded").map((log) => log.projectId)).size;
  const inScope = inputProjects - excluded;
  const ruleHitDistribution: Record<string, number> = {};
  for (const log of logs.filter((entry) => entry.step === "frequency")) {
    const rule = log.ruleHit ?? "RULE_GAP";
    ruleHitDistribution[rule] = (ruleHitDistribution[rule] ?? 0) + 1;
  }

  const ruleGap = new Set(
    logs
      .filter((entry) => entry.step === "frequency" && entry.result === "block" && (entry.ruleHit === "RULE_GAP" || entry.ruleHit?.startsWith("P")))
      .map((entry) => entry.projectId)
  ).size;
  const hardConflicts = conflicts.filter((conflict) => conflict.severity === "hard" && conflict.status === "open" && conflict.kind !== "RULE_GAP").length;
  const manualOverrides = logs.filter((entry) => entry.step === "override").length;
  const pendingManual = tasks.filter((task) => task.status === "manual_needed" || task.status === "unplaceable").length;

  return {
    inputProjects,
    inScope,
    excluded,
    onsiteTasks: executableTasks.filter((task) => task.checkType === "onsite").length,
    offsiteTasks: executableTasks.filter((task) => task.checkType === "offsite").length,
    ruleHitDistribution,
    unmatchedFrequency: logs.filter((entry) => entry.step === "frequency" && entry.ruleHit === "RULE_GAP").length,
    ruleGap,
    hardConflicts,
    manualOverrides,
    pendingManual,
    publishable: ruleGap === 0 && hardConflicts === 0
  };
};
