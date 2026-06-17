import { nanoid } from "nanoid";
import type {
  FrequencyValue,
  Project,
  RuleDecisionDraft,
  RuleSuggestionBatch,
  RuleSuggestionSkippedItem,
  RuleSupplementSuggestion,
  SchedulingRun,
  Task
} from "@inspection/domain";
import { businessRuleByTechnicalId, evidenceForRule } from "./business-rules.js";
import { createRuleDecisionDraft } from "./rule-drafts.js";

type SuggestionTemplate = {
  onsite: FrequencyValue;
  offsite: FrequencyValue;
  confidence: number;
  reason: string;
};

export type RuleSuggestionGenerationResult = {
  batch: RuleSuggestionBatch;
  drafts: RuleDecisionDraft[];
};

const suggestionId = (prefix: string) => `${prefix}_${nanoid(10)}`;

const unique = <T>(items: T[]) => [...new Set(items)];
const dataGapRuleIds = new Set(["P5", "P6"]);

const isManualTask = (task: Task) => task.status === "manual_needed" || task.status === "unplaceable";

const missingItemsForTask = (task: Task) => {
  const missing = [];
  if (!task.assigneeId) missing.push("负责人");
  if (!task.scheduledDate) missing.push("开始日期");
  if (task.status === "unplaceable") missing.push("可用完整工作周");
  return missing.length ? missing : ["人工确认原因"];
};

const p4ComparableTemplate = (project: Project): SuggestionTemplate | null => {
  if (project.exposureBalance > 300_000_000) {
    return {
      onsite: { count: 2, period: "year" },
      offsite: { count: 1, period: "year" },
      confidence: 0.78,
      reason: "保理业务纳入适用范围，按可比外部/协同B大额敞口分档生成建议。"
    };
  }
  if (project.exposureBalance > 100_000_000) {
    return {
      onsite: { count: 1, period: "year" },
      offsite: { count: 1, period: "year" },
      confidence: 0.82,
      reason: "保理业务纳入适用范围，当前敞口落在可比 R11 分档，建议沿用每年 1 次现场、每年 1 次非现场。"
    };
  }
  if (project.exposureBalance > 30_000_000) {
    return {
      onsite: { count: 1, period: "two_years" },
      offsite: { count: 1, period: "year" },
      confidence: 0.76,
      reason: "保理业务纳入适用范围，按可比较小敞口分档生成建议。"
    };
  }
  return {
    onsite: { count: 1, period: "two_years" },
    offsite: { count: 1, period: "year" },
    confidence: 0.68,
    reason: "保理业务纳入适用范围，但小额保理缺少直接制度口径，先按小额客户保守建议生成。"
  };
};

const templateForRule = (technicalRuleId: string, projects: Project[]): SuggestionTemplate | RuleSuggestionSkippedItem => {
  if (technicalRuleId === "P1") {
    return {
      onsite: { count: 1, period: "two_years" },
      offsite: { count: 1, period: "year" },
      confidence: 0.84,
      reason: "小额外部/协同B不高于上一档，保留年度非现场监控。"
    };
  }

  if (technicalRuleId === "P4") {
    if (!projects.length) {
      return { technicalRuleId, title: "保理业务频次待明确", reason: "当前没有可用于映射可比分档的受影响项目。" };
    }
    const templates = projects.map(p4ComparableTemplate).filter((item): item is SuggestionTemplate => Boolean(item));
    const keys = unique(templates.map((item) => `${item.onsite.count}-${item.onsite.period}-${item.offsite.count}-${item.offsite.period}`));
    if (keys.length !== 1) {
      return { technicalRuleId, title: "保理业务频次待明确", reason: "多个保理项目映射出不同频次，需员工拆分判断后再补充口径。" };
    }
    return templates[0]!;
  }

  const rule = businessRuleByTechnicalId(technicalRuleId);
  return {
    technicalRuleId,
    title: rule?.businessTitle ?? technicalRuleId,
    reason: "当前规则尚未配置内置建议模板，需员工人工补充。"
  };
};

const isSkippedItem = (value: SuggestionTemplate | RuleSuggestionSkippedItem): value is RuleSuggestionSkippedItem =>
  "title" in value && "reason" in value && !("onsite" in value);

