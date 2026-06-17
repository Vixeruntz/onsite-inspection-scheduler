import type { FieldCondition, FrequencyDecision, Project, Rule, RuleCondition, RuleSet } from "@inspection/domain";

export type RuleEvaluationContext = Project & {
  groupMemberCount?: number | null;
  manualFrequencyRequested?: boolean;
};

const isFieldCondition = (condition: RuleCondition): condition is FieldCondition =>
  "field" in condition && "op" in condition;

const getField = (ctx: RuleEvaluationContext, field: string) => (ctx as unknown as Record<string, unknown>)[field];

export const evaluateFieldCondition = (ctx: RuleEvaluationContext, condition: FieldCondition) => {
  const actual = getField(ctx, condition.field);
  const expected = condition.value;

  switch (condition.op) {
    case "=":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case ">":
      return Number(actual) > Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
    case "between":
      return Array.isArray(expected) && Number(actual) >= Number(expected[0]) && Number(actual) <= Number(expected[1]);
    case "is_null":
      return actual === null || actual === undefined || actual === "";
    case "not_null":
      return actual !== null && actual !== undefined && actual !== "";
    default:
      return false;
  }
};

export const evaluateCondition = (ctx: RuleEvaluationContext, condition: RuleCondition): boolean => {
  if (isFieldCondition(condition)) return evaluateFieldCondition(ctx, condition);
  if ("all" in condition) return condition.all.every((child) => evaluateCondition(ctx, child));
  if ("any" in condition) return condition.any.some((child) => evaluateCondition(ctx, child));
  if ("not" in condition) return !evaluateCondition(ctx, condition.not);
  return false;
};

export const matchingRules = (rules: Rule[], ctx: RuleEvaluationContext) =>
  rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .filter((rule) => evaluateCondition(ctx, rule.when));

export const evaluateInScope = (ruleset: RuleSet, ctx: RuleEvaluationContext) => {
  const rules = ruleset.rules.filter((rule) => rule.group === "in_scope");
  const exclusions = matchingRules(rules, ctx).filter((rule) => "inScope" in rule.then && rule.then.inScope === false);
  if (exclusions.length > 0) {
    const hit = exclusions[0]!;
    return {
      inScope: false,
      ruleId: hit.id,
      ruleName: hit.name,
      source: hit.source,
      reason: "reason" in hit.then ? hit.then.reason : "规则性排除"
    };
  }
  return {
    inScope: true,
    ruleId: "IN-5",
    ruleName: "一般风险业务入池",
    source: "实施细则 §3",
    reason: "未命中排除规则"
  };
};

export const evaluateFrequency = (ruleset: RuleSet, ctx: RuleEvaluationContext): FrequencyDecision => {
  const rules = ruleset.rules.filter((rule) => rule.group === "frequency");
  const hit = matchingRules(rules, ctx)[0];
  if (!hit) {
    return {
      onsite: { special: "asset_department_decides", note: "未命中频次规则" },
      offsite: { special: "asset_department_decides", note: "未命中频次规则" },
      ruleId: "RULE_GAP",
      ruleName: "待规则补全",
      source: "规则覆盖红线",
      status: "rule_gap"
    };
  }
  if ("gap" in hit.then) {
    return {
      onsite: { special: "asset_department_decides", note: hit.then.reason },
      offsite: { special: "asset_department_decides", note: hit.then.reason },
      ruleId: hit.id,
      ruleName: hit.name,
      source: hit.source,
      status: "rule_gap"
    };
  }
  if (!("onsite" in hit.then)) {
    return {
      onsite: { special: "asset_department_decides", note: "规则结论类型错误" },
      offsite: { special: "asset_department_decides", note: "规则结论类型错误" },
      ruleId: hit.id,
      ruleName: hit.name,
      source: hit.source,
      status: "rule_gap"
    };
  }

  const manualNeeded = Boolean(hit.then.onsite.special || hit.then.offsite.special);
  return {
    onsite: hit.then.onsite,
    offsite: hit.then.offsite,
    ruleId: hit.id,
    ruleName: hit.name,
    source: hit.source,
    status: manualNeeded ? "manual_needed" : "covered"
  };
};

export const ruleToHumanText = (ruleId: string, name: string, source: string) => `${ruleId} ${name}｜${source}`;
