import type {
  BusinessRuleItem,
  DecisionStep,
  Person,
  PendingRuleDecision,
  Project,
  RuleFlowStep,
  RuleInfluence,
  RuleSystemMap,
  SchedulingRun,
  TagCategory,
  TagDefinition,
  TagScope,
  TagTaxonomyNode
} from "@inspection/domain";
import { businessRuleByTechnicalId, businessRuleItems, businessRuleOrders, evidenceForRule, evidenceLibrary } from "./business-rules.js";
import { defaultTagLibrary } from "./tags.js";

type RuleSystemContext = {
  projects?: Project[];
  people?: Person[];
  run?: SchedulingRun;
  tagLibrary?: TagDefinition[];
};

const flowStepLabels: Record<Exclude<DecisionStep, "override">, string> = {
  scope: "是否纳入计划",
  frequency: "检查频次",
  assignee: "人员安排",
  time: "时间安排",
  validation: "发布校验"
};

const ruleStepOf = (technicalRuleId: string): Exclude<DecisionStep, "override"> => {
  if (technicalRuleId.startsWith("IN-")) return "scope";
  if (technicalRuleId.startsWith("R") || technicalRuleId.startsWith("P")) return "frequency";
  if (technicalRuleId.startsWith("A-")) return "assignee";
  if (technicalRuleId.startsWith("H-")) return "time";
  return "validation";
};

const ruleIds = (ids: string[]) => ids.filter((id) => businessRuleByTechnicalId(id));

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];
const dataGapRuleIds = new Set(["P5", "P6"]);

const tagIdsForRules = (ids: string[]) =>
  unique(ids.flatMap((id) => businessRuleByTechnicalId(id)?.tagRefs ?? []));

const influences = (
  schedulerStep: Exclude<DecisionStep, "override">,
  rows: Array<Omit<RuleInfluence, "schedulerStep">>
): RuleInfluence[] => rows.map((row) => ({ ...row, schedulerStep }));

