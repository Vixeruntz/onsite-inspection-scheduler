import type { Conflict, DecisionExplanation, DecisionLog, FrequencyValue, Project, RuleEvidence, Task } from "@inspection/domain";
import { businessRuleByTechnicalId, evidenceForRule } from "./business-rules.js";

const labels = {
  riskGrade: {
    normal: "正常",
    watch: "关注",
    substandard: "次级",
    doubtful: "可疑",
    loss: "损失"
  },
  customerType: {
    internal: "内部",
    collab_a: "协同A",
    collab_b: "协同B",
    external: "外部"
  },
  industry: {
    energy: "能源环保",
    healthcare: "医疗健康",
    public_services: "民生公用",
    other: "其他类"
  },
  bizType: {
    leaseback: "回租",
    direct_lease: "直租",
    factoring: "保理"
  }
} as const;

type ExplanationInput = {
  project: Project;
  logs: DecisionLog[];
  tasks: Task[];
  conflicts?: Conflict[];
};

const stepTitles: Record<DecisionLog["step"], string> = {
  scope: "是否纳入检查计划",
  frequency: "检查频次安排",
  assignee: "人员安排",
  time: "时间安排",
  validation: "发布校验",
  override: "人工调整留痕"
};

const stepQuestions: Record<DecisionLog["step"], string> = {
  scope: "这个项目是否需要纳入本年度检查计划？",
  frequency: "本年度需要安排几次现场和非现场检查？",
  assignee: "这项检查由谁负责更合适？",
  time: "检查应安排在什么时间窗口？",
  validation: "这个项目当前能否进入正式发布？",
  override: "是否有人对系统建议做过人工调整？"
};

const factLabels: Record<string, string> = {
  exposureBalance: "风险敞口",
  exposureInit: "初始敞口",
  isSettledThisYear: "当年结清",
  isNewWithin1y: "当年新增短期限",
  riskGrade: "风险分类",
  customerType: "客户类型",
  industry: "行业",
  bizType: "业务类型",
  hospitalType: "医院类型",
  groupMemberCount: "集团存量客户数",
  dept: "业务部门",
  isNpl: "不良类",
  maintainer: "样表维护人",
  anchorMonth: "参考月份",
  targetMonth: "目标月份",
  halfReq: "半年度要求",
  taskCount: "任务数",
  siteMonths: "现场月份",
  scheduledDate: "开始日期",
  endDate: "结束日期",
  status: "状态",
  conflicts: "校验问题"
};

const dateBasisLabels: Record<Task["dateBasis"], string> = {
  history: "参考历史检查节奏",
  term_half: "参考项目中期时间安排",
  credit_anniversary: "参考授信起始周年",
  balanced: "按全年负荷均衡安排",
  balanced_shift: "因容量调整后安排",
  completion_window: "非现场 5 个工作日完成窗口",
  unplaceable: "全年可用窗口不足",
  manual_needed: "需要人工确定时间",
  manual_override: "发布前人工确认"
};

const assigneeReasons: Record<string, string> = {
  "A-1": "沿用长期归属关系，因此优先保持负责人稳定。",
  "A-2": "项目命中专项标签，因此优先匹配具备对应经验的人员。",
  "A-3": "沿用样表中的维护人，便于保持项目上下文连续。",
  "A-4": "未命中专项归属时，按人员负荷进行均衡安排。"
};

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿元`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)} 万元`;
  return `${value} 元`;
};

const formatValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return "未填";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number" && (key.includes("exposure") || key.includes("Balance") || key.includes("Init"))) return formatCurrency(value);
  if (key === "customerType" && typeof value === "string") return labels.customerType[value as keyof typeof labels.customerType] ?? value;
  if (key === "riskGrade" && typeof value === "string") return labels.riskGrade[value as keyof typeof labels.riskGrade] ?? value;
  if (key === "industry" && typeof value === "string") return labels.industry[value as keyof typeof labels.industry] ?? value;
  if (key === "bizType" && typeof value === "string") return labels.bizType[value as keyof typeof labels.bizType] ?? value;
  if (key === "hospitalType" && value === "public_hospital") return "公立医院";
  if (key === "hospitalType" && value === "private_hospital") return "民营医院";
  if (key === "halfReq" && value === "H1") return "上半年";
  if (key === "halfReq" && value === "H2") return "下半年";
  if (key === "siteMonths" && Array.isArray(value)) return value.length ? value.map((month) => `${month}月`).join("、") : "无现场月份";
  if (key === "conflicts" && Array.isArray(value)) return value.length ? `${value.length} 项问题` : "无问题";
  if (Array.isArray(value)) return value.length ? value.map(String).join("、") : "无";
  if (typeof value === "object") return "见系统追溯";
  return String(value);
};

const factsFrom = (record: Record<string, unknown>) =>
  Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      label: factLabels[key] ?? key,
      value: formatValue(key, value)
    }));

const formatFrequency = (value: FrequencyValue | undefined): string => {
  if (!value) return "未安排";
  if (value.special === "manual_warning_plan") return "按预警处理方案人工确定";
  if (value.special === "not_mandatory") return "原则上不强制";
  if (value.special === "asset_department_decides") return "由资产管理部明确";
  if (!value.count) return "不安排";
  return value.period === "two_years" ? `每两年 ${value.count} 次` : `每年 ${value.count} 次`;
};

const formatTask = (task: Task) => {
  const type = task.checkType === "onsite" ? "现场检查" : "非现场检查";
  if (!task.scheduledDate) return `${type}暂未自动排期，需要人工确认。`;
  const end = task.endDate ? ` 至 ${task.endDate}` : "";
  const assignee = task.assigneeName ? `，由${task.assigneeName}负责` : "";
  const basis = dateBasisLabels[task.dateBasis];
  return `安排第 ${task.occurrenceIndex}/${task.occurrenceTotal} 次${type}${assignee}，计划 ${task.scheduledDate}${end}，${basis}。`;
};

