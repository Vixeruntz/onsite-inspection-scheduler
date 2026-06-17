import type { Rule, RuleSet } from "@inspection/domain";
import { businessRuleByTechnicalId } from "./business-rules.js";

const rulesetId = "due-diligence-2026";

const rule = (input: Omit<Rule, "rulesetId" | "enabled">): Rule => {
  const businessRule = businessRuleByTechnicalId(input.id);
  return {
    ...input,
    businessTitle: businessRule?.businessTitle,
    businessCondition: businessRule?.businessCondition,
    businessOutcome: businessRule?.businessOutcome,
    businessOrderGroup: businessRule?.businessOrderGroup,
    evidenceRefs: businessRule?.evidenceRefs,
    technicalRuleId: input.id,
    tagRefs: businessRule?.tagRefs,
    impactType: businessRule?.impactType,
    assignmentPriority: businessRule?.assignmentPriority,
    rulesetId,
    enabled: true
  };
};

export const defaultRuleSet: RuleSet = {
  id: rulesetId,
  version: "1.0.0",
  effectiveAt: "2026-01-01",
  status: "published",
  createdBy: "system",
  createdAt: "2026-05-29T00:00:00.000Z",
  sourceNote: "授信后检查管理实施细则 + 2026 授信检查计划样表",
  rules: [
    rule({
      id: "IN-1",
      group: "in_scope",
      priority: 10,
      name: "低风险无敞口",
      when: { field: "exposureBalance", op: "<=", value: 0 },
      then: { inScope: false, reason: "计划时剩余风险敞口≤0" },
      source: "实施细则 §3 只针对一般风险业务"
    }),
    rule({
      id: "IN-2",
      group: "in_scope",
      priority: 20,
      name: "当年结清",
      when: { field: "isSettledThisYear", op: "=", value: true },
      then: { inScope: false, reason: "当年结清项目排除" },
      source: "实施细则 §3 免除条件"
    }),
    rule({
      id: "IN-3",
      group: "in_scope",
      priority: 30,
      name: "当年新增且期限≤1年",
      when: { field: "isNewWithin1y", op: "=", value: true },
      then: { inScope: false, reason: "当年新增且期限≤1年" },
      source: "实施细则 §3 免除条件"
    }),
    rule({
      id: "R1",
      group: "frequency",
      priority: 10,
      name: "风险预警项目",
      when: { field: "isWarning", op: "=", value: true },
      then: {
        onsite: { special: "manual_warning_plan", note: "按预警方案" },
        offsite: { special: "manual_warning_plan", note: "按预警方案" }
      },
      source: "实施细则 §3 现场检查(三)"
    }),
    rule({
      id: "R2",
      group: "frequency",
      priority: 20,
      name: "不良类客户",
      when: { field: "isNpl", op: "=", value: true },
      then: {
        onsite: { count: 2, period: "year" },
        offsite: { count: 0, period: "year" }
      },
      source: "实施细则 §3 现场检查(一)"
    }),
    rule({
      id: "R3",
      group: "frequency",
      priority: 30,
      name: "内部客户",
      when: { field: "customerType", op: "=", value: "internal" },
      then: {
        onsite: { special: "not_mandatory", note: "不强制，待人工确认" },
        offsite: { special: "not_mandatory", note: "不强制，待人工确认" }
      },
      source: "实施细则 §3 集团内部"
    }),
    rule({
      id: "R4",
      group: "frequency",
      priority: 40,
      name: "协同A客户",
      when: { field: "customerType", op: "=", value: "collab_a" },
      then: {
        onsite: { count: 0, period: "year" },
        offsite: { count: 1, period: "year" }
      },
      source: "实施细则 §3 现场检查(3)"
    }),
    rule({
      id: "R5",
      group: "frequency",
      priority: 50,
      name: "能源环保≤3亿且满足豁免",
      when: {
        all: [
          { field: "industry", op: "=", value: "energy" },
          { field: "exposureBalance", op: "<=", value: 300_000_000 },
          { field: "gridConnected", op: "=", value: true },
          { field: "repayClean3y", op: "=", value: true },
          {
            any: [
              { field: "realtimeMonitored", op: "=", value: true },
              { field: "accountMonitored", op: "=", value: true }
            ]
          }
        ]
      },
      then: {
        onsite: { count: 0, period: "year" },
        offsite: { count: 1, period: "year" }
      },
      source: "实施细则 §3 全面检查(1)"
    }),
    rule({
      id: "R6",
      group: "frequency",
      priority: 60,
      name: "能源环保>3亿",
      when: {
        all: [
          { field: "industry", op: "=", value: "energy" },
          { field: "exposureBalance", op: ">", value: 300_000_000 }
        ]
      },
      then: {
        onsite: { count: 1, period: "year" },
        offsite: { count: 1, period: "year" }
      },
      source: "实施细则 §3 全面检查(1)"
    }),
    rule({
      id: "R7",
      group: "frequency",
      priority: 70,
      name: "公立医院初始敞口>6000万",
      when: {
        all: [
          { field: "hospitalType", op: "=", value: "public_hospital" },
          { field: "exposureInit", op: ">", value: 60_000_000 }
        ]
      },
      then: {
        onsite: { count: 1, period: "year", note: "项目中期" },
        offsite: { count: 1, period: "year" }
      },
      source: "实施细则 §3 全面检查(2)"
    }),
    rule({
      id: "R8",
      group: "frequency",
      priority: 80,
      name: "集团合并管理且存量>3",
      when: {
        all: [
          { field: "groupMemberCount", op: ">", value: 3 },
          {
            any: [
              { field: "groupId", op: "not_null" },
              { field: "partyType", op: "=", value: "group" }
            ]
          }
        ]
      },
      then: {
        onsite: { count: 2, period: "year" },
        offsite: { count: 1, period: "year", note: "集团合并管理默认补 1 次非现场" }
      },
      source: "实施细则 §3 集团客户"
    }),
    rule({
      id: "R9",
      group: "frequency",
      priority: 90,
      name: "集团合并管理且存量≤3",
      when: {
        all: [
          { field: "groupMemberCount", op: "between", value: [2, 3] },
          {
            any: [
              { field: "groupId", op: "not_null" },
              { field: "partyType", op: "=", value: "group" }
            ]
          }
        ]
      },
      then: {
        onsite: { count: 1, period: "year" },
        offsite: { count: 1, period: "year", note: "集团合并管理默认补 1 次非现场" }
      },
      source: "实施细则 §3 集团客户"
    }),
    rule({
      id: "R10",
      group: "frequency",
      priority: 100,
      name: "外部/协同B敞口>3亿",
      when: {
        all: [
          { field: "customerType", op: "in", value: ["external", "collab_b"] },
          { field: "exposureBalance", op: ">", value: 300_000_000 }
        ]
      },
      then: {
        onsite: { count: 2, period: "year" },
        offsite: { count: 1, period: "year" }
      },
      source: "实施细则 §3 敞口分档"
    }),
    rule({
      id: "R11",
      group: "frequency",
      priority: 110,
      name: "外部/协同B 1亿<敞口≤3亿",
      when: {
        all: [
          { field: "customerType", op: "in", value: ["external", "collab_b"] },
          { field: "exposureBalance", op: ">", value: 100_000_000 },
          { field: "exposureBalance", op: "<=", value: 300_000_000 }
        ]
      },
      then: {
        onsite: { count: 1, period: "year" },
        offsite: { count: 1, period: "year" }
      },
      source: "实施细则 §3 敞口分档"
    }),
    rule({
      id: "R12",
      group: "frequency",
      priority: 120,
      name: "外部/协同B 3000万<敞口≤1亿",
      when: {
        all: [
          { field: "customerType", op: "in", value: ["external", "collab_b"] },
          { field: "exposureBalance", op: ">", value: 30_000_000 },
          { field: "exposureBalance", op: "<=", value: 100_000_000 }
        ]
      },
      then: {
        onsite: { count: 1, period: "two_years" },
        offsite: { count: 1, period: "year" }
      },
      source: "实施细则 §3 敞口分档"
    }),
    rule({
      id: "P1",
      group: "frequency",
      priority: 130,
      name: "外部/协同B敞口≤3000万待补全",
      when: {
        all: [
          { field: "customerType", op: "in", value: ["external", "collab_b"] },
          { field: "exposureBalance", op: "<=", value: 30_000_000 }
        ]
      },
      then: { gap: true, reason: "外部/协同B 且敞口≤3000万，资产部频次口径待补全" },
      source: "待业务确认 P1"
    }),
    rule({
      id: "P2",
      group: "frequency",
      priority: 75,
      name: "公立医院≤6000万待补全",
      when: {
        all: [
          { field: "hospitalType", op: "=", value: "public_hospital" },
          { field: "exposureInit", op: "<=", value: 60_000_000 }
        ]
      },
      then: { gap: true, reason: "公立医院初始敞口≤6000万，频次口径待补全" },
      source: "待业务确认 P2"
    }),
    rule({
      id: "P3",
      group: "frequency",
      priority: 76,
      name: "民营医院待补全",
      when: { field: "hospitalType", op: "=", value: "private_hospital" },
      then: { gap: true, reason: "民营医院频次口径待补全" },
      source: "待业务确认 P3"
    }),
    rule({
      id: "P4",
      group: "frequency",
      priority: 77,
      name: "保理业务待补全",
      when: { field: "bizType", op: "=", value: "factoring" },
      then: { gap: true, reason: "保理业务频次口径待补全" },
      source: "待业务确认 P4"
    }),
    rule({
      id: "P5",
      group: "frequency",
      priority: 78,
      name: "集团存量数据待补齐",
      when: {
        all: [
          { field: "partyType", op: "=", value: "group" },
          { field: "groupMemberCount", op: "is_null" }
        ]
      },
      then: { gap: true, reason: "集团检查对象缺少 member_count（旗下我司存量客户数）" },
      source: "待业务确认 P5"
    }),
    rule({
      id: "P6",
      group: "frequency",
      priority: 79,
      name: "担保人/母公司存量数据待补齐",
      when: {
        all: [
          { field: "partyType", op: "=", value: "guarantor" },
          { field: "relatedPartyStockCount", op: "is_null" }
        ]
      },
      then: { gap: true, reason: "担保人/母公司旗下存量客户数字段缺失" },
      source: "待业务确认 P6"
    }),
    rule({
      id: "R13",
      group: "frequency",
      priority: 80,
      name: "担保人/母公司旗下存量>3",
      when: {
        all: [
          { field: "partyType", op: "=", value: "guarantor" },
          { field: "relatedPartyStockCount", op: ">", value: 3 }
        ]
      },
      then: {
        onsite: { count: 2, period: "year" },
        offsite: { count: 1, period: "year", note: "担保人/母公司口径默认补 1 次非现场" }
      },
      source: "实施细则 §3 担保人/实控人/母公司"
    }),
    rule({
      id: "R14",
      group: "frequency",
      priority: 81,
      name: "担保人/母公司旗下存量≤3",
      when: {
        all: [
          { field: "partyType", op: "=", value: "guarantor" },
          { field: "relatedPartyStockCount", op: "<=", value: 3 }
        ]
      },
      then: {
        onsite: { count: 1, period: "year" },
        offsite: { count: 1, period: "year", note: "担保人/母公司口径默认补 1 次非现场" }
      },
      source: "实施细则 §3 担保人/实控人/母公司"
    }),
    rule({
      id: "P7",
      group: "frequency",
      priority: 5,
      name: "资产部酌情增减待覆写",
      when: { field: "manualFrequencyRequested", op: "=", value: true },
      then: { gap: true, reason: "资产部负责人酌情增减次数，默认需人工覆写留痕" },
      source: "待业务确认 P7"
    })
  ]
};

export const timeAndConflictRules = [
  { id: "H-0", severity: "hard", label: "现场/非现场均按 5 个工作日" },
  { id: "H-1", severity: "hard", label: "现场 2 次/年必须上下半年各 1 次" },
  { id: "H-2", severity: "hard", label: "同项目现场与非现场至少错开 28 天" },
  { id: "H-3", severity: "hard", label: "每两年 1 次距上次现场满 24 个月" },
  { id: "H-4", severity: "hard", label: "同一人现场整周不重叠" },
  { id: "H-5", severity: "hard", label: "现场整周不含中国法定节假日" },
  { id: "S-1", severity: "soft", label: "现场与非现场建议间隔 1 季度" },
  { id: "S-2", severity: "soft", label: "同一人相邻周现场扎堆" }
] as const;
