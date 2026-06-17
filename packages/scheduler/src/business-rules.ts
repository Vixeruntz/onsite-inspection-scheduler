import type { AssignmentPriorityKey, BusinessRuleItem, BusinessRuleOrder, DecisionLog, EnrichedDecisionLog, PolicyCitation, RuleEvidence, RuleImpactType } from "@inspection/domain";
import { ruleTagRefs } from "./tags.js";

const implementationDoc = "产品架构与工程实现说明书";
const policyDoc = "检查计划管理实施细则 CRL/ZC-2024-001-07";

const citation = (
  chapterTitle: string,
  articleNo: string,
  articleTitle: string,
  clauseLabel: string | null,
  excerpt: string,
  sourceDocument = policyDoc
): PolicyCitation => ({
  sourceDocument,
  chapterTitle,
  articleNo,
  articleTitle,
  clauseLabel,
  citationLabel: [chapterTitle, articleNo, articleTitle, clauseLabel].filter(Boolean).join(" · "),
  excerpt
});

const evidence = (
  id: string,
  policyCitation: PolicyCitation,
  interpretation: string
): RuleEvidence => ({
  id,
  sourceDocument: policyCitation.sourceDocument,
  sourceParagraph: policyCitation.citationLabel,
  policyCitation,
  sourceExcerpt: policyCitation.excerpt,
  interpretation
});

export const evidenceLibrary: RuleEvidence[] = [
  evidence(
    "EV-PLAN-CYCLE",
    citation("第三章 授信后检查操作细则", "第八条", "检查计划制定", null, "资产管理部于每年1月31日之前制定当年度授信后检查计划；于每年7月31日前制定新增项目的下半年检查计划。"),
    "系统按自然年度/半年度生成检查计划，半年度计划按检查要求减半。"
  ),
  evidence(
    "EV-IN-SCOPE",
    citation("第三章 授信后检查操作细则", "第九条、第十条", "一般风险业务与免检条件", null, "授信后检查只针对一般风险业务；当年度结清、当年新增且项目期限不超过1年的非不良类客户或项目可免除。"),
    "先判断项目是否纳入检查池，免检项目不继续计算频次。"
  ),
  evidence(
    "EV-CHECK-METHOD",
    citation("第三章 授信后检查操作细则", "第十一条", "授信后检查工作方式", null, "授信后检查可采取现场和非现场检查相结合的方式；非现场检查需要与现场检查时间错开。"),
    "现场和非现场是两类任务，同项目两类检查需错开安排。"
  ),
  evidence(
    "EV-OFFSITE-GENERAL",
    citation("第三章 授信后检查操作细则", "第十三条", "全面检查", "非现场检查", "内部客户不做非现场检查强制要求，其他类型客户每年进行一次非现场检查；不良类仅做现场检查要求。"),
    "非不良的一般客户默认保留年度非现场；不良类客户以现场检查为主。"
  ),
  evidence(
    "EV-NPL",
    citation("第三章 授信后检查操作细则", "第十三条", "全面检查", "现场检查（一）不良类客户", "对于风险分类为不良类客户，现场检查按需进行，年度不少于2次。"),
    "不良类客户优先于普通客户分档判断，直接生成年度不少于两次现场检查。"
  ),
  evidence(
    "EV-EXTERNAL-TIERS",
    citation("第三章 授信后检查操作细则", "第十三条", "全面检查", "现场检查（二）1 外部客户及协同B类客户", "外部客户及协同B类客户依据风险敞口余额，分为大于3亿元、1至3亿元、3000万至1亿元、3000万元以下。"),
    "外部/协同B客户按风险敞口余额分档计算现场频次。"
  ),
  evidence(
    "EV-ENERGY",
    citation("第三章 授信后检查操作细则", "第十三条", "全面检查", "能源环保项目", "能源环保项目符合并网、监管、还款等条件且敞口不超过3亿元，可免除现场检查；大于3亿元每年1次现场。"),
    "能源环保项目先走专项豁免判断，再进入通用敞口分档。"
  ),
  evidence(
    "EV-HOSPITAL",
    citation("第三章 授信后检查操作细则", "第十三条", "全面检查", "公立医院类项目", "公立医院项目初始风险敞口大于6000万元，现场检查1次；小于等于6000万元以资产管理部要求为准。"),
    "公立医院是行业专项规则，大额项目按中期现场检查，小额项目需资产部明确量化口径。"
  ),
  evidence(
    "EV-GROUP",
    citation("第三章 授信后检查操作细则", "第十三条", "全面检查", "集团客户", "符合集团客户合并管理的集团需至少有两个以上存量客户；旗下存量客户数大于3时每年2次，否则每年1次。"),
    "集团客户按合并管理口径和旗下存量客户数确定现场频次。"
  ),
  evidence(
    "EV-INTERNAL-COLLABA-WARNING",
    citation("第三章 授信后检查操作细则", "第十三条", "全面检查", "集团内部、协同A与预警客户", "集团内部客户原则上不进行强制要求；协同A类客户现场检查不做要求；出现预警信号按方案及时安排检查。"),
    "内部、协同A和预警客户按制度单独处理，不进入普通外部客户分档。"
  ),
  evidence(
    "EV-MANUAL-INCREASE",
    citation("第三章 授信后检查操作细则", "第十四条", "酌情增减检查次数", null, "资产管理部负责人有权根据项目风险情况、项目进度等情况酌情增减项目现场、非现场检查次数。"),
    "酌情增减属于人工决策，应通过覆写和审批留痕完成。"
  ),
  evidence(
    "EV-FACTORING-SCOPE",
    citation("第一章 总则", "第三条", "业务适用范围", null, "本细则所规范的业务范围包括融资租赁、商业保理及其他可能给公司带来信用风险敞口暴露、实质为授信的债权类业务。"),
    "保理业务在适用范围内，但制度未单列频次，需要资产部补充是否沿用回租口径。"
  ),
  evidence(
    "EV-RULE-GAP",
    citation("产品架构与工程实现说明书", "红线要求", "待补口径发布前处理", null, "命不中频次规则标记待规则补全，发布前必须处理；待人工事项单独留痕。", implementationDoc),
    "制度未量化或口径待定时，系统必须显式阻断正式发布。"
  )
];