const flowSteps = (tagLibrary: TagDefinition[] = defaultTagLibrary): RuleFlowStep[] => {
  const scopeRules = ruleIds(["IN-1", "IN-2", "IN-3", "IN-5"]);
  const frequencyRules = ruleIds([
    "R1",
    "R2",
    "R3",
    "R4",
    "R5",
    "R6",
    "R7",
    "R8",
    "R9",
    "R13",
    "R14",
    "R10",
    "R11",
    "R12",
    "P1",
    "P2",
    "P3",
    "P4",
    "P5",
    "P6",
    "P7"
  ]);
  const assigneeTags = tagLibrary
    .filter((tag) => tag.code.startsWith("person.") || tag.code.startsWith("project.group.") || tag.code === "biz.direct_lease" || tag.code === "risk.npl" || tag.category === "ownership")
    .map((tag) => tag.id);
  const validationTags = tagLibrary.filter((tag) => tag.code === "rule.asset_department_decides").map((tag) => tag.id);

  return [
    {
      id: "scope",
      order: 1,
      title: flowStepLabels.scope,
      businessQuestion: "项目是否属于本年度授信后检查计划对象？",
      currentStateTitle: "当前状况",
      currentState: "读取项目敞口、是否结清、是否当年新增短期限，以及是否属于一般风险业务。",
      judgmentBasisTitle: "判断依据",
      judgmentBasis: "第三章第八至十条要求按年度/半年度制定计划，只针对一般风险业务，符合免检条件的项目先排除。",
      decisionResultTitle: "判断结果",
      decisionResult: "排除免检项目；其余项目进入检查频次判断。",
      relatedRuleIds: scopeRules,
      relatedTagIds: tagIdsForRules(scopeRules),
      influences: influences("scope", [
        { target: "project", description: "决定项目是否进入年度项目池和后续排期计算。" },
        { target: "task", description: "被排除项目不生成现场或非现场任务。" }
      ])
    },
    {
      id: "frequency",
      order: 2,
      title: flowStepLabels.frequency,
      businessQuestion: "入池项目应安排几次现场和非现场检查？",
      currentStateTitle: "当前状况",
      currentState: "读取客户类型、风险分类、行业专项、集团口径、风险敞口、医院类型和预警状态。",
      judgmentBasisTitle: "判断依据",
      judgmentBasis: "第三章第十一至十四条规定检查方式、全面检查频次、专项口径、预警处理和资产部酌情增减权限。",
      decisionResultTitle: "判断结果",
      decisionResult: "输出现场/非现场次数；制度未量化或数据字段缺失的事项生成待办，规则口径缺失会阻断正式发布。",
      relatedRuleIds: frequencyRules,
      relatedTagIds: unique([
        ...tagIdsForRules(frequencyRules),
        ...tagLibrary.filter((tag) => tag.code.startsWith("project.group.")).map((tag) => tag.id)
      ]),
      influences: influences("frequency", [
        { target: "task", description: "决定每个项目生成多少个现场和非现场任务。" },
        { target: "publish", description: "待补口径会进入发布闸门，未补齐前不能正式发布。" }
      ])
    },
    {
      id: "assignee",
      order: 3,
      title: flowStepLabels.assignee,
      businessQuestion: "这些检查任务应该由谁负责？",
      currentStateTitle: "当前状况",
      currentState: "读取项目维护人、长期归属、项目专项标签，以及人员池、专项能力和有效期。",
      judgmentBasisTitle: "判断依据",
      judgmentBasis: "第二章第五至七条明确检查责任主体；系统实现口径将长期归属、专项能力和负荷均衡转成分派顺序。",
      decisionResultTitle: "判断结果",
      decisionResult: "按规则配置的优先级匹配长期负责项目/集团、专项能力、历史维护人和负荷均衡。",
      relatedRuleIds: ["A-1", "A-2", "A-3", "A-4"],
      relatedTagIds: unique(assigneeTags),
      influences: influences("assignee", [
        { target: "person", description: "人员标签决定可参与的人员池和专项优先级。" },
        { target: "task", description: "为每条检查任务写入建议负责人。" }
      ])
    },
    {
      id: "time",
      order: 4,
      title: flowStepLabels.time,
      businessQuestion: "检查任务应安排在什么时间窗口？",
      currentStateTitle: "当前状况",
      currentState: "读取检查次数、上下半年要求、项目中期时间、人员已有负荷和节假日完整工作周。",
      judgmentBasisTitle: "判断依据",
      judgmentBasis: "第三章第八条按自然年度/半年度计划；第三章第十一条要求非现场与现场错开。",
      decisionResultTitle: "判断结果",
      decisionResult: "现场按完整工作周排期，2次现场拆分上下半年；非现场作为5个工作日完成窗口并与现场错开。",
      relatedRuleIds: ["H-1", "H-2", "H-3", "H-4", "H-5", "S-1", "S-2"],
      relatedTagIds: [],
      influences: influences("time", [
        { target: "schedule", description: "决定任务落在哪一周或完成窗口。" },
        { target: "person", description: "同一人员现场周容量会限制可排任务数量。" }
      ])
    },
    {
      id: "validation",
      order: 5,
      title: flowStepLabels.validation,
      businessQuestion: "方案能不能进入正式发布？",
      currentStateTitle: "当前状况",
      currentState: "汇总待补口径、硬冲突、待人工项、项目快照和人员版本状态。",
      judgmentBasisTitle: "判断依据",
      judgmentBasis: "工程实现说明书红线要求：待补口径阻断发布；每个方案格点必须可追溯输入、规则版本和依据。",
      decisionResultTitle: "判断结果",
      decisionResult: "待补口径和硬冲突为0后允许发布；待人工项可形成草案，但必须留痕确认。",
      relatedRuleIds: ["RULE_GAP", "H-0", "H-4", "H-5"],
      relatedTagIds: validationTags,
      influences: influences("validation", [
        { target: "publish", description: "决定生成正式排期按钮是否可用。" },
        { target: "project", description: "把问题定位回项目、人员或规则维护页面。" }
      ])
    }
  ];
};

const affectedCount = (technicalRuleId: string, run?: SchedulingRun) =>
  run?.audit.ruleHitDistribution[technicalRuleId] ?? 0;

const requiredInputFor = (item: BusinessRuleItem) => {
  if (item.technicalRuleId === "P1") return "明确外部/协同B客户敞口≤3000万元时的现场检查频次。";
  if (item.technicalRuleId === "P2") return "明确公立医院初始敞口≤6000万元时是否安排现场检查及次数。";
  if (item.technicalRuleId === "P3") return "明确民营医院项目是否沿用公立医院或普通客户口径。";
  if (item.technicalRuleId === "P4") return "明确商业保理业务是否沿用回租/直租检查频次。";
  if (item.technicalRuleId === "P5") return "补齐集团检查对象的 member_count（旗下我司存量客户数）；存量≥2 后自动进入 R8/R9。";
  if (item.technicalRuleId === "P6") return "补齐担保人、实控人或母公司旗下存量客户数字段。";
  if (item.technicalRuleId === "P7") return "补充资产管理部负责人酌情增减的审批依据和最终次数。";
  return "确认人工处理口径和留痕要求。";
};

