import { labelMaps, type DecisionLog, type Project, type SchedulingRun, type Task } from "@inspection/domain";
import * as XLSX from "xlsx";
import { businessRuleByTechnicalId } from "./business-rules.js";

type WorkbookRow = Record<string, string | number | boolean | null>;

const checkTypeLabel = (type: Task["checkType"]) => labelMaps.checkType[type];

const taskStatusLabel: Record<Task["status"], string> = {
  pending: "待执行",
  completed: "已完成",
  delayed: "延期",
  exempted: "人工确认不安排",
  unplaceable: "需人工改期",
  manual_needed: "待人工确认"
};

const dateBasisLabel: Record<Task["dateBasis"], string> = {
  history: "参考历史时间",
  term_half: "按期限中点",
  credit_anniversary: "按授信周年",
  balanced: "负荷均衡",
  balanced_shift: "负荷均衡后顺延",
  completion_window: "完成窗口",
  unplaceable: "无可用完整工作周",
  manual_needed: "发布前人工确认",
  manual_override: "人工调整"
};

const stepLabel: Record<DecisionLog["step"], string> = {
  scope: "数据准备/入池",
  frequency: "规则判断/频次",
  assignee: "人员匹配",
  time: "时间安排",
  validation: "发布校验",
  override: "人工调整"
};

const resultLabel: Record<DecisionLog["result"], string> = {
  pass: "通过",
  warn: "提示",
  block: "阻断",
  excluded: "免检"
};

const conflictSeverityLabel: Record<SchedulingRun["conflicts"][number]["severity"], string> = {
  hard: "阻断",
  soft: "提示"
};

const conflictStatusLabel: Record<SchedulingRun["conflicts"][number]["status"], string> = {
  open: "待处理",
  resolved: "已解决",
  overridden: "已人工处理"
};

const appendSheet = (workbook: XLSX.WorkBook, rows: WorkbookRow[], name: string) => {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
};

const formatWindow = (task: Task) =>
  task.scheduledDate && task.endDate ? `${task.scheduledDate}~${task.endDate.slice(5)}` : "待人工";

const monthOf = (task: Task) => task.scheduledDate ? Number(task.scheduledDate.slice(5, 7)) : null;

const businessRuleLabel = (ruleId: string | null | undefined) => {
  if (!ruleId || ruleId === "RULE_GAP") return "检查口径待补全";
  if (ruleId === "override") return "人工调整";
  return businessRuleByTechnicalId(ruleId)?.businessTitle ?? "业务规则";
};

const countBy = <T>(items: T[], keyFn: (item: T) => string) => {
  const rows = new Map<string, number>();
  for (const item of items) rows.set(keyFn(item), (rows.get(keyFn(item)) ?? 0) + 1);
  return [...rows.entries()].map(([name, count]) => ({ 分类: name, 数量: count }));
};

const projectIdsInScope = (run: SchedulingRun) => [...new Set(run.tasks.map((task) => task.projectId))];

const makeSummaryRows = (run: SchedulingRun): WorkbookRow[] => {
  const tasks = run.tasks;
  const projectCount = projectIdsInScope(run).length;
  const manualTasks = tasks.filter((task) => task.status === "manual_needed" || task.status === "unplaceable").length;
  const placedTasks = tasks.filter((task) => task.isPlaced).length;
  const manuallySkippedTasks = tasks.filter((task) => task.status === "exempted" && task.slotSource === "manual").length;
  return [
    { 项目: "年度", 内容: run.planPeriod.year },
    { 项目: "项目总数", 内容: run.audit.inputProjects },
    { 项目: "纳入检查项目", 内容: projectCount || run.audit.inScope },
    { 项目: "免检/不纳入项目", 内容: run.audit.excluded },
    { 项目: "现场任务", 内容: run.audit.onsiteTasks },
    { 项目: "非现场任务", 内容: run.audit.offsiteTasks },
    { 项目: "已排入任务", 内容: placedTasks },
    { 项目: "待人工任务", 内容: manualTasks },
    { 项目: "人工确认不安排任务", 内容: manuallySkippedTasks },
    { 项目: "阻断冲突", 内容: run.audit.hardConflicts },
    { 项目: "人工调整", 内容: run.audit.manualOverrides },
    { 项目: "生成时间", 内容: run.createdAt },
    { 项目: "发布版本", 内容: run.rulesetVersion }
  ];
};