const rule = (
  order: number,
  businessOrderGroup: string,
  technicalRuleId: string,
  businessTitle: string,
  businessCondition: string,
  businessOutcome: string,
  evidenceRefs: string[],
  systemAction: BusinessRuleItem["systemAction"],
  publishImpact: BusinessRuleItem["publishImpact"],
  impactType: RuleImpactType,
  assignmentPriority?: AssignmentPriorityKey[]
): BusinessRuleItem => ({
  id: `BR-${technicalRuleId}`,
  order,
  businessOrderGroup,
  technicalRuleId,
  businessTitle,
  businessCondition,
  businessOutcome,
  evidenceRefs,
  tagRefs: ruleTagRefs[technicalRuleId] ?? [],
  impactType,
  assignmentPriority,
  systemAction,
  publishImpact
});

const groups: Array<Omit<BusinessRuleOrder, "items"> & { itemIds: string[] }> = [
  {
    id: "G1",
    title: "先判断是否纳入检查计划",
    description: "低风险、已结清、当年新增短期限等项目先排除，只有入池项目才继续计算频次。",
    order: 1,
    itemIds: ["IN-1", "IN-2", "IN-3", "IN-5"]
  },
  {
    id: "G2",
    title: "特殊要求优先处理",
    description: "批复、预警、资产部负责人酌情增减等事项优先进入人工或专项处理。",
    order: 2,
    itemIds: ["R1", "P7"]
  },
  {
    id: "G3",
    title: "风险优先",
    description: "不良类客户风险最高，优先于普通客户类型和敞口分档。",
    order: 3,
    itemIds: ["R2"]
  },
  {
    id: "G4",
    title: "客户类型明确口径",
    description: "内部客户和协同A客户按制度直接处理，不进入外部/协同B分档。",
    order: 4,
    itemIds: ["R3", "R4"]
  },
  {
    id: "G5",
    title: "行业与集团专项",
    description: "能源环保、公立医院、集团客户等专项口径优先于通用敞口分档。",
    order: 5,
    itemIds: ["R5", "R6", "R7", "P2", "P3", "R8", "R9", "P5", "R13", "R14", "P6", "P4"]
  },
  {
    id: "G6",
    title: "外部及协同B敞口分档",
    description: "普通外部客户和协同B客户按计划时剩余风险敞口余额分档。",
    order: 6,
    itemIds: ["R10", "R11", "R12", "P1"]
  },
  {
    id: "G7",
    title: "制度未量化口径",
    description: "制度写明由资产管理部要求确定、或样表出现但制度未单列的情形，进入待规则补全。",
    order: 7,
    itemIds: ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]
  }
];