const createPendingDecisions = (run?: SchedulingRun): PendingRuleDecision[] =>
  businessRuleItems
    .filter((item): item is BusinessRuleItem & { publishImpact: "manual_needed" | "blocks_publish" } => item.publishImpact !== "can_publish")
    .map((item) => ({
      id: `pending-${item.technicalRuleId}`,
      technicalRuleId: item.technicalRuleId,
      title: item.businessTitle,
      businessQuestion: item.businessCondition,
      currentGap: item.businessOutcome,
      requiredInput: requiredInputFor(item),
      suggestedAction:
        dataGapRuleIds.has(item.technicalRuleId)
          ? "到项目维护页补齐基础数据后重新校验，不需要发布补充规则。"
          : item.publishImpact === "blocks_publish"
          ? "补充量化口径后先做沙盘试算，再提交规则发布。"
          : "确认人工处理方案，并在项目决策链中保留人工确认记录。",
      evidenceRefs: item.evidenceRefs,
      tagRefs: item.tagRefs,
      affectedProjectCount: affectedCount(item.technicalRuleId, run),
      publishImpact: item.publishImpact
    }));

export const createRuleSystemMap = (context: RuleSystemContext = {}): RuleSystemMap => ({
  title: "现场检查排期规则地图",
  summary: "规则从项目和人员标签读取当前状况，尤其通过集团归属等关系标签把项目需求与人员长期负责范围对应起来，再驱动任务数量、负责人、时间窗口和发布闸门。",
  sourceDocuments: unique(evidenceLibrary.map((entry) => entry.sourceDocument)),
  steps: flowSteps(context.tagLibrary ?? defaultTagLibrary),
  pendingDecisions: createPendingDecisions(context.run)
});

const tagGroupMeta: Partial<Record<TagCategory, { title: string; description: string; scope: TagScope }>> = {
  customer_type: { title: "客户类型", description: "决定内部、协同A、协同B、外部客户采用哪类检查口径。", scope: "project" },
  risk: { title: "风险状态", description: "决定不良类客户是否优先进入现场检查。", scope: "project" },
  industry: { title: "行业专项", description: "承接能源环保、医院等专项检查要求。", scope: "project" },
  business_type: { title: "业务类型", description: "识别回租、直租、保理等业务差异和待补口径。", scope: "project" },
  party: { title: "检查对象", description: "识别承租人、集团客户、担保人或母公司口径。", scope: "project" },
  special_condition: { title: "特殊状态", description: "承接预警、结清、新增短期限、能源豁免条件等事实。", scope: "project" },
  person_pool: { title: "人员池", description: "决定哪些人员参与当前排期场景。", scope: "person" },
  person_specialty: { title: "专项能力", description: "决定直租、不良等专项项目优先匹配谁。", scope: "person" },
  responsibility: { title: "职责分工", description: "承接资产管理部主责、业务部门主责/配合、报告和整改职责。", scope: "person" },
  ownership: { title: "归属关系", description: "连接项目归属集团与人员长期负责集团，决定集团项目优先按归属人排期。", scope: "person" },
  rule_applicability: { title: "待补口径", description: "标记制度写明由资产管理部确定或当前系统尚未量化的事项。", scope: "rule" },
  rule_stage: { title: "规则阶段", description: "标记规则作用于入池、频次、人员、时间或发布校验。", scope: "rule" },
  rule_outcome: { title: "输出动作", description: "标记规则最终输出免检、频次、人工确认或阻断发布。", scope: "rule" },
  derived: { title: "派生分档", description: "由敞口、存量等字段自动归一出的业务分档。", scope: "project" },
  schedule_output: { title: "排期输出", description: "由规则和排期结果生成的状态标签。", scope: "project" },
  manual: { title: "人工标签", description: "由管理员维护的补充业务分类。", scope: "rule" }
};

const nodeImpact = (
  tagIds: string[],
  ruleItems: BusinessRuleItem[],
  projects: Project[],
  people: Person[]
): TagTaxonomyNode["impact"] => {
  const tagSet = new Set(tagIds);
  const linkedRules = ruleItems.filter((item) => item.tagRefs.some((id) => tagSet.has(id)));
  const schedulerSteps = unique([
    ...linkedRules.map((item) => flowStepLabels[ruleStepOf(item.technicalRuleId)]),
    ...(tagIds.some((id) => id.startsWith("tag-person-")) ? [flowStepLabels.assignee] : [])
  ]);
  return {
    projectCount: projects.filter((project) => (project.tagIds ?? []).some((id) => tagSet.has(id))).length,
    personCount: people.filter((person) => (person.tagIds ?? []).some((id) => tagSet.has(id))).length,
    ruleCount: linkedRules.length,
    schedulerSteps
  };
};

const makeLeafNode = (
  tag: TagDefinition,
  ruleItems: BusinessRuleItem[],
  projects: Project[],
  people: Person[]
): TagTaxonomyNode => ({
  id: tag.id,
  title: tag.name,
  description: tag.description,
  level: 3,
  scope: tag.scopes[0] ?? null,
  category: tag.category,
  tagIds: [tag.id],
  impact: nodeImpact([tag.id], ruleItems, projects, people),
  children: []
});