type WorkbookContext = {
  projects?: Project[];
};

const projectMapFrom = (projects?: Project[]) => new Map((projects ?? []).map((project) => [project.id, project]));

const makeCategoryRows = (run: SchedulingRun, context: WorkbookContext): WorkbookRow[] => {
  const tasks = run.tasks;
  const uniqueProjects = new Map<string, Task>();
  for (const task of tasks) if (!uniqueProjects.has(task.projectId)) uniqueProjects.set(task.projectId, task);
  const projectById = projectMapFrom(context.projects);
  const inScopeProjects = [...uniqueProjects.keys()]
    .map((id) => projectById.get(id))
    .filter((project): project is Project => Boolean(project));
  const projectCategoryRows = inScopeProjects.length
    ? [
        ...countBy(inScopeProjects, (project) => labelMaps.customerType[project.customerType]).map((row) => ({ 统计维度: "客户类型", ...row })),
        ...countBy(inScopeProjects, (project) => labelMaps.riskGrade[project.riskGrade]).map((row) => ({ 统计维度: "风险分类", ...row })),
        ...countBy(inScopeProjects, (project) => labelMaps.industry[project.industry]).map((row) => ({ 统计维度: "行业", ...row })),
        ...countBy(inScopeProjects, (project) => labelMaps.bizType[project.bizType]).map((row) => ({ 统计维度: "业务类型", ...row }))
      ]
    : countBy([...uniqueProjects.values()], (task) => task.projectName.includes("内部") ? "内部/集团内" : task.projectName.includes("保理") ? "保理" : "一般项目")
      .map((row) => ({ 统计维度: "项目名称识别", ...row }));
  return [
    { 统计维度: "项目类别", 分类: "纳入检查", 数量: uniqueProjects.size || run.audit.inScope },
    { 统计维度: "项目类别", 分类: "免检/不纳入", 数量: run.audit.excluded },
    ...projectCategoryRows,
    ...countBy(tasks.filter((task) => task.status !== "exempted"), (task) => checkTypeLabel(task.checkType)).map((row) => ({ 统计维度: "检查形式", ...row })),
    ...countBy(tasks.filter((task) => task.status !== "exempted"), (task) => task.assigneeName ?? "待人工").map((row) => ({ 统计维度: "负责人", ...row })),
    ...countBy(tasks, (task) => task.status === "exempted" ? "人工确认不安排" : task.status === "manual_needed" || task.status === "unplaceable" ? "待人工" : task.isPlaced ? "已排入" : "未排入")
      .map((row) => ({ 统计维度: "任务状态", ...row }))
  ];
};

const makeScheduleRows = (run: SchedulingRun, context: WorkbookContext): WorkbookRow[] => {
  const projectById = projectMapFrom(context.projects);
  return run.tasks.map((task) => {
    const project = projectById.get(task.projectId);
    return {
  项目编号: task.projectId,
  项目名称: task.projectName,
  归属集团: project?.groupName ?? "",
  客户类型: project ? labelMaps.customerType[project.customerType] : "",
  风险分类: project ? labelMaps.riskGrade[project.riskGrade] : "",
  行业: project ? labelMaps.industry[project.industry] : "",
  业务类型: project ? labelMaps.bizType[project.bizType] : "",
  检查形式: checkTypeLabel(task.checkType),
  检查次数: `${task.occurrenceIndex}/${task.occurrenceTotal}`,
  开始日期: task.status === "exempted" ? "本年不安排" : task.scheduledDate ?? "待人工",
  结束日期: task.status === "exempted" ? "本年不安排" : task.endDate ?? "待人工",
  月份: task.status === "exempted" ? "本年不安排" : monthOf(task) ?? "待人工",
  负责人: task.assigneeName ?? "待安排",
  任务状态: taskStatusLabel[task.status],
  排入状态: task.status === "exempted" ? "人工确认不安排" : task.isPlaced ? "已排入" : "未排入",
  时间依据: dateBasisLabel[task.dateBasis],
  人工确认: task.slotSource === "manual" || task.status === "manual_needed" || task.status === "unplaceable" ? "是" : "否",
  报告引用: task.reportRef ?? ""
    };
  });
};