const items = [
  rule(10, "G1", "IN-1", "低风险无敞口不纳入", "项目无风险敞口或剩余敞口为0。", "不纳入本期授信后检查计划。", ["EV-IN-SCOPE"], "exclude", "can_publish", "exclude"),
  rule(20, "G1", "IN-2", "当年度结清项目免检", "项目当年度已经结清。", "免除后续检查要求。", ["EV-IN-SCOPE"], "exclude", "can_publish", "exclude"),
  rule(30, "G1", "IN-3", "当年新增短期限项目免检", "当年新增且项目期限不超过1年，且无公司特殊要求。", "免除本期授信后检查。", ["EV-IN-SCOPE"], "exclude", "can_publish", "exclude"),
  rule(40, "G1", "IN-5", "一般风险业务进入检查池", "风险授信敞口大于0，且未命中免检情形。", "继续进入频次判断。", ["EV-IN-SCOPE", "EV-PLAN-CYCLE"], "covered", "can_publish", "frequency"),
  rule(50, "G2", "R1", "预警客户按处理方案安排", "客户出现预警信号。", "按预警信号处理方案及时安排现场或非现场检查，次数需人工确认。", ["EV-INTERNAL-COLLABA-WARNING"], "manual", "manual_needed", "method_manual"),
  rule(60, "G2", "P7", "资产部负责人酌情增减", "资产部负责人要求按项目风险或进度增减检查次数。", "走人工覆写并保留操作依据，默认不自动量化。", ["EV-MANUAL-INCREASE", "EV-RULE-GAP"], "rule_gap", "blocks_publish", "publish_block"),
  rule(70, "G3", "R2", "不良类客户现场优先", "五级分类为次级、可疑、损失。", "年度不少于2次现场检查，不再安排普通非现场检查。", ["EV-NPL"], "covered", "can_publish", "frequency", ["capability", "maintainer", "load_balance"]),
  rule(80, "G4", "R3", "内部客户不强制", "客户类型为集团内部客户。", "原则上不强制现场/非现场，重点监控股权、控制权变化，需人工确认。", ["EV-INTERNAL-COLLABA-WARNING", "EV-OFFSITE-GENERAL"], "manual", "manual_needed", "method_manual"),
  rule(90, "G4", "R4", "协同A客户现场不要求", "客户类型为协同A。", "现场检查不做要求，保留每年1次非现场检查。", ["EV-INTERNAL-COLLABA-WARNING", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency"),
  rule(100, "G5", "R5", "能源环保满足条件免现场", "能源环保项目，敞口不超过3亿元，且满足并网、监管、还款等豁免条件。", "免除现场检查，保留每年1次非现场检查。", ["EV-ENERGY", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency"),
  rule(110, "G5", "R6", "能源环保大额项目每年现场", "能源环保项目，风险敞口余额大于3亿元。", "每年1次现场检查，并安排每年1次非现场检查。", ["EV-ENERGY", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency"),
  rule(120, "G5", "R7", "公立医院大额项目中期现场", "公立医院项目，初始风险敞口余额大于6000万元。", "项目中期安排1次现场检查，并安排每年1次非现场检查。", ["EV-HOSPITAL", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency"),
  rule(130, "G5", "P2", "公立医院小额项目待资产部明确", "公立医院项目，初始风险敞口余额小于等于6000万元。", "制度写明以资产管理部要求为准，当前系统未配置量化次数。", ["EV-HOSPITAL", "EV-RULE-GAP"], "rule_gap", "blocks_publish", "publish_block"),
  rule(140, "G5", "P3", "民营医院项目待明确", "医院类型为民营医院。", "制度未单列民营医院频次口径，需资产部补充规则。", ["EV-HOSPITAL", "EV-RULE-GAP"], "rule_gap", "blocks_publish", "publish_block"),
  rule(150, "G5", "R8", "集团客户存量大于3每年两次", "符合集团合并管理，且旗下存量客户数大于3。", "每年2次现场检查，并补充非现场检查安排。", ["EV-GROUP", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency", ["ownership_group", "ownership_project", "capability", "maintainer", "load_balance"]),
  rule(160, "G5", "R9", "集团客户存量不超过3每年一次", "符合集团合并管理，且旗下存量客户数为2至3。", "每年1次现场检查，并补充非现场检查安排。", ["EV-GROUP", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency", ["ownership_group", "ownership_project", "capability", "maintainer", "load_balance"]),
  rule(170, "G5", "P5", "集团存量数据待补齐", "检查对象为集团客户，但 member_count（旗下我司存量客户数）字段缺失。", "制度已有频次口径；需补齐集团旗下存量客户数后自动计算。", ["EV-GROUP", "EV-RULE-GAP"], "rule_gap", "blocks_publish", "publish_block", ["ownership_group", "load_balance"]),
  rule(180, "G5", "R13", "担保人/母公司旗下存量大于3每年两次", "检查对象为担保人、实控人或母公司，且旗下存量客户数大于3。", "每年2次现场检查，并补充非现场检查安排。", ["EV-GROUP", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency", ["ownership_group", "ownership_project", "capability", "maintainer", "load_balance"]),
  rule(185, "G5", "R14", "担保人/母公司旗下存量不超过3每年一次", "检查对象为担保人、实控人或母公司，且旗下存量客户数不超过3。", "每年1次现场检查，并补充非现场检查安排。", ["EV-GROUP", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency", ["ownership_group", "ownership_project", "capability", "maintainer", "load_balance"]),
  rule(188, "G5", "P6", "担保人/母公司存量数据待补齐", "检查对象为担保人、实控人或母公司，但旗下存量客户数字段缺失。", "制度已有频次口径；需补齐旗下存量客户数后自动计算。", ["EV-GROUP", "EV-RULE-GAP"], "rule_gap", "blocks_publish", "publish_block"),
  rule(190, "G5", "P4", "保理业务频次待明确", "业务类型为商业保理。", "制度纳入适用范围，但未单列频次；需明确是否沿用回租口径。", ["EV-FACTORING-SCOPE", "EV-RULE-GAP"], "rule_gap", "blocks_publish", "publish_block"),
  rule(200, "G6", "R10", "外部/协同B大额敞口检查", "外部或协同B客户，风险敞口余额大于3亿元。", "每半年1次现场检查，全年2次；同时每年1次非现场检查。", ["EV-EXTERNAL-TIERS", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency"),
  rule(210, "G6", "R11", "外部/协同B中额敞口检查", "外部或协同B客户，风险敞口余额大于1亿元且不超过3亿元。", "每年1次现场检查，并安排每年1次非现场检查。", ["EV-EXTERNAL-TIERS", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency"),
  rule(220, "G6", "R12", "外部/协同B较小敞口检查", "外部或协同B客户，风险敞口余额大于3000万元且不超过1亿元。", "每两年1次现场检查，并安排每年1次非现场检查。", ["EV-EXTERNAL-TIERS", "EV-OFFSITE-GENERAL"], "covered", "can_publish", "frequency"),
  rule(230, "G6", "P1", "外部/协同B小额敞口待资产部明确", "外部或协同B客户，风险敞口余额小于等于3000万元。", "制度写明以资产管理部要求为准，当前系统未配置量化次数。", ["EV-EXTERNAL-TIERS", "EV-RULE-GAP"], "rule_gap", "blocks_publish", "publish_block")
] satisfies BusinessRuleItem[];

const byId = new Map(items.map((item) => [item.technicalRuleId, item]));
const evidenceById = new Map(evidenceLibrary.map((evidence) => [evidence.id, evidence]));

export const businessRuleItems = items;

export const businessRuleOrders: BusinessRuleOrder[] = groups.map((group) => ({
  id: group.id,
  title: group.title,
  description: group.description,
  order: group.order,
  items: group.itemIds.map((id) => byId.get(id)).filter((item): item is BusinessRuleItem => Boolean(item))
}));

export const businessRuleByTechnicalId = (technicalRuleId: string | null | undefined) =>
  technicalRuleId ? byId.get(technicalRuleId) ?? null : null;

export const evidenceForRule = (technicalRuleId: string | null | undefined) => {
  const item = businessRuleByTechnicalId(technicalRuleId);
  if (!item) return [];
  return item.evidenceRefs.map((id) => evidenceById.get(id)).filter((evidence): evidence is RuleEvidence => Boolean(evidence));
};

export const enrichDecisionLog = (log: DecisionLog): EnrichedDecisionLog => {
  const businessRule = businessRuleByTechnicalId(log.ruleHit);
  return {
    ...log,
    businessRule,
    evidence: evidenceForRule(log.ruleHit)
  };
};

export const enrichDecisionLogs = (logs: DecisionLog[]) => logs.map(enrichDecisionLog);
