import type {
  AssigneePoolMode,
  Person,
  Project,
  TagDefinition,
  TagFieldBinding,
  TagScope
} from "@inspection/domain";

const tag = (
  id: string,
  code: string,
  name: string,
  category: TagDefinition["category"],
  scopes: TagScope[],
  description: string,
  options: {
    exclusiveGroup?: string | null;
    fieldBinding?: TagFieldBinding | null;
    relationMeta?: TagDefinition["relationMeta"];
    isSystem?: boolean;
    active?: boolean;
  } = {}
): TagDefinition => ({
  id,
  code,
  name,
  category,
  scopes,
  exclusiveGroup: options.exclusiveGroup ?? null,
  fieldBinding: options.fieldBinding ?? null,
  relationMeta: options.relationMeta ?? null,
  description,
  isSystem: options.isSystem ?? true,
  active: options.active ?? true
});

export const defaultTagLibrary: TagDefinition[] = [
  tag("tag-project-customer-external", "customer.external", "外部客户", "customer_type", ["project", "rule"], "外部客户检查口径", {
    exclusiveGroup: "project.customerType",
    fieldBinding: { entity: "project", field: "customerType", value: "external", mode: "equals" }
  }),
  tag("tag-project-customer-collab-b", "customer.collab_b", "协同B客户", "customer_type", ["project", "rule"], "协同B客户检查口径", {
    exclusiveGroup: "project.customerType",
    fieldBinding: { entity: "project", field: "customerType", value: "collab_b", mode: "equals" }
  }),
  tag("tag-project-customer-collab-a", "customer.collab_a", "协同A客户", "customer_type", ["project", "rule"], "协同A客户检查口径", {
    exclusiveGroup: "project.customerType",
    fieldBinding: { entity: "project", field: "customerType", value: "collab_a", mode: "equals" }
  }),
  tag("tag-project-customer-internal", "customer.internal", "内部客户", "customer_type", ["project", "rule"], "集团内部客户检查口径", {
    exclusiveGroup: "project.customerType",
    fieldBinding: { entity: "project", field: "customerType", value: "internal", mode: "equals" }
  }),
  tag("tag-project-risk-normal", "risk.normal", "正常类", "risk", ["project", "rule"], "五级分类正常", {
    exclusiveGroup: "project.riskGrade",
    fieldBinding: { entity: "project", field: "riskGrade", value: "normal", mode: "equals" }
  }),
  tag("tag-project-risk-watch", "risk.watch", "关注类", "risk", ["project", "rule"], "五级分类关注", {
    exclusiveGroup: "project.riskGrade",
    fieldBinding: { entity: "project", field: "riskGrade", value: "watch", mode: "equals" }
  }),
  tag("tag-project-risk-substandard", "risk.substandard", "次级类", "risk", ["project", "rule"], "五级分类次级", {
    exclusiveGroup: "project.riskGrade",
    fieldBinding: { entity: "project", field: "riskGrade", value: "substandard", mode: "equals" }
  }),
  tag("tag-project-risk-doubtful", "risk.doubtful", "可疑类", "risk", ["project", "rule"], "五级分类可疑", {
    exclusiveGroup: "project.riskGrade",
    fieldBinding: { entity: "project", field: "riskGrade", value: "doubtful", mode: "equals" }
  }),
  tag("tag-project-risk-loss", "risk.loss", "损失类", "risk", ["project", "rule"], "五级分类损失", {
    exclusiveGroup: "project.riskGrade",
    fieldBinding: { entity: "project", field: "riskGrade", value: "loss", mode: "equals" }
  }),
  tag("tag-project-risk-npl", "risk.npl", "不良类", "risk", ["project", "rule"], "次级、可疑、损失统一视为不良类", {
    fieldBinding: { entity: "project", field: "isNpl", value: true, mode: "equals" }
  }),
  tag("tag-project-industry-energy", "industry.energy", "能源环保", "industry", ["project", "rule"], "能源环保专项口径", {
    exclusiveGroup: "project.industry",
    fieldBinding: { entity: "project", field: "industry", value: "energy", mode: "equals" }
  }),
  tag("tag-project-industry-healthcare", "industry.healthcare", "医疗健康", "industry", ["project", "rule"], "医疗健康/医院项目口径", {
    exclusiveGroup: "project.industry",
    fieldBinding: { entity: "project", field: "industry", value: "healthcare", mode: "equals" }
  }),
  tag("tag-project-industry-public", "industry.public_services", "民生公用", "industry", ["project", "rule"], "民生公用项目口径", {
    exclusiveGroup: "project.industry",
    fieldBinding: { entity: "project", field: "industry", value: "public_services", mode: "equals" }
  }),
  tag("tag-project-industry-other", "industry.other", "其他行业", "industry", ["project", "rule"], "通用行业口径", {
    exclusiveGroup: "project.industry",
    fieldBinding: { entity: "project", field: "industry", value: "other", mode: "equals" }
  }),
  tag("tag-project-hospital-public", "hospital.public", "公立医院", "industry", ["project", "rule"], "公立医院专项口径", {
    exclusiveGroup: "project.hospitalType",
    fieldBinding: { entity: "project", field: "hospitalType", value: "public_hospital", mode: "equals" }
  }),
  tag("tag-project-hospital-private", "hospital.private", "民营医院", "industry", ["project", "rule"], "民营医院待明确口径", {
    exclusiveGroup: "project.hospitalType",
    fieldBinding: { entity: "project", field: "hospitalType", value: "private_hospital", mode: "equals" }
  }),
  tag("tag-project-biz-leaseback", "biz.leaseback", "回租", "business_type", ["project", "rule"], "回租业务", {
    exclusiveGroup: "project.bizType",
    fieldBinding: { entity: "project", field: "bizType", value: "leaseback", mode: "equals" }
  }),
  tag("tag-project-biz-direct", "biz.direct_lease", "直租", "business_type", ["project", "rule"], "直租业务，需要直租专员优先匹配", {
    exclusiveGroup: "project.bizType",
    fieldBinding: { entity: "project", field: "bizType", value: "direct_lease", mode: "equals" }
  }),
  tag("tag-project-biz-factoring", "biz.factoring", "保理", "business_type", ["project", "rule"], "商业保理业务待明确口径", {
    exclusiveGroup: "project.bizType",
    fieldBinding: { entity: "project", field: "bizType", value: "factoring", mode: "equals" }
  }),
  tag("tag-project-party-lessee", "party.lessee", "承租人", "party", ["project", "rule"], "承租人项目", {
    exclusiveGroup: "project.partyType",
    fieldBinding: { entity: "project", field: "partyType", value: "lessee", mode: "equals" }
  }),
  tag("tag-project-party-group", "party.group", "集团客户", "party", ["project", "rule"], "集团合并管理项目", {
    exclusiveGroup: "project.partyType",
    fieldBinding: { entity: "project", field: "partyType", value: "group", mode: "equals" }
  }),
  tag("tag-project-party-guarantor", "party.guarantor", "担保人/母公司", "party", ["project", "rule"], "担保人、实控人或母公司口径待确认", {
    exclusiveGroup: "project.partyType",
    fieldBinding: { entity: "project", field: "partyType", value: "guarantor", mode: "equals" }
  }),
  tag("tag-project-warning", "flag.warning", "预警信号", "special_condition", ["project", "rule"], "出现预警信号，按处理方案安排检查", {
    fieldBinding: { entity: "project", field: "isWarning", value: true, mode: "equals" }
  }),
  tag("tag-project-settled", "flag.settled_this_year", "当年结清", "special_condition", ["project", "rule"], "当年度结清项目免检", {
    fieldBinding: { entity: "project", field: "isSettledThisYear", value: true, mode: "equals" }
  }),
  tag("tag-project-new-1y", "flag.new_within_1y", "当年新增短期限", "special_condition", ["project", "rule"], "当年新增且期限不超过 1 年项目免检", {
    fieldBinding: { entity: "project", field: "isNewWithin1y", value: true, mode: "equals" }
  }),
  tag("tag-project-grid-connected", "energy.grid_connected", "已并网", "special_condition", ["project", "rule"], "能源环保项目已并网", {
    fieldBinding: { entity: "project", field: "gridConnected", value: true, mode: "equals" }
  }),
  tag("tag-project-account-monitored", "energy.account_monitored", "账户监管", "special_condition", ["project", "rule"], "能源环保项目账户监管", {
    fieldBinding: { entity: "project", field: "accountMonitored", value: true, mode: "equals" }
  }),
  tag("tag-project-realtime-monitored", "energy.realtime_monitored", "实时监控", "special_condition", ["project", "rule"], "能源环保项目实时监控", {
    fieldBinding: { entity: "project", field: "realtimeMonitored", value: true, mode: "equals" }
  }),
  tag("tag-project-repay-clean", "energy.repay_clean_3y", "近三年还款正常", "special_condition", ["project", "rule"], "能源环保项目近三年还款正常", {
    fieldBinding: { entity: "project", field: "repayClean3y", value: true, mode: "equals" }
  }),
  tag("tag-project-shanghai", "dept.shanghai_self_check", "上海分公司自检", "special_condition", ["project", "rule"], "上海分公司项目由分公司自检", {
    fieldBinding: { entity: "project", field: "dept", value: "上海分公司", mode: "equals" }
  }),
  tag("tag-project-responsibility-asset", "responsibility.asset_management", "资产管理部主责", "responsibility", ["project", "rule"], "资产管理部负责计划执行或监督的项目", {
    exclusiveGroup: "project.primaryResponsibleDept",
    fieldBinding: { entity: "project", field: "primaryResponsibleDept", value: "asset_management", mode: "equals" }
  }),
  tag("tag-project-responsibility-business", "responsibility.business_department", "业务部门主责", "responsibility", ["project", "rule"], "业务部门负责计划执行的项目", {
    exclusiveGroup: "project.primaryResponsibleDept",
    fieldBinding: { entity: "project", field: "primaryResponsibleDept", value: "business_department", mode: "equals" }
  }),
  tag("tag-project-responsibility-joint", "responsibility.joint", "资产主责/业务配合", "responsibility", ["project", "rule"], "资产管理部主责、业务部门配合的项目", {
    exclusiveGroup: "project.primaryResponsibleDept",
    fieldBinding: { entity: "project", field: "primaryResponsibleDept", value: "joint", mode: "equals" }
  }),
  tag("tag-project-approval-requirement", "requirement.approval_followup", "批复要求待跟踪", "special_condition", ["project", "rule"], "项目决议或批复约定授信后管理要求"),
  tag("tag-project-company-special", "requirement.company_special", "公司特殊要求", "special_condition", ["project", "rule"], "当年新增短期限但公司有特殊要求时不得直接免检", {
    fieldBinding: { entity: "project", field: "companySpecialRequirement", value: true, mode: "equals" }
  }),
  tag("tag-project-asset-decides", "rule.asset_department_decides", "资产部待定口径", "rule_applicability", ["project", "rule"], "制度写明以资产管理部要求为准或未量化"),
  tag("tag-exposure-balance-gt-300m", "exposure.balance.gt_300m", "剩余敞口>3亿", "derived", ["project", "rule"], "外部/协同B大额敞口分档"),
  tag("tag-exposure-balance-100m-300m", "exposure.balance.100m_300m", "剩余敞口1-3亿", "derived", ["project", "rule"], "外部/协同B中额敞口分档"),
  tag("tag-exposure-balance-30m-100m", "exposure.balance.30m_100m", "剩余敞口3000万-1亿", "derived", ["project", "rule"], "外部/协同B较小敞口分档"),
  tag("tag-exposure-balance-le-30m", "exposure.balance.le_30m", "剩余敞口≤3000万", "derived", ["project", "rule"], "外部/协同B小额待定分档"),
  tag("tag-exposure-init-gt-60m", "exposure.init.gt_60m", "初始敞口>6000万", "derived", ["project", "rule"], "公立医院大额项目分档"),
  tag("tag-exposure-init-le-60m", "exposure.init.le_60m", "初始敞口≤6000万", "derived", ["project", "rule"], "公立医院小额待定分档"),
  tag("tag-related-party-stock-gt-3", "related_party.stock.gt_3", "旗下存量>3", "derived", ["project", "rule"], "集团/担保人/母公司旗下存量大于 3"),
  tag("tag-related-party-stock-le-3", "related_party.stock.le_3", "旗下存量≤3", "derived", ["project", "rule"], "集团/担保人/母公司旗下存量不超过 3"),
  tag("tag-related-party-stock-unknown", "related_party.stock.unknown", "旗下存量待补", "derived", ["project", "rule"], "集团/担保人/母公司旗下存量字段缺失"),
  tag("tag-schedule-exempted", "schedule.exempted", "免除检查", "schedule_output", ["project", "rule"], "入池阶段排除或免检项目"),
  tag("tag-schedule-manual-needed", "schedule.manual_needed", "待人工确认", "schedule_output", ["project", "rule"], "规则或排期需要人工确认"),
  tag("tag-schedule-unplaceable", "schedule.unplaceable", "无法自动落位", "schedule_output", ["project", "rule"], "当前自动排期无法落到具体时间"),
  tag("tag-schedule-publish-blocked", "schedule.publish_blocked", "阻断正式发布", "schedule_output", ["project", "rule"], "规则缺口或硬冲突阻断发布"),
  tag("tag-rule-step-scope", "rule.step.scope", "规则阶段：入池", "rule_stage", ["rule"], "判断项目是否纳入检查计划"),
  tag("tag-rule-step-frequency", "rule.step.frequency", "规则阶段：频次", "rule_stage", ["rule"], "判断现场/非现场检查频次"),
  tag("tag-rule-step-assignee", "rule.step.assignee", "规则阶段：人员", "rule_stage", ["rule"], "判断检查任务负责人"),
  tag("tag-rule-step-time", "rule.step.time", "规则阶段：时间", "rule_stage", ["rule"], "判断检查任务时间窗口"),
  tag("tag-rule-step-validation", "rule.step.validation", "规则阶段：发布校验", "rule_stage", ["rule"], "判断排期方案是否可发布"),
  tag("tag-rule-outcome-exclude", "rule.outcome.exclude", "输出：免检/排除", "rule_outcome", ["rule"], "规则输出为不纳入检查计划"),
  tag("tag-rule-outcome-frequency", "rule.outcome.frequency", "输出：检查频次", "rule_outcome", ["rule"], "规则输出为现场/非现场次数"),
  tag("tag-rule-outcome-manual", "rule.outcome.manual", "输出：人工确认", "rule_outcome", ["rule"], "规则输出需要人工确认"),
  tag("tag-rule-outcome-publish-block", "rule.outcome.publish_block", "输出：阻断发布", "rule_outcome", ["rule"], "规则输出阻断正式发布"),
  tag("tag-person-specialist-direct", "person.specialist.direct_lease", "直租专员", "person_specialty", ["person", "rule"], "直租项目优先匹配人员", {
    fieldBinding: { entity: "person", field: "specialTags", value: "直租专员", mode: "includes" }
  }),
  tag("tag-person-specialist-npl", "person.specialist.npl", "问题项目专员", "person_specialty", ["person", "rule"], "不良类项目优先匹配人员", {
    fieldBinding: { entity: "person", field: "specialTags", value: "问题项目专员", mode: "includes" }
  }),
  tag("tag-person-specialist-energy", "person.specialist.energy", "能源环保检查能力", "person_specialty", ["person", "rule"], "可承接能源环保现场检查和豁免条件核查", {
    fieldBinding: { entity: "person", field: "specialTags", value: "能源环保检查能力", mode: "includes" }
  }),
  tag("tag-person-specialist-hospital", "person.specialist.hospital", "医院项目检查能力", "person_specialty", ["person", "rule"], "可承接医院类项目现场检查", {
    fieldBinding: { entity: "person", field: "specialTags", value: "医院项目检查能力", mode: "includes" }
  }),
  tag("tag-person-specialist-group", "person.specialist.group", "集团客户检查能力", "person_specialty", ["person", "rule"], "可承接集团客户、担保人、母公司检查", {
    fieldBinding: { entity: "person", field: "specialTags", value: "集团客户检查能力", mode: "includes" }
  }),
  tag("tag-person-specialist-offsite", "person.specialist.offsite_investigation", "非现场信息核查", "person_specialty", ["person", "rule"], "可承接征信、中登、法院、舆情等非现场信息核查", {
    fieldBinding: { entity: "person", field: "specialTags", value: "非现场信息核查", mode: "includes" }
  }),
  tag("tag-person-specialist-asset-check", "person.specialist.asset_check", "租赁物现场检查", "person_specialty", ["person", "rule"], "可承接租赁物抽查、经营场所检查和现场访谈", {
    fieldBinding: { entity: "person", field: "specialTags", value: "租赁物现场检查", mode: "includes" }
  }),
  tag("tag-person-role-asset-owner", "person.role.asset_management_owner", "资产管理部主责", "responsibility", ["person", "rule"], "负责资产管理部主责范围内检查计划执行", {
    fieldBinding: { entity: "person", field: "responsibilityRoles", value: "asset_management_owner", mode: "includes" }
  }),
  tag("tag-person-role-business-owner", "person.role.business_owner", "业务部门主责", "responsibility", ["person", "rule"], "负责业务部门主责范围内检查计划执行", {
    fieldBinding: { entity: "person", field: "responsibilityRoles", value: "business_owner", mode: "includes" }
  }),
  tag("tag-person-role-business-support", "person.role.business_support", "业务部门配合", "responsibility", ["person", "rule"], "配合资产管理部主责范围内客户检查", {
    fieldBinding: { entity: "person", field: "responsibilityRoles", value: "business_support", mode: "includes" }
  }),
  tag("tag-person-role-report-owner", "person.role.report_owner", "检查报告填写", "responsibility", ["person", "rule"], "负责授信后检查报告填写和线上归档", {
    fieldBinding: { entity: "person", field: "responsibilityRoles", value: "report_owner", mode: "includes" }
  }),
  tag("tag-person-role-rectification-owner", "person.role.rectification_owner", "整改跟进", "responsibility", ["person", "rule"], "负责检查发现问题的整改跟进", {
    fieldBinding: { entity: "person", field: "responsibilityRoles", value: "rectification_owner", mode: "includes" }
  }),
  tag("tag-person-pool-asset5", "person.pool.asset5", "资产部5人池", "person_pool", ["person", "rule"], "资产部 5 人排期场景", {
    fieldBinding: { entity: "person", field: "pool", value: "asset5", mode: "includes" }
  }),
  tag("tag-person-pool-asset7", "person.pool.asset7", "资产部7人池", "person_pool", ["person", "rule"], "资产部 7 人排期场景", {
    fieldBinding: { entity: "person", field: "pool", value: "asset7", mode: "includes" }
  }),
  tag("tag-person-pool-sample", "person.pool.sample", "样表维护人池", "person_pool", ["person", "rule"], "沿用样表维护人场景", {
    fieldBinding: { entity: "person", field: "pool", value: "sampleMaintainers", mode: "includes" }
  }),
  tag("tag-person-pool-all26", "person.pool.all26", "全部人员池", "person_pool", ["person", "rule"], "全部可用人员排期场景", {
    fieldBinding: { entity: "person", field: "pool", value: "all26", mode: "includes" }
  }),
  tag("tag-person-pool-business-support", "person.pool.business_support", "业务部门协同池", "person_pool", ["person", "rule"], "业务部门主责或配合检查场景", {
    fieldBinding: { entity: "person", field: "pool", value: "businessSupport", mode: "includes" }
  }),
  tag("tag-person-long-term", "person.ownership.long_term", "长期归属人", "ownership", ["person", "rule"], "项目或集团长期归属优先匹配")
];