const makeCategoryNode = (
  category: TagCategory,
  tags: TagDefinition[],
  ruleItems: BusinessRuleItem[],
  projects: Project[],
  people: Person[],
  scope: TagScope
): TagTaxonomyNode => {
  const meta = tagGroupMeta[category] ?? { title: category, description: "业务标签分类", scope: "rule" as TagScope };
  const scopedTags = tags.filter((tag) => tag.scopes.includes(scope));
  const tagIds = scopedTags.map((tag) => tag.id);
  return {
    id: `taxonomy-${category}`,
    title: meta.title,
    description: meta.description,
    level: 2,
    scope,
    category,
    tagIds,
    impact: nodeImpact(tagIds, ruleItems, projects, people),
    children: scopedTags.map((tag) => makeLeafNode(tag, ruleItems, projects, people))
  };
};

export const createTagTaxonomy = ({
  tagLibrary = defaultTagLibrary,
  projects = [],
  people = []
}: RuleSystemContext = {}): TagTaxonomyNode[] => {
  const activeTags = tagLibrary.filter((tag) => tag.active);
  const ruleItems = businessRuleOrders.flatMap((order) => order.items);
  const grouped = new Map<TagCategory, TagDefinition[]>();
  for (const tag of activeTags) {
    grouped.set(tag.category, [...(grouped.get(tag.category) ?? []), tag]);
  }

  const rootGroups: Array<{ id: string; title: string; description: string; categories: TagCategory[]; scope: TagScope }> = [
    {
      id: "taxonomy-project",
      title: "项目标签",
      description: "描述项目本身的业务属性，是入池和频次规则的主要输入。",
      scope: "project",
      categories: ["customer_type", "risk", "industry", "business_type", "party", "responsibility", "ownership", "derived", "special_condition", "schedule_output"]
    },
    {
      id: "taxonomy-person",
      title: "人员标签",
      description: "描述人员可用范围和专项能力，是人员分派规则的主要输入。",
      scope: "person",
      categories: ["person_pool", "responsibility", "person_specialty", "ownership"]
    },
    {
      id: "taxonomy-rule",
      title: "规则标签",
      description: "描述规则适用性和待补口径，影响发布前审计。",
      scope: "rule",
      categories: ["rule_stage", "rule_outcome", "rule_applicability", "manual"]
    }
  ];

  return rootGroups.map((root) => {
    const children = root.categories
      .map((category) => {
        const categoryTags = grouped.get(category)?.filter((tag) => tag.scopes.includes(root.scope)) ?? [];
        return categoryTags.length ? makeCategoryNode(category, categoryTags, ruleItems, projects, people, root.scope) : null;
      })
      .filter((node): node is TagTaxonomyNode => Boolean(node));
    const tagIds = children.flatMap((child) => child.tagIds);
    return {
      id: root.id,
      title: root.title,
      description: root.description,
      level: 1,
      scope: root.scope,
      category: null,
      tagIds,
      impact: nodeImpact(tagIds, ruleItems, projects, people),
      children
    };
  });
};

export const createRuleImpact = (technicalRuleId: string, context: RuleSystemContext = {}) => {
  const businessRule = businessRuleByTechnicalId(technicalRuleId);
  const tagLibrary = context.tagLibrary ?? defaultTagLibrary;
  const tags = tagLibrary.filter((tag) => businessRule?.tagRefs.includes(tag.id));
  const tagIds = tags.map((tag) => tag.id);
  const affectedProjectIds = new Set(
    context.run?.decisionLogs
      .filter((log) => log.ruleHit === technicalRuleId)
      .map((log) => log.projectId) ?? []
  );
  const affectedProjects = (context.projects ?? [])
    .filter((project) => affectedProjectIds.has(project.id))
    .map((project) => ({
      id: project.id,
      name: project.name,
      customerType: project.customerType,
      riskGrade: project.riskGrade,
      exposureBalance: project.exposureBalance,
      tagIds: project.tagIds ?? []
    }));
  return {
    technicalRuleId,
    businessRule,
    evidence: evidenceForRule(technicalRuleId),
    tags,
    affectedProjectCount: affectedCount(technicalRuleId, context.run),
    affectedProjects,
    affectedPersonCount: (context.people ?? []).filter((person) => (person.tagIds ?? []).some((id) => tagIds.includes(id))).length,
        affectedSchedulerStep: businessRule ? flowStepLabels[ruleStepOf(technicalRuleId)] : "发布校验",
        influences: flowSteps(context.tagLibrary ?? defaultTagLibrary).find((step) => step.id === ruleStepOf(technicalRuleId))?.influences ?? []
      };
};