const taskFacts = (task: Task | undefined) =>
  task
    ? [
        { label: "检查类型", value: task.checkType === "onsite" ? "现场检查" : "非现场检查" },
        { label: "负责人", value: task.assigneeName ?? "待人工" },
        { label: "计划窗口", value: task.scheduledDate ? `${task.scheduledDate}${task.endDate ? ` 至 ${task.endDate}` : ""}` : "待人工" },
        { label: "排期依据", value: dateBasisLabels[task.dateBasis] }
      ]
    : [];

const impactFor = (log: DecisionLog, publishImpact?: DecisionExplanation["impact"]): DecisionExplanation["impact"] => {
  if (log.result === "block") return "blocks_publish";
  if (log.result === "warn") return "manual_needed";
  if (log.result === "excluded") return "excluded";
  return publishImpact ?? "can_publish";
};

const operatorMessageFor = (impact: DecisionExplanation["impact"], log: DecisionLog) => {
  if (impact === "blocks_publish") return "不允许正式发布：请先补全业务口径或处理硬性冲突，再重新生成方案。";
  if (impact === "manual_needed") return "可形成草案，但需要业务人员确认后再进入正式发布。";
  if (impact === "excluded") return "本项目无需生成检查任务。";
  if (log.step === "validation") return "本项目未发现发布阻断。";
  return "无需额外处理，继续下一步判断。";
};

const answerFor = (log: DecisionLog, project: Project, task: Task | undefined) => {
  const businessRule = businessRuleByTechnicalId(log.ruleHit);
  if (businessRule) {
    if (log.result === "block") return `不允许正式发布：${businessRule.businessOutcome}`;
    if (log.step === "frequency") {
      const onsite = formatFrequency(log.output.onsite as FrequencyValue | undefined);
      const offsite = formatFrequency(log.output.offsite as FrequencyValue | undefined);
      return `${businessRule.businessOutcome} 本项目建议为：现场${onsite}，非现场${offsite}。`;
    }
    return businessRule.businessOutcome;
  }

  if (log.step === "assignee") {
    const assigneeName = typeof log.output.assigneeName === "string" ? log.output.assigneeName : "待人工";
    const basis = log.ruleHit ? assigneeReasons[log.ruleHit] : null;
    return assigneeName === "待人工" ? "当前未找到可自动分派的负责人，需要人工指定。" : `建议由${assigneeName}负责。${basis ?? "系统根据人员池和项目特征给出建议。"}`;
  }

  if (log.step === "time") return task ? formatTask(task) : log.result === "warn" ? "本步骤需要人工确定时间。" : "系统已完成时间安排。";

  if (log.step === "validation") {
    const conflicts = Array.isArray(log.output.conflicts) ? log.output.conflicts : [];
    if (log.result === "block") return "存在正式发布前必须处理的问题，当前项目不能直接发布。";
    if (log.result === "warn") return "存在需要业务关注的提示，建议发布前确认。";
    return conflicts.length ? "存在提示项，但未发现硬性阻断。" : "未发现硬性冲突或待补全规则。";
  }

  if (log.step === "override" && log.override) {
    return `${log.override.operator} 已进行人工调整，原因：${log.override.reason}。`;
  }

  return log.result === "pass" ? "本步骤已通过。" : "本步骤需要业务人员关注。";
};

const systemActionFor = (log: DecisionLog, task: Task | undefined) => {
  if (log.step === "scope") return log.result === "excluded" ? "系统不再为该项目生成检查任务。" : "系统继续计算检查频次。";
  if (log.step === "frequency") return log.result === "block" ? "系统阻断正式发布，并记录待补全口径。" : "系统按该频次生成后续任务。";
  if (log.step === "assignee") return "系统为后续现场和非现场任务写入建议负责人。";
  if (log.step === "time") return task?.scheduledDate ? "系统写入计划开始和结束日期。" : "系统生成待人工处理的占位任务。";
  if (log.step === "validation") return log.result === "pass" ? "系统允许进入后续发布审计。" : "系统将问题带入发布前审计。";
  return "系统追加人工调整记录，不覆盖原始决策。";
};

export const createDecisionExplanations = ({ project, logs, tasks }: ExplanationInput): DecisionExplanation[] =>
  logs.map((log) => {
    const businessRule = businessRuleByTechnicalId(log.ruleHit);
    const task = log.taskId ? tasks.find((item) => item.id === log.taskId) : undefined;
    const impact = impactFor(log, businessRule?.publishImpact);
    const policyBasis: RuleEvidence[] = evidenceForRule(log.ruleHit);
    const baseFacts = log.step === "time" ? taskFacts(task) : factsFrom(log.inputs);

    return {
      id: log.id,
      step: log.step,
      result: log.result,
      businessStepTitle: stepTitles[log.step],
      businessQuestion: stepQuestions[log.step],
      businessAnswer: answerFor(log, project, task),
      keyFacts:
        log.step === "scope" || log.step === "frequency"
          ? [{ label: "项目", value: project.name }, ...baseFacts]
          : baseFacts,
      policyBasis,
      systemAction: systemActionFor(log, task),
      impact,
      operatorMessage: operatorMessageFor(impact, log),
      trace: {
        logId: log.id,
        technicalRuleId: log.ruleHit,
        ruleText: log.ruleText,
        inputs: log.inputs,
        output: log.output,
        rawLog: log,
        chainPrev: log.chainPrev,
        chainNext: log.chainNext
      }
    };
  });