const byId = (tagLibrary: TagDefinition[]) => new Map(tagLibrary.map((item) => [item.id, item]));
const byCode = (tagLibrary: TagDefinition[]) => new Map(tagLibrary.map((item) => [item.code, item]));

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const relationTagCodePrefixes = [
  "project.group.",
  "person.ownership.group.",
  "project.identity.",
  "person.ownership.project.",
  "project.maintainer.person.",
  "person.identity."
];

const tagSlug = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return normalized || encodeURIComponent(value).replace(/%/g, "").toLowerCase();
};

export const isRelationshipTag = (tag: TagDefinition) =>
  relationTagCodePrefixes.some((prefix) => tag.code.startsWith(prefix));

export const createGroupRelationshipTags = (projects: Project[], people: Person[] = []): TagDefinition[] => {
  const groupNames = new Map<string, string>();
  for (const project of projects) {
    if (!project.groupId) continue;
    groupNames.set(project.groupId, project.groupName?.trim() || project.groupId);
  }
  for (const person of people) {
    for (const groupId of person.longTermGroupIds) {
      if (!groupNames.has(groupId)) groupNames.set(groupId, groupId);
    }
  }

  return [...groupNames.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .flatMap(([groupId, groupName]) => {
      const slug = tagSlug(groupId);
      return [
        tag(
          `tag-project-group-${slug}`,
          `project.group.${slug}`,
          `归属集团：${groupName}`,
          "ownership",
          ["project", "rule"],
          `项目归属集团 ${groupName}`,
          {
            exclusiveGroup: "project.groupId",
            fieldBinding: { entity: "project", field: "groupId", value: groupId, mode: "equals" },
            relationMeta: {
              subject: "project",
              relation: "group",
              objectType: "group",
              objectId: groupId,
              objectName: groupName,
              counterpartCode: `person.ownership.group.${slug}`
            }
          }
        ),
        tag(
          `tag-person-long-term-group-${slug}`,
          `person.ownership.group.${slug}`,
          `长期负责集团：${groupName}`,
          "ownership",
          ["person", "rule"],
          `人员长期负责集团 ${groupName}`,
          {
            fieldBinding: { entity: "person", field: "longTermGroupIds", value: groupId, mode: "includes" },
            relationMeta: {
              subject: "person",
              relation: "ownership",
              objectType: "group",
              objectId: groupId,
              objectName: groupName,
              counterpartCode: `project.group.${slug}`
            }
          }
        )
      ];
    });
};

export const createProjectRelationshipTags = (projects: Project[], people: Person[] = []): TagDefinition[] => {
  const projectNames = new Map<string, string>();
  for (const project of projects) projectNames.set(project.id, project.name);
  for (const person of people) {
    for (const projectId of person.longTermProjectIds) {
      if (!projectNames.has(projectId)) projectNames.set(projectId, projectId);
    }
  }

  return [...projectNames.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .flatMap(([projectId, projectName]) => {
      const slug = tagSlug(projectId);
      return [
        tag(
          `tag-project-identity-${slug}`,
          `project.identity.${slug}`,
          `项目身份：${projectName}`,
          "ownership",
          ["project", "rule"],
          `项目身份 ${projectName}`,
          {
            fieldBinding: { entity: "project", field: "id", value: projectId, mode: "equals" },
            relationMeta: {
              subject: "project",
              relation: "identity",
              objectType: "project",
              objectId: projectId,
              objectName: projectName,
              counterpartCode: `person.ownership.project.${slug}`
            }
          }
        ),
        tag(
          `tag-person-long-term-project-${slug}`,
          `person.ownership.project.${slug}`,
          `长期负责项目：${projectName}`,
          "ownership",
          ["person", "rule"],
          `人员长期负责项目 ${projectName}`,
          {
            fieldBinding: { entity: "person", field: "longTermProjectIds", value: projectId, mode: "includes" },
            relationMeta: {
              subject: "person",
              relation: "ownership",
              objectType: "project",
              objectId: projectId,
              objectName: projectName,
              counterpartCode: `project.identity.${slug}`
            }
          }
        )
      ];
    });
};

const maintainerPersonId = (project: Project, people: Person[]) => {
  if (project.onsiteMaintainerId) return project.onsiteMaintainerId;
  if (project.offsiteMaintainerId) return project.offsiteMaintainerId;
  const maintainerName = project.onsiteMaintainerName ?? project.offsiteMaintainerName;
  if (!maintainerName) return null;
  const matches = people.filter((person) => person.name === maintainerName);
  return matches.length === 1 ? matches[0]!.id : null;
};

export const createMaintainerRelationshipTags = (projects: Project[], people: Person[] = []): TagDefinition[] => {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const maintainerIds = new Set<string>();
  for (const project of projects) {
    const personId = maintainerPersonId(project, people);
    if (personId) maintainerIds.add(personId);
  }
  for (const person of people) maintainerIds.add(person.id);

  return [...maintainerIds]
    .sort((a, b) => (peopleById.get(a)?.name ?? a).localeCompare(peopleById.get(b)?.name ?? b, "zh-CN"))
    .flatMap((personId) => {
      const personName = peopleById.get(personId)?.name ?? personId;
      const slug = tagSlug(personId);
      return [
        tag(
          `tag-person-identity-${slug}`,
          `person.identity.${slug}`,
          `人员身份：${personName}`,
          "ownership",
          ["person", "rule"],
          `人员身份 ${personName}`,
          {
            fieldBinding: { entity: "person", field: "id", value: personId, mode: "equals" },
            relationMeta: {
              subject: "person",
              relation: "identity",
              objectType: "person",
              objectId: personId,
              objectName: personName,
              counterpartCode: `project.maintainer.person.${slug}`
            }
          }
        ),
        tag(
          `tag-project-maintainer-${slug}`,
          `project.maintainer.person.${slug}`,
          `维护人：${personName}`,
          "ownership",
          ["project", "rule"],
          `项目历史维护人 ${personName}`,
          {
            relationMeta: {
              subject: "project",
              relation: "maintainer",
              objectType: "person",
              objectId: personId,
              objectName: personName,
              counterpartCode: `person.identity.${slug}`
            }
          }
        )
      ];
    });
};

export const extendTagLibraryWithRelationships = (
  tagLibrary: TagDefinition[] = defaultTagLibrary,
  projects: Project[] = [],
  people: Person[] = []
) => {
  const baseTags = tagLibrary.filter((item) => !isRelationshipTag(item));
  return [
    ...baseTags,
    ...createGroupRelationshipTags(projects, people),
    ...createProjectRelationshipTags(projects, people),
    ...createMaintainerRelationshipTags(projects, people)
  ];
};

export const validateTagLibrary = (tagLibrary: TagDefinition[] = defaultTagLibrary) => {
  const codes = new Set<string>();
  for (const item of tagLibrary) {
    if (!item.code.trim()) throw new Error("标签编码不能为空");
    if (!item.name.trim()) throw new Error(`标签 ${item.code} 名称不能为空`);
    if (codes.has(item.code)) throw new Error(`标签编码重复: ${item.code}`);
    codes.add(item.code);
  }
};

export const tagsForScope = (scope: TagScope, tagLibrary: TagDefinition[] = defaultTagLibrary) =>
  tagLibrary.filter((item) => item.active && item.scopes.includes(scope));

export const tagIdsByCodes = (codes: string[], tagLibrary: TagDefinition[] = defaultTagLibrary) => {
  const codeMap = byCode(tagLibrary);
  return codes.map((code) => codeMap.get(code)?.id).filter((id): id is string => Boolean(id));
};

export const tagNamesByIds = (tagIds: string[] = [], tagLibrary: TagDefinition[] = defaultTagLibrary) => {
  const idMap = byId(tagLibrary);
  return tagIds.map((id) => idMap.get(id)?.name).filter((name): name is string => Boolean(name));
};

const bindingMatches = (record: Record<string, unknown>, binding: TagFieldBinding) => {
  const actual = record[binding.field];
  if (binding.mode === "includes") return Array.isArray(actual) && actual.includes(binding.value);
  return actual === binding.value;
};

const normalizeExclusive = (tagIds: string[], scope: TagScope, tagLibrary: TagDefinition[]) => {
  const idMap = byId(tagLibrary);
  const selected = unique(tagIds).filter((id) => idMap.get(id)?.active && idMap.get(id)?.scopes.includes(scope));
  const latestByGroup = new Map<string, string>();
  for (const id of selected) {
    const item = idMap.get(id);
    if (item?.exclusiveGroup) latestByGroup.set(item.exclusiveGroup, id);
  }
  return selected.filter((id) => {
    const group = idMap.get(id)?.exclusiveGroup;
    return !group || latestByGroup.get(group) === id;
  });
};

const applyBindings = (record: Record<string, unknown>, scope: TagScope, tagIds: string[], tagLibrary: TagDefinition[]) => {
  const idMap = byId(tagLibrary);
  const selected = new Set(normalizeExclusive(tagIds, scope, tagLibrary));
  const next = { ...record };

  const arrayFields = new Map<string, { controlled: unknown[]; selected: unknown[] }>();
  for (const item of tagLibrary) {
    if (!item.active || !item.scopes.includes(scope) || !item.fieldBinding || item.fieldBinding.entity !== scope) continue;
    if (item.fieldBinding.mode !== "includes") continue;
    const entry = arrayFields.get(item.fieldBinding.field) ?? { controlled: [], selected: [] };
    entry.controlled.push(item.fieldBinding.value);
    if (selected.has(item.id)) entry.selected.push(item.fieldBinding.value);
    arrayFields.set(item.fieldBinding.field, entry);
  }

  for (const [field, entry] of arrayFields) {
    const existing = Array.isArray(next[field]) ? next[field] as unknown[] : [];
    next[field] = unique([
      ...existing.filter((value) => !entry.controlled.includes(value)),
      ...entry.selected
    ].map(String));
  }

  for (const id of selected) {
    const item = idMap.get(id);
    const binding = item?.fieldBinding;
    if (!binding || binding.entity !== scope || binding.mode === "includes") continue;
    next[binding.field] = binding.value;
  }

  return next;
};

const deriveBoundTags = (record: Record<string, unknown>, scope: TagScope, tagLibrary: TagDefinition[]) =>
  tagLibrary
    .filter((item) => item.active && item.scopes.includes(scope) && item.fieldBinding?.entity === scope && bindingMatches(record, item.fieldBinding))
    .map((item) => item.id);

const tagIdForCode = (code: string, tagLibrary: TagDefinition[]) => byCode(tagLibrary).get(code)?.id;

const stockCountForProject = (project: Project) =>
  project.partyType === "group" ? project.memberCount : project.partyType === "guarantor" ? project.relatedPartyStockCount : null;

const stockCountAffectsFrequency = (project: Project) =>
  (project.partyType === "group" || project.partyType === "guarantor") &&
  project.exposureBalance > 0 &&
  !project.isSettledThisYear &&
  !project.isNewWithin1y &&
  !project.isWarning &&
  !project.isNpl &&
  project.customerType !== "internal" &&
  project.customerType !== "collab_a" &&
  project.industry !== "energy" &&
  !project.hospitalType &&
  project.bizType !== "factoring";

const derivedProjectTagCodes = (project: Project) => {
  const codes: string[] = [];
  if (project.exposureBalance > 300_000_000) codes.push("exposure.balance.gt_300m");
  else if (project.exposureBalance > 100_000_000) codes.push("exposure.balance.100m_300m");
  else if (project.exposureBalance > 30_000_000) codes.push("exposure.balance.30m_100m");
  else codes.push("exposure.balance.le_30m");

  if (project.exposureInit > 60_000_000) codes.push("exposure.init.gt_60m");
  else codes.push("exposure.init.le_60m");

  if (project.partyType === "guarantor" || project.partyType === "group") {
    const stockCount = stockCountForProject(project);
    if (stockCount === null || stockCount === undefined) {
      if (stockCountAffectsFrequency(project)) codes.push("related_party.stock.unknown");
    } else if (stockCount > 3) {
      codes.push("related_party.stock.gt_3");
    } else {
      codes.push("related_party.stock.le_3");
    }
  }

  const isExemptedFromSchedule = project.exposureBalance <= 0 || project.isSettledThisYear || project.isNewWithin1y;

  if (isExemptedFromSchedule) {
    codes.push("schedule.exempted");
  }

  if (!isExemptedFromSchedule && (project.isWarning || project.customerType === "internal" || codes.includes("related_party.stock.unknown"))) {
    codes.push("schedule.manual_needed");
  }
  const needsAssetDecision =
    !isExemptedFromSchedule &&
    (
      Boolean(project.manualFrequencyRequested) ||
      project.bizType === "factoring" ||
      (project.hospitalType === "public_hospital" && project.exposureInit <= 60_000_000) ||
      project.hospitalType === "private_hospital" ||
      ((project.customerType === "external" || project.customerType === "collab_b") && project.exposureBalance <= 30_000_000) ||
      codes.includes("related_party.stock.unknown")
    );
  if (needsAssetDecision) {
    codes.push("rule.asset_department_decides");
  }
  if (
    needsAssetDecision
  ) {
    codes.push("schedule.publish_blocked");
  }
  return codes;
};
const deriveProjectComputedTags = (project: Project, tagLibrary: TagDefinition[]) =>
  derivedProjectTagCodes(project).map((code) => tagIdForCode(code, tagLibrary)).filter((id): id is string => Boolean(id));

const deriveProjectMaintainerTag = (project: Project, tagLibrary: TagDefinition[]) => {
  const personIds = unique([project.onsiteMaintainerId ?? "", project.offsiteMaintainerId ?? ""]);
  return personIds
    .map((personId) => tagIdForCode(`project.maintainer.person.${tagSlug(personId)}`, tagLibrary))
    .filter((id): id is string => Boolean(id));
};

const retainManualTags = (tagIds: string[] | undefined, scope: TagScope, tagLibrary: TagDefinition[]) => {
  const idMap = byId(tagLibrary);
  return (tagIds ?? []).filter((id) => {
    const item = idMap.get(id);
    return item?.active && item.scopes.includes(scope) && !item.fieldBinding;
  });
};

const normalizeProjectDerivedFields = (project: Project): Project => ({
  ...project,
  isNpl: ["substandard", "doubtful", "loss"].includes(project.riskGrade),
  isSettledThisYear: project.exposureBalance <= 0 ? true : project.isSettledThisYear,
  primaryResponsibleDept: project.primaryResponsibleDept ?? (["substandard", "doubtful", "loss"].includes(project.riskGrade) ? "asset_management" : "joint"),
  companySpecialRequirement: project.companySpecialRequirement ?? false,
  manualFrequencyRequested: project.manualFrequencyRequested ?? false,
  unavailableMonths: project.unavailableMonths ?? [],
  offsiteInfoChannels: project.offsiteInfoChannels ?? []
});

export const syncProjectTags = (project: Project, tagLibrary: TagDefinition[] = defaultTagLibrary): Project => {
  const normalized = normalizeProjectDerivedFields(project);
  return {
    ...normalized,
    tagIds: unique([
      ...deriveBoundTags(normalized as unknown as Record<string, unknown>, "project", tagLibrary),
      ...deriveProjectComputedTags(normalized, tagLibrary),
      ...deriveProjectMaintainerTag(normalized, tagLibrary),
      ...retainManualTags(project.tagIds, "project", tagLibrary)
    ])
  };
};

export const applyProjectTagIds = (project: Project, tagIds: string[], tagLibrary: TagDefinition[] = defaultTagLibrary): Project => {
  const withBindings = applyBindings(project as unknown as Record<string, unknown>, "project", tagIds, tagLibrary) as unknown as Project;
  return syncProjectTags({ ...withBindings, tagIds }, tagLibrary);
};

export const syncPersonTags = (person: Person, tagLibrary: TagDefinition[] = defaultTagLibrary): Person => ({
  ...person,
  tagIds: unique([
    ...deriveBoundTags(person as unknown as Record<string, unknown>, "person", tagLibrary),
    ...retainManualTags(person.tagIds, "person", tagLibrary)
  ])
});

export const applyPersonTagIds = (person: Person, tagIds: string[], tagLibrary: TagDefinition[] = defaultTagLibrary): Person => {
  const withBindings = applyBindings(person as unknown as Record<string, unknown>, "person", tagIds, tagLibrary) as unknown as Person;
  return syncPersonTags({ ...withBindings, tagIds }, tagLibrary);
};

export const ruleTagRefs: Record<string, string[]> = {
  "IN-1": tagIdsByCodes(["flag.settled_this_year"]),
  "IN-2": tagIdsByCodes(["flag.settled_this_year"]),
  "IN-3": tagIdsByCodes(["flag.new_within_1y"]),
  "IN-5": tagIdsByCodes(["customer.external", "customer.collab_b", "customer.collab_a", "customer.internal"]),
  R1: tagIdsByCodes(["flag.warning"]),
  R2: tagIdsByCodes(["risk.npl", "person.specialist.npl"]),
  R3: tagIdsByCodes(["customer.internal"]),
  R4: tagIdsByCodes(["customer.collab_a"]),
  R5: tagIdsByCodes(["industry.energy", "energy.grid_connected", "energy.account_monitored", "energy.realtime_monitored", "energy.repay_clean_3y"]),
  R6: tagIdsByCodes(["industry.energy"]),
  R7: tagIdsByCodes(["hospital.public"]),
  R8: tagIdsByCodes(["party.group"]),
  R9: tagIdsByCodes(["party.group"]),
  R13: tagIdsByCodes(["party.guarantor", "related_party.stock.gt_3"]),
  R14: tagIdsByCodes(["party.guarantor", "related_party.stock.le_3"]),
  R10: tagIdsByCodes(["customer.external", "customer.collab_b"]),
  R11: tagIdsByCodes(["customer.external", "customer.collab_b"]),
  R12: tagIdsByCodes(["customer.external", "customer.collab_b"]),
  P1: tagIdsByCodes(["customer.external", "customer.collab_b", "rule.asset_department_decides"]),
  P2: tagIdsByCodes(["hospital.public", "rule.asset_department_decides"]),
  P3: tagIdsByCodes(["hospital.private", "rule.asset_department_decides"]),
  P4: tagIdsByCodes(["biz.factoring", "rule.asset_department_decides"]),
  P5: tagIdsByCodes(["party.group", "related_party.stock.unknown", "rule.asset_department_decides"]),
  P6: tagIdsByCodes(["party.guarantor", "related_party.stock.unknown", "rule.asset_department_decides"]),
  P7: tagIdsByCodes(["rule.asset_department_decides"])
};

export const activePeopleForMode = (people: Person[], mode: AssigneePoolMode) =>
  people.filter((person) => person.isActive && person.pool.includes(mode));
