import type { Conflict, IssueBoard, Project, PublishIssue, PublishIssueKind, RuleDecisionDraft, SchedulingRun, Task } from "@inspection/domain";
import { businessRuleByTechnicalId } from "./business-rules.js";

type IssueBoardOptions = {
  run: SchedulingRun;
  projects: Project[];
  ruleDrafts?: RuleDecisionDraft[];
};

const issueKinds: PublishIssueKind[] = ["rule_gap", "project_data_gap", "manual_confirm", "time_conflict", "hint"];
const dataGapRules = new Set(["P5", "P6"]);

const dataGapField = (ruleId: string | null | undefined) =>
  ruleId === "P5" ? "memberCount" : ruleId === "P6" ? "relatedPartyStockCount" : null;

const dataGapAction = (ruleId: string | null | undefined) =>
  ruleId === "P5"
    ? "到项目维护页补齐集团旗下存量客户数。"
    : ruleId === "P6"
      ? "到项目维护页补齐担保人/母公司旗下存量客户数。"
      : "到项目维护页补齐项目基础数据。";

const checkTypeLabel = (task: Task) => (task.checkType === "onsite" ? "现场检查" : "非现场检查");

const missingTaskItems = (task: Task) => {
  const items = [];
  if (!task.assigneeId) items.push("负责人");
  if (!task.scheduledDate) items.push("开始日期");
  if (task.status === "unplaceable") items.push("可用完整工作周");
  return items.length ? items.join("、") : "人工确认";
};

const projectNameLookup = (projects: Project[]) => new Map(projects.map((project) => [project.id, project.name || project.id]));

const baseSummary = (): Record<PublishIssueKind, number> =>
  issueKinds.reduce((summary, kind) => ({ ...summary, [kind]: 0 }), {} as Record<PublishIssueKind, number>);

const conflictTask = (conflict: Conflict, tasks: Task[]) =>
  conflict.taskIds.map((taskId) => tasks.find((task) => task.id === taskId)).find((task): task is Task => Boolean(task));

export const createIssueBoard = ({ run, projects, ruleDrafts = [] }: IssueBoardOptions): IssueBoard => {
  const projectNames = projectNameLookup(projects);
  const submittedRules = new Set(ruleDrafts.filter((draft) => draft.status === "submitted").map((draft) => draft.technicalRuleId));
  const issues: PublishIssue[] = [];

  const blockedLogs = run.decisionLogs.filter(
    (log) => log.step === "frequency" && log.result === "block" && (log.ruleHit === "RULE_GAP" || log.ruleHit?.startsWith("P"))
  );
  const logsByRule = new Map<string, typeof blockedLogs>();
  for (const log of blockedLogs) {
    const ruleId = log.ruleHit && log.ruleHit !== "RULE_GAP" ? log.ruleHit : "RULE_GAP";
    logsByRule.set(ruleId, [...(logsByRule.get(ruleId) ?? []), log]);
  }

  for (const [ruleId, logs] of logsByRule) {
    if (submittedRules.has(ruleId)) continue;
    const projectIds = [...new Set(logs.map((log) => log.projectId))];
    const names = projectIds.map((projectId) => projectNames.get(projectId) ?? projectId);
    const businessRule = businessRuleByTechnicalId(ruleId);
    const isDataGap = dataGapRules.has(ruleId);
    const kind: PublishIssueKind = isDataGap ? "project_data_gap" : "rule_gap";
    issues.push({
      id: `${kind}-${ruleId}`,
      kind,
      severity: "block",
      title: businessRule?.businessTitle ?? "检查口径待补全",
      objectLabel: `${isDataGap ? "项目数据" : "规则口径"} · ${ruleId}`,
      description: businessRule?.businessOutcome ?? logs[0]?.reason ?? "当前项目命中未量化口径。",
      requiredAction: isDataGap ? dataGapAction(ruleId) : "补充量化口径，完成试算后提交纳入排期规则。",
      technicalRuleId: ruleId,
      projectIds,
      projectNames: names,
      projectId: projectIds[0] ?? null,
      projectName: names[0] ?? null,
      taskId: null,
      checkType: null,
      field: dataGapField(ruleId),
      affectedProjectCount: projectIds.length
    });
  }

  for (const task of run.tasks.filter((item) => item.status === "manual_needed" || item.status === "unplaceable")) {
    const taskRuleHit = run.decisionLogs.find((log) => log.taskId === task.id)?.ruleHit ?? null;
    if (taskRuleHit === "RULE_GAP" || taskRuleHit?.startsWith("P")) continue;
    issues.push({
      id: `manual_confirm-${task.id}`,
      kind: "manual_confirm",
      severity: "warn",
      title: task.projectName,
      objectLabel: `${task.projectId} · ${checkTypeLabel(task)}`,
      description: `需要人工确认：${missingTaskItems(task)}。`,
      requiredAction: "到排期方案中确认负责人或开始日期，并保留人工处理原因。",
      technicalRuleId: taskRuleHit,
      projectIds: [task.projectId],
      projectNames: [task.projectName],
      projectId: task.projectId,
      projectName: task.projectName,
      taskId: task.id,
      checkType: task.checkType,
      field: null,
      affectedProjectCount: 1
    });
  }

  for (const conflict of run.conflicts.filter((item) => item.status === "open" && item.kind !== "RULE_GAP")) {
    const task = conflictTask(conflict, run.tasks);
    const kind: PublishIssueKind = conflict.severity === "hard" ? "time_conflict" : "hint";
    issues.push({
      id: `${kind}-${conflict.id}`,
      kind,
      severity: conflict.severity === "hard" ? "block" : "info",
      title: conflict.message,
      objectLabel: conflict.severity === "hard" ? "时间冲突" : "排期提示",
      description: conflict.severity === "hard" ? "该冲突会阻断正式发布。" : "软提示不阻断发布，建议发布前确认。",
      requiredAction: task ? "到排期方案查看任务并确认是否接受。" : "到排期方案查看冲突详情。",
      technicalRuleId: conflict.kind,
      projectIds: task ? [task.projectId] : [],
      projectNames: task ? [task.projectName] : [],
      projectId: task?.projectId ?? null,
      projectName: task?.projectName ?? null,
      taskId: task?.id ?? null,
      checkType: task?.checkType ?? null,
      field: null,
      affectedProjectCount: task ? 1 : 0
    });
  }

  const summary = baseSummary();
  for (const issue of issues) summary[issue.kind] += 1;

  return {
    runId: run.id,
    summary,
    issues
  };
};