export const generateRuleSuggestions = ({
  run,
  projects,
  existingDrafts,
  now = new Date().toISOString()
}: {
  run: SchedulingRun;
  projects: Project[];
  existingDrafts: RuleDecisionDraft[];
  now?: string;
}): RuleSuggestionGenerationResult => {
  const batchId = suggestionId("rule_suggest");
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const draftsByRule = new Map(existingDrafts.map((draft) => [draft.technicalRuleId, draft]));
  const blockedLogs = run.decisionLogs.filter(
    (log) => log.step === "frequency" && log.result === "block" && Boolean(log.ruleHit?.startsWith("P")) && !dataGapRuleIds.has(log.ruleHit!)
  );
  const blockedRuleIds = unique(blockedLogs.map((log) => log.ruleHit!).filter(Boolean));
  const ruleSuggestions: RuleSupplementSuggestion[] = [];
  const skippedItems: RuleSuggestionSkippedItem[] = [];
  const drafts: RuleDecisionDraft[] = [];

  for (const technicalRuleId of blockedRuleIds) {
    const rule = businessRuleByTechnicalId(technicalRuleId);
    const currentDraft = draftsByRule.get(technicalRuleId);
    if (currentDraft?.status === "submitted") {
      skippedItems.push({ technicalRuleId, title: rule?.businessTitle ?? technicalRuleId, reason: "该口径已提交，不覆盖已发布草稿。" });
      continue;
    }
    if (currentDraft && currentDraft.suggestionMeta?.reviewStatus !== "needs_review") {
      skippedItems.push({ technicalRuleId, title: rule?.businessTitle ?? technicalRuleId, reason: "员工已编辑或采纳该草稿，不覆盖人工处理结果。" });
      continue;
    }
    if (currentDraft && !currentDraft.suggestionMeta) {
      skippedItems.push({ technicalRuleId, title: rule?.businessTitle ?? technicalRuleId, reason: "已存在人工草稿，不覆盖员工手动输入。" });
      continue;
    }

    const affectedProjectIds = unique(blockedLogs.filter((log) => log.ruleHit === technicalRuleId).map((log) => log.projectId));
    const affectedProjects = affectedProjectIds.map((id) => projectById.get(id)).filter((project): project is Project => Boolean(project));
    const template = templateForRule(technicalRuleId, affectedProjects);
    if (isSkippedItem(template)) {
      skippedItems.push(template);
      continue;
    }

    const evidence = evidenceForRule(technicalRuleId);
    const draft = createRuleDecisionDraft(
      technicalRuleId,
      {
        ...currentDraft,
        id: currentDraft?.id ?? `draft-${technicalRuleId}`,
        pendingDecisionId: `pending-${technicalRuleId}`,
        technicalRuleId,
        status: "draft",
        submittedAt: currentDraft?.submittedAt ?? null,
        simulationRunId: currentDraft?.simulationRunId ?? null,
        onsite: template.onsite,
        offsite: template.offsite,
        businessNote: `${rule?.businessTitle ?? technicalRuleId}：${template.reason}`,
        confirmerNote: "根据当前阻断、影响项目与制度依据生成，待员工审核确认。",
        suggestionMeta: {
          batchId,
          source: "system_template",
          confidence: template.confidence,
          reviewStatus: "needs_review",
          generatedAt: now
        }
      },
      now
    );
    drafts.push(draft);
    ruleSuggestions.push({
      id: suggestionId("rule_item"),
      pendingDecisionId: draft.pendingDecisionId,
      technicalRuleId,
      title: rule?.businessTitle ?? technicalRuleId,
      affectedProjectIds,
      affectedProjectNames: affectedProjects.map((project) => project.name),
      onsite: template.onsite,
      offsite: template.offsite,
      businessNote: draft.businessNote,
      confirmerNote: draft.confirmerNote,
      reason: template.reason,
      evidenceRefs: rule?.evidenceRefs ?? [],
      evidenceLabels: evidence.map((entry) => entry.policyCitation.citationLabel),
      confidence: template.confidence,
      draftId: draft.id,
      status: currentDraft ? "draft_refreshed" : "draft_generated"
    });
  }

  const manualSuggestions = run.tasks.filter(isManualTask).map((task) => ({
    taskId: task.id,
    projectId: task.projectId,
    projectName: task.projectName,
    checkType: task.checkType,
    missingItems: missingItemsForTask(task),
    recommendation: "保留当前建议负责人，由员工补充开始日期并填写发布前人工确认原因。",
    reason: task.status === "unplaceable" ? "当前未找到可用完整工作周，需员工确认可接受窗口。" : "规则允许形成草案，但正式发布前需人工确认任务安排。"
  }));

  return {
    batch: {
      id: batchId,
      runId: run.id,
      createdAt: now,
      summary: {
        generatedDrafts: ruleSuggestions.length,
        manualSuggestions: manualSuggestions.length,
        skipped: skippedItems.length
      },
      ruleSuggestions,
      manualSuggestions,
      skippedItems
    },
    drafts
  };
};