const makeRuleRows = (run: SchedulingRun, context: WorkbookContext): WorkbookRow[] => {
  const projectById = projectMapFrom(context.projects);
  const logsByProject = new Map<string, DecisionLog[]>();
  for (const log of run.decisionLogs) {
    const rows = logsByProject.get(log.projectId) ?? [];
    rows.push(log);
    logsByProject.set(log.projectId, rows);
  }
  return [...logsByProject.entries()].map(([projectId, logs]) => {
    const tasks = run.tasks.filter((task) => task.projectId === projectId);
    const executableTasks = tasks.filter((task) => task.status !== "exempted");
    const project = projectById.get(projectId);
    const frequencyLogs = logs.filter((log) => log.step === "frequency");
    const blockingLogs = logs.filter((log) => log.result === "block");
    const manualLogs = logs.filter((log) => log.result === "warn");
    return {
      项目编号: projectId,
      项目名称: tasks[0]?.projectName ?? projectId,
      客户类型: project ? labelMaps.customerType[project.customerType] : "",
      风险分类: project ? labelMaps.riskGrade[project.riskGrade] : "",
      行业: project ? labelMaps.industry[project.industry] : "",
      业务类型: project ? labelMaps.bizType[project.bizType] : "",
      现场任务: executableTasks.filter((task) => task.checkType === "onsite").length,
      非现场任务: executableTasks.filter((task) => task.checkType === "offsite").length,
      命中规则: [...new Set(frequencyLogs.map((log) => businessRuleLabel(log.ruleHit)))].join("；") || "无频次任务",
      阻断原因: blockingLogs.map((log) => log.reason).join("；"),
      待人工原因: manualLogs.map((log) => log.reason).join("；"),
      任务负责人: [...new Set(tasks.map((task) => task.assigneeName ?? "待安排"))].join("、"),
      时间安排: tasks.map(formatWindow).join("；")
    };
  });
};

const makePeopleRows = (run: SchedulingRun): WorkbookRow[] => {
  const people = new Map<string, WorkbookRow>();
  for (const task of run.tasks.filter((item) => item.status !== "exempted")) {
    const key = task.assigneeName ?? "待人工";
    const row = people.get(key) ?? {
      负责人: key,
      现场任务: 0,
      非现场任务: 0,
      待人工任务: 0,
      未排入任务: 0,
      "1月": 0,
      "2月": 0,
      "3月": 0,
      "4月": 0,
      "5月": 0,
      "6月": 0,
      "7月": 0,
      "8月": 0,
      "9月": 0,
      "10月": 0,
      "11月": 0,
      "12月": 0
    };
    if (task.checkType === "onsite") row.现场任务 = Number(row.现场任务) + 1;
    if (task.checkType === "offsite") row.非现场任务 = Number(row.非现场任务) + 1;
    if (task.status === "manual_needed" || task.status === "unplaceable") row.待人工任务 = Number(row.待人工任务) + 1;
    if (!task.isPlaced) row.未排入任务 = Number(row.未排入任务) + 1;
    const month = monthOf(task);
    if (month) row[`${month}月`] = Number(row[`${month}月`]) + 1;
    people.set(key, row);
  }
  return [...people.values()];
};

