import type { FrequencyValue, Rule, RuleDecisionDraft, RuleSet } from "@inspection/domain";
import { defaultRuleSet } from "./rulesets.js";

const pendingId = (technicalRuleId: string) => `pending-${technicalRuleId}`;

export const normalizePendingDecisionId = (id: string) => id.replace(/^pending-/, "");

export const isResolvedFrequency = (value: FrequencyValue) =>
  value.special === undefined && typeof value.count === "number" && Boolean(value.period);

export const isResolvedRuleDraft = (draft: RuleDecisionDraft) =>
  isResolvedFrequency(draft.onsite) && isResolvedFrequency(draft.offsite);

export const createRuleDecisionDraft = (
  technicalRuleId: string,
  input: Partial<RuleDecisionDraft> = {},
  now = new Date().toISOString()
): RuleDecisionDraft => ({
  id: input.id ?? `draft-${technicalRuleId}`,
  pendingDecisionId: input.pendingDecisionId ?? pendingId(technicalRuleId),
  technicalRuleId,
  status: input.status ?? "draft",
  onsite: input.onsite ?? { special: "asset_department_decides", note: "待补充现场检查次数" },
  offsite: input.offsite ?? { special: "asset_department_decides", note: "待补充非现场检查次数" },
  businessNote: input.businessNote ?? "",
  confirmerNote: input.confirmerNote ?? "",
  simulationRunId: input.simulationRunId ?? null,
  updatedAt: now,
  submittedAt: input.submittedAt ?? null,
  ...(input.suggestionMeta ? { suggestionMeta: input.suggestionMeta } : {})
});

const ruleWithDraft = (rule: Rule, draft: RuleDecisionDraft, rulesetId: string): Rule => ({
  ...rule,
  rulesetId,
  then: {
    onsite: draft.onsite,
    offsite: draft.offsite
  },
  source: `${rule.source}；业务口径已补充`,
  businessOutcome: draft.businessNote || rule.businessOutcome || rule.name,
  enabled: true
});

export const applyRuleDecisionDrafts = (
  ruleset: RuleSet = defaultRuleSet,
  drafts: RuleDecisionDraft[],
  mode: "draft" | "submitted" = "draft"
): RuleSet => {
  const usable = drafts.filter((draft) => isResolvedRuleDraft(draft) && (mode === "draft" || draft.status === "submitted"));
  if (!usable.length) return ruleset;
  const draftByRule = new Map(usable.map((draft) => [draft.technicalRuleId, draft]));
  const suffix = mode === "submitted"
    ? `business-v${usable.filter((draft) => draft.status === "submitted").length}`
    : "what-if";
  const nextRulesetId = `${ruleset.id}-${suffix}`;
  return {
    ...ruleset,
    id: nextRulesetId,
    version: `${ruleset.version}+${suffix}`,
    status: mode === "submitted" ? "published" : "draft",
    sourceNote: `${ruleset.sourceNote}；${mode === "submitted" ? "已发布补充口径" : "草稿补充口径试算"}`,
    rules: ruleset.rules.map((rule) => {
      const draft = draftByRule.get(rule.id);
      if (!draft || !("gap" in rule.then)) return { ...rule, rulesetId: nextRulesetId };
      return ruleWithDraft(rule, draft, nextRulesetId);
    })
  };
};