const makeIssueRows = (run: SchedulingRun): WorkbookRow[] => {
  const manualRows = run.tasks
    .filter((task) => task.status !== "exempted" && (task.status === "manual_needed" || task.status === "unplaceable" || !task.isPlaced))
    .map((task) => ({
      类型: "待人工/未排入",
      项目编号: task.projectId,
      项目名称: task.projectName,
      检查形式: checkTypeLabel(task.checkType),
      当前负责人: task.assigneeName ?? "待安排",
      当前时间: formatWindow(task),
      问题: task.status === "unplaceable" ? "缺少可用完整工作周" : task.scheduledDate ? "需人工确认" : "缺少开始日期",
      建议动作: "确认负责人和开始日期"
    }));
  const conflictRows = run.conflicts.map((conflict) => ({
    类型: conflictSeverityLabel[conflict.severity],
    项目编号: "",
    项目名称: "",
    检查形式: "",
    当前负责人: "",
    当前时间: "",
    问题: conflict.message,
    建议动作: conflictStatusLabel[conflict.status],
    关联任务: conflict.taskIds.join("；")
  }));
  return [...manualRows, ...conflictRows];
};

const makeTraceRows = (run: SchedulingRun): WorkbookRow[] => {
  const decisionRows = run.decisionLogs.map((log) => ({
    记录时间: log.createdAt,
    项目编号: log.projectId,
    任务编号: log.taskId ?? "",
    处理阶段: stepLabel[log.step],
    命中规则: businessRuleLabel(log.ruleHit),
    判断结果: resultLabel[log.result],
    业务说明: log.reason,
    是否人工调整: log.override ? "是" : "否",
    人工原因: log.override?.reason ?? ""
  }));
  const overrideRows = run.decisionLogs
    .filter((log) => log.override)
    .map((log) => ({
      记录时间: log.override?.at ?? log.createdAt,
      项目编号: log.projectId,
      任务编号: log.taskId ?? "",
      处理阶段: "人工调整",
      命中规则: "人工调整",
      判断结果: "已留痕",
      业务说明: log.override?.reason ?? "",
      是否人工调整: "是",
      人工原因: log.override?.reason ?? ""
    }));
  return [...decisionRows, ...overrideRows];
};

const fieldRows: WorkbookRow[] = [
  { 字段: "发布摘要", 说明: "展示年度、项目分类、任务数量、待人工和冲突数量；不作为发布审批结论。" },
  { 字段: "正式排期", 说明: "执行主表，只保留项目、检查形式、日期、负责人、状态和时间依据。" },
  { 字段: "项目规则说明", 说明: "说明每个项目的频次来源、阻断或待人工原因。" },
  { 字段: "人员负荷", 说明: "按负责人统计年度任务和 1-12 月分布。" },
  { 字段: "异常与待人工", 说明: "集中列出待人工、未排入、冲突和建议处理动作。" },
  { 字段: "审计留痕", 说明: "记录规则判断、人工调整、判断结果和业务说明。" }
];

export const runToWorkbook = (run: SchedulingRun, context: WorkbookContext = {}) => {
  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, [...makeSummaryRows(run), {}, ...makeCategoryRows(run, context)], "发布摘要");
  appendSheet(workbook, makeScheduleRows(run, context), "正式排期");
  appendSheet(workbook, makeRuleRows(run, context), "项目规则说明");
  appendSheet(workbook, makePeopleRows(run), "人员负荷");
  appendSheet(workbook, makeIssueRows(run), "异常与待人工");
  appendSheet(workbook, makeTraceRows(run), "审计留痕");
  appendSheet(workbook, fieldRows, "字段说明");
  return workbook;
};

export const writeRunWorkbook = (run: SchedulingRun, filePath: string) => {
  XLSX.writeFile(runToWorkbook(run), filePath);
};
