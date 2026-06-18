"use client";

import {
  labelMaps,
  type AssigneePoolMode,
  type BusinessRuleItem,
  type BusinessRuleOrder,
  type DecisionExplanation,
  type DecisionResult,
  type FrequencyValue,
  type IssueBoard,
  type Person,
  type PendingRuleDecision,
  type PlanningYearWorkspace,
  type Project,
  type PublishIssue,
  type ReadinessGate,
  type RuleDecisionDraft,
  type RuleEvidence,
  type RuleRegistryGroup,
  type RuleRegistryItem,
  type RuleSuggestionBatch,
  type RuleSupplementSuggestion,
  type RuleSimulationResult,
  type RuleSystemMap,
  type SchedulingRun,
  type TagCoverageSummary,
  type TagDefinition,
  type TagTaxonomyNode,
  type Task
} from "@inspection/domain";
import {
  businessRuleByTechnicalId,
  businessRuleOrders as fallbackBusinessRuleOrders,
  createDecisionExplanations,
  createIssueBoard,
  createRuleSystemMap,
  createTagCoverageSummary,
  createTagTaxonomy,
  diffRuns,
  evidenceForRule,
  evidenceLibrary as fallbackEvidenceLibrary,
  isRunLocked,
  latestRunEndDate,
  syncPersonTags,
  syncProjectTags,
  tagNamesByIds,
  tagsForScope
} from "@inspection/scheduler";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Database,
  Download,
  FileDiff,
  FileSpreadsheet,
  FlaskConical,
  FolderOpen,
  GitBranch,
  ListChecks,
  ListFilter,
  Lock,
  PanelLeft,
  Play,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  UserCog,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  monthTaskClasses,
  peopleCapacity,
  projectStatus,
  statusLabel,
  stepStatus,
  tasksForProject,
  workspace as fallbackWorkspace
} from "../lib/demo";

type View = "readiness" | "projectInput" | "peopleInput" | "rulesInput" | "schedule" | "tasks" | "export" | "archive";
type RuleUrlPanel = "draft" | "impact" | "evidence" | "simulation";
type RuleActionPanelMode = RuleUrlPanel | "submit";
type ScheduleFilter = "manual" | "issues" | null;
type ScheduleFilterState = {
  assignees: string[];
  personTypes: string[];
  customerTypes: Project["customerType"][];
  bizTypes: Project["bizType"][];
  checkTypes: Task["checkType"][];
};
type RouteState = {
  rule?: string;
  panel?: RuleUrlPanel;
  filter?: ScheduleFilter;
  project?: string;
  task?: string;
  field?: string;
  section?: string;
  projectStatus?: ProjectReadinessFilter;
  personStatus?: PersonReadinessFilter;
  person?: string;
  run?: string;
  assignee?: string;
  personType?: string;
  customerType?: string;
  bizType?: string;
  checkType?: string;
};

const navItems: Array<{ id: View; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "readiness", label: "首页", icon: ListChecks },
  { id: "projectInput", label: "项目维护", icon: FileSpreadsheet },
  { id: "peopleInput", label: "人员维护", icon: UserCog },
  { id: "rulesInput", label: "规则维护", icon: Settings2 },
  { id: "schedule", label: "排期方案", icon: Table2 },
  { id: "tasks", label: "执行追踪", icon: ClipboardCheck },
  { id: "export", label: "导出中心", icon: Download },
  { id: "archive", label: "归档", icon: Archive }
];

const viewIds = new Set<View>(navItems.map((item) => item.id));

const rulePanelIds = new Set<RuleUrlPanel>(["draft", "impact", "evidence", "simulation"]);
const scheduleFilterIds = new Set<Exclude<ScheduleFilter, null>>(["manual", "issues"]);
const projectStatusIds = new Set<ProjectReadinessFilter>(["all", "ready", "excluded", "missing_fields"]);
const personStatusIds = new Set<PersonReadinessFilter>(["all", "ready", "needs_capability", "missing_fields", "inactive"]);

const viewHref = (view: View, params: RouteState = {}) => {
  const search = new URLSearchParams();
  if (view !== "readiness") search.set("view", view);
  if (params.rule) search.set("rule", params.rule);
  if (params.panel) search.set("panel", params.panel);
  if (params.filter) search.set("filter", params.filter);
  if (params.project) search.set("project", params.project);
  if (params.task) search.set("task", params.task);
  if (params.field) search.set("field", params.field);
  if (params.section) search.set("section", params.section);
  if (params.projectStatus) search.set("projectStatus", params.projectStatus);
  if (params.personStatus) search.set("personStatus", params.personStatus);
  if (params.person) search.set("person", params.person);
  if (params.run) search.set("run", params.run);
  if (params.assignee) search.set("assignee", params.assignee);
  if (params.personType) search.set("personType", params.personType);
  if (params.customerType) search.set("customerType", params.customerType);
  if (params.bizType) search.set("bizType", params.bizType);
  if (params.checkType) search.set("checkType", params.checkType);
  const query = search.toString();
  return query ? `/?${query}` : "/";
};

const viewFromLocation = () => {
  if (typeof window === "undefined") return "readiness";
  const url = new URL(window.location.href);
  const rawView = url.searchParams.get("view") ?? url.hash.replace(/^#/, "");
  return viewIds.has(rawView as View) ? rawView as View : "readiness";
};

const routeStateFromLocation = (): RouteState => {
  if (typeof window === "undefined") return {};
  const url = new URL(window.location.href);
  const rawPanel = url.searchParams.get("panel");
  const rawFilter = url.searchParams.get("filter");
  const rawProjectStatus = url.searchParams.get("projectStatus");
  const rawPersonStatus = url.searchParams.get("personStatus");
  return {
    rule: url.searchParams.get("rule") ?? undefined,
    panel: rulePanelIds.has(rawPanel as RuleUrlPanel) ? rawPanel as RuleUrlPanel : undefined,
    filter: scheduleFilterIds.has(rawFilter as Exclude<ScheduleFilter, null>) ? rawFilter as Exclude<ScheduleFilter, null> : null,
    project: url.searchParams.get("project") ?? undefined,
    task: url.searchParams.get("task") ?? undefined,
    field: url.searchParams.get("field") ?? undefined,
    section: url.searchParams.get("section") ?? undefined,
    projectStatus: projectStatusIds.has(rawProjectStatus as ProjectReadinessFilter) ? rawProjectStatus as ProjectReadinessFilter : undefined,
    personStatus: personStatusIds.has(rawPersonStatus as PersonReadinessFilter) ? rawPersonStatus as PersonReadinessFilter : undefined,
    person: url.searchParams.get("person") ?? undefined,
    run: url.searchParams.get("run") ?? undefined,
    assignee: url.searchParams.get("assignee") ?? undefined,
    personType: url.searchParams.get("personType") ?? undefined,
    customerType: url.searchParams.get("customerType") ?? undefined,
    bizType: url.searchParams.get("bizType") ?? undefined,
    checkType: url.searchParams.get("checkType") ?? undefined
  };
};

function ViewAction({
  view,
  params,
  onNavigate,
  className = "button",
  children
}: {
  view: View;
  params?: RouteState;
  onNavigate: (view: View, params?: RouteState) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className={className}
      href={viewHref(view, params)}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(view, params);
      }}
    >
      {children}
    </a>
  );
}

type MetricTone = "" | "good" | "bad" | "warn";

function scrollToSectionElement(element: HTMLElement | null | undefined) {
  if (!element || typeof window === "undefined") return;
  window.setTimeout(() => {
    element.scrollIntoView({ block: "start", behavior: "smooth" });
    element.classList.add("section-focus-highlight");
    window.setTimeout(() => element.classList.remove("section-focus-highlight"), 1400);
  }, 0);
}

function MetricAction({
  label,
  value,
  tone = "",
  active = false,
  title,
  href,
  onClick,
  className = ""
}: {
  label: string;
  value: number | string;
  tone?: MetricTone;
  active?: boolean;
  title?: string;
  href?: string;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  className?: string;
}) {
  const metricClassName = `metric metric-action ${tone} ${active ? "active" : ""} ${className}`.trim();
  const content = (
    <>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </>
  );
  if (href) {
    return (
      <a className={metricClassName} href={href} onClick={onClick as ((event: React.MouseEvent<HTMLAnchorElement>) => void) | undefined} title={title}>
        {content}
      </a>
    );
  }
  return (
    <button aria-pressed={active} className={metricClassName} onClick={onClick as ((event: React.MouseEvent<HTMLButtonElement>) => void) | undefined} title={title} type="button">
      {content}
    </button>
  );
}

const viewMetaBase: Record<Exclude<View, "schedule">, { title: string; subtitle: string }> = {
  readiness: { title: "首页 · 2026 现场检查准备", subtitle: "一眼确认项目、人员、规则是否可以开始排期" },
  projectInput: { title: "项目维护 · 年度项目池", subtitle: "样表导入、差异确认、字段校验、快照冻结" },
  peopleInput: { title: "人员维护 · 排期人员池", subtitle: "维护参与排期所需的人员、职责、能力、归属和产能字段" },
  rulesInput: { title: "规则维护 · 草稿与覆盖审计", subtitle: "规则继承、检查口径编辑、试算与待补全口径闸门" },
  tasks: { title: "执行追踪 · 检查任务台账", subtitle: "发布后的任务状态、完成日期和报告引用" },
  export: { title: "导出中心 · 计划表输出", subtitle: "年度计划、问题清单、审计说明、人员产能、月度负荷" },
  archive: { title: "归档 · 正式排期台账", subtitle: "管理已生成的正式排期、归档状态和编辑锁定" }
};

type WorkspaceSummary = {
  projects: Project[];
  people: Person[];
  currentRun: SchedulingRun;
  publishCandidateRun: SchedulingRun;
  asset7Run: SchedulingRun;
  officialRuns: SchedulingRun[];
  ruleset: unknown;
  planningYear: PlanningYearWorkspace;
  tagLibrary: TagDefinition[];
  businessRuleOrders: BusinessRuleOrder[];
  evidenceLibrary: RuleEvidence[];
  ruleRegistry: RuleRegistryItem[];
  ruleRegistryGroups: RuleRegistryGroup[];
  ruleSystemMap: RuleSystemMap;
  tagTaxonomy: TagTaxonomyNode[];
  ruleDrafts: RuleDecisionDraft[];
  latestRuleSimulation: RuleSimulationResult | null;
  latestRuleSuggestionBatch: RuleSuggestionBatch | null;
  tagCoverageSummary: TagCoverageSummary;
  issueBoard: IssueBoard;
};

type WorkspaceRequest = <T = unknown>(path: string, options?: RequestInit) => Promise<T>;

type GenerationState = {
  open: boolean;
  status: "idle" | "running" | "success" | "error";
  step: number;
  result: SchedulingRun | null;
  error: string | null;
};

const generationSteps = ["确认准备状态", "计算排期方案", "生成完成"];

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const fallbackRuleRegistry = (): RuleRegistryItem[] =>
  Array.from(
    new Map(fallbackBusinessRuleOrders.flatMap((order) => order.items).map((item) => [item.technicalRuleId, item])).values()
  )
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const evidence = evidenceForRule(item.technicalRuleId);
      const isDataGap = ["P5", "P6"].includes(item.technicalRuleId);
      const authorityType: RuleRegistryItem["authorityType"] = item.publishImpact === "can_publish" ? "policy_compiled" : "system_builtin";
      const status: RuleRegistryItem["status"] = item.publishImpact === "can_publish" ? "effective" : isDataGap ? "pending_data" : "pending_action";
      return {
        id: item.id,
        order: item.order,
        technicalRuleId: item.technicalRuleId,
        businessTitle: item.businessTitle,
        businessCondition: item.businessCondition,
        businessOutcome: item.businessOutcome,
        businessOrderGroup: item.businessOrderGroup,
        evidenceLabels: evidence.map((entry) => entry.policyCitation?.citationLabel ?? entry.sourceParagraph),
        authorityType,
        authorityLabel: authorityType === "policy_compiled" ? "制度已编制" : "系统内置",
        authorityDetail: evidence.map((entry) => entry.policyCitation?.citationLabel ?? entry.sourceParagraph).join("；"),
        status,
        statusLabel: status === "effective" ? "已生效" : status === "pending_data" ? "待补数据" : "待补口径",
        affectedProjectCount: 0,
        publishImpact: item.publishImpact,
        impactType: item.impactType,
        onsite: null,
        offsite: null,
        confirmerName: null,
        confirmerNote: null,
        confirmedAt: null,
        rulesetVersion: "1.0.0",
        tagRefs: item.tagRefs
      };
    });

const ruleRegistryStatusSummary = (items: RuleRegistryItem[]): RuleRegistryGroup["statusSummary"] => ({
  total: items.length,
  effective: items.filter((item) => item.status === "effective").length,
  pendingAction: items.filter((item) => item.status === "pending_action").length,
  pendingData: items.filter((item) => item.status === "pending_data").length,
  draft: items.filter((item) => item.status === "draft").length,
  simulated: items.filter((item) => item.status === "simulated").length,
  manualConfirmed: items.filter((item) => item.status === "manual_confirmed").length
});

const ruleRegistryGroupPrimaryStatus = (items: RuleRegistryItem[]): RuleRegistryGroup["primaryStatus"] => {
  const summary = ruleRegistryStatusSummary(items);
  if (summary.pendingData > 0) return "needs_data";
  if (summary.draft > 0 || summary.simulated > 0) return "in_progress";
  if (summary.pendingAction > 0) return "needs_action";
  return "ready";
};

const createFallbackRuleRegistryGroups = (registry = fallbackRuleRegistry()): RuleRegistryGroup[] => {
  const registryByRule = new Map(registry.map((item) => [item.technicalRuleId, item]));
  const assignedRuleIds = new Set<string>();
  return fallbackBusinessRuleOrders.map((group) => {
    const groupRegistryItems = group.items
      .map((item) => registryByRule.get(item.technicalRuleId))
      .filter((item): item is RuleRegistryItem => Boolean(item));
    const isUnquantifiedSummary = group.id === "G7";
    const displayItems = isUnquantifiedSummary
      ? []
      : groupRegistryItems.filter((item) => {
          if (assignedRuleIds.has(item.technicalRuleId)) return false;
          assignedRuleIds.add(item.technicalRuleId);
          return true;
        });
    const summaryItems = isUnquantifiedSummary ? groupRegistryItems : displayItems;
    return {
      id: group.id,
      order: group.order,
      title: group.title,
      description: group.description,
      items: displayItems.sort((a, b) => a.order - b.order),
      statusSummary: ruleRegistryStatusSummary(summaryItems),
      affectedProjectCount: summaryItems.reduce((total, item) => total + item.affectedProjectCount, 0),
      primaryStatus: ruleRegistryGroupPrimaryStatus(summaryItems)
    };
  });
};

const fallbackSummary: WorkspaceSummary = {
  projects: fallbackWorkspace.projects,
  people: fallbackWorkspace.people,
  currentRun: fallbackWorkspace.currentRun,
  publishCandidateRun: fallbackWorkspace.currentRun,
  asset7Run: fallbackWorkspace.asset7Run,
  officialRuns: [fallbackWorkspace.currentRun],
  ruleset: {},
  planningYear: fallbackWorkspace.planningYear,
  tagLibrary: fallbackWorkspace.tagLibrary,
  businessRuleOrders: fallbackBusinessRuleOrders,
  evidenceLibrary: fallbackEvidenceLibrary,
  ruleRegistry: fallbackRuleRegistry(),
  ruleRegistryGroups: createFallbackRuleRegistryGroups(),
  ruleSystemMap: createRuleSystemMap({
    projects: fallbackWorkspace.projects,
    people: fallbackWorkspace.people,
    run: fallbackWorkspace.currentRun,
    tagLibrary: fallbackWorkspace.tagLibrary
  }),
  tagTaxonomy: createTagTaxonomy({
    projects: fallbackWorkspace.projects,
    people: fallbackWorkspace.people,
    run: fallbackWorkspace.currentRun,
    tagLibrary: fallbackWorkspace.tagLibrary
  }),
  ruleDrafts: [],
  latestRuleSimulation: null,
  latestRuleSuggestionBatch: null,
  tagCoverageSummary: createTagCoverageSummary({
    projects: fallbackWorkspace.projects,
    people: fallbackWorkspace.people,
    run: fallbackWorkspace.currentRun,
    tagLibrary: fallbackWorkspace.tagLibrary
  }),
  issueBoard: createIssueBoard({
    run: fallbackWorkspace.currentRun,
    projects: fallbackWorkspace.projects,
    ruleDrafts: []
  })
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/backend";

const workspaceUrl = (path: string) => `${apiBase}${path}`;

const getViewMeta = (view: View, run: SchedulingRun) =>
  view === "schedule"
    ? {
        title: run.status === "archived" ? "排期方案 · 归档方案" : run.runType === "official" ? "排期方案 · 正式草案" : "排期方案 · 当前草案",
        subtitle: `${run.planPeriod.year} 年度检查安排｜${runStatusLabel[run.status] ?? "草案待确认"}`
      }
    : viewMetaBase[view];

const statusIcon = {
  pass: Check,
  warn: AlertTriangle,
  block: X,
  excluded: Lock
} as const;

const gateTone = {
  ready: "pass",
  needs_attention: "warn",
  blocked: "block",
  not_started: "warn"
} as const;

const useWorkspaceSummary = () => {
  const [data, setData] = useState<WorkspaceSummary>(fallbackSummary);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("正在连接后台业务数据");

  const refresh = async () => {
    try {
      const response = await fetch(workspaceUrl("/workspace"), { cache: "no-store" });
      if (!response.ok) throw new Error(`workspace ${response.status}`);
      const next = (await response.json()) as WorkspaceSummary;
      setData({
        ...next,
        publishCandidateRun: next.publishCandidateRun ?? next.currentRun,
        asset7Run: next.asset7Run ?? next.currentRun,
        officialRuns: next.officialRuns ?? [next.currentRun],
        tagLibrary: next.tagLibrary ?? fallbackSummary.tagLibrary,
        businessRuleOrders: next.businessRuleOrders ?? fallbackBusinessRuleOrders,
        evidenceLibrary: next.evidenceLibrary ?? fallbackEvidenceLibrary,
        ruleRegistry: next.ruleRegistry ?? fallbackRuleRegistry(),
        ruleRegistryGroups: next.ruleRegistryGroups ?? createFallbackRuleRegistryGroups(next.ruleRegistry ?? fallbackRuleRegistry()),
        ruleSystemMap: next.ruleSystemMap ?? fallbackSummary.ruleSystemMap,
        tagTaxonomy: next.tagTaxonomy ?? fallbackSummary.tagTaxonomy,
        ruleDrafts: next.ruleDrafts ?? [],
        latestRuleSimulation: next.latestRuleSimulation ?? null,
        latestRuleSuggestionBatch: next.latestRuleSuggestionBatch ?? null,
        tagCoverageSummary: next.tagCoverageSummary ?? fallbackSummary.tagCoverageSummary,
        issueBoard: next.issueBoard ?? createIssueBoard({
          run: next.publishCandidateRun ?? next.currentRun,
          projects: next.projects ?? fallbackSummary.projects,
          ruleDrafts: next.ruleDrafts ?? []
        })
      });
      setMessage("已连接最新业务数据");
    } catch {
      setData(fallbackSummary);
      setMessage("后台数据暂不可用，当前显示内置测试数据");
    } finally {
      setLoading(false);
    }
  };

  const request = async <T = unknown,>(path: string, options: RequestInit = {}) => {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const response = await fetch(workspaceUrl(path), {
      ...options,
      headers: isFormData
        ? options.headers
        : {
            "Content-Type": "application/json",
            ...(options.headers ?? {})
          }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `请求失败 ${response.status}`);
    }
    const text = await response.text();
    const payload = text ? JSON.parse(text) as T : undefined as T;
    await refresh();
    return payload;
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { data, loading, message, refresh, request };
};

const projectTagOptions = (tagLibrary: TagDefinition[]) => tagsForScope("project", tagLibrary);
const personTagOptions = (tagLibrary: TagDefinition[]) => tagsForScope("person", tagLibrary);
const ruleTagOptions = (tagLibrary: TagDefinition[]) => tagsForScope("rule", tagLibrary);

const entityTagNames = (tagIds: string[] = [], tagLibrary: TagDefinition[]) => {
  const tagById = new Map(tagLibrary.map((tag) => [tag.id, tag]));
  return tagIds
    .map((id) => tagById.get(id))
    .filter((tag): tag is TagDefinition => Boolean(tag))
    .sort((a, b) => {
      const relationA = a.category === "ownership" ? 0 : 1;
      const relationB = b.category === "ownership" ? 0 : 1;
      return relationA - relationB || a.name.localeCompare(b.name, "zh-CN");
    })
    .map((tag) => tag.name);
};

const projectTagNames = (project: Project, tagLibrary: TagDefinition[]) => entityTagNames(project.tagIds ?? [], tagLibrary);
const personTagNames = (person: Person, tagLibrary: TagDefinition[]) => entityTagNames(person.tagIds ?? [], tagLibrary);

const tagNamesByCategory = (
  tagIds: string[] = [],
  tagLibrary: TagDefinition[],
  hiddenCategories: Array<TagDefinition["category"]> = []
) => {
  const tagById = new Map(tagLibrary.map((tag) => [tag.id, tag]));
  const hiddenCategorySet = new Set(hiddenCategories);
  return tagIds
    .map((id) => tagById.get(id))
    .filter((tag): tag is TagDefinition => Boolean(tag))
    .filter((tag) => !hiddenCategorySet.has(tag.category))
    .reduce<Record<string, string[]>>((groups, tag) => {
      const label =
        tag.category === "ownership" ? "关系标签" :
        tag.category === "derived" ? "派生标签" :
        tag.category === "schedule_output" ? "输出标签" :
        ["customer_type", "risk", "industry", "business_type", "party", "special_condition"].includes(tag.category) ? "基础属性" :
        ["person_pool", "person_specialty"].includes(tag.category) ? "人员能力/池" :
        "其他标签";
      groups[label] = [...(groups[label] ?? []), tag.name];
      return groups;
    }, {});
};

const relationTypeLabel: Record<TagCoverageSummary["relationPairs"][number]["type"], string> = {
  group: "集团归属",
  project: "项目长期归属",
  maintainer: "维护人身份"
};

const relationStatusLabel: Record<TagCoverageSummary["relationPairs"][number]["status"], string> = {
  matched: "已闭合",
  project_only: "缺人员侧",
  person_only: "缺项目侧",
  missing: "缺失"
};

const taskStatusLabel: Record<Task["status"], string> = {
  pending: "已排期",
  completed: "已完成",
  delayed: "已延期",
  exempted: "人工确认不安排",
  unplaceable: "需人工改期",
  manual_needed: "待人工确认"
};

const runStatusLabel: Record<SchedulingRun["status"], string> = {
  draft: "草案待确认",
  published: "已正式发布",
  archived: "历史方案",
  abandoned: "已作废"
};

const formatBusinessDateTime = (value: string) => value.slice(0, 16).replace("T", " ");

const officialRunName = (run: SchedulingRun, index: number) =>
  `${run.planPeriod.year} 年正式排期 ${String(index + 1).padStart(2, "0")}`;

const runEditState = (run: SchedulingRun) => {
  const latestEndDate = latestRunEndDate(run);
  const locked = isRunLocked(run);
  return {
    latestEndDate,
    locked,
    editable: !locked,
    reason: locked ? `已超过最晚计划结束日${latestEndDate ? ` ${latestEndDate}` : ""}，排期已锁定` : "未超过最晚计划结束日，仍可编辑"
  };
};

const ruleSetBusinessLabel = (version?: string | null) =>
  version?.includes("+business-v") ? "已补充业务口径" : "基础业务口径";

const trialStateLabel = (runId?: string | null) => runId ? "已完成试算" : "待试算";

const businessFieldLabel = (field?: string | null) => {
  const labels: Record<string, string> = {
    customerType: "客户类型",
    riskGrade: "风险分类",
    industry: "行业",
    bizType: "业务类型",
    exposureBalance: "剩余风险敞口",
    exposureInit: "初始风险敞口",
    groupId: "归属集团编号",
    groupName: "归属集团名称",
    partyType: "检查对象",
    onsiteMaintainerId: "现场维护人",
    offsiteMaintainerId: "非现场维护人",
    memberCount: "集团旗下存量客户数",
    relatedPartyStockCount: "旗下存量客户数",
    tagIds: "标签"
  };
  return field ? labels[field] ?? field : "整行";
};

const projectChangeStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    in_pool: "已纳入项目池",
    pending_review: "待确认",
    confirmed: "已确认",
    ignored: "不纳入"
  };
  return labels[status] ?? status;
};

const projectChangeTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    added: "新增",
    changed: "变更",
    removed: "移出",
    unchanged: "无变化"
  };
  return labels[type] ?? "其他变化";
};

const poolListLabel = (pool: AssigneePoolMode[]) => pool.map((mode) => poolLabels[mode]).join(" / ");

const businessRuleLabel = (ruleId?: string | null) => {
  if (!ruleId || ruleId === "RULE_GAP") return "检查口径待补全";
  if (ruleId === "override") return "人工调整";
  return businessRuleByTechnicalId(ruleId)?.businessTitle ?? "业务规则";
};

const scheduleDiffKindLabel = (kind: string) => {
  const labels: Record<string, string> = {
    status: "项目状态变化",
    frequency: "检查频次变化",
    assignee: "负责人变化",
    time: "检查时间变化",
    new_in_scope: "新增纳入检查",
    removed: "不再纳入检查"
  };
  return labels[kind] ?? "安排变化";
};

const impactTypeLabel: Record<NonNullable<BusinessRuleItem["impactType"]>, string> = {
  exclude: "影响免检/入池",
  frequency: "影响检查频次",
  method_manual: "影响检查形式/人工",
  assignee_policy: "影响分配人",
  time_constraint: "影响时间约束",
  publish_block: "影响正式方案"
};

const assignmentPriorityLabel: Record<string, string> = {
  ownership_project: "长期负责项目",
  ownership_group: "长期负责集团",
  capability: "专项能力",
  maintainer: "历史维护人",
  load_balance: "负荷均衡"
};

function StatusDot({ result }: { result: DecisionResult }) {
  const Icon = statusIcon[result];
  return (
    <span className={`status-dot ${result}`} title={statusLabel[result]}>
      <Icon size={15} />
    </span>
  );
}

function GateBadge({ gate }: { gate: ReadinessGate }) {
  return (
    <span className={`gate-badge ${gate.status}`}>
      {gate.passed ? <Check size={14} /> : <AlertTriangle size={14} />}
      {gate.status === "ready" ? "已就绪" : gate.status === "blocked" ? "待处理" : gate.status === "not_started" ? "未开始" : "待处理"}
    </span>
  );
}

function IssueList({ issues, emptyText = "暂无需要处理的问题" }: { issues: PlanningYearWorkspace["ruleReport"]["issues"]; emptyText?: string }) {
  if (!issues.length) {
    return <div className="empty compact">{emptyText}</div>;
  }
  return (
    <div className="issue-list">
      {issues.map((issue) => (
        <div className={`issue-item ${issue.severity}`} key={issue.id}>
          <div className="issue-head">
            <span>{issue.title}</span>
            <span>{issue.severity === "block" ? "待处理" : issue.severity === "warn" ? "提示" : "信息"}</span>
          </div>
          <p>{issue.message}</p>
          <p>{issue.suggestedAction}</p>
        </div>
      ))}
    </div>
  );
}

function AuditStrip({ run, onNavigate }: { run: SchedulingRun; onNavigate: (view: View, params?: RouteState) => void }) {
  const metrics: Array<{ label: string; value: number; tone: MetricTone; target: { view: View; params?: RouteState } }> = [
    { label: "输入项目", value: run.audit.inputProjects, tone: "", target: { view: "projectInput", params: { projectStatus: "all", section: "projectTable" } } },
    { label: "入池", value: run.audit.inScope, tone: "good", target: { view: "projectInput", params: { projectStatus: "ready", section: "projectTable" } } },
    { label: "排除", value: run.audit.excluded, tone: "", target: { view: "projectInput", params: { projectStatus: "excluded", section: "projectTable" } } },
    { label: "现场任务", value: run.audit.onsiteTasks, tone: "", target: { view: "tasks" } },
    { label: "非现场", value: run.audit.offsiteTasks, tone: "", target: { view: "tasks" } },
    { label: "待补全", value: run.audit.ruleGap, tone: run.audit.ruleGap ? "bad" : "good", target: { view: "rulesInput", params: { section: "ruleIssues" } } },
    { label: "硬冲突", value: run.audit.hardConflicts, tone: run.audit.hardConflicts ? "bad" : "good", target: { view: "schedule", params: { filter: "issues", section: "scheduleMatrix" } } },
    { label: "待人工", value: run.audit.pendingManual, tone: run.audit.pendingManual ? "warn" : "good", target: { view: "schedule", params: { filter: "manual", section: "manualQueue" } } }
  ];
  return (
    <div className="audit-grid">
      {metrics.map((metric) => (
        <MetricAction
          href={viewHref(metric.target.view, metric.target.params)}
          key={metric.label}
          label={metric.label}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(metric.target.view, metric.target.params);
          }}
          tone={metric.tone}
          value={metric.value}
        />
      ))}
    </div>
  );
}

const poolLabels: Record<AssigneePoolMode, string> = {
  asset5: "核心检查人员池",
  asset7: "资产管理部主责池",
  sampleMaintainers: "样表回归池",
  all26: "全员容量评估池",
  businessSupport: "业务部门协同池"
};

const poolDescriptions: Record<AssigneePoolMode, string> = {
  asset7: "正式排期默认场景，承接资产管理部主责范围内检查。",
  asset5: "保守容量场景，用于高负荷周或核心人员排期试算。",
  sampleMaintainers: "冷启动和样表回归场景，不作为正式业务口径。",
  all26: "容量评估和 What-If 场景，用于观察全员承接能力。",
  businessSupport: "业务部门主责或配合检查场景，用于制度第二章职责协同。"
};

const poolOrder: AssigneePoolMode[] = ["asset7", "asset5", "businessSupport", "sampleMaintainers", "all26"];

const projectResponsibilityOptions: Array<{ value: NonNullable<Project["primaryResponsibleDept"]>; label: string; hint: string }> = [
  { value: "asset_management", label: "资产管理部主责", hint: "负责主责范围内和非正常类客户检查计划执行" },
  { value: "business_department", label: "业务部门主责", hint: "业务部门负责其主责范围内客户检查计划执行" },
  { value: "joint", label: "资产主责/业务配合", hint: "资产管理部主责，业务部门配合执行和整改" }
];

const personResponsibilityLabels: Record<string, string> = {
  asset_management_owner: "资产管理部主责",
  business_owner: "业务部门主责",
  business_support: "业务部门配合",
  report_owner: "检查报告填写",
  rectification_owner: "整改跟进"
};

const personSpecialtyOptions = ["直租专员", "问题项目专员", "能源环保检查能力", "医院项目检查能力", "集团客户检查能力", "非现场信息核查", "租赁物现场检查"];
const fallbackSchedulePersonTypeLabels = new Set(personSpecialtyOptions);
const offsiteChannelOptions = ["征信系统", "中登网", "法院/被执行人查询", "财务报表", "电话访谈", "网络/媒体", "舆情监控"];
const manualAssigneeFilterValue = "__manual__";

const emptyScheduleFilterState: ScheduleFilterState = {
  assignees: [],
  personTypes: [],
  customerTypes: [],
  bizTypes: [],
  checkTypes: []
};

const parseRouteList = (value?: string) =>
  value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];

const scheduleFilterStateFromRoute = (routeState: RouteState): ScheduleFilterState => {
  const customerTypeIds = new Set(Object.keys(labelMaps.customerType));
  const bizTypeIds = new Set(Object.keys(labelMaps.bizType));
  const checkTypeIds = new Set(Object.keys(labelMaps.checkType));
  return {
    assignees: parseRouteList(routeState.assignee),
    personTypes: parseRouteList(routeState.personType),
    customerTypes: parseRouteList(routeState.customerType).filter((item): item is Project["customerType"] => customerTypeIds.has(item)),
    bizTypes: parseRouteList(routeState.bizType).filter((item): item is Project["bizType"] => bizTypeIds.has(item)),
    checkTypes: parseRouteList(routeState.checkType).filter((item): item is Task["checkType"] => checkTypeIds.has(item))
  };
};

const scheduleFilterRouteParams = (filters: ScheduleFilterState): Pick<RouteState, "assignee" | "personType" | "customerType" | "bizType" | "checkType"> => ({
  assignee: filters.assignees.length ? filters.assignees.join(",") : undefined,
  personType: filters.personTypes.length ? filters.personTypes.join(",") : undefined,
  customerType: filters.customerTypes.length ? filters.customerTypes.join(",") : undefined,
  bizType: filters.bizTypes.length ? filters.bizTypes.join(",") : undefined,
  checkType: filters.checkTypes.length ? filters.checkTypes.join(",") : undefined
});

const scheduleFilterHasValue = (filters: ScheduleFilterState) =>
  filters.assignees.length > 0 || filters.personTypes.length > 0 || filters.customerTypes.length > 0 || filters.bizTypes.length > 0 || filters.checkTypes.length > 0;

const sameScheduleFilterState = (a: ScheduleFilterState, b: ScheduleFilterState) =>
  a.assignees.join(",") === b.assignees.join(",") &&
  a.personTypes.join(",") === b.personTypes.join(",") &&
  a.customerTypes.join(",") === b.customerTypes.join(",") &&
  a.bizTypes.join(",") === b.bizTypes.join(",") &&
  a.checkTypes.join(",") === b.checkTypes.join(",");

const schedulePersonTypeLabelsFromTagLibrary = (tagLibrary: TagDefinition[]) => {
  const labels = tagLibrary
    .filter((tag) =>
      tag.active &&
      tag.category === "person_specialty" &&
      tag.scopes.includes("person") &&
      tag.scopes.includes("rule") &&
      tag.fieldBinding?.entity === "person" &&
      tag.fieldBinding.field === "specialTags"
    )
    .map((tag) => tag.name);
  return new Set(labels.length ? labels : [...fallbackSchedulePersonTypeLabels]);
};

const isCustomerTypeValue = (value: unknown): value is Project["customerType"] =>
  typeof value === "string" && value in labelMaps.customerType;

const isBizTypeValue = (value: unknown): value is Project["bizType"] =>
  typeof value === "string" && value in labelMaps.bizType;

const businessRuleItemsForTag = (tagId: string) =>
  [...new Map(fallbackBusinessRuleOrders
    .flatMap((order) => order.items)
    .filter((item) => item.tagRefs.includes(tagId))
    .sort((a, b) => a.order - b.order)
    .map((item) => [item.technicalRuleId, item])).values()];

const evidenceLabel = (evidence: RuleEvidence) => {
  const citation = evidence.policyCitation;
  return [citation.articleNo, citation.articleTitle, citation.clauseLabel].filter(Boolean).join(" · ");
};

const scheduleProjectTypeFallbackBasis: Record<string, string> = {
  "biz.leaseback": "基础业务类型，参与通用频次分档。",
  "biz.direct_lease": "直租业务优先匹配直租专员，影响人员分配。"
};

const scheduleProjectTypeFallbackEvidence = fallbackEvidenceLibrary.find((item) => item.id === "EV-FACTORING-SCOPE");

const scheduleProjectTypeFacetFromTag = (
  tag: TagDefinition,
  value: Project["customerType"] | Project["bizType"],
  kind: ScheduleProjectTypeFacet["kind"]
): ScheduleProjectTypeFacet => {
  const ruleItems = businessRuleItemsForTag(tag.id);
  const ruleLabels = ruleItems.length
    ? ruleItems.map((item) => `${item.technicalRuleId} ${item.businessTitle}`)
    : [scheduleProjectTypeFallbackBasis[tag.code] ?? tag.description];
  const evidenceLabels = [...new Set(ruleItems.flatMap((item) => evidenceForRule(item.technicalRuleId).map(evidenceLabel)))];
  if (!evidenceLabels.length && scheduleProjectTypeFallbackEvidence) {
    evidenceLabels.push(evidenceLabel(scheduleProjectTypeFallbackEvidence));
  }
  const sourceField = tag.fieldBinding?.field ? businessFieldLabel(tag.fieldBinding.field) : "项目标签";
  const tooltip = [
    `来源字段：${sourceField}`,
    `系统标签：${tag.name}（${tag.code}）`,
    `业务含义：${tag.description}`,
    `影响规则：${ruleLabels.join("；")}`,
    `制度依据：${evidenceLabels.join("；") || "业务标签库基础口径"}`
  ].join("\n");
  const badge =
    ruleItems.length ? [...new Set(ruleItems.map((item) => item.technicalRuleId))].slice(0, 3).join("/") :
    tag.code === "biz.direct_lease" ? "人员匹配" :
    "基础口径";
  return { kind, value, label: tag.name, badge, tooltip } as ScheduleProjectTypeFacet;
};

const scheduleProjectTypeFacetsFromTagLibrary = (tagLibrary: TagDefinition[], projects: Project[]) => {
  const customerValues = new Set(projects.map((project) => project.customerType));
  const bizValues = new Set(projects.map((project) => project.bizType));
  const customerFacets = tagLibrary
    .filter((tag) =>
      tag.active &&
      tag.category === "customer_type" &&
      tag.scopes.includes("project") &&
      tag.scopes.includes("rule") &&
      tag.fieldBinding?.entity === "project" &&
      tag.fieldBinding.field === "customerType" &&
      isCustomerTypeValue(tag.fieldBinding.value) &&
      customerValues.has(tag.fieldBinding.value)
    )
    .map((tag) => scheduleProjectTypeFacetFromTag(tag, tag.fieldBinding!.value as Project["customerType"], "customerType"));
  const bizFacets = tagLibrary
    .filter((tag) =>
      tag.active &&
      tag.category === "business_type" &&
      tag.scopes.includes("project") &&
      tag.scopes.includes("rule") &&
      tag.fieldBinding?.entity === "project" &&
      tag.fieldBinding.field === "bizType" &&
      isBizTypeValue(tag.fieldBinding.value) &&
      bizValues.has(tag.fieldBinding.value)
    )
    .map((tag) => scheduleProjectTypeFacetFromTag(tag, tag.fieldBinding!.value as Project["bizType"], "bizType"));
  return [...customerFacets, ...bizFacets];
};

const normalizeScheduleFiltersForPersonTypes = (filters: ScheduleFilterState, allowedPersonTypes: Set<string>): ScheduleFilterState => ({
  ...filters,
  personTypes: filters.personTypes.filter((type) => allowedPersonTypes.has(type))
});

const personTypesForPerson = (person?: Person | null, allowedPersonTypes: Set<string> = fallbackSchedulePersonTypeLabels) =>
  person ? [...new Set(person.specialTags.filter((tag) => allowedPersonTypes.has(tag)))] : [];

const personForTask = (task: Task, personById: Map<string, Person>, personByName: Map<string, Person>) =>
  (task.assigneeId ? personById.get(task.assigneeId) : undefined) ?? (task.assigneeName ? personByName.get(task.assigneeName) : undefined) ?? null;

const assigneeDisplayNameForTask = (task: Task, personById: Map<string, Person>, personByName: Map<string, Person>) =>
  personForTask(task, personById, personByName)?.name ?? task.assigneeName ?? "待人工";

const taskMatchesScheduleFilters = (
  task: Task,
  personById: Map<string, Person>,
  personByName: Map<string, Person>,
  filters: ScheduleFilterState,
  allowedPersonTypes: Set<string> = fallbackSchedulePersonTypeLabels
) => {
  if (filters.checkTypes.length && !filters.checkTypes.includes(task.checkType)) return false;
  if (filters.assignees.length) {
    const isManual = !task.assigneeName || isManualTask(task);
    const displayName = assigneeDisplayNameForTask(task, personById, personByName);
    const assigneeMatched =
      (filters.assignees.includes(manualAssigneeFilterValue) && isManual) ||
      (displayName !== "待人工" ? filters.assignees.includes(displayName) : false);
    if (!assigneeMatched) return false;
  }
  if (filters.personTypes.length) {
    const personTypes = personTypesForPerson(personForTask(task, personById, personByName), allowedPersonTypes);
    if (!filters.personTypes.some((type) => personTypes.includes(type))) return false;
  }
  return true;
};

const projectMatchesScheduleFilters = (
  project: Project,
  tasks: Task[],
  personById: Map<string, Person>,
  personByName: Map<string, Person>,
  filters: ScheduleFilterState,
  allowedPersonTypes: Set<string> = fallbackSchedulePersonTypeLabels
) => {
  if (filters.customerTypes.length && !filters.customerTypes.includes(project.customerType)) return false;
  if (filters.bizTypes.length && !filters.bizTypes.includes(project.bizType)) return false;
  const needsTaskMatch = filters.assignees.length > 0 || filters.personTypes.length > 0 || filters.checkTypes.length > 0;
  return needsTaskMatch ? tasks.some((task) => taskMatchesScheduleFilters(task, personById, personByName, filters, allowedPersonTypes)) : true;
};

const taskWithProjectMatchesScheduleFilters = (
  project: Project,
  task: Task,
  personById: Map<string, Person>,
  personByName: Map<string, Person>,
  filters: ScheduleFilterState,
  allowedPersonTypes: Set<string> = fallbackSchedulePersonTypeLabels
) => {
  if (filters.customerTypes.length && !filters.customerTypes.includes(project.customerType)) return false;
  if (filters.bizTypes.length && !filters.bizTypes.includes(project.bizType)) return false;
  return taskMatchesScheduleFilters(task, personById, personByName, filters, allowedPersonTypes);
};

const projectIsExempted = (project: Project) =>
  project.exposureBalance <= 0 || project.isSettledThisYear || (project.isNewWithin1y && !project.companySpecialRequirement);

const projectNeedsRuleDecision = (project: Project) =>
  project.bizType === "factoring" ||
  ((project.customerType === "external" || project.customerType === "collab_b") && project.exposureBalance <= 30_000_000) ||
  (project.hospitalType === "public_hospital" && project.exposureInit <= 60_000_000);

const stockCountAffectsFrequency = (project: Project) =>
  (project.partyType === "group" || project.partyType === "guarantor") &&
  !projectIsExempted(project) &&
  !project.isWarning &&
  !project.isNpl &&
  project.customerType !== "internal" &&
  project.customerType !== "collab_a" &&
  project.industry !== "energy" &&
  !project.hospitalType &&
  project.bizType !== "factoring";

const projectFrequencyBasis = (project: Project) => {
  if (projectIsExempted(project)) return "免检/不入池";
  if (project.isNpl) return "不良类：年度不少于2次现场";
  if (project.isWarning) return "预警客户：按处理方案安排";
  if (project.customerType === "internal") return "内部客户：原则上不强制";
  if (project.customerType === "collab_a") return "协同A：现场不要求";
  if (project.industry === "energy") return "能源环保专项";
  if (project.hospitalType) return "医院专项";
  if (project.partyType === "group" || project.partyType === "guarantor") return "集团/担保人存量口径";
  if (project.customerType === "external" || project.customerType === "collab_b") return "外部/协同B敞口分档";
  return "普通全面检查";
};

type ProjectFieldSection = "basic" | "scope" | "frequency" | "owner" | "schedule";
const coreProjectFieldSections: ProjectFieldSection[] = ["basic", "scope", "frequency", "owner"];
type ProjectFieldRequirement = {
  key: string;
  label: string;
  fieldNames: string[];
  reason: string;
  section: ProjectFieldSection;
  severity: "block" | "warn";
  actionLabel: string;
};

const requirement = (
  key: string,
  label: string,
  section: ProjectFieldSection,
  fieldNames: string[],
  reason: string,
  actionLabel = `补充${label}`,
  severity: ProjectFieldRequirement["severity"] = "block"
): ProjectFieldRequirement => ({ key, label, section, fieldNames, reason, actionLabel, severity });

const getProjectFieldRequirements = (project: Project): ProjectFieldRequirement[] => [
  !project.name ? requirement("name", "项目名称", "basic", ["name"], "项目名称用于识别检查对象、导入差异和后续排期任务。") : null,
  !project.dept ? requirement("dept", "业务部门", "basic", ["dept"], "业务部门用于定位项目来源和协同责任。") : null,
  !project.creditStart ? requirement("creditStart", "授信开始日", "scope", ["creditStart"], "授信开始日用于判断当年新增和项目期限。") : null,
  !project.creditEnd ? requirement("creditEnd", "授信结束日", "scope", ["creditEnd"], "授信结束日用于判断项目期限和是否满足免检条件。") : null,
  !project.primaryResponsibleDept ? requirement("primaryResponsibleDept", "主责部门", "owner", ["primaryResponsibleDept"], "主责部门用于确定检查责任主体。") : null,
  project.industry === "healthcare" && !project.hospitalType ? requirement("hospitalType", "医院类型", "frequency", ["hospitalType"], "医疗健康项目需要区分公立医院和民营医院，才能判断专项频次。") : null,
  project.hospitalType === "public_hospital" && project.exposureInit > 60_000_000 && !project.termHalf ? requirement("termHalf", "项目中期日期", "frequency", ["termHalf"], "公立医院大额项目按项目中期安排现场检查，需要维护中期日期。") : null,
  project.partyType === "group" && stockCountAffectsFrequency(project) && (project.memberCount === null || project.memberCount === undefined)
    ? requirement("memberCount", "集团旗下存量客户数", "frequency", ["memberCount"], "集团检查对象需要填写 member_count（旗下我司存量客户数），用于判断 R8/R9 现场检查频次。")
    : null,
  project.partyType === "guarantor" && stockCountAffectsFrequency(project) && (project.relatedPartyStockCount === null || project.relatedPartyStockCount === undefined)
    ? requirement("relatedPartyStockCount", "担保人/母公司旗下存量客户数", "frequency", ["relatedPartyStockCount"], "担保人、实控人或母公司需要填写旗下存量客户数，用于判断 R13/R14 现场检查频次。")
    : null,
  project.industry === "energy" && project.exposureBalance <= 300_000_000 && (project.gridConnected === null || project.accountMonitored === null || project.repayClean3y === null)
    ? requirement("energyExemption", "能源豁免条件", "frequency", ["gridConnected", "accountMonitored", "repayClean3y"], "能源环保项目需确认并网、账户监管和还款情况，才能判断是否免现场检查。")
    : null,
  project.isWarning && !project.warningPlan ? requirement("warningPlan", "预警处理方案", "frequency", ["warningPlan"], "预警客户按处理方案及时安排检查，需要先补充处理方案。") : null,
  project.companySpecialRequirement && !project.approvalRequirement ? requirement("approvalRequirement", "特殊要求依据", "frequency", ["approvalRequirement"], "公司或批复存在特殊要求时，需要记录依据，后续排期才可追溯。") : null
].filter((item): item is ProjectFieldRequirement => Boolean(item));

const projectPendingItems = (project: Project) => [
  ...getProjectFieldRequirements(project).map((item) => item.label)
].filter((item): item is string => Boolean(item));

type ProjectSchedulingStatus = "ready" | "missing_fields" | "excluded";
type ProjectReadinessFilter = "all" | ProjectSchedulingStatus;
type ProjectSchedulingReadiness = {
  status: ProjectSchedulingStatus;
  statusLabel: string;
  inSchedule: boolean;
  fieldRequirements: ProjectFieldRequirement[];
  missingFields: string[];
  needsRuleDecision: boolean;
  completenessLabel: string;
  frequencyBasis: string;
  canFreeze: boolean;
};

type EnergyFieldKey = "gridConnected" | "accountMonitored" | "repayClean3y";
type EnergyMissingFilter = "any" | EnergyFieldKey;
type EnergyBulkValue = "keep" | "true" | "false";

const energyFieldKeys: EnergyFieldKey[] = ["gridConnected", "accountMonitored", "repayClean3y"];
const energyFieldLabels: Record<EnergyFieldKey, string> = {
  gridConnected: "并网情况",
  accountMonitored: "账户监管",
  repayClean3y: "近三年还款正常"
};
const energyFilterLabels: Record<EnergyMissingFilter, string> = {
  any: "三项任一缺失",
  gridConnected: "缺并网情况",
  accountMonitored: "缺账户监管",
  repayClean3y: "缺近三年还款正常"
};

const energyBooleanLabel = (value: boolean | null | undefined) => (value === null || value === undefined ? "待确认" : value ? "是" : "否");
const isEnergyR5ScopeProject = (project: Project) => project.industry === "energy" && project.exposureBalance <= 300_000_000;
const energyFieldMissing = (project: Project, field: EnergyFieldKey) => project[field] === null;
const needsEnergyExemptionReview = (project: Project) => isEnergyR5ScopeProject(project) && energyFieldKeys.some((field) => energyFieldMissing(project, field));
const satisfiesEnergyExemption = (project: Project) =>
  isEnergyR5ScopeProject(project) &&
  project.gridConnected === true &&
  project.repayClean3y === true &&
  (project.accountMonitored === true || project.realtimeMonitored === true);

const applyEnergyPreviewUpdates = (project: Project, values: Record<EnergyFieldKey, EnergyBulkValue>) => {
  const patch = Object.fromEntries(
    energyFieldKeys
      .filter((field) => values[field] !== "keep")
      .map((field) => [field, values[field] === "true"])
  ) as Partial<Pick<Project, EnergyFieldKey>>;
  return { ...project, ...patch };
};

const projectSchedulingReadiness = (project: Project): ProjectSchedulingReadiness => {
  const fieldRequirements = getProjectFieldRequirements(project);
  const missingFields = fieldRequirements.map((item) => item.label);
  const needsRuleDecision = projectNeedsRuleDecision(project);
  const excluded = projectIsExempted(project);
  const status: ProjectSchedulingStatus = missingFields.length
    ? "missing_fields"
    : excluded
      ? "excluded"
      : "ready";
  return {
    status,
    statusLabel: status === "ready" ? "可排期" : status === "missing_fields" ? "字段待补" : "免检",
    inSchedule: status === "ready",
    fieldRequirements,
    missingFields,
    needsRuleDecision,
    completenessLabel: missingFields.length ? `待补 ${missingFields.length} 项` : "规则完整",
    frequencyBasis: projectFrequencyBasis(project),
    canFreeze: missingFields.length === 0
  };
};

const responsibilityRoleNames = (person: Person) =>
  (person.responsibilityRoles ?? []).map((role) => personResponsibilityLabels[role] ?? role);

type PersonFieldSection = "basic" | "schedule" | "responsibility" | "specialty" | "ownership" | "capacity";
type PersonFieldRequirement = {
  key: string;
  label: string;
  section: PersonFieldSection;
  fieldNames: string[];
  reason: string;
  severity: "block" | "warn";
};

const personRequirement = (
  key: string,
  label: string,
  section: PersonFieldSection,
  fieldNames: string[],
  reason: string,
  severity: PersonFieldRequirement["severity"] = "block"
): PersonFieldRequirement => ({ key, label, section, fieldNames, reason, severity });

const personIsActiveForYear = (person: Person, year: number) => {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return person.isActive && (!person.activeFrom || person.activeFrom <= yearEnd) && (!person.activeTo || person.activeTo >= yearStart);
};

const positiveCapacity = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) && value > 0;

const getPersonFieldRequirements = (person: Person): PersonFieldRequirement[] => [
  !person.name.trim() ? personRequirement("name", "姓名", "basic", ["name"], "姓名用于排期任务负责人展示和人员匹配。") : null,
  !person.dept.trim() ? personRequirement("dept", "部门", "basic", ["dept"], "部门用于判断资产管理部、业务部门及协同职责。") : null,
  !person.baseCity.trim() ? personRequirement("baseCity", "所在城市", "basic", ["baseCity"], "所在城市用于后续安排现场检查和跨区域协调。") : null,
  !person.pool.length ? personRequirement("pool", "人员池", "schedule", ["pool"], "人员池决定该人员是否参与资产主责、业务协同或容量试算。") : null,
  !(person.responsibilityRoles ?? []).length ? personRequirement("responsibilityRoles", "制度职责", "responsibility", ["responsibilityRoles"], "制度职责用于判断检查主责、配合、报告填写和整改跟进责任。") : null,
  !positiveCapacity(person.annualOnsiteWeekCapacity) ? personRequirement("annualOnsiteWeekCapacity", "年度现场周容量", "capacity", ["annualOnsiteWeekCapacity"], "年度现场周容量用于判断全年是否排得下现场检查。") : null,
  !positiveCapacity(person.monthlyOnsiteLimit) ? personRequirement("monthlyOnsiteLimit", "月度现场上限", "capacity", ["monthlyOnsiteLimit"], "月度现场上限用于避免同一人员月份负荷过高。") : null,
  !positiveCapacity(person.offsiteTaskCapacity) ? personRequirement("offsiteTaskCapacity", "非现场任务容量", "capacity", ["offsiteTaskCapacity"], "非现场任务容量用于估算非现场检查承接能力。") : null
].filter((item): item is PersonFieldRequirement => Boolean(item));

const personMatchableProjectCount = (person: Person, projects: Project[]) =>
  projects.filter((project) =>
    person.longTermProjectIds.includes(project.id) ||
    (project.groupId ? person.longTermGroupIds.includes(project.groupId) : false) ||
    project.onsiteMaintainerId === person.id ||
    project.offsiteMaintainerId === person.id ||
    project.onsiteMaintainerName === person.name ||
    project.offsiteMaintainerName === person.name ||
    (project.bizType === "direct_lease" && person.specialTags.includes("直租专员")) ||
    (project.isNpl && person.specialTags.includes("问题项目专员"))
  ).length;

type PersonSchedulingStatus = "ready" | "missing_fields" | "needs_capability" | "inactive";
type PersonReadinessFilter = "all" | PersonSchedulingStatus;
type PersonPoolFilter = "all" | AssigneePoolMode;
type PersonSchedulingReadiness = {
  status: PersonSchedulingStatus;
  statusLabel: string;
  canSchedule: boolean;
  inSelectedPool: boolean;
  activeForYear: boolean;
  fieldRequirements: PersonFieldRequirement[];
  missingFields: string[];
  capabilityNotes: string[];
  matchableProjectCount: number;
  participationLabel: string;
  poolLabel: string;
  capacityLabel: string;
  availabilityLabel: string;
};

const personSchedulingReadiness = (
  person: Person,
  projects: Project[],
  poolFilter: PersonPoolFilter,
  year: number
): PersonSchedulingReadiness => {
  const fieldRequirements = getPersonFieldRequirements(person);
  const activeForYear = personIsActiveForYear(person, year);
  const inSelectedPool = poolFilter === "all" || person.pool.includes(poolFilter);
  const matchableProjectCount = personMatchableProjectCount(person, projects);
  const hasOwnership = person.longTermProjectIds.length > 0 || person.longTermGroupIds.length > 0;
  const hasSpecialty = person.specialTags.length > 0;
  const capabilityNotes = [
    !hasSpecialty ? "专项能力" : null,
    !hasOwnership && matchableProjectCount === 0 ? "长期归属" : null
  ].filter((item): item is string => Boolean(item));
  const needsCapability = activeForYear && inSelectedPool && !fieldRequirements.length && capabilityNotes.length > 0;
  const status: PersonSchedulingStatus = !activeForYear
    ? "inactive"
    : fieldRequirements.length
      ? "missing_fields"
      : needsCapability
        ? "needs_capability"
        : "ready";
  const canSchedule = activeForYear && inSelectedPool && !fieldRequirements.length;

  return {
    status,
    statusLabel: status === "ready" ? "可排期" : status === "missing_fields" ? "字段待补" : status === "needs_capability" ? "待完善" : "未生效",
    canSchedule,
    inSelectedPool,
    activeForYear,
    fieldRequirements,
    missingFields: fieldRequirements.map((item) => item.label),
    capabilityNotes,
    matchableProjectCount,
    participationLabel: !activeForYear ? "本年度未生效" : inSelectedPool ? "当前人员池" : "池外人员",
    poolLabel: person.pool.length ? poolListLabel(person.pool) : "人员池待维护",
    capacityLabel: `现场 ${person.annualOnsiteWeekCapacity ?? "待补"} 周/年 · 月上限 ${person.monthlyOnsiteLimit ?? "待补"} · 非现场 ${person.offsiteTaskCapacity ?? "待补"}`,
    availabilityLabel: `${person.activeFrom ?? "全年"}${person.activeTo ? ` 至 ${person.activeTo}` : ""} · 不可用 ${formatMonthList(person.unavailableMonths)}`
  };
};

const formatMonthList = (months: number[] | undefined) =>
  months?.length ? months.map((month) => `${month}月`).join("、") : "未配置";

const parseNumberList = (value: string) =>
  value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item >= 1 && item <= 12);

const compactDocName = (source: string) => source.replace(" CRL/ZC-2024-001-07", "");

const citationLabel = (evidence: RuleEvidence | undefined) =>
  evidence?.policyCitation?.citationLabel ?? evidence?.sourceParagraph ?? "待补充依据";

const shortCitation = (evidence: RuleEvidence | undefined) => {
  if (!evidence) return "待补充依据";
  const citation = evidence.policyCitation;
  return citation ? `${citation.chapterTitle} · ${citation.articleNo}` : evidence.sourceParagraph;
};

type RuleImpactResponse = {
  technicalRuleId: string;
  businessRule: BusinessRuleItem | null;
  evidence: RuleEvidence[];
  tags: TagDefinition[];
  affectedProjectCount: number;
  affectedProjects: Array<{
    id: string;
    name: string;
    customerType: Project["customerType"];
    riskGrade: Project["riskGrade"];
    exposureBalance: number;
    tagIds: string[];
  }>;
  affectedPersonCount: number;
  affectedSchedulerStep: string;
  influences: Array<{ target: string; schedulerStep: string; description: string }>;
};

type RuleSubmitResult = {
  draft: RuleDecisionDraft;
  rulesetVersion: string;
  validationRunId: string;
  publishable: boolean;
  blockers: string[];
  simulation: RuleSimulationResult;
  readiness: ReadinessGate | undefined;
};

const readableApiError = (message: string) => {
  try {
    const parsed = JSON.parse(message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join("；");
    if (parsed.message) return parsed.message;
  } catch {
    return message;
  }
  return message;
};

const frequencyCount = (value: FrequencyValue) => value.special ? "" : String(value.count ?? 0);
const frequencyPeriod = (value: FrequencyValue) => value.period ?? "year";
const frequencyLabel = (value: FrequencyValue) => {
  if (value.special) {
    const specialLabel = {
      manual_warning_plan: "按预警方案",
      not_mandatory: "不强制，待人工确认",
      asset_department_decides: "资产部明确"
    } satisfies Record<NonNullable<FrequencyValue["special"]>, string>;
    return specialLabel[value.special];
  }
  return `${value.count ?? 0} 次 / ${value.period === "two_years" ? "两年" : "年"}`;
};

const valueFromCountPeriod = (countText: string, period: FrequencyValue["period"]): FrequencyValue => {
  const count = Math.max(0, Number(countText || 0));
  return { count, period: period ?? "year" };
};

const createDefaultDraft = (decision: PendingRuleDecision): RuleDecisionDraft => ({
  id: `draft-${decision.technicalRuleId}`,
  pendingDecisionId: decision.id,
  technicalRuleId: decision.technicalRuleId,
  status: "draft",
  onsite: { special: "asset_department_decides", note: "待补充现场检查次数" },
  offsite: { special: "asset_department_decides", note: "待补充非现场检查次数" },
  businessNote: decision.currentGap,
  confirmerNote: "",
  simulationRunId: null,
  updatedAt: new Date().toISOString(),
  submittedAt: null
});

const isResolvedFrequencyValue = (value: FrequencyValue) =>
  value.special === undefined && typeof value.count === "number" && Boolean(value.period);

const isDraftReadyForRuleAction = (draft: RuleDecisionDraft | null | undefined) =>
  Boolean(draft && isResolvedFrequencyValue(draft.onsite) && isResolvedFrequencyValue(draft.offsite));

const draftActionSignature = (draft: RuleDecisionDraft | null | undefined) =>
  draft
    ? JSON.stringify({
        onsite: draft.onsite,
        offsite: draft.offsite,
        businessNote: draft.businessNote,
        confirmerNote: draft.confirmerNote
      })
    : "";

const processingReasonFor = (decision: PendingRuleDecision, draft?: RuleDecisionDraft) => {
  if (draft?.suggestionMeta?.reviewStatus === "needs_review") return "已有建议待审核";
  if (draft?.suggestionMeta?.reviewStatus === "accepted") return "建议已采纳";
  if (draft?.suggestionMeta?.reviewStatus === "edited") return "已人工调整";
  if (isDataGapDecision(decision)) return "需补项目数据";
  if (decision.publishImpact === "manual_needed") return "需确认安排";
  if (decision.technicalRuleId.startsWith("P")) return "需补检查次数";
  return "需补制度口径";
};

const processingImpactFor = (decision: PendingRuleDecision) =>
  decision.publishImpact === "blocks_publish" ? "影响正式发布" : "进入发布前待办";

const dataGapRuleIds = new Set(["P5", "P6"]);

const isDataGapDecision = (decision: PendingRuleDecision | null | undefined) =>
  Boolean(decision && dataGapRuleIds.has(decision.technicalRuleId));

const decisionWorkflowStatusFor = (draft?: RuleDecisionDraft, decision?: PendingRuleDecision | null) => {
  if (draft?.status === "submitted") {
    return {
      className: "submitted",
      label: "已纳入规则",
      detail: "已纳入正式排期规则"
    };
  }
  if (draft?.status === "simulated") {
    return {
      className: "simulated",
      label: "已试算",
      detail: "已试算，待纳入规则"
    };
  }
  if (isDataGapDecision(decision)) {
    return {
      className: "data",
      label: "待补数据",
      detail: "需先补项目数据"
    };
  }
  return {
    className: "pending",
    label: "待处理",
    detail: "待处理"
  };
};

type PendingDecisionTitle = {
  problemType: string;
  subject: string;
  confirmationTarget: string;
};

const pendingDecisionTitleMap: Record<string, PendingDecisionTitle> = {
  R1: {
    problemType: "预警方案待确认",
    subject: "预警客户检查安排",
    confirmationTarget: "按处理方案安排检查次数和时间"
  },
  P7: {
    problemType: "特殊调整待确认",
    subject: "资产部负责人酌情增减",
    confirmationTarget: "审批依据、现场/非现场最终次数"
  },
  R3: {
    problemType: "检查安排待确认",
    subject: "内部客户",
    confirmationTarget: "是否安排检查及人工留痕要求"
  },
  P2: {
    problemType: "检查次数待确认",
    subject: "公立医院初始敞口≤6000万元",
    confirmationTarget: "是否安排现场检查及次数"
  },
  P3: {
    problemType: "行业口径待确认",
    subject: "民营医院项目",
    confirmationTarget: "沿用公立医院还是普通客户频次"
  },
  P5: {
    problemType: "基础数据待补齐",
    subject: "集团检查对象",
    confirmationTarget: "member_count / 集团旗下存量客户数"
  },
  P6: {
    problemType: "基础数据待补齐",
    subject: "担保人/实控人/母公司",
    confirmationTarget: "旗下存量客户数"
  },
  P4: {
    problemType: "业务类型口径待确认",
    subject: "商业保理业务",
    confirmationTarget: "是否沿用回租/直租检查频次"
  },
  P1: {
    problemType: "检查次数待确认",
    subject: "外部/协同B小额敞口",
    confirmationTarget: "现场和非现场检查次数"
  }
};

const pendingDecisionTitleFor = (decision: PendingRuleDecision): PendingDecisionTitle =>
  pendingDecisionTitleMap[decision.technicalRuleId] ?? {
    problemType: decision.publishImpact === "manual_needed" ? "检查安排待确认" : "业务口径待确认",
    subject: decision.title,
    confirmationTarget: decision.requiredInput.replace(/[。；]$/, "")
  };

const projectInfoComplete = (project: Project) =>
  Boolean(
    project.name &&
      project.dept &&
      project.creditStart &&
      project.creditEnd &&
      project.customerType &&
      project.riskGrade &&
      project.industry &&
      project.bizType &&
      project.onsiteMaintainerName &&
      project.offsiteMaintainerName &&
      project.exposureBalance >= 0 &&
      project.exposureInit >= 0
  );

const checkTypeText = (type: Task["checkType"]) => (type === "onsite" ? "现场检查" : "非现场检查");

const isManualTask = (task: Task) => task.status === "manual_needed" || task.status === "unplaceable";

const taskMissingItems = (task: Task) => {
  const items = [];
  if (!task.assigneeId) items.push("负责人");
  if (!task.scheduledDate) items.push("开始日期");
  if (task.status === "unplaceable") items.push("可用完整工作周");
  return items.length ? items : ["人工复核"];
};

const taskShortTitle = (task: Task) => `${task.checkType === "onsite" ? "现场" : "非现场"}第 ${task.occurrenceIndex} 次`;

const taskWindowText = (task: Task) =>
  task.status === "exempted"
    ? "本年不安排"
    : task.scheduledDate
      ? `${task.scheduledDate}${task.endDate ? ` 至 ${task.endDate}` : ""}`
      : "待人工确认";

const missingItemsBusinessText = (task: Task) =>
  taskMissingItems(task)
    .map((item) => item.startsWith("缺") ? item : `缺${item}`)
    .join("、");

const assigneeFormValueForTask = (task: Task | null, people: Person[]) =>
  task?.assigneeId ?? (task?.assigneeName ? people.find((person) => person.name === task.assigneeName)?.id : undefined) ?? "";

const taskArrangementStatus = (task: Task | null) => {
  if (!task) return "暂无任务";
  if (task.status === "exempted") return "人工确认不安排";
  if (isManualTask(task)) return "待人工确认";
  if (task.isPlaced) return "已排入排期";
  return taskStatusLabel[task.status];
};

const matrixTaskStatusLabel = (status: DecisionResult, tasks: Task[]) => {
  if (tasks.some(isManualTask)) return "待人工确认";
  if (tasks.some((task) => task.status === "exempted")) {
    return tasks.every((task) => task.status === "exempted") ? "人工确认不安排" : "部分不安排";
  }
  if (status === "block") return "阻断";
  if (tasks.length && tasks.every((task) => task.isPlaced)) return "已排入";
  return scheduleMatrixStatusLabel[status];
};

const taskBusinessReason = (run: SchedulingRun, task: Task | null) => {
  if (!task) return "暂无任务需要处理。";
  const taskLogs = run.decisionLogs.filter((log) => log.projectId === task.projectId && (!log.taskId || log.taskId === task.id));
  const manualLog =
    taskLogs.find((log) => log.step === "time" && log.result === "warn") ??
    taskLogs.find((log) => log.step === "frequency" && log.result === "warn") ??
    taskLogs.find((log) => log.step === "assignee" && log.result === "warn");
  return manualLog?.reason ?? (task.status === "exempted" ? "员工已确认本年度不安排该任务。" : "需要发布前人工确认。");
};

const releaseStatus = (run: SchedulingRun, planning: PlanningYearWorkspace) => {
  if (!planning.canGenerateOfficial) {
    return {
      className: "danger",
      disabled: true,
      label: "暂不可发布：准备闸门未通过"
    };
  }
  if (!run.audit.publishable) {
    return {
      className: "danger",
      disabled: true,
      label: "暂不可发布：待处理未清零"
    };
  }
  if (run.audit.pendingManual) {
    return {
      className: "warn",
      disabled: false,
      label: "可发布但有待人工提示"
    };
  }
  return {
    className: "primary",
    disabled: false,
    label: "可正式发布"
  };
};

type ReleaseTodo = {
  id: string;
  group: "block" | "manual" | "hint";
  title: string;
  objectLabel: string;
  description: string;
  meta: string;
  actionLabel: string;
  target: { view: View; params: RouteState };
};

const releaseTodoGroups: Array<{ id: ReleaseTodo["group"]; label: string }> = [
  { id: "block", label: "阻断" },
  { id: "manual", label: "待人工" },
  { id: "hint", label: "提示" }
];

const issueTarget = (issue: PublishIssue): { view: View; params: RouteState } =>
  issue.kind === "rule_gap"
    ? { view: "rulesInput", params: { rule: issue.technicalRuleId ?? undefined, project: issue.projectId ?? undefined, panel: "draft", section: "ruleIssues" } }
    : issue.kind === "project_data_gap"
      ? { view: "projectInput", params: { project: issue.projectId ?? undefined, field: issue.field ?? undefined, section: "projectTable" } }
      : issue.kind === "manual_confirm"
        ? { view: "schedule", params: { filter: "manual", project: issue.projectId ?? undefined, task: issue.taskId ?? undefined, section: "manualQueue" } }
        : { view: "schedule", params: { filter: issue.kind === "time_conflict" ? "issues" : undefined, project: issue.projectId ?? undefined, task: issue.taskId ?? undefined, section: "scheduleMatrix" } };

const releaseTodoFromIssue = (issue: PublishIssue): ReleaseTodo => {
  const group: ReleaseTodo["group"] = issue.kind === "manual_confirm" ? "manual" : issue.kind === "hint" ? "hint" : "block";
  const target = issueTarget(issue);
  const actionLabel =
    issue.kind === "rule_gap"
      ? "补充检查口径"
      : issue.kind === "project_data_gap"
        ? "补充项目数据"
        : issue.kind === "manual_confirm"
          ? "处理人工项"
          : "查看提示";
  const meta = issue.affectedProjectCount > 1
    ? `影响 ${issue.affectedProjectCount} 个项目`
    : issue.projectName ? `项目：${issue.projectName}` : "当前方案";
  return {
    id: issue.id,
    group,
    title: issue.title,
    objectLabel: issue.objectLabel,
    description: issue.description,
    meta,
    actionLabel,
    target
  };
};

const buildReleaseTodos = (issueBoard: IssueBoard): ReleaseTodo[] =>
  issueBoard.issues.map(releaseTodoFromIssue);

function ReleaseTodoPanel({
  issueBoard,
  onNavigate
}: {
  issueBoard: IssueBoard;
  onNavigate: (view: View, params?: RouteState) => void;
}) {
  const todos = buildReleaseTodos(issueBoard);
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>发布前处理中心</h2>
          <span>规则阻断、待人工任务和软提示集中处理，点击后直达对象</span>
        </div>
        <AlertTriangle size={18} color="#b7791f" />
      </div>
      <div className="home-todo-list">
        {releaseTodoGroups.map((group) => {
          const items = todos.filter((todo) => todo.group === group.id);
          if (!items.length) return null;
          return (
            <div className="home-todo-group" key={group.id}>
              <div className="home-todo-group-title">
                <span>{group.label}</span>
                <strong>{items.length}</strong>
              </div>
              {items.map((todo) => (
                <div className={`home-blocker ${todo.group}`} key={todo.id}>
                  <div>
                    <span>{todo.objectLabel}</span>
                    <strong>{todo.title}</strong>
                    <p>{todo.description}</p>
                    <small>{todo.meta}</small>
                  </div>
                  <ViewAction view={todo.target.view} params={todo.target.params} onNavigate={onNavigate}>
                    {todo.actionLabel}
                    <ChevronRight size={15} />
                  </ViewAction>
                </div>
              ))}
            </div>
          );
        })}
        {!todos.length ? <div className="empty compact">发布前待办已清空，可以进入正式发布确认。</div> : null}
      </div>
    </section>
  );
}

function PreparationSummaryPanel({
  planning,
  projects,
  people,
  tagCoverage,
  onNavigate
}: {
  planning: PlanningYearWorkspace;
  projects: Project[];
  people: Person[];
  tagCoverage: TagCoverageSummary;
  onNavigate: (view: View, params?: RouteState) => void;
}) {
  const completeCount = projects.filter(projectInfoComplete).length;
  const ruleGate = planning.readiness[2]!;
  const cards = [
    {
      title: "项目",
      gate: planning.readiness[0]!,
      view: "projectInput" as View,
      facts: [`${planning.projectBatch.dataRows} 条`, `${tagCoverage.projectTagCoverageRate}% 标签`, planning.activeSnapshotId ? "已冻结" : "待冻结"]
    },
    {
      title: "人员",
      gate: planning.readiness[1]!,
      view: "peopleInput" as View,
      facts: [`${planning.rosterVersion.activePeople}/${planning.rosterVersion.totalPeople} 人`, `${tagCoverage.personRelationshipCoverageRate}% 关系`, poolLabels[planning.rosterVersion.poolMode]]
    },
    {
      title: "规则",
      gate: ruleGate,
      view: "rulesInput" as View,
      facts: [`${planning.ruleReport.coverageRate}% 覆盖`, `${planning.ruleReport.ruleGap} 待补`, ruleSetBusinessLabel(planning.ruleReport.rulesetVersion)]
    }
  ];

  return (
    <section className="panel prep-summary">
      <div className="section-title">
        <div>
          <h2>准备状态</h2>
          <span>项目 {completeCount}/{projects.length} · 人员 {planning.rosterVersion.activePeople} · 规则 {planning.ruleReport.ruleGap} 待补</span>
        </div>
        <Database size={18} color="#0f7578" />
      </div>
      <div className="prep-card-grid">
        {cards.map((card) => (
          <div className={`prep-card ${gateTone[card.gate.status]}`} key={card.title}>
            <div>
              <strong>{card.title}</strong>
              <GateBadge gate={card.gate} />
            </div>
            <div className="classification-list">
              {card.facts.map((fact) => <span key={fact}>{fact}</span>)}
            </div>
            <ViewAction view={card.view} onNavigate={onNavigate} className="button compact-button">
              维护
              <ChevronRight size={14} />
            </ViewAction>
          </div>
        ))}
      </div>
    </section>
  );
}

function RuleMapStrip({ systemMap, compact = false }: { systemMap: RuleSystemMap; compact?: boolean }) {
  return (
    <div className={`rule-map-strip ${compact ? "compact" : ""}`}>
      {systemMap.steps.map((step) => (
        <article className="rule-map-step" key={step.id}>
          <div className="rule-map-step-head">
            <span>{step.order}</span>
            <strong>{step.title}</strong>
          </div>
          <div className="rule-map-columns">
            <div>
              <span>{step.currentStateTitle}</span>
              <p>{step.currentState}</p>
            </div>
            <div>
              <span>{step.judgmentBasisTitle}</span>
              <p>{step.judgmentBasis}</p>
            </div>
            <div>
              <span>{step.decisionResultTitle}</span>
              <p>{step.decisionResult}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReadinessCenter({
  planning,
  run,
  projects,
  people,
  issueBoard,
  systemMap,
  tagCoverage,
  routeState,
  generationBusy,
  onGenerateOfficial,
  onNavigate
}: {
  planning: PlanningYearWorkspace;
  run: SchedulingRun;
  projects: Project[];
  people: Person[];
  issueBoard: IssueBoard;
  systemMap: RuleSystemMap;
  tagCoverage: TagCoverageSummary;
  routeState: RouteState;
  generationBusy: boolean;
  onGenerateOfficial: () => void;
  onNavigate: (view: View, params?: RouteState) => void;
}) {
  const passedCount = planning.readiness.filter((gate) => gate.passed).length;
  const officialStatus = releaseStatus(run, planning);
  const firstTodo = buildReleaseTodos(issueBoard)[0];
  const canGenerateOfficialRun = planning.canGenerateOfficial && run.audit.publishable;
  const prepSummaryRef = useRef<HTMLDivElement | null>(null);
  const navigatePrepSummary = () => {
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", viewHref("readiness", { section: "prepSummary" }));
    }
    scrollToSectionElement(prepSummaryRef.current);
  };
  useEffect(() => {
    if (routeState.section === "prepSummary") scrollToSectionElement(prepSummaryRef.current);
  }, [routeState.section]);
  return (
    <div className="readiness-layout">
      <section className="readiness-hero publish-hero">
        <div>
          <h2>{officialStatus.label}</h2>
          <p>{planning.periodLabel} · 先清阻断，再确认待人工，最后生成正式排期。</p>
          <div className="publish-metrics">
            <MetricAction href={viewHref("rulesInput", { section: "ruleIssues" })} label="规则阻断" onClick={(event) => { event.preventDefault(); onNavigate("rulesInput", { section: "ruleIssues" }); }} tone={run.audit.ruleGap ? "bad" : "good"} value={run.audit.ruleGap} />
            <MetricAction href={viewHref("schedule", { filter: "manual", section: "manualQueue" })} label="待人工" onClick={(event) => { event.preventDefault(); onNavigate("schedule", { filter: "manual", section: "manualQueue" }); }} tone={run.audit.pendingManual ? "warn" : "good"} value={run.audit.pendingManual} />
            <MetricAction href={viewHref("schedule", { filter: "issues", section: "scheduleMatrix" })} label="时间冲突" onClick={(event) => { event.preventDefault(); onNavigate("schedule", { filter: "issues", section: "scheduleMatrix" }); }} tone={run.audit.hardConflicts ? "bad" : "good"} value={run.audit.hardConflicts} />
            <MetricAction href={viewHref("readiness", { section: "prepSummary" })} label="准备项" onClick={(event) => { event.preventDefault(); navigatePrepSummary(); }} tone={passedCount === 3 ? "good" : "warn"} value={`${passedCount}/3`} />
          </div>
        </div>
        <div className="hero-actions">
          <button className="button primary generate-cta" disabled={!canGenerateOfficialRun || generationBusy} onClick={onGenerateOfficial} type="button">
            <Sparkles size={15} />
            {generationBusy ? "正在生成..." : "生成正式排期"}
          </button>
          {firstTodo ? (
            <ViewAction view={firstTodo.target.view} params={firstTodo.target.params} onNavigate={onNavigate}>
              <AlertTriangle size={15} />
              处理首个待办
            </ViewAction>
          ) : null}
          {planning.canGenerateSandbox ? (
            <ViewAction view="schedule" onNavigate={onNavigate}>
              <FlaskConical size={15} />
              查看排期
            </ViewAction>
          ) : (
            <button className="button" disabled type="button">
              <FlaskConical size={15} />
              查看排期
            </button>
          )}
          <button className={`button ${officialStatus.className}`} disabled={officialStatus.disabled}>
            <ShieldCheck size={15} />
            {officialStatus.label}
          </button>
        </div>
      </section>

      <ReleaseTodoPanel issueBoard={issueBoard} onNavigate={onNavigate} />
      <div ref={prepSummaryRef}>
        <PreparationSummaryPanel planning={planning} projects={projects} people={people} tagCoverage={tagCoverage} onNavigate={onNavigate} />
      </div>

      <details className="context-panel">
        <summary>查看标签归一、规则地图和准备流程</summary>
        <div className="context-grid">
          <section className="inset-panel">
            <div className="section-title">
              <div>
                <h2>标签归一</h2>
                <span>输入质量</span>
              </div>
              <ListFilter size={18} color="#0f7578" />
            </div>
            <div className="audit-grid compact-grid padded">
              <div className="metric good"><div className="metric-label">项目标签</div><div className="metric-value">{tagCoverage.projectTagCoverageRate}%</div></div>
              <div className={tagCoverage.personRelationshipCoverageRate < 60 ? "metric warn" : "metric good"}><div className="metric-label">人员关系</div><div className="metric-value">{tagCoverage.personRelationshipCoverageRate}%</div></div>
              <div className={tagCoverage.missingFields.some((item) => item.severity === "block") ? "metric bad" : "metric good"}><div className="metric-label">缺口</div><div className="metric-value">{tagCoverage.missingFields.length}</div></div>
              <div className="metric"><div className="metric-label">配对</div><div className="metric-value">{tagCoverage.relationPairs.length}</div></div>
            </div>
          </section>
          <section className="inset-panel">
            <div className="section-title">
              <div>
                <h2>准备流程</h2>
                <span>输入维护到正式发布</span>
              </div>
              <Database size={18} color="#0f7578" />
            </div>
            <div className="workflow-strip compact">
              {["项目", "差异", "人员", "规则", "排期"].map((step, index) => (
                <div className={`flow-step ${index < passedCount ? "done" : index === passedCount ? "active" : ""}`} key={step}>
                  <span>{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>
          </section>
        </div>
        <RuleMapStrip systemMap={systemMap} compact />
      </details>
    </div>
  );
}

function GenerationProgressOverlay({
  state,
  onClose,
  onViewSchedule,
  onArchive
}: {
  state: GenerationState;
  onClose: () => void;
  onViewSchedule: () => void;
  onArchive: () => void;
}) {
  if (!state.open) return null;
  const run = state.result;
  return (
    <div className="generation-backdrop" role="presentation">
      <section className="generation-dialog" role="dialog" aria-modal="true" aria-label="生成正式排期">
        <div className="generation-head">
          <div>
            <h2>{state.status === "success" ? "正式排期草案已生成" : state.status === "error" ? "生成排期失败" : "正在生成正式排期"}</h2>
            <p>系统按项目池、人员池和规则口径生成年度检查任务。</p>
          </div>
          {state.status !== "running" ? (
            <button className="icon-button" aria-label="关闭生成面板" onClick={onClose} type="button">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="generation-steps">
          {generationSteps.map((step, index) => (
            <div className={`generation-step ${index < state.step ? "done" : index === state.step ? "active" : ""}`} key={step}>
              <span>{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
        {state.status === "running" ? (
          <div className="generation-note">
            <strong>{generationSteps[state.step]}</strong>
            <p>{state.step === 0 ? "正在确认项目、人员、规则准备状态。" : "正在计算规则频次、人员匹配和时间约束。"}</p>
          </div>
        ) : null}
        {state.status === "success" && run ? (
          <>
            <div className="generation-result-grid">
              <div><span>项目总数</span><strong>{run.audit.inputProjects}</strong></div>
              <div><span>任务数</span><strong>{run.tasks.length}</strong></div>
              <div><span>待人工</span><strong>{run.audit.pendingManual}</strong></div>
              <div><span>硬冲突</span><strong>{run.audit.hardConflicts}</strong></div>
            </div>
            {run.audit.pendingManual ? <p className="form-hint">仍有 {run.audit.pendingManual} 项待人工提示，已进入排期待办队列。</p> : null}
            <div className="inline-actions generation-actions">
              <button className="button primary" onClick={onViewSchedule} type="button">
                <Table2 size={15} />
                查看排期
              </button>
              <button className="button" onClick={onArchive} type="button">
                <Archive size={15} />
                归档此排期
              </button>
            </div>
          </>
        ) : null}
        {state.status === "error" ? <div className="action-message error">{state.error ?? "生成失败，请稍后重试。"}</div> : null}
      </section>
    </div>
  );
}

function TagSelector({
  scope,
  tagLibrary,
  selected,
  onChange,
  hiddenCategories = []
}: {
  scope: "project" | "person" | "rule";
  tagLibrary: TagDefinition[];
  selected: string[];
  onChange: (tagIds: string[]) => void;
  hiddenCategories?: Array<TagDefinition["category"]>;
}) {
  const hiddenCategorySet = new Set(hiddenCategories);
  const options = (scope === "project" ? projectTagOptions(tagLibrary) : scope === "person" ? personTagOptions(tagLibrary) : ruleTagOptions(tagLibrary))
    .filter((tag) => !hiddenCategorySet.has(tag.category));
  const selectedSet = new Set(selected);
  const toggle = (tag: TagDefinition) => {
    const withoutSameGroup = tag.exclusiveGroup
      ? selected.filter((id) => {
          const current = tagLibrary.find((item) => item.id === id);
          return current?.exclusiveGroup !== tag.exclusiveGroup;
        })
      : selected;
    const next = selectedSet.has(tag.id)
      ? selected.filter((id) => id !== tag.id)
      : [...withoutSameGroup, tag.id];
    onChange([...new Set(next)]);
  };

  return (
    <div className="tag-picker">
      {options.map((tag) => (
        <button
          className={`tag-option ${selectedSet.has(tag.id) ? "active" : ""}`}
          key={tag.id}
          type="button"
          onClick={() => toggle(tag)}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}

function ProjectHandlingDrawer({
  open,
  project,
  people,
  readiness,
  ruleImpacts,
  activeRequirement,
  activeSection,
  validationMessage,
  onClose,
  onSave,
  onSaveAndValidate,
  onUpdate,
  onFocusRequirement,
  onSectionToggle,
  setFieldRef,
  isSectionOpen,
  isFieldHighlighted,
  sectionRequirement
}: {
  open: boolean;
  project: Project | null;
  people: Person[];
  readiness: ProjectSchedulingReadiness | null;
  ruleImpacts: PublishIssue[];
  activeRequirement: ProjectFieldRequirement | null;
  activeSection: ProjectFieldSection | null;
  validationMessage: string;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onSaveAndValidate: () => void | Promise<void>;
  onUpdate: (patch: Partial<Project>) => void;
  onFocusRequirement: (requirement: ProjectFieldRequirement) => void;
  onSectionToggle: (section: ProjectFieldSection, open: boolean) => void;
  setFieldRef: (fieldName: string) => (node: HTMLElement | null) => void;
  isSectionOpen: (section: ProjectFieldSection) => boolean;
  isFieldHighlighted: (fieldName: string) => boolean;
  sectionRequirement: (section: ProjectFieldSection) => ProjectFieldRequirement | null;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !project || !readiness) return null;
  const statusClass = readiness.status === "ready" ? "success-chip" : readiness.status === "missing_fields" ? "danger-chip" : "";

  return (
    <div className="project-drawer-layer">
      <button className="project-drawer-backdrop" aria-label="关闭项目维护抽屉" onClick={onClose} type="button" />
      <aside className="project-handling-drawer" aria-label={`正在维护：${project.name || "未命名项目"}`} aria-modal="true" role="dialog">
        <header className="project-drawer-header">
          <div>
            <span>项目维护 · {readiness.statusLabel}</span>
            <h2>{project.name || "未命名项目"}</h2>
            <p>项目编号 {project.id}｜{project.groupName ?? "无归属集团"}｜{project.dept || "业务部门待补"}</p>
          </div>
          <div className="inline-actions">
            <button className="button primary" onClick={onSaveAndValidate} type="button">保存并校验</button>
            <button className="button" onClick={onSave} type="button">保存</button>
            <button className="button" onClick={onClose} type="button">收起</button>
          </div>
        </header>
        <div className="project-drawer-summary">
          <span className={`chip ${statusClass}`}>{readiness.statusLabel}</span>
          <span className="chip">字段：{readiness.completenessLabel}</span>
          <span className="chip">频次依据：{readiness.frequencyBasis}</span>
          <span className="chip">现场 {project.onsiteMaintainerName ?? "待维护"} / 非现场 {project.offsiteMaintainerName ?? "待维护"}</span>
        </div>
        <div className="project-drawer-body">
          <div className="project-editor-summary">
            <div className="project-editor-title">
              <span className={`chip ${statusClass}`}>{readiness.statusLabel}</span>
              <strong>{project.name || "未命名项目"}</strong>
              <p>{project.groupName ?? "无归属集团"} · {project.dept || "业务部门待补"} · {labelMaps.customerType[project.customerType]} · {labelMaps.bizType[project.bizType]}</p>
            </div>
            <div className="project-editor-facts">
              <div><span>检查对象</span><strong>{labelMaps.partyType[project.partyType]}</strong></div>
              <div><span>风险敞口</span><strong>{(project.exposureBalance / 100_000_000).toFixed(2)} 亿</strong></div>
              <div><span>频次依据</span><strong>{readiness.frequencyBasis}</strong></div>
              <div><span>责任人</span><strong>现场 {project.onsiteMaintainerName ?? "待维护"} / 非现场 {project.offsiteMaintainerName ?? "待维护"}</strong></div>
            </div>
          </div>
          {validationMessage ? <div className="action-message success">{validationMessage}</div> : null}
          {readiness.missingFields.length ? (
            <div className="requirement-guide">
              <div>
                <strong>本项目还差哪些必要信息</strong>
                <p>{activeRequirement?.reason ?? "按待补内容补齐后即可重新校验。"}</p>
              </div>
              <div className="chips editor-alert-chips">
                {readiness.fieldRequirements.map((item) => (
                  <button className={`chip chip-button danger-chip ${activeRequirement?.key === item.key ? "active" : ""}`} type="button" key={item.key} onClick={() => onFocusRequirement(item)} title={item.reason}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="requirement-guide success">
              <div>
                <strong>项目字段完整</strong>
                <p>本项目已经满足排期规则需要的项目字段。</p>
              </div>
            </div>
          )}
          {ruleImpacts.length ? (
            <div className="requirement-guide">
              <div>
                <strong>规则影响</strong>
                <p>项目字段完整，后续由规则维护处理。</p>
              </div>
              <div className="chips editor-alert-chips">
                {ruleImpacts.map((issue) => (
                  <a className="chip chip-link warning-chip" href={viewHref("rulesInput", { rule: issue.technicalRuleId ?? undefined, project: project.id, panel: "draft" })} key={issue.id}>
                    命中 {issue.technicalRuleId} · 待规则确认
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          <div className="editor-grid project-editor-grid">
            <div className="policy-editor-stack">
              <details className={`policy-editor-section ${activeSection === "basic" ? "active-requirement-section" : ""}`} open={isSectionOpen("basic")} onToggle={(event) => onSectionToggle("basic", event.currentTarget.open)}>
                <summary className="policy-editor-heading"><span>必要字段</span><strong>基础信息</strong></summary>
                {sectionRequirement("basic") ? <p className="requirement-reason">{sectionRequirement("basic")?.reason}</p> : null}
                <div className="form-grid">
                  <label className={`field-label ${isFieldHighlighted("name") ? "field-label-missing" : ""}`}>项目名称<input ref={setFieldRef("name")} className="search" value={project.name} onChange={(event) => onUpdate({ name: event.target.value })} /></label>
                  <label className={`field-label ${isFieldHighlighted("dept") ? "field-label-missing" : ""}`}>业务部门<input ref={setFieldRef("dept")} className="search" value={project.dept} onChange={(event) => onUpdate({ dept: event.target.value })} /></label>
                  <label>归属集团编号<input className="search" value={project.groupId ?? ""} onChange={(event) => onUpdate({ groupId: event.target.value || null })} /></label>
                  <label>归属集团名称<input className="search" value={project.groupName ?? ""} onChange={(event) => onUpdate({ groupName: event.target.value || null })} /></label>
                  <label>检查对象<select className="select" value={project.partyType} onChange={(event) => onUpdate({ partyType: event.target.value as Project["partyType"] })}>{Object.entries(labelMaps.partyType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>业务类型<select className="select" value={project.bizType} onChange={(event) => onUpdate({ bizType: event.target.value as Project["bizType"] })}>{Object.entries(labelMaps.bizType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                </div>
              </details>
              <details className={`policy-editor-section ${activeSection === "scope" ? "active-requirement-section" : ""}`} open={isSectionOpen("scope")} onToggle={(event) => onSectionToggle("scope", event.currentTarget.open)}>
                <summary className="policy-editor-heading"><span>规则字段</span><strong>入池判断</strong></summary>
                {sectionRequirement("scope") ? <p className="requirement-reason">{sectionRequirement("scope")?.reason}</p> : null}
                <div className="form-grid">
                  <label>客户类型<select className="select" value={project.customerType} onChange={(event) => onUpdate({ customerType: event.target.value as Project["customerType"] })}>{Object.entries(labelMaps.customerType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>风险分类<select className="select" value={project.riskGrade} onChange={(event) => onUpdate({ riskGrade: event.target.value as Project["riskGrade"], isNpl: ["substandard", "doubtful", "loss"].includes(event.target.value) })}>{Object.entries(labelMaps.riskGrade).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>风险敞口余额<input className="search" type="number" value={project.exposureBalance} onChange={(event) => onUpdate({ exposureBalance: Number(event.target.value) })} /></label>
                  <label className={`field-label ${isFieldHighlighted("creditStart") ? "field-label-missing" : ""}`}>授信开始<input ref={setFieldRef("creditStart")} className="search" type="date" value={project.creditStart} onChange={(event) => onUpdate({ creditStart: event.target.value })} /></label>
                  <label className={`field-label ${isFieldHighlighted("creditEnd") ? "field-label-missing" : ""}`}>授信结束<input ref={setFieldRef("creditEnd")} className="search" type="date" value={project.creditEnd} onChange={(event) => onUpdate({ creditEnd: event.target.value })} /></label>
                  <label className="check-line"><input type="checkbox" checked={project.isSettledThisYear} onChange={(event) => onUpdate({ isSettledThisYear: event.target.checked })} />当年结清</label>
                  <label className="check-line"><input type="checkbox" checked={project.isNewWithin1y} onChange={(event) => onUpdate({ isNewWithin1y: event.target.checked })} />当年新增且期限不超过1年</label>
                  <label className="check-line"><input type="checkbox" checked={project.companySpecialRequirement ?? false} onChange={(event) => onUpdate({ companySpecialRequirement: event.target.checked })} />公司特殊要求</label>
                </div>
              </details>
              <details className={`policy-editor-section ${activeSection === "frequency" ? "active-requirement-section" : ""}`} open={isSectionOpen("frequency")} onToggle={(event) => onSectionToggle("frequency", event.currentTarget.open)}>
                <summary className="policy-editor-heading"><span>规则字段</span><strong>频次判断</strong></summary>
                {sectionRequirement("frequency") ? <p className="requirement-reason">{sectionRequirement("frequency")?.reason}</p> : null}
                <div className="form-grid">
                  <label>行业<select className="select" value={project.industry} onChange={(event) => onUpdate({ industry: event.target.value as Project["industry"] })}>{Object.entries(labelMaps.industry).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label className={`field-label ${isFieldHighlighted("hospitalType") ? "field-label-missing" : ""}`}>医院类型<select ref={setFieldRef("hospitalType")} className="select" value={project.hospitalType ?? ""} onChange={(event) => onUpdate({ hospitalType: event.target.value ? event.target.value as Project["hospitalType"] : null })}><option value="">非医院/待维护</option><option value="public_hospital">公立医院</option><option value="private_hospital">民营医院</option></select></label>
                  <label>初始敞口<input className="search" type="number" value={project.exposureInit} onChange={(event) => onUpdate({ exposureInit: Number(event.target.value) })} /></label>
                  <label className={`field-label ${isFieldHighlighted("termHalf") ? "field-label-missing" : ""}`}>项目中期<input ref={setFieldRef("termHalf")} className="search" type="date" value={project.termHalf ?? ""} onChange={(event) => onUpdate({ termHalf: event.target.value || null })} /></label>
                  <label className={`field-label ${isFieldHighlighted("memberCount") ? "field-label-missing" : ""}`}>集团旗下存量客户数<input ref={setFieldRef("memberCount")} className="search" type="number" value={project.memberCount ?? ""} onChange={(event) => onUpdate({ memberCount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  <label className={`field-label ${isFieldHighlighted("relatedPartyStockCount") ? "field-label-missing" : ""}`}>担保人/母公司旗下存量客户数<input ref={setFieldRef("relatedPartyStockCount")} className="search" type="number" value={project.relatedPartyStockCount ?? ""} onChange={(event) => onUpdate({ relatedPartyStockCount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  <label className={`field-label ${isFieldHighlighted("gridConnected") ? "field-label-missing" : ""}`}>并网情况<select ref={setFieldRef("gridConnected")} className="select" value={project.gridConnected === null ? "" : String(project.gridConnected)} onChange={(event) => onUpdate({ gridConnected: event.target.value === "" ? null : event.target.value === "true" })}><option value="">待维护</option><option value="true">是</option><option value="false">否</option></select></label>
                  <label className={`field-label ${isFieldHighlighted("accountMonitored") ? "field-label-missing" : ""}`}>账户监管<select ref={setFieldRef("accountMonitored")} className="select" value={project.accountMonitored === null ? "" : String(project.accountMonitored)} onChange={(event) => onUpdate({ accountMonitored: event.target.value === "" ? null : event.target.value === "true" })}><option value="">待维护</option><option value="true">是</option><option value="false">否</option></select></label>
                  <label className={`field-label ${isFieldHighlighted("repayClean3y") ? "field-label-missing" : ""}`}>近三年还款正常<select ref={setFieldRef("repayClean3y")} className="select" value={project.repayClean3y === null ? "" : String(project.repayClean3y)} onChange={(event) => onUpdate({ repayClean3y: event.target.value === "" ? null : event.target.value === "true" })}><option value="">待维护</option><option value="true">是</option><option value="false">否</option></select></label>
                  <label className="check-line"><input type="checkbox" checked={project.isWarning} onChange={(event) => onUpdate({ isWarning: event.target.checked })} />预警信号</label>
                  <label className={`field-label ${isFieldHighlighted("warningPlan") ? "field-label-missing" : ""}`}>预警处理方案<input ref={setFieldRef("warningPlan")} className="search" value={project.warningPlan ?? ""} onChange={(event) => onUpdate({ warningPlan: event.target.value || null })} /></label>
                  <label className={`wide-field field-label ${isFieldHighlighted("approvalRequirement") ? "field-label-missing" : ""}`}>批复/决议授信后管理要求<textarea ref={setFieldRef("approvalRequirement")} value={project.approvalRequirement ?? ""} onChange={(event) => onUpdate({ approvalRequirement: event.target.value || null })} /></label>
                </div>
              </details>
              <details className={`policy-editor-section ${activeSection === "owner" ? "active-requirement-section" : ""}`} open={isSectionOpen("owner")} onToggle={(event) => onSectionToggle("owner", event.currentTarget.open)}>
                <summary className="policy-editor-heading"><span>必要字段</span><strong>责任人</strong></summary>
                {sectionRequirement("owner") ? <p className="requirement-reason">{sectionRequirement("owner")?.reason}</p> : null}
                <div className="form-grid">
                  <label className={`field-label ${isFieldHighlighted("primaryResponsibleDept") ? "field-label-missing" : ""}`}>主责口径<select ref={setFieldRef("primaryResponsibleDept")} className="select" value={project.primaryResponsibleDept ?? ""} onChange={(event) => onUpdate({ primaryResponsibleDept: event.target.value ? event.target.value as Project["primaryResponsibleDept"] : undefined })}><option value="">待选择</option>{projectResponsibilityOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                  <label>现场维护人<select className="select" value={project.onsiteMaintainerId ?? ""} onChange={(event) => {
                    const person = people.find((item) => item.id === event.target.value);
                    onUpdate({ onsiteMaintainerId: event.target.value || null, onsiteMaintainerName: person?.name ?? null });
                  }}><option value="">待维护</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
                  <label>非现场维护人<select className="select" value={project.offsiteMaintainerId ?? ""} onChange={(event) => {
                    const person = people.find((item) => item.id === event.target.value);
                    onUpdate({ offsiteMaintainerId: event.target.value || null, offsiteMaintainerName: person?.name ?? null });
                  }}><option value="">待维护</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
                  <label>配合部门<input className="search" value={project.assistingDept ?? ""} onChange={(event) => onUpdate({ assistingDept: event.target.value || null })} /></label>
                </div>
              </details>
              <details className="policy-editor-section">
                <summary className="policy-editor-heading"><span>可选字段</span><strong>排期约束</strong></summary>
                <div className="form-grid">
                  <label>优先检查月份<input className="search" type="number" min={1} max={12} value={project.preferredInspectionMonth ?? ""} onChange={(event) => onUpdate({ preferredInspectionMonth: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  <label>不可排月份<input className="search" value={(project.unavailableMonths ?? []).join(",")} onChange={(event) => onUpdate({ unavailableMonths: parseNumberList(event.target.value) })} /></label>
                </div>
                <div className="check-chip-grid">
                  {offsiteChannelOptions.map((channel) => {
                    const selected = project.offsiteInfoChannels?.includes(channel) ?? false;
                    return (
                      <label className="check-line compact" key={channel}>
                        <input type="checkbox" checked={selected} onChange={(event) => {
                          const current = project.offsiteInfoChannels ?? [];
                          onUpdate({ offsiteInfoChannels: event.target.checked ? [...current, channel] : current.filter((item) => item !== channel) });
                        }} />
                        {channel}
                      </label>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ProjectInputView({
  planning,
  projects,
  people,
  officialRuns,
  tagLibrary,
  tagCoverage,
  issueBoard,
  routeState,
  request
}: {
  planning: PlanningYearWorkspace;
  projects: Project[];
  people: Person[];
  officialRuns: SchedulingRun[];
  tagLibrary: TagDefinition[];
  tagCoverage: TagCoverageSummary;
  issueBoard: IssueBoard;
  routeState: RouteState;
  request: WorkspaceRequest;
}) {
  const issues = planning.projectChangeSet.issues;
  const inScopeProjects = projects.filter((project) => !projectIsExempted(project));
  const exemptedProjects = projects.filter(projectIsExempted);
  const currentRuleIssues = issueBoard.issues.filter((issue) => issue.kind === "rule_gap");
  const ruleImpactsByProject = new Map<string, PublishIssue[]>();
  for (const issue of currentRuleIssues) {
    for (const projectId of issue.projectIds) {
      ruleImpactsByProject.set(projectId, [...(ruleImpactsByProject.get(projectId) ?? []), issue]);
    }
  }
  const ruleImpactProjectCount = ruleImpactsByProject.size;
  const missingResponsibilityProjects = projects.filter((project) => !project.primaryResponsibleDept);
  const warningPlanProjects = projects.filter((project) => project.isWarning && !project.warningPlan);
  const stats = [
    ["检查对象", projects.length, ""],
    ["纳入计划", inScopeProjects.length, "good"],
    ["免检", exemptedProjects.length, ""],
    ["规则影响", ruleImpactProjectCount, ruleImpactProjectCount ? "warn" : "good"],
    ["待补项目字段", tagCoverage.missingFields.filter((issue) => issue.scope === "project").length, tagCoverage.missingFields.some((issue) => issue.scope === "project" && issue.severity === "block") ? "bad" : "good"],
    ["主责待维护", missingResponsibilityProjects.length, missingResponsibilityProjects.length ? "warn" : "good"]
  ] as const;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectReadinessFilter>("all");
  const [draft, setDraft] = useState<Project | null>(null);
  const [isProjectDrawerOpen, setIsProjectDrawerOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isEnergyWorkbenchOpen, setIsEnergyWorkbenchOpen] = useState(false);
  const [energyFilter, setEnergyFilter] = useState<EnergyMissingFilter>("any");
  const [selectedEnergyProjectIds, setSelectedEnergyProjectIds] = useState<string[]>([]);
  const [energyBulkValues, setEnergyBulkValues] = useState<Record<EnergyFieldKey, EnergyBulkValue>>({
    gridConnected: "keep",
    accountMonitored: "keep",
    repayClean3y: "keep"
  });
  const [activeRequirementKey, setActiveRequirementKey] = useState<string | null>(null);
  const [activeRequirementRevealToken, setActiveRequirementRevealToken] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  const [bulkDeleteMessage, setBulkDeleteMessage] = useState("");
  const [energyBulkMessage, setEnergyBulkMessage] = useState("");
  const [openProjectSections, setOpenProjectSections] = useState<ProjectFieldSection[]>(coreProjectFieldSections);
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableSectionRef = useRef<HTMLElement | null>(null);
  const energyWorkbenchRef = useRef<HTMLElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const suppressedProjectRouteRef = useRef<string | null>(null);
  const readinessByProject = new Map(projects.map((project) => [project.id, projectSchedulingReadiness(project)]));
  const schedulingReadyProjects = projects.filter((project) => readinessByProject.get(project.id)?.status === "ready");
  const missingFieldProjects = projects.filter((project) => readinessByProject.get(project.id)?.status === "missing_fields");
  const rows = projects
    .filter((project) => (query ? `${project.id}${project.name}${project.groupName ?? ""}${project.customerType}${project.dept}`.includes(query) : true))
    .filter((project) => (statusFilter === "all" ? true : readinessByProject.get(project.id)?.status === statusFilter));
  const selectedProjectIdSet = new Set(selectedProjectIds);
  const selectedProjects = projects.filter((project) => selectedProjectIdSet.has(project.id));
  const visibleProjectIds = rows.map((project) => project.id);
  const visibleProjectIdSet = new Set(visibleProjectIds);
  const selectedVisibleCount = rows.filter((project) => selectedProjectIdSet.has(project.id)).length;
  const allVisibleSelected = rows.length > 0 && selectedVisibleCount === rows.length;
  const hasOfficialRuns = officialRuns.some((run) => run.runType === "official");
  const selectedReadyCount = selectedProjects.filter((project) => readinessByProject.get(project.id)?.status === "ready").length;
  const selectedMissingFieldCount = selectedProjects.filter((project) => readinessByProject.get(project.id)?.status === "missing_fields").length;
  const selectedRuleImpactCount = selectedProjects.filter((project) => (ruleImpactsByProject.get(project.id) ?? []).length > 0).length;
  const energyScopeProjects = projects.filter(isEnergyR5ScopeProject);
  const energyPendingProjects = energyScopeProjects.filter(needsEnergyExemptionReview);
  const energyRows = energyPendingProjects.filter((project) => (energyFilter === "any" ? true : energyFieldMissing(project, energyFilter)));
  const energyRowIdSet = new Set(energyRows.map((project) => project.id));
  const selectedEnergyIdSet = new Set(selectedEnergyProjectIds);
  const selectedEnergyProjects = projects.filter((project) => selectedEnergyIdSet.has(project.id) && needsEnergyExemptionReview(project));
  const selectedVisibleEnergyCount = energyRows.filter((project) => selectedEnergyIdSet.has(project.id)).length;
  const allVisibleEnergySelected = energyRows.length > 0 && selectedVisibleEnergyCount === energyRows.length;
  const previewEnergyProjects = selectedEnergyProjects.map((project) => applyEnergyPreviewUpdates(project, energyBulkValues));
  const previewResolvedCount = previewEnergyProjects.filter((project) => !needsEnergyExemptionReview(project)).length;
  const previewR5Count = previewEnergyProjects.filter(satisfiesEnergyExemption).length;
  const previewStillPendingCount = previewEnergyProjects.filter(needsEnergyExemptionReview).length;
  const energyUpdates = Object.fromEntries(
    energyFieldKeys
      .filter((field) => energyBulkValues[field] !== "keep")
      .map((field) => [field, energyBulkValues[field] === "true"])
  ) as Partial<Record<EnergyFieldKey, boolean>>;
  const canSubmitEnergyBulk = selectedEnergyProjects.length > 0 && Object.keys(energyUpdates).length > 0;
  const missingEnergyCounts = {
    any: energyPendingProjects.length,
    gridConnected: energyPendingProjects.filter((project) => energyFieldMissing(project, "gridConnected")).length,
    accountMonitored: energyPendingProjects.filter((project) => energyFieldMissing(project, "accountMonitored")).length,
    repayClean3y: energyPendingProjects.filter((project) => energyFieldMissing(project, "repayClean3y")).length
  } satisfies Record<EnergyMissingFilter, number>;

  const updateDraft = (patch: Partial<Project>) => {
    if (!draft) return;
    setDraft(syncProjectTags({ ...draft, ...patch }, tagLibrary));
  };
  const setFieldRef = (fieldName: string) => (node: HTMLElement | null) => {
    fieldRefs.current[fieldName] = node;
  };
  const projectRouteKey = (projectId?: string | null, field?: string | null) => `${projectId ?? ""}:${field ?? ""}`;
  const openProjectEditor = (project: Project, requirementKey?: string | null) => {
    suppressedProjectRouteRef.current = null;
    const fieldRequirements = getProjectFieldRequirements(project);
    const targetRequirement = requirementKey
      ? fieldRequirements.find((item) => item.key === requirementKey || item.fieldNames.includes(requirementKey)) ?? null
      : fieldRequirements[0] ?? null;
    setDraft(project);
    setIsProjectDrawerOpen(true);
    setActiveRequirementKey(targetRequirement?.key ?? null);
    setOpenProjectSections(coreProjectFieldSections);
    if (requirementKey && targetRequirement) setActiveRequirementRevealToken((current) => current + 1);
    setValidationMessage("");
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", viewHref("projectInput", { project: project.id, field: requirementKey ?? undefined, projectStatus: statusFilter, section: "projectTable" }));
    }
  };
  useEffect(() => {
    if (!routeState.project) return;
    if (suppressedProjectRouteRef.current === projectRouteKey(routeState.project, routeState.field)) return;
    const project = projects.find((item) => item.id === routeState.project);
    if (!project) return;
    openProjectEditor(project, routeState.field ?? null);
  }, [routeState.project, routeState.field, projects]);
  useEffect(() => {
    const projectIds = new Set(projects.map((project) => project.id));
    setSelectedProjectIds((current) => {
      const next = current.filter((id) => projectIds.has(id));
      return next.length === current.length ? current : next;
    });
    setSelectedEnergyProjectIds((current) => {
      const next = current.filter((id) => projectIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [projects]);
  useEffect(() => {
    if (routeState.projectStatus) {
      setQuery("");
      setStatusFilter(routeState.projectStatus);
    }
    if (routeState.section === "projectTable") {
      scrollToSectionElement(tableSectionRef.current);
    }
  }, [routeState.projectStatus, routeState.section]);
  const handleProjectSectionToggle = (section: ProjectFieldSection, open: boolean) => {
    setOpenProjectSections((current) => {
      if (open) return [...new Set([...current, section])];
      return current.filter((item) => item !== section);
    });
  };
  const focusRequirement = (requirement: ProjectFieldRequirement) => {
    setActiveRequirementKey(requirement.key);
    setOpenProjectSections((current) => [...new Set([...current, requirement.section])]);
    setActiveRequirementRevealToken((current) => current + 1);
  };
  const saveDraft = async () => {
    if (!draft) return;
    await request(`/projects/${draft.id}`, { method: "PATCH", body: JSON.stringify(draft) });
    setIsProjectDrawerOpen(false);
    setDraft(null);
  };
  const saveDraftAndValidate = async () => {
    if (!draft) return;
    const saved = await request<Project>(`/projects/${draft.id}`, { method: "PATCH", body: JSON.stringify(draft) });
    const nextReadiness = projectSchedulingReadiness(saved);
    const nextRequirement = nextReadiness.fieldRequirements[0] ?? null;
    setDraft(saved);
    setActiveRequirementKey(nextRequirement?.key ?? null);
    if (nextRequirement) {
      setOpenProjectSections((current) => [...new Set([...coreProjectFieldSections, ...current, nextRequirement.section])]);
      setActiveRequirementRevealToken((current) => current + 1);
      setValidationMessage(`已保存。仍需补充：${nextReadiness.missingFields.join("、")}`);
    } else {
      setOpenProjectSections(coreProjectFieldSections);
      setValidationMessage("项目字段完整，可进入排期判断。");
    }
  };
  const addProject = async () => {
    const project = await request<Project>("/projects", { method: "POST", body: JSON.stringify({ name: "新增项目" }) });
    openProjectEditor(project);
  };
  const importExcel = async (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setImportMessage("请上传 .xlsx 格式的年度项目表");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await request<{ importedProjects: number; batch: { filename: string } }>(`/planning-years/${planning.year}/projects/import`, {
        method: "POST",
        body: formData
      });
      setImportMessage(`已导入 ${result.importedProjects} 条项目数据，项目池需重新冻结`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败，请检查 Excel 文件");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const freezeProjects = async () => {
    await request(`/planning-years/${planning.year}/projects/freeze`, { method: "POST" });
  };
  const toggleProjectSelection = (projectId: string, checked: boolean) => {
    setSelectedProjectIds((current) => checked ? [...new Set([...current, projectId])] : current.filter((id) => id !== projectId));
  };
  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedProjectIds((current) => checked
      ? [...new Set([...current, ...visibleProjectIds])]
      : current.filter((id) => !visibleProjectIdSet.has(id))
    );
  };
  const bulkDeleteProjects = async () => {
    if (!selectedProjectIds.length) return;
    const idsToDelete = [...selectedProjectIds];
    const idSet = new Set(idsToDelete);
    try {
      const result = await request<{ deletedCount: number; deletedProjectIds: string[]; remainingProjects: number }>("/projects/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ projectIds: idsToDelete })
      });
      setSelectedProjectIds([]);
      setIsBulkDeleteConfirmOpen(false);
      setBulkDeleteMessage(`已移出 ${result.deletedCount} 个项目，项目池需重新冻结`);
      if (draft && idSet.has(draft.id)) {
        setIsProjectDrawerOpen(false);
        setDraft(null);
      }
      if (typeof window !== "undefined" && routeState.project && idSet.has(routeState.project)) {
        window.history.pushState(null, "", viewHref("projectInput", { projectStatus: statusFilter, section: "projectTable" }));
      }
    } catch (error) {
      setBulkDeleteMessage(error instanceof Error ? readableApiError(error.message) : "批量移出失败，请稍后重试");
    }
  };
  const openEnergyWorkbench = (filter: EnergyMissingFilter = "any") => {
    setIsEnergyWorkbenchOpen(true);
    setEnergyFilter(filter);
    setStatusFilter("missing_fields");
    setEnergyBulkMessage("");
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", viewHref("projectInput", { projectStatus: "missing_fields", section: "projectTable" }));
    }
    window.setTimeout(() => scrollToSectionElement(energyWorkbenchRef.current), 0);
  };
  const toggleEnergySelection = (projectId: string, checked: boolean) => {
    setSelectedEnergyProjectIds((current) => checked ? [...new Set([...current, projectId])] : current.filter((id) => id !== projectId));
  };
  const toggleVisibleEnergySelection = (checked: boolean) => {
    setSelectedEnergyProjectIds((current) => checked
      ? [...new Set([...current, ...energyRows.map((project) => project.id)])]
      : current.filter((id) => !energyRowIdSet.has(id))
    );
  };
  const submitEnergyBulkUpdate = async () => {
    if (!canSubmitEnergyBulk) return;
    try {
      const result = await request<{
        updatedCount: number;
        afterSummary: { pendingEnergyProjects: number; r5ExemptedProjects: number };
        r5CandidateProjectIds: string[];
      }>("/projects/bulk-update-energy-fields", {
        method: "POST",
        body: JSON.stringify({
          projectIds: selectedEnergyProjectIds,
          updates: energyUpdates,
          reason: "导入后批量确认能源豁免条件"
        })
      });
      setEnergyBulkMessage(
        `已确认 ${result.updatedCount} 个能源环保项目。当前仍待确认 ${result.afterSummary.pendingEnergyProjects} 个，预计命中 R5 免现场 ${result.afterSummary.r5ExemptedProjects} 个。`
      );
      setSelectedEnergyProjectIds([]);
      setEnergyBulkValues({ gridConnected: "keep", accountMonitored: "keep", repayClean3y: "keep" });
      setBulkDeleteMessage("能源豁免字段已更新，项目池需重新冻结");
    } catch (error) {
      setEnergyBulkMessage(error instanceof Error ? readableApiError(error.message) : "批量确认失败，请稍后重试");
    }
  };

  const statusOptions: Array<{ value: ProjectReadinessFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "ready", label: "可排期" },
    { value: "missing_fields", label: "字段待补" },
    { value: "excluded", label: "免检" }
  ];
  const overviewStats: Array<{
    label: string;
    value: number;
    tone: "" | "good" | "bad" | "warn";
    filter: ProjectReadinessFilter;
    helperText: string;
  }> = [
    { label: "项目总数", value: projects.length, tone: "", filter: "all", helperText: "查看全部年度项目" },
    { label: "可排期", value: schedulingReadyProjects.length, tone: "good", filter: "ready", helperText: "筛选项目字段完整且可排期的项目" },
    {
      label: "免检",
      value: projects.filter((project) => readinessByProject.get(project.id)?.status === "excluded").length,
      tone: "",
      filter: "excluded",
      helperText: "筛选不进入排期的项目"
    },
    {
      label: "字段待补",
      value: missingFieldProjects.length,
      tone: missingFieldProjects.length ? "bad" : "good",
      filter: "missing_fields",
      helperText: "筛选需要补充必要字段的项目"
    }
  ];
  const draftReadiness = draft ? projectSchedulingReadiness(draft) : null;
  const draftRuleImpacts = draft ? ruleImpactsByProject.get(draft.id) ?? [] : [];
  const activeRequirement = draftReadiness?.fieldRequirements.find((item) => item.key === activeRequirementKey) ?? draftReadiness?.fieldRequirements[0] ?? null;
  const activeSection = activeRequirement?.section ?? null;
  const isSectionOpen = (section: ProjectFieldSection) => openProjectSections.includes(section);
  const sectionRequirement = (section: ProjectFieldSection) =>
    activeRequirement?.section === section ? activeRequirement : null;
  const isFieldHighlighted = (fieldName: string) => activeRequirement?.fieldNames.includes(fieldName) ?? false;
  const openFirstMissingProject = () => {
    const project = missingFieldProjects[0];
    if (!project) return;
    setStatusFilter("missing_fields");
    openProjectEditor(project);
  };
  const handleOverviewCardClick = (filter: ProjectReadinessFilter) => {
    setQuery("");
    setStatusFilter(filter);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", viewHref("projectInput", { projectStatus: filter, section: "projectTable" }));
    }
    scrollToSectionElement(tableSectionRef.current);
  };
  const closeProjectDrawer = () => {
    suppressedProjectRouteRef.current = projectRouteKey(routeState.project ?? draft?.id, routeState.field);
    setIsProjectDrawerOpen(false);
    setDraft(null);
    setValidationMessage("");
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", viewHref("projectInput", { projectStatus: statusFilter, section: "projectTable" }));
    }
  };

  useEffect(() => {
    if (!draft || !activeRequirement || !activeRequirementRevealToken) return;
    const targetField = activeRequirement.fieldNames[0];
    if (!targetField) return;
    const timer = window.setTimeout(() => {
      const target = fieldRefs.current[targetField];
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
        target.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeRequirementRevealToken, draft?.id, activeRequirement?.key]);

  return (
    <div className="stack">
      <section className="panel project-overview-panel">
        <div className="section-title">
          <div>
            <h2>整体概览</h2>
            <span>把待排期项目维护到满足排期规则所需字段的状态。</span>
          </div>
          <div className="inline-actions">
            <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".xlsx" onChange={(event) => void importExcel(event.target.files?.[0] ?? null)} />
            <button className="button" type="button" onClick={() => fileInputRef.current?.click()}>
              <FileSpreadsheet size={15} />
              导入 Excel
            </button>
            <button className="button" type="button" onClick={addProject}>
              <FileSpreadsheet size={15} />
              手动新增
            </button>
            <button className="button" type="button" disabled={!missingFieldProjects.length} onClick={openFirstMissingProject}>
              <AlertTriangle size={15} />
              处理待补项目
            </button>
            <button className="button primary" type="button" disabled={missingFieldProjects.length > 0} onClick={freezeProjects}>
              <ShieldCheck size={15} />
              冻结项目池
            </button>
          </div>
        </div>
        <div className="project-overview-body">
          <div className="audit-grid compact-grid">
            {overviewStats.map(({ label, value, tone, filter, helperText }) => (
              <MetricAction
                active={statusFilter === filter}
                href={viewHref("projectInput", { projectStatus: filter, section: "projectTable" })}
                key={label}
                label={label}
                onClick={(event) => {
                  event.preventDefault();
                  handleOverviewCardClick(filter);
                }}
                tone={tone}
                title={helperText}
                value={value}
              />
            ))}
          </div>
          <div className="detail-grid">
            <div><span>项目池状态</span><strong>{planning.activeSnapshotId ? "已冻结" : "需重新冻结"}</strong></div>
            <div><span>最近导入</span><strong>{planning.projectBatch.filename}</strong></div>
            <div><span>数据行数</span><strong>{planning.projectBatch.dataRows} 条</strong></div>
            <div><span>字段校验</span><strong>{missingFieldProjects.length ? `${missingFieldProjects.length} 个项目待补` : "已满足排期字段"}</strong></div>
          </div>
          {energyScopeProjects.length ? (
            <div className="energy-bulk-card">
              <div className="section-title compact-section-title">
                <div>
                  <h3>能源环保字段待确认</h3>
                  <span>并网情况、账户监管、近三年还款正常会影响 R5 是否免现场检查。</span>
                </div>
                <button className="button primary" type="button" disabled={!energyPendingProjects.length} onClick={() => openEnergyWorkbench("any")}>
                  <Check size={15} />
                  批量确认能源豁免条件
                </button>
              </div>
              <div className="energy-metric-grid">
                {([
                  ["any", "待确认项目数", "查看全部能源环保待确认项目"],
                  ["gridConnected", "并网情况缺失", "只看缺并网情况"],
                  ["accountMonitored", "账户监管缺失", "只看缺账户监管"],
                  ["repayClean3y", "近三年还款正常缺失", "只看缺还款正常"]
                ] as const).map(([filter, label, title]) => (
                  <MetricAction
                    active={isEnergyWorkbenchOpen && energyFilter === filter}
                    href={viewHref("projectInput", { projectStatus: "missing_fields", section: "projectTable" })}
                    key={filter}
                    label={label}
                    onClick={(event) => {
                      event.preventDefault();
                      openEnergyWorkbench(filter);
                    }}
                    tone={missingEnergyCounts[filter] ? "warn" : "good"}
                    title={title}
                    value={missingEnergyCounts[filter]}
                  />
                ))}
                <MetricAction
                  active={false}
                  href={viewHref("projectInput", { projectStatus: "ready", section: "projectTable" })}
                  label="可能影响 R5 豁免"
                  onClick={(event) => {
                    event.preventDefault();
                    openEnergyWorkbench("any");
                  }}
                  tone={missingEnergyCounts.any ? "warn" : "good"}
                  title="字段补齐后由系统按 R5 重新判断是否免现场"
                  value={energyPendingProjects.length}
                />
              </div>
            </div>
          ) : null}
          {importMessage ? <p className="helper-text">{importMessage}</p> : null}
          {bulkDeleteMessage ? <p className="helper-text">{bulkDeleteMessage}</p> : null}
        </div>
      </section>

      {isEnergyWorkbenchOpen ? (
        <section className="panel energy-workbench" ref={energyWorkbenchRef}>
          <div className="section-title">
            <div>
              <h2>能源豁免条件批量确认工作台</h2>
              <span>本次仅确认项目事实字段，不直接人工改写检查频次；系统将按 R5 重新判断是否免现场。</span>
            </div>
            <button className="button" type="button" onClick={() => setIsEnergyWorkbenchOpen(false)}>收起</button>
          </div>
          <div className="energy-filter-row">
            {(Object.keys(energyFilterLabels) as EnergyMissingFilter[]).map((filter) => (
              <button
                className={`chip chip-button ${energyFilter === filter ? "active" : ""}`}
                key={filter}
                onClick={() => setEnergyFilter(filter)}
                type="button"
              >
                {energyFilterLabels[filter]} · {missingEnergyCounts[filter]}
              </button>
            ))}
          </div>
          <div className={`bulk-action-bar ${selectedEnergyProjects.length ? "active" : ""}`}>
            <div>
              <strong>已选择 {selectedEnergyProjects.length} 个能源环保项目</strong>
              <span>{energyRows.length ? `当前筛选结果 ${energyRows.length} 个，已选 ${selectedVisibleEnergyCount} 个` : "当前筛选下暂无待确认项目"}</span>
            </div>
            <div className="inline-actions">
              <button className="button" type="button" disabled={!energyRows.length} onClick={() => toggleVisibleEnergySelection(!allVisibleEnergySelected)}>
                {allVisibleEnergySelected ? "取消当前筛选" : "全选当前筛选"}
              </button>
              <button className="button" type="button" disabled={!selectedEnergyProjects.length} onClick={() => setSelectedEnergyProjectIds([])}>
                清空选择
              </button>
            </div>
          </div>
          <div className="energy-bulk-editor">
            {energyFieldKeys.map((field) => (
              <label key={field}>
                {energyFieldLabels[field]}
                <select
                  className="select"
                  value={energyBulkValues[field]}
                  onChange={(event) => setEnergyBulkValues((current) => ({ ...current, [field]: event.target.value as EnergyBulkValue }))}
                >
                  <option value="keep">保持不变</option>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              </label>
            ))}
            <div className="energy-preview-card">
              <span>保存前影响预览</span>
              <strong>
                {selectedEnergyProjects.length
                  ? `${previewResolvedCount} 个可完成字段确认，${previewR5Count} 个可能免现场，${previewStillPendingCount} 个仍待确认`
                  : "请选择项目并设置字段后预览"}
              </strong>
              <p>确认并重新校验后，候选排期、项目标签、待办数字和规则判断会同步刷新。</p>
            </div>
            <button className="button primary" type="button" disabled={!canSubmitEnergyBulk} onClick={submitEnergyBulkUpdate}>
              确认并重新校验
            </button>
          </div>
          {energyBulkMessage ? <div className={`action-message ${energyBulkMessage.includes("失败") || energyBulkMessage.includes("仅允许") ? "error" : "success"}`}>{energyBulkMessage}</div> : null}
          <div className="table-wrap">
            <table className="energy-workbench-table">
              <thead>
                <tr>
                  <th className="selection-cell">
                    <input
                      aria-label="选择当前能源环保筛选结果"
                      checked={allVisibleEnergySelected}
                      disabled={!energyRows.length}
                      onChange={(event) => toggleVisibleEnergySelection(event.target.checked)}
                      type="checkbox"
                    />
                  </th>
                  <th>项目</th>
                  <th>集团/客户</th>
                  <th>剩余敞口</th>
                  <th>并网情况</th>
                  <th>账户监管</th>
                  <th>近三年还款正常</th>
                  <th>当前规则判断</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {energyRows.length ? energyRows.map((project) => {
                  const selected = selectedEnergyIdSet.has(project.id);
                  return (
                    <tr className={selected ? "selected-row" : ""} key={project.id}>
                      <td className="selection-cell">
                        <input
                          aria-label={`选择${project.name || project.id}`}
                          checked={selected}
                          onChange={(event) => toggleEnergySelection(project.id, event.target.checked)}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <div className="project-name">{project.name || "未命名项目"}</div>
                        <div className="muted">{project.id} · {labelMaps.bizType[project.bizType]}</div>
                      </td>
                      <td>
                        <div className="project-name">{project.groupName ?? "无归属集团"}</div>
                        <div className="muted">{labelMaps.customerType[project.customerType]}</div>
                      </td>
                      <td>{(project.exposureBalance / 100_000_000).toFixed(2)} 亿</td>
                      {energyFieldKeys.map((field) => (
                        <td key={field}>
                          <span className={`chip ${energyFieldMissing(project, field) ? "warning-chip" : project[field] ? "success-chip" : ""}`}>
                            {energyFieldLabels[field].replace("情况", "").replace("正常", "")}：{energyBooleanLabel(project[field])}
                          </span>
                        </td>
                      ))}
                      <td>
                        <div className="project-name">{needsEnergyExemptionReview(project) ? "R5 判断字段待确认" : satisfiesEnergyExemption(project) ? "可按 R5 免现场" : "不满足 R5 豁免"}</div>
                        <div className="muted">能源环保 ≤3 亿</div>
                      </td>
                      <td>
                        <button className="button" type="button" onClick={() => openProjectEditor(project, "energyExemption")}>单条维护</button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">
                        <strong>当前筛选下没有能源豁免字段待确认项目</strong>
                        <p>可以切换筛选条件，或回到项目表格查看其他待补字段。</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel" ref={tableSectionRef}>
        <div className="section-title">
          <div>
            <h2>项目表格</h2>
            <span>通过 Excel 导入或手动新增维护年度项目池。</span>
          </div>
          <ListFilter size={18} color="#0f7578" />
        </div>
        <div className="filters">
          <label>
            <Search size={14} />
          </label>
          <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目编号、名称、集团或业务部门" />
          <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProjectReadinessFilter)}>
            {statusOptions.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className={`bulk-action-bar ${selectedProjects.length ? "active" : ""}`}>
          <div>
            <strong>已选择 {selectedProjects.length} 个项目</strong>
            <span>{selectedVisibleCount ? `当前筛选结果中已选 ${selectedVisibleCount} 个` : "可从表格左侧勾选项目"}</span>
          </div>
          <div className="inline-actions">
            <button className="button" type="button" disabled={!rows.length} onClick={() => toggleVisibleSelection(!allVisibleSelected)}>
              {allVisibleSelected ? "取消当前筛选" : "全选当前筛选"}
            </button>
            <button className="button danger" type="button" disabled={!selectedProjects.length} onClick={() => setIsBulkDeleteConfirmOpen(true)}>
              <Trash2 size={15} />
              批量移出项目池
            </button>
            <button className="button" type="button" disabled={!selectedProjects.length} onClick={() => setSelectedProjectIds([])}>
              清空选择
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="selection-cell">
                  <input
                    aria-label="选择当前筛选结果"
                    checked={allVisibleSelected}
                    disabled={!rows.length}
                    onChange={(event) => toggleVisibleSelection(event.target.checked)}
                    type="checkbox"
                  />
                </th>
                <th>项目</th>
                <th>排期状态</th>
                <th>项目字段</th>
                <th>规则影响</th>
                <th>检查频次依据</th>
                <th>责任人</th>
                <th>待补内容</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((project) => {
                const readiness = readinessByProject.get(project.id) ?? projectSchedulingReadiness(project);
                const ruleImpacts = ruleImpactsByProject.get(project.id) ?? [];
                const actionLabel = readiness.status === "missing_fields" ? "补充信息" : "编辑";
                const statusClass = readiness.status === "ready" ? "success-chip" : readiness.status === "missing_fields" ? "danger-chip" : "";
                const isSelected = selectedProjectIdSet.has(project.id);
                return (
                  <tr className={isSelected ? "selected-row" : ""} key={project.id}>
                    <td className="selection-cell">
                      <input
                        aria-label={`选择${project.name || project.id}`}
                        checked={isSelected}
                        onChange={(event) => toggleProjectSelection(project.id, event.target.checked)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <div className="project-name">{project.name || "未命名项目"}</div>
                      <div className="muted">{project.groupName ?? `项目编号 ${project.id}`} · {project.dept || "业务部门待补"}</div>
                    </td>
                    <td>
                      <span className={`chip ${statusClass}`}>{readiness.statusLabel}</span>
                    </td>
                    <td>
                      <div className="project-name">{readiness.completenessLabel}</div>
                      <div className="muted">{labelMaps.customerType[project.customerType]} · {labelMaps.bizType[project.bizType]}</div>
                    </td>
                    <td>
                      <div className="chips">
                        {ruleImpacts.length ? ruleImpacts.map((issue) => (
                          <a className="chip chip-link warning-chip" href={viewHref("rulesInput", { rule: issue.technicalRuleId ?? undefined, project: project.id, panel: "draft" })} key={issue.id}>
                            命中 {issue.technicalRuleId} · 待规则确认
                          </a>
                        )) : (
                          <span className="muted">无当前规则待办</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="project-name">{readiness.frequencyBasis}</div>
                      <div className="muted">{labelMaps.riskGrade[project.riskGrade]} · {(project.exposureBalance / 100_000_000).toFixed(2)} 亿</div>
                    </td>
                    <td>
                      <div className="project-name">{project.primaryResponsibleDept ? labelMaps.primaryResponsibleDept[project.primaryResponsibleDept] : "待维护"}</div>
                      <div className="muted">现场 {project.onsiteMaintainerName ?? "待维护"} / 非现场 {project.offsiteMaintainerName ?? "待维护"}</div>
                    </td>
                    <td>
                      <div className="chips">
                        {readiness.fieldRequirements.length ? readiness.fieldRequirements.slice(0, 4).map((item) => (
                          <button
                            className="chip chip-button danger-chip"
                            key={item.key}
                            type="button"
                            onClick={() => item.key === "energyExemption" ? openEnergyWorkbench("any") : openProjectEditor(project, item.key)}
                            title={item.reason}
                          >
                            {item.label}
                          </button>
                        )) : (
                          <span className="muted">-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button className="button" type="button" onClick={() => openProjectEditor(project)}>{actionLabel}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isBulkDeleteConfirmOpen ? (
        <div className="generation-backdrop">
          <section className="generation-dialog project-delete-dialog" role="dialog" aria-modal="true" aria-label="确认移出项目池">
            <div className="generation-head">
              <div>
                <span className="eyebrow">项目池维护</span>
                <h2>确认移出所选项目？</h2>
                <p>移出后这些项目不会参与后续候选排期；如需恢复，请重新导入或手动新增。</p>
              </div>
              <button className="button icon-button" type="button" aria-label="关闭确认面板" onClick={() => setIsBulkDeleteConfirmOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="project-delete-summary">
              <div><span>移出项目</span><strong>{selectedProjects.length} 个</strong></div>
              <div><span>可排期项目</span><strong>{selectedReadyCount} 个</strong></div>
              <div><span>规则影响项目</span><strong>{selectedRuleImpactCount} 个</strong></div>
              <div><span>字段待补项目</span><strong>{selectedMissingFieldCount} 个</strong></div>
            </div>
            {hasOfficialRuns ? (
              <div className="action-message warn">
                已有正式排期不会被自动改写。本次仅影响当前项目池和后续候选方案。
              </div>
            ) : null}
            {selectedProjects.length === projects.length ? (
              <div className="action-message error">
                你正在移出全部项目，确认后当前候选排期将清空。
              </div>
            ) : null}
            <div className="project-delete-list">
              {selectedProjects.slice(0, 5).map((project) => (
                <div key={project.id}>
                  <strong>{project.name || project.id}</strong>
                  <span>{(project.groupName ?? project.dept) || "无归属集团"}</span>
                </div>
              ))}
              {selectedProjects.length > 5 ? <p className="muted">另有 {selectedProjects.length - 5} 个项目将一并移出。</p> : null}
            </div>
            <div className="inline-actions right">
              <button className="button" type="button" onClick={() => setIsBulkDeleteConfirmOpen(false)}>取消</button>
              <button className="button danger" type="button" onClick={bulkDeleteProjects}>
                <Trash2 size={15} />
                确认移出项目池
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <ProjectHandlingDrawer
        activeRequirement={activeRequirement}
        activeSection={activeSection}
        isFieldHighlighted={isFieldHighlighted}
        isSectionOpen={isSectionOpen}
        onClose={closeProjectDrawer}
        onFocusRequirement={focusRequirement}
        onSave={saveDraft}
        onSaveAndValidate={saveDraftAndValidate}
        onSectionToggle={handleProjectSectionToggle}
        onUpdate={updateDraft}
        open={isProjectDrawerOpen}
        people={people}
        project={draft}
        readiness={draftReadiness}
        ruleImpacts={draftRuleImpacts}
        sectionRequirement={sectionRequirement}
        setFieldRef={setFieldRef}
        validationMessage={validationMessage}
      />

      {/* Legacy inline project editor removed after drawer migration.
      {draft && false ? (
        <section className="panel project-editor-legacy-disabled">
          <div className="section-title">
            <div>
              <h2>{draft.name || "未命名项目"}</h2>
              <span>项目编号 {draft.id}｜{draft.groupName ?? "无归属集团"}｜{draft.dept || "业务部门待补"}</span>
            </div>
            <div className="inline-actions">
              <button className="button primary" onClick={saveDraftAndValidate}>保存并校验</button>
              <button className="button" onClick={saveDraft}>保存</button>
              <button className="button" onClick={() => setDraft(null)}>取消</button>
            </div>
          </div>
          <div className="project-editor-summary">
            <div className="project-editor-title">
              <span className={`chip ${draftReadiness?.status === "ready" ? "success-chip" : draftReadiness?.status === "missing_fields" ? "danger-chip" : ""}`}>
                {draftReadiness?.statusLabel ?? "待校验"}
              </span>
              <strong>{draft.name || "未命名项目"}</strong>
              <p>{draft.groupName ?? "无归属集团"} · {draft.dept || "业务部门待补"} · {labelMaps.customerType[draft.customerType]} · {labelMaps.bizType[draft.bizType]}</p>
            </div>
            <div className="project-editor-facts">
              <div><span>检查对象</span><strong>{labelMaps.partyType[draft.partyType]}</strong></div>
              <div><span>风险敞口</span><strong>{(draft.exposureBalance / 100_000_000).toFixed(2)} 亿</strong></div>
              <div><span>频次依据</span><strong>{draftReadiness?.frequencyBasis ?? projectFrequencyBasis(draft)}</strong></div>
              <div><span>责任人</span><strong>现场 {draft.onsiteMaintainerName ?? "待维护"} / 非现场 {draft.offsiteMaintainerName ?? "待维护"}</strong></div>
            </div>
          </div>
          {validationMessage ? <p className="helper-text">{validationMessage}</p> : null}
          {draftReadiness && draftReadiness.missingFields.length ? (
            <div className="requirement-guide">
              <div>
                <strong>本项目还差哪些必要信息</strong>
                <p>{activeRequirement?.reason ?? "按待补内容补齐后即可重新校验。"}</p>
              </div>
              <div className="chips editor-alert-chips">
                {draftReadiness.fieldRequirements.map((item) => (
                  <button className={`chip chip-button danger-chip ${activeRequirement?.key === item.key ? "active" : ""}`} type="button" key={item.key} onClick={() => focusRequirement(item)} title={item.reason}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="requirement-guide success">
              <div>
                <strong>项目字段完整</strong>
                <p>本项目已经满足排期规则需要的项目字段。</p>
              </div>
            </div>
          )}
          {draftRuleImpacts.length ? (
            <div className="requirement-guide">
              <div>
                <strong>规则影响</strong>
                <p>项目字段完整，后续由规则维护处理。</p>
              </div>
              <div className="chips editor-alert-chips">
                {draftRuleImpacts.map((issue) => (
                  <a className="chip chip-link warning-chip" href={viewHref("rulesInput", { rule: issue.technicalRuleId ?? undefined, project: draft.id, panel: "draft" })} key={issue.id}>
                    命中 {issue.technicalRuleId} · 待规则确认
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          <div className="editor-grid project-editor-grid">
            <div className="policy-editor-stack">
              <details className={`policy-editor-section ${activeSection === "basic" ? "active-requirement-section" : ""}`} open={isSectionOpen("basic")} onToggle={(event) => handleProjectSectionToggle("basic", event.currentTarget.open)}>
                <summary className="policy-editor-heading"><span>必要字段</span><strong>基础信息</strong></summary>
                {sectionRequirement("basic") ? <p className="requirement-reason">{sectionRequirement("basic")?.reason}</p> : null}
                <div className="form-grid">
                  <label className={`field-label ${isFieldHighlighted("name") ? "field-label-missing" : ""}`}>项目名称<input ref={setFieldRef("name")} className="search" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
                  <label className={`field-label ${isFieldHighlighted("dept") ? "field-label-missing" : ""}`}>业务部门<input ref={setFieldRef("dept")} className="search" value={draft.dept} onChange={(event) => updateDraft({ dept: event.target.value })} /></label>
                  <label>归属集团编号<input className="search" value={draft.groupId ?? ""} onChange={(event) => updateDraft({ groupId: event.target.value || null })} /></label>
                  <label>归属集团名称<input className="search" value={draft.groupName ?? ""} onChange={(event) => updateDraft({ groupName: event.target.value || null })} /></label>
                  <label>检查对象<select className="select" value={draft.partyType} onChange={(event) => updateDraft({ partyType: event.target.value as Project["partyType"] })}>{Object.entries(labelMaps.partyType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>业务类型<select className="select" value={draft.bizType} onChange={(event) => updateDraft({ bizType: event.target.value as Project["bizType"] })}>{Object.entries(labelMaps.bizType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                </div>
              </details>
              <details className={`policy-editor-section ${activeSection === "scope" ? "active-requirement-section" : ""}`} open={isSectionOpen("scope")} onToggle={(event) => handleProjectSectionToggle("scope", event.currentTarget.open)}>
                <summary className="policy-editor-heading"><span>规则字段</span><strong>入池判断</strong></summary>
                {sectionRequirement("scope") ? <p className="requirement-reason">{sectionRequirement("scope")?.reason}</p> : null}
                <div className="form-grid">
                  <label>客户类型<select className="select" value={draft.customerType} onChange={(event) => updateDraft({ customerType: event.target.value as Project["customerType"] })}>{Object.entries(labelMaps.customerType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>风险分类<select className="select" value={draft.riskGrade} onChange={(event) => updateDraft({ riskGrade: event.target.value as Project["riskGrade"], isNpl: ["substandard", "doubtful", "loss"].includes(event.target.value) })}>{Object.entries(labelMaps.riskGrade).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>风险敞口余额<input className="search" type="number" value={draft.exposureBalance} onChange={(event) => updateDraft({ exposureBalance: Number(event.target.value) })} /></label>
                  <label className={`field-label ${isFieldHighlighted("creditStart") ? "field-label-missing" : ""}`}>授信开始<input ref={setFieldRef("creditStart")} className="search" type="date" value={draft.creditStart} onChange={(event) => updateDraft({ creditStart: event.target.value })} /></label>
                  <label className={`field-label ${isFieldHighlighted("creditEnd") ? "field-label-missing" : ""}`}>授信结束<input ref={setFieldRef("creditEnd")} className="search" type="date" value={draft.creditEnd} onChange={(event) => updateDraft({ creditEnd: event.target.value })} /></label>
                  <label className="check-line"><input type="checkbox" checked={draft.isSettledThisYear} onChange={(event) => updateDraft({ isSettledThisYear: event.target.checked })} />当年结清</label>
                  <label className="check-line"><input type="checkbox" checked={draft.isNewWithin1y} onChange={(event) => updateDraft({ isNewWithin1y: event.target.checked })} />当年新增且期限不超过1年</label>
                  <label className="check-line"><input type="checkbox" checked={draft.companySpecialRequirement ?? false} onChange={(event) => updateDraft({ companySpecialRequirement: event.target.checked })} />公司特殊要求</label>
                </div>
              </details>
              <details className={`policy-editor-section ${activeSection === "frequency" ? "active-requirement-section" : ""}`} open={isSectionOpen("frequency")} onToggle={(event) => handleProjectSectionToggle("frequency", event.currentTarget.open)}>
                <summary className="policy-editor-heading"><span>规则字段</span><strong>频次判断</strong></summary>
                {sectionRequirement("frequency") ? <p className="requirement-reason">{sectionRequirement("frequency")?.reason}</p> : null}
                <div className="form-grid">
                  <label>行业<select className="select" value={draft.industry} onChange={(event) => updateDraft({ industry: event.target.value as Project["industry"] })}>{Object.entries(labelMaps.industry).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
	                  <label className={`field-label ${isFieldHighlighted("hospitalType") ? "field-label-missing" : ""}`}>医院类型<select ref={setFieldRef("hospitalType")} className="select" value={draft.hospitalType ?? ""} onChange={(event) => updateDraft({ hospitalType: event.target.value ? event.target.value as Project["hospitalType"] : null })}><option value="">非医院/待维护</option><option value="public_hospital">公立医院</option><option value="private_hospital">民营医院</option></select></label>
	                  <label>初始敞口<input className="search" type="number" value={draft.exposureInit} onChange={(event) => updateDraft({ exposureInit: Number(event.target.value) })} /></label>
	                  <label className={`field-label ${isFieldHighlighted("termHalf") ? "field-label-missing" : ""}`}>项目中期<input ref={setFieldRef("termHalf")} className="search" type="date" value={draft.termHalf ?? ""} onChange={(event) => updateDraft({ termHalf: event.target.value || null })} /></label>
	                  <label className={`field-label ${isFieldHighlighted("memberCount") ? "field-label-missing" : ""}`}>集团旗下存量客户数<input ref={setFieldRef("memberCount")} className="search" type="number" value={draft.memberCount ?? ""} onChange={(event) => updateDraft({ memberCount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
	                  <label className={`field-label ${isFieldHighlighted("relatedPartyStockCount") ? "field-label-missing" : ""}`}>担保人/母公司旗下存量客户数<input ref={setFieldRef("relatedPartyStockCount")} className="search" type="number" value={draft.relatedPartyStockCount ?? ""} onChange={(event) => updateDraft({ relatedPartyStockCount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  <label className={`field-label ${isFieldHighlighted("gridConnected") ? "field-label-missing" : ""}`}>并网情况<select ref={setFieldRef("gridConnected")} className="select" value={draft.gridConnected === null ? "" : String(draft.gridConnected)} onChange={(event) => updateDraft({ gridConnected: event.target.value === "" ? null : event.target.value === "true" })}><option value="">待维护</option><option value="true">是</option><option value="false">否</option></select></label>
                  <label className={`field-label ${isFieldHighlighted("accountMonitored") ? "field-label-missing" : ""}`}>账户监管<select ref={setFieldRef("accountMonitored")} className="select" value={draft.accountMonitored === null ? "" : String(draft.accountMonitored)} onChange={(event) => updateDraft({ accountMonitored: event.target.value === "" ? null : event.target.value === "true" })}><option value="">待维护</option><option value="true">是</option><option value="false">否</option></select></label>
                  <label className={`field-label ${isFieldHighlighted("repayClean3y") ? "field-label-missing" : ""}`}>近三年还款正常<select ref={setFieldRef("repayClean3y")} className="select" value={draft.repayClean3y === null ? "" : String(draft.repayClean3y)} onChange={(event) => updateDraft({ repayClean3y: event.target.value === "" ? null : event.target.value === "true" })}><option value="">待维护</option><option value="true">是</option><option value="false">否</option></select></label>
                  <label className="check-line"><input type="checkbox" checked={draft.isWarning} onChange={(event) => updateDraft({ isWarning: event.target.checked })} />预警信号</label>
                  <label className={`field-label ${isFieldHighlighted("warningPlan") ? "field-label-missing" : ""}`}>预警处理方案<input ref={setFieldRef("warningPlan")} className="search" value={draft.warningPlan ?? ""} onChange={(event) => updateDraft({ warningPlan: event.target.value || null })} /></label>
                  <label className={`wide-field field-label ${isFieldHighlighted("approvalRequirement") ? "field-label-missing" : ""}`}>批复/决议授信后管理要求<textarea ref={setFieldRef("approvalRequirement")} value={draft.approvalRequirement ?? ""} onChange={(event) => updateDraft({ approvalRequirement: event.target.value || null })} /></label>
                </div>
              </details>
              <details className={`policy-editor-section ${activeSection === "owner" ? "active-requirement-section" : ""}`} open={isSectionOpen("owner")} onToggle={(event) => handleProjectSectionToggle("owner", event.currentTarget.open)}>
                <summary className="policy-editor-heading"><span>必要字段</span><strong>责任人</strong></summary>
                {sectionRequirement("owner") ? <p className="requirement-reason">{sectionRequirement("owner")?.reason}</p> : null}
                <div className="form-grid">
                  <label className={`field-label ${isFieldHighlighted("primaryResponsibleDept") ? "field-label-missing" : ""}`}>主责口径<select ref={setFieldRef("primaryResponsibleDept")} className="select" value={draft.primaryResponsibleDept ?? ""} onChange={(event) => updateDraft({ primaryResponsibleDept: event.target.value ? event.target.value as Project["primaryResponsibleDept"] : undefined })}><option value="">待选择</option>{projectResponsibilityOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                  <label>现场维护人<select className="select" value={draft.onsiteMaintainerId ?? ""} onChange={(event) => {
                    const person = people.find((item) => item.id === event.target.value);
                    updateDraft({ onsiteMaintainerId: event.target.value || null, onsiteMaintainerName: person?.name ?? null });
                  }}><option value="">待维护</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
                  <label>非现场维护人<select className="select" value={draft.offsiteMaintainerId ?? ""} onChange={(event) => {
                    const person = people.find((item) => item.id === event.target.value);
                    updateDraft({ offsiteMaintainerId: event.target.value || null, offsiteMaintainerName: person?.name ?? null });
                  }}><option value="">待维护</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
                  <label>配合部门<input className="search" value={draft.assistingDept ?? ""} onChange={(event) => updateDraft({ assistingDept: event.target.value || null })} /></label>
                </div>
              </details>
              <details className="policy-editor-section">
                <summary className="policy-editor-heading"><span>可选字段</span><strong>排期约束</strong></summary>
                <div className="form-grid">
                  <label>优先检查月份<input className="search" type="number" min={1} max={12} value={draft.preferredInspectionMonth ?? ""} onChange={(event) => updateDraft({ preferredInspectionMonth: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  <label>不可排月份<input className="search" value={(draft.unavailableMonths ?? []).join(",")} onChange={(event) => updateDraft({ unavailableMonths: parseNumberList(event.target.value) })} /></label>
                </div>
                <div className="check-chip-grid">
                  {offsiteChannelOptions.map((channel) => {
                    const selected = draft.offsiteInfoChannels?.includes(channel) ?? false;
                    return (
                      <label className="check-line compact" key={channel}>
                        <input type="checkbox" checked={selected} onChange={(event) => {
                          const current = draft.offsiteInfoChannels ?? [];
                          updateDraft({ offsiteInfoChannels: event.target.checked ? [...current, channel] : current.filter((item) => item !== channel) });
                        }} />
                        {channel}
                      </label>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>
        </section>
      ) : null}
      */}
    </div>
  );
}

/*
  return (
    <div className="stack">
      <div className="audit-grid compact-grid">
        {stats.map(([label, value, tone]) => (
          <div className={`metric ${tone}`} key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>制度字段准备</h2>
            <span>按《授信后检查管理实施细则》校验检查对象、入池免检、频次依据和责任主体</span>
          </div>
          <ListFilter size={18} color="#0f7578" />
        </div>
        <div className="detail-grid">
          <div><span>第二章职责字段</span><strong>{projects.length - missingResponsibilityProjects.length} / {projects.length}</strong></div>
          <div><span>第三章入池字段</span><strong>{inScopeProjects.length} 入池 / {exemptedProjects.length} 免检</strong></div>
          <div><span>第三章频次字段</span><strong>{ruleDecisionProjects.length ? `${ruleDecisionProjects.length} 个待确认` : "已具备"}</strong></div>
          <div><span>预警处理方案</span><strong>{warningPlanProjects.length ? `${warningPlanProjects.length} 个待补` : "无待补"}</strong></div>
        </div>
        <div className="policy-check-grid">
          <div className="policy-check-card">
            <span>第二章 · 职责与分工</span>
            <strong>主责部门、配合部门、报告填写和整改跟进必须能定位责任主体。</strong>
            <p>当前重点补齐项目主责口径和维护人映射。</p>
          </div>
          <div className="policy-check-card">
            <span>第三章 · 第八至十条</span>
            <strong>计划按自然年度/半年度制定，只针对一般风险业务。</strong>
            <p>低风险、当年结清、当年新增短期限会先进入免检判断。</p>
          </div>
          <div className="policy-check-card">
            <span>第三章 · 第十一至十四条</span>
            <strong>现场/非现场频次由客户类型、风险分类、行业和敞口共同决定。</strong>
            <p>待资产部明确的口径会进入规则维护待处理。</p>
          </div>
        </div>
        <IssueList issues={tagCoverage.missingFields.filter((issue) => issue.scope === "project").map((issue) => ({
          id: issue.id,
          scope: issue.scope === "schedule" ? "rule" : issue.scope,
          severity: issue.severity,
          title: issue.title,
          message: issue.message,
          field: issue.field,
          recordId: issue.recordId,
          suggestedAction: issue.suggestedAction
        }))} emptyText="项目标签和关键字段已覆盖当前规则" />
      </section>
      <div className="split-grid">
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>年度项目来源</h2>
              <span>来自年度项目样表</span>
            </div>
            <GateBadge gate={planning.readiness[0]!} />
          </div>
          <div className="detail-grid">
            <div>
              <span>来源</span>
              <strong>2026 样表</strong>
            </div>
            <div>
              <span>导入时间</span>
              <strong>{planning.projectBatch.importedAt.slice(0, 10)}</strong>
            </div>
            <div>
              <span>项目池状态</span>
              <strong>{planning.activeSnapshotId ? "已确认冻结" : "待确认冻结"}</strong>
            </div>
            <div>
              <span>样表检查次数</span>
              <strong>现场 {planning.projectBatch.regressionBaseline.onsiteExpectedTotal} / 非现场 {planning.projectBatch.regressionBaseline.offsiteExpectedTotal}</strong>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>数据质量</h2>
              <span>阻断项必须先修正</span>
            </div>
            <AlertTriangle size={18} color="#b7791f" />
          </div>
          <IssueList issues={issues} emptyText="项目字段已通过冻结校验" />
        </section>
      </div>

      <section className="panel">
        <div className="section-title">
          <div>
            <h2>项目维护台</h2>
            <span>可编辑字段与标签同步，保存后需重新冻结年度项目池</span>
          </div>
          <div className="inline-actions">
            <button className="button" onClick={addProject}>
              <FileSpreadsheet size={15} />
              新增项目
            </button>
            <button className="button primary" onClick={freezeProjects}>
              <ShieldCheck size={15} />
              冻结快照
            </button>
          </div>
        </div>
        <div className="filters">
          <label>
            <Search size={14} />
          </label>
          <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目编号、名称或集团" />
          <select className="select" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">全部标签</option>
            {tags.map((tag) => (
              <option value={tag.id} key={tag.id}>{tag.name}</option>
            ))}
          </select>
          <select className="select" value={bulkTagId} onChange={(event) => setBulkTagId(event.target.value)}>
            <option value="">批量选择标签</option>
            {tags.map((tag) => (
              <option value={tag.id} key={tag.id}>{tag.name}</option>
            ))}
          </select>
          <button className="button" disabled={!bulkTagId || !selectedIds.length} onClick={() => applyBulkTag("add")}>批量添加</button>
          <button className="button" disabled={!bulkTagId || !selectedIds.length} onClick={() => applyBulkTag("remove")}>批量移除</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>选择</th>
                <th>项目</th>
                <th>检查对象</th>
                <th>入池状态</th>
                <th>频次依据</th>
                <th>主责/维护</th>
                <th>待补事项</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((project) => {
                const pendingItems = projectPendingItems(project);
                return (
                  <tr key={project.id}>
                    <td className="check-cell">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(project.id)}
                        onChange={(event) =>
                          setSelectedIds((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))
                        }
                      />
                    </td>
                    <td>
                      <div className="project-name">{project.name}</div>
                      <div className="muted">{project.groupName ?? `项目编号 ${project.id}`}</div>
                    </td>
                    <td>
                      <div className="project-name">{labelMaps.partyType[project.partyType]}</div>
                      <div className="muted">{labelMaps.customerType[project.customerType]} · {labelMaps.bizType[project.bizType]}</div>
                    </td>
                    <td>
                      <span className={projectIsExempted(project) ? "chip" : "chip success-chip"}>{projectIsExempted(project) ? "免检" : "纳入计划"}</span>
                      <div className="muted">{project.exposureBalance > 0 ? "一般风险业务" : "低风险业务"}</div>
                    </td>
                    <td>
                      <div className="project-name">{projectFrequencyBasis(project)}</div>
                      <div className="muted">{labelMaps.riskGrade[project.riskGrade]} · {(project.exposureBalance / 100_000_000).toFixed(2)} 亿</div>
                    </td>
                    <td>
                      <div className="project-name">{labelMaps.primaryResponsibleDept[project.primaryResponsibleDept ?? "joint"]}</div>
                      <div className="muted">现场 {project.onsiteMaintainerName ?? "待维护"} / 非现场 {project.offsiteMaintainerName ?? "待维护"}</div>
                    </td>
                    <td>
                      <div className="chips">
                        {pendingItems.length ? pendingItems.slice(0, 4).map((item) => (
                          <span className="chip danger-chip" key={item}>{item}</span>
                        )) : <span className="muted">-</span>}
                      </div>
                    </td>
                    <td><button className="button" onClick={() => setDraft(project)}>编辑</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {draft ? (
        <section className="panel legacy-inline-editor-panel">
          <div className="section-title">
            <div>
              <h2>编辑项目</h2>
              <span>项目编号 {draft.id}｜选择标签会同步项目字段</span>
            </div>
            <div className="inline-actions">
              <button className="button primary" onClick={saveDraft}>保存</button>
              <button className="button" onClick={() => setDraft(null)}>取消</button>
            </div>
          </div>
          <div className="editor-grid">
            <div className="policy-editor-stack">
              <div className="policy-editor-section">
                <div className="policy-editor-heading"><span>第一章/第三章</span><strong>基础识别与检查对象</strong></div>
                <div className="form-grid">
                  <label>项目名称<input className="search" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
                  <label>业务部门<input className="search" value={draft.dept} onChange={(event) => updateDraft({ dept: event.target.value })} /></label>
                  <label>归属集团编号<input className="search" value={draft.groupId ?? ""} onChange={(event) => updateDraft({ groupId: event.target.value || null })} /></label>
                  <label>归属集团名称<input className="search" value={draft.groupName ?? ""} onChange={(event) => updateDraft({ groupName: event.target.value || null })} /></label>
                  <label>检查对象<select className="select" value={draft.partyType} onChange={(event) => updateDraft({ partyType: event.target.value as Project["partyType"] })}>{Object.entries(labelMaps.partyType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>业务类型<select className="select" value={draft.bizType} onChange={(event) => updateDraft({ bizType: event.target.value as Project["bizType"] })}>{Object.entries(labelMaps.bizType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                </div>
              </div>
              <div className="policy-editor-section">
                <div className="policy-editor-heading"><span>第三章第八至十条</span><strong>入池与免检判断</strong></div>
                <div className="form-grid">
                  <label>客户类型<select className="select" value={draft.customerType} onChange={(event) => updateDraft({ customerType: event.target.value as Project["customerType"] })}>{Object.entries(labelMaps.customerType).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>风险敞口<input className="search" type="number" value={draft.exposureBalance} onChange={(event) => updateDraft({ exposureBalance: Number(event.target.value) })} /></label>
                  <label>授信开始<input className="search" type="date" value={draft.creditStart} onChange={(event) => updateDraft({ creditStart: event.target.value })} /></label>
                  <label>授信结束<input className="search" type="date" value={draft.creditEnd} onChange={(event) => updateDraft({ creditEnd: event.target.value })} /></label>
                  <label className="check-line"><input type="checkbox" checked={draft.isSettledThisYear} onChange={(event) => updateDraft({ isSettledThisYear: event.target.checked })} />当年结清</label>
                  <label className="check-line"><input type="checkbox" checked={draft.isNewWithin1y} onChange={(event) => updateDraft({ isNewWithin1y: event.target.checked })} />当年新增且期限不超过1年</label>
                  <label className="check-line"><input type="checkbox" checked={draft.companySpecialRequirement ?? false} onChange={(event) => updateDraft({ companySpecialRequirement: event.target.checked })} />公司特殊要求</label>
                </div>
              </div>
              <div className="policy-editor-section">
                <div className="policy-editor-heading"><span>第三章第十一至十四条</span><strong>频次、专项与批复要求</strong></div>
                <div className="form-grid">
                  <label>风险分类<select className="select" value={draft.riskGrade} onChange={(event) => updateDraft({ riskGrade: event.target.value as Project["riskGrade"] })}>{Object.entries(labelMaps.riskGrade).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>行业<select className="select" value={draft.industry} onChange={(event) => updateDraft({ industry: event.target.value as Project["industry"] })}>{Object.entries(labelMaps.industry).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label>医院类型<select className="select" value={draft.hospitalType ?? ""} onChange={(event) => updateDraft({ hospitalType: event.target.value ? event.target.value as Project["hospitalType"] : null })}><option value="">非医院/待维护</option><option value="public_hospital">公立医院</option><option value="private_hospital">民营医院</option></select></label>
                  <label>初始敞口<input className="search" type="number" value={draft.exposureInit} onChange={(event) => updateDraft({ exposureInit: Number(event.target.value) })} /></label>
                  <label>项目中期<input className="search" type="date" value={draft.termHalf ?? ""} onChange={(event) => updateDraft({ termHalf: event.target.value || null })} /></label>
                  <label>集团旗下存量客户数<input className="search" type="number" value={draft.memberCount ?? ""} onChange={(event) => updateDraft({ memberCount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  <label>担保人/母公司旗下存量客户数<input className="search" type="number" value={draft.relatedPartyStockCount ?? ""} onChange={(event) => updateDraft({ relatedPartyStockCount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  <label className="check-line"><input type="checkbox" checked={draft.isWarning} onChange={(event) => updateDraft({ isWarning: event.target.checked })} />预警信号</label>
                  <label>预警处理方案<input className="search" value={draft.warningPlan ?? ""} onChange={(event) => updateDraft({ warningPlan: event.target.value || null })} /></label>
                  <label className="wide-field">批复/决议授信后管理要求<textarea value={draft.approvalRequirement ?? ""} onChange={(event) => updateDraft({ approvalRequirement: event.target.value || null })} /></label>
                </div>
              </div>
              <div className="policy-editor-section">
                <div className="policy-editor-heading"><span>第二章职责与分工</span><strong>责任主体与执行人</strong></div>
                <div className="form-grid">
                  <label>主责口径<select className="select" value={draft.primaryResponsibleDept ?? "joint"} onChange={(event) => updateDraft({ primaryResponsibleDept: event.target.value as Project["primaryResponsibleDept"] })}>{projectResponsibilityOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                  <label>配合部门<input className="search" value={draft.assistingDept ?? ""} onChange={(event) => updateDraft({ assistingDept: event.target.value || null })} /></label>
                  <label>现场维护人<select className="select" value={draft.onsiteMaintainerId ?? ""} onChange={(event) => {
                    const person = people.find((item) => item.id === event.target.value);
                    updateDraft({ onsiteMaintainerId: event.target.value || null, onsiteMaintainerName: person?.name ?? null });
                  }}><option value="">待维护</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
                  <label>非现场维护人<select className="select" value={draft.offsiteMaintainerId ?? ""} onChange={(event) => {
                    const person = people.find((item) => item.id === event.target.value);
                    updateDraft({ offsiteMaintainerId: event.target.value || null, offsiteMaintainerName: person?.name ?? null });
                  }}><option value="">待维护</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
                  <label>报告填写责任人<input className="search" value={draft.reportOwnerName ?? ""} onChange={(event) => updateDraft({ reportOwnerName: event.target.value || null })} /></label>
                  <label>整改跟进责任人<input className="search" value={draft.rectificationOwnerName ?? ""} onChange={(event) => updateDraft({ rectificationOwnerName: event.target.value || null })} /></label>
                </div>
              </div>
              <div className="policy-editor-section">
                <div className="policy-editor-heading"><span>排期约束</span><strong>计划时间与非现场渠道</strong></div>
                <div className="form-grid">
                  <label>优先检查月份<input className="search" type="number" min={1} max={12} value={draft.preferredInspectionMonth ?? ""} onChange={(event) => updateDraft({ preferredInspectionMonth: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  <label>不可排月份<input className="search" value={(draft.unavailableMonths ?? []).join(",")} onChange={(event) => updateDraft({ unavailableMonths: parseNumberList(event.target.value) })} /></label>
                  <label>现场基线<input className="search" type="number" value={draft.expectedOnsiteCount ?? 0} onChange={(event) => updateDraft({ expectedOnsiteCount: Number(event.target.value) })} /></label>
                  <label>非现场基线<input className="search" type="number" value={draft.expectedOffsiteCount ?? 0} onChange={(event) => updateDraft({ expectedOffsiteCount: Number(event.target.value) })} /></label>
                </div>
                <div className="check-chip-grid">
                  {offsiteChannelOptions.map((channel) => {
                    const selected = draft.offsiteInfoChannels?.includes(channel) ?? false;
                    return (
                      <label className="check-line compact" key={channel}>
                        <input type="checkbox" checked={selected} onChange={(event) => {
                          const current = draft.offsiteInfoChannels ?? [];
                          updateDraft({ offsiteInfoChannels: event.target.checked ? [...current, channel] : current.filter((item) => item !== channel) });
                        }} />
                        {channel}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div>
              <h3 className="editor-subtitle">项目标签</h3>
              {Object.entries(tagNamesByCategory(draft.tagIds ?? [], tagLibrary)).map(([group, names]) => (
                <div className="tag-field-group" key={group}>
                  <span>{group}</span>
                  <div className="chips">{names.map((name) => <span className="chip" key={name}>{name}</span>)}</div>
                </div>
              ))}
              <TagSelector scope="project" tagLibrary={tagLibrary} selected={draft.tagIds ?? []} onChange={updateDraftTags} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-title">
          <div>
            <h2>年度差异确认</h2>
            <span>后续年度基于上一快照增量维护</span>
          </div>
          <FileDiff size={18} color="#0f7578" />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>项目</th>
                <th>变化</th>
                <th>业务字段</th>
                <th>原值</th>
                <th>新值</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {planning.projectChangeSet.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="project-name">{item.projectName}</div>
                    <div className="muted">{item.projectId}</div>
                  </td>
                  <td>{projectChangeTypeLabel(item.type)}</td>
                  <td>{businessFieldLabel(item.field)}</td>
                  <td>{item.before ?? "无"}</td>
                  <td>{item.after ?? "已纳入年度池"}</td>
                  <td><span className="chip">{projectChangeStatusLabel(item.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <div>
            <h2>项目主数据样例</h2>
            <span>当前页面展示代表性项目，年度池总量以导入批次为准</span>
          </div>
          <Search size={18} color="#0f7578" />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>项目</th>
                <th>客户类型</th>
                <th>行业</th>
                <th>敞口</th>
                <th>维护人</th>
                <th>检查基线</th>
              </tr>
            </thead>
            <tbody>
              {projects.slice(0, 12).map((project) => (
                <tr key={project.id}>
                  <td>
                    <div className="project-name">{project.name}</div>
                    <div className="muted">{project.groupName ?? `项目编号 ${project.id}`}</div>
                  </td>
                  <td>{labelMaps.customerType[project.customerType]}</td>
                  <td>{labelMaps.industry[project.industry]}</td>
                  <td>{(project.exposureBalance / 100_000_000).toFixed(2)} 亿</td>
                  <td>{project.onsiteMaintainerName ?? "待维护"}</td>
                  <td>现场 {project.expectedOnsiteCount ?? 0} / 非现场 {project.expectedOffsiteCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
*/

const personStatusChipClass = (status: PersonSchedulingStatus | undefined) =>
  status === "ready" ? "success-chip" : status === "missing_fields" ? "danger-chip" : status === "needs_capability" ? "warning-chip" : "";

const personIssueLabels = (readiness: PersonSchedulingReadiness) =>
  readiness.fieldRequirements.length ? readiness.fieldRequirements.map((item) => item.label) : readiness.capabilityNotes;

const personSectionNeedsAttention = (readiness: PersonSchedulingReadiness | null, section: PersonFieldSection) => {
  if (!readiness) return false;
  if (readiness.fieldRequirements.some((item) => item.section === section)) return true;
  if (section === "specialty" && readiness.capabilityNotes.includes("专项能力")) return true;
  if (section === "ownership" && readiness.capabilityNotes.includes("长期归属")) return true;
  return false;
};

function CompactChipList({
  items,
  emptyText,
  chipClassName = "chip neutral-chip",
  emptyClassName = "chip warning-chip",
  limit = 2
}: {
  items: string[];
  emptyText: string;
  chipClassName?: string;
  emptyClassName?: string;
  limit?: number;
}) {
  const hasItems = items.length > 0;
  const visibleItems = (hasItems ? items : [emptyText]).slice(0, limit);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);
  const title = hasItems ? items.join(" / ") : emptyText;
  return (
    <div className="chips compact-chips" title={title}>
      {visibleItems.map((item) => (
        <span className={hasItems ? chipClassName : emptyClassName} key={item}>{item}</span>
      ))}
      {hiddenCount ? <span className="chip overflow-chip">+{hiddenCount}</span> : null}
    </div>
  );
}

function PeopleHandlingDrawer({
  open,
  person,
  readiness,
  validationMessage,
  onClose,
  onSave,
  onSaveAndValidate,
  onUpdate,
  onUpdatePool
}: {
  open: boolean;
  person: Person | null;
  readiness: PersonSchedulingReadiness | null;
  validationMessage: string;
  onClose: () => void;
  onSave: () => void;
  onSaveAndValidate: () => void;
  onUpdate: (patch: Partial<Person>) => void;
  onUpdatePool: (mode: AssigneePoolMode, selected: boolean) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !person || !readiness) return null;
  const issueLabels = personIssueLabels(readiness);
  const statusClass = personStatusChipClass(readiness.status);
  const needsBasic = personSectionNeedsAttention(readiness, "basic");
  const needsAssignment =
    personSectionNeedsAttention(readiness, "schedule") ||
    personSectionNeedsAttention(readiness, "responsibility") ||
    personSectionNeedsAttention(readiness, "specialty");
  const needsOwnership = personSectionNeedsAttention(readiness, "ownership");
  const needsCapacity = personSectionNeedsAttention(readiness, "capacity");

  return (
    <div className="people-drawer-layer">
      <button className="people-drawer-backdrop" aria-label="关闭人员维护抽屉" onClick={onClose} type="button" />
      <aside className="people-handling-drawer" aria-label={`正在维护：${person.name || "未命名人员"}`} aria-modal="true" role="dialog">
        <header className="people-drawer-header">
          <div>
            <span>人员维护 · {readiness.participationLabel}</span>
            <h2>{person.name || "未命名人员"}</h2>
            <p>{person.dept || "部门待补"} · {person.baseCity || "城市待补"}</p>
          </div>
          <div className="inline-actions">
            <button className="button primary" onClick={onSaveAndValidate} type="button">保存并校验</button>
            <button className="button" onClick={onSave} type="button">保存</button>
            <button className="button" onClick={onClose} type="button">收起</button>
          </div>
        </header>
        <div className="people-drawer-summary">
          <span className={`chip ${statusClass}`}>{readiness.statusLabel}</span>
          <span className="chip">可匹配 {readiness.matchableProjectCount} 个项目</span>
          <span className="chip">年度现场容量 {person.annualOnsiteWeekCapacity ?? "待补"} 周</span>
        </div>
        {validationMessage ? <div className="action-message success">{validationMessage}</div> : null}
        <div className="people-drawer-body">
          {issueLabels.length ? (
            <div className="requirement-guide">
              <div>
                <strong>待补项</strong>
                <p>{readiness.fieldRequirements[0]?.reason ?? "补充专项能力或长期归属后，排期可优先匹配合适人员。"}</p>
              </div>
              <CompactChipList items={issueLabels} emptyText="已具备" chipClassName={readiness.fieldRequirements.length ? "chip danger-chip" : "chip warning-chip"} limit={4} />
            </div>
          ) : (
            <div className="requirement-guide success">
              <div>
                <strong>人员字段完整</strong>
                <p>已具备参与分派所需的人员池、职责、专项能力、长期归属和产能信息。</p>
              </div>
            </div>
          )}

          <details className={`policy-editor-section ${needsAssignment ? "active-requirement-section" : ""}`} open={needsAssignment || !issueLabels.length}>
            <summary className="policy-editor-heading"><span>分派条件</span><strong>人员池、制度职责、专项能力</strong></summary>
            <div className="drawer-field-group">
              <div>
                <h3>人员池</h3>
                <div className="check-chip-grid">
                  {poolOrder.map((mode) => {
                    const selected = person.pool.includes(mode);
                    return (
                      <label className="check-line compact" key={mode} title={poolDescriptions[mode]}>
                        <input type="checkbox" checked={selected} onChange={(event) => onUpdatePool(mode, event.target.checked)} />
                        {poolLabels[mode]}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3>制度职责</h3>
                <div className="check-chip-grid">
                  {Object.entries(personResponsibilityLabels).map(([role, label]) => {
                    const selected = person.responsibilityRoles?.includes(role) ?? false;
                    return (
                      <label className="check-line compact" key={role}>
                        <input type="checkbox" checked={selected} onChange={(event) => {
                          const current = person.responsibilityRoles ?? [];
                          onUpdate({ responsibilityRoles: event.target.checked ? [...current, role] : current.filter((item) => item !== role) });
                        }} />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3>专项能力</h3>
                <div className="check-chip-grid">
                  {personSpecialtyOptions.map((tag) => {
                    const selected = person.specialTags.includes(tag);
                    return (
                      <label className="check-line compact" key={tag}>
                        <input type="checkbox" checked={selected} onChange={(event) => onUpdate({ specialTags: event.target.checked ? [...person.specialTags, tag] : person.specialTags.filter((item) => item !== tag) })} />
                        {tag}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>

          <details className={`policy-editor-section ${needsOwnership ? "active-requirement-section" : ""}`} open={needsOwnership}>
            <summary className="policy-editor-heading"><span>长期归属</span><strong>维护匹配优先使用</strong></summary>
            <div className="form-grid">
              <label>长期负责项目编号<input className="search" value={person.longTermProjectIds.join(",")} onChange={(event) => onUpdate({ longTermProjectIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
              <label>长期负责集团编号<input className="search" value={person.longTermGroupIds.join(",")} onChange={(event) => onUpdate({ longTermGroupIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
            </div>
          </details>

          <details className={`policy-editor-section ${needsCapacity ? "active-requirement-section" : ""}`} open={needsCapacity}>
            <summary className="policy-editor-heading"><span>产能与不可用</span><strong>容量、月度上限和不可用月份</strong></summary>
            <div className="form-grid">
              <label>年度现场容量<input className="search" type="number" value={person.annualOnsiteWeekCapacity ?? 44} onChange={(event) => onUpdate({ annualOnsiteWeekCapacity: Number(event.target.value) })} /></label>
              <label>月度现场上限<input className="search" type="number" value={person.monthlyOnsiteLimit ?? 4} onChange={(event) => onUpdate({ monthlyOnsiteLimit: Number(event.target.value) })} /></label>
              <label>非现场任务容量<input className="search" type="number" value={person.offsiteTaskCapacity ?? 36} onChange={(event) => onUpdate({ offsiteTaskCapacity: Number(event.target.value) })} /></label>
              <label>不可用月份<input className="search" value={(person.unavailableMonths ?? []).join(",")} onChange={(event) => onUpdate({ unavailableMonths: parseNumberList(event.target.value) })} /></label>
            </div>
          </details>

          <details className={`policy-editor-section ${needsBasic ? "active-requirement-section" : ""}`} open={needsBasic}>
            <summary className="policy-editor-heading"><span>基础信息</span><strong>人员身份与生效状态</strong></summary>
            <div className="form-grid">
              <label>姓名<input className="search" value={person.name} onChange={(event) => onUpdate({ name: event.target.value })} /></label>
              <label>城市<input className="search" value={person.baseCity} onChange={(event) => onUpdate({ baseCity: event.target.value })} /></label>
              <label>部门<input className="search" value={person.dept} onChange={(event) => onUpdate({ dept: event.target.value })} /></label>
              <label>生效日<input className="search" type="date" value={person.activeFrom ?? ""} onChange={(event) => onUpdate({ activeFrom: event.target.value || null })} /></label>
              <label>失效日<input className="search" type="date" value={person.activeTo ?? ""} onChange={(event) => onUpdate({ activeTo: event.target.value || null })} /></label>
              <label className="check-line"><input type="checkbox" checked={person.isActive} onChange={(event) => onUpdate({ isActive: event.target.checked })} />有效人员</label>
            </div>
          </details>
        </div>
      </aside>
    </div>
  );
}

function PeopleInputView({
  planning,
  people,
  projects,
  tagLibrary,
  routeState,
  request
}: {
  planning: PlanningYearWorkspace;
  people: Person[];
  projects: Project[];
  tagLibrary: TagDefinition[];
  routeState: RouteState;
  request: WorkspaceRequest;
}) {
  const [poolFilter, setPoolFilter] = useState<PersonPoolFilter>(planning.rosterVersion.poolMode);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PersonReadinessFilter>("all");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isPeopleDrawerOpen, setIsPeopleDrawerOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const tableSectionRef = useRef<HTMLElement | null>(null);
  const readinessByPerson = useMemo(
    () => new Map(people.map((person) => [person.id, personSchedulingReadiness(person, projects, poolFilter, planning.year)])),
    [people, projects, poolFilter, planning.year]
  );
  const peopleInPool = people.filter((person) => poolFilter === "all" || person.pool.includes(poolFilter));
  const readyPeople = peopleInPool.filter((person) => readinessByPerson.get(person.id)?.status === "ready");
  const inactivePeople = peopleInPool.filter((person) => readinessByPerson.get(person.id)?.status === "inactive");
  const missingFieldPeople = peopleInPool.filter((person) => readinessByPerson.get(person.id)?.status === "missing_fields");
  const capabilityPeople = peopleInPool.filter((person) => readinessByPerson.get(person.id)?.status === "needs_capability");
  const rows = useMemo(
    () =>
      people
        .filter((person) => (poolFilter === "all" ? true : person.pool.includes(poolFilter)))
        .filter((person) => (query ? `${person.name}${person.dept}${person.baseCity}${responsibilityRoleNames(person).join("")}${person.specialTags.join("")}`.includes(query) : true))
        .filter((person) => (statusFilter === "all" ? true : readinessByPerson.get(person.id)?.status === statusFilter))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [people, poolFilter, query, statusFilter, readinessByPerson]
  );
  const updateDraft = (patch: Partial<Person>) => {
    if (!selectedPerson) return;
    setSelectedPerson(syncPersonTags({ ...selectedPerson, ...patch }, tagLibrary));
  };
  const saveDraft = async () => {
    if (!selectedPerson) return;
    await request(`/people/${selectedPerson.id}`, { method: "PATCH", body: JSON.stringify(selectedPerson) });
    setIsPeopleDrawerOpen(false);
    setSelectedPerson(null);
  };
  const saveDraftAndValidate = async () => {
    if (!selectedPerson) return;
    const saved = await request<Person>(`/people/${selectedPerson.id}`, { method: "PATCH", body: JSON.stringify(selectedPerson) });
    const readiness = personSchedulingReadiness(saved, projects, poolFilter, planning.year);
    setSelectedPerson(saved);
    setIsPeopleDrawerOpen(true);
    if (readiness.fieldRequirements.length) {
      setValidationMessage(`已保存。仍需补充：${readiness.missingFields.join("、")}`);
    } else if (readiness.status === "needs_capability") {
      setValidationMessage(`已保存。建议继续完善：${readiness.capabilityNotes.join("、")}`);
    } else if (!readiness.inSelectedPool) {
      setValidationMessage("已保存。该人员不在当前人员池。");
    } else if (!readiness.activeForYear) {
      setValidationMessage("已保存。该人员未在本年度生效，暂不参与排期。");
    } else {
      setValidationMessage("人员字段完整，可排期。");
    }
  };
  const addPerson = async () => {
    const person = await request<Person>("/people", { method: "POST", body: JSON.stringify({ name: "新增人员" }) });
    setSelectedPerson(person);
    setIsPeopleDrawerOpen(true);
    setValidationMessage("请补充人员基础信息、人员池、制度职责和产能字段。");
  };
  const confirmRoster = async () => {
    await request(`/planning-years/${planning.year}/people/versions/confirm`, { method: "POST" });
  };
  const statusOptions: Array<{ value: PersonReadinessFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "ready", label: "可排期" },
    { value: "missing_fields", label: "字段待补" },
    { value: "needs_capability", label: "待完善" },
    { value: "inactive", label: "未生效" }
  ];
  const poolOptions: Array<{ value: PersonPoolFilter; label: string }> = [
    { value: "all", label: "全部人员池" },
    ...poolOrder.map((mode) => ({ value: mode, label: poolLabels[mode] }))
  ];
  const overviewStats: Array<{
    label: string;
    value: number | string;
    tone: "" | "good" | "bad" | "warn";
    filter: PersonReadinessFilter;
    helperText: string;
    context?: boolean;
  }> = [
    { label: "可排期", value: readyPeople.length, tone: "good", filter: "ready", helperText: "筛选字段完整且可排期的人员" },
    { label: "待完善", value: capabilityPeople.length, tone: capabilityPeople.length ? "warn" : "good", filter: "needs_capability", helperText: "筛选需要完善专项能力或长期归属的人员" },
    { label: "字段待补", value: missingFieldPeople.length, tone: missingFieldPeople.length ? "bad" : "good", filter: "missing_fields", helperText: "筛选缺少排期必要字段的人员" },
    { label: "停用/未生效", value: inactivePeople.length, tone: inactivePeople.length ? "warn" : "good", filter: "inactive", helperText: "筛选本年度不可用人员" },
    { label: "当前人员池", value: poolFilter === "all" ? "全部人员池" : poolLabels[poolFilter], tone: "", filter: "all", helperText: "查看当前人员池下全部人员", context: true }
  ];
  const handleOverviewCardClick = (filter: PersonReadinessFilter) => {
    setQuery("");
    setStatusFilter(filter);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", viewHref("peopleInput", { personStatus: filter, section: "peopleTable" }));
    }
    scrollToSectionElement(tableSectionRef.current);
  };
  const selectedReadiness = selectedPerson ? personSchedulingReadiness(selectedPerson, projects, poolFilter, planning.year) : null;
  const updateDraftPool = (mode: AssigneePoolMode, selected: boolean) => {
    if (!selectedPerson) return;
    const nextPool = selected ? [...new Set([...selectedPerson.pool, mode])] : selectedPerson.pool.filter((item) => item !== mode);
    updateDraft({ pool: nextPool });
  };
  const openPersonEditor = (person: Person) => {
    setSelectedPerson(person);
    setIsPeopleDrawerOpen(true);
    setValidationMessage("");
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", viewHref("peopleInput", { person: person.id, personStatus: statusFilter, section: "peopleTable" }));
    }
  };
  useEffect(() => {
    if (routeState.personStatus) {
      setQuery("");
      setStatusFilter(routeState.personStatus);
    }
    if (routeState.section === "peopleTable") {
      scrollToSectionElement(tableSectionRef.current);
    }
  }, [routeState.personStatus, routeState.section]);
  useEffect(() => {
    if (!routeState.person) return;
    const person = people.find((item) => item.id === routeState.person);
    if (person) openPersonEditor(person);
  }, [routeState.person, people]);
  const assetOwnerCount = peopleInPool.filter((person) => person.responsibilityRoles?.includes("asset_management_owner")).length;
  const specialtyCount = peopleInPool.filter((person) => person.specialTags.length > 0).length;

  return (
    <div className="stack">
      <section className="panel people-readiness-panel">
        <div className="section-title">
          <div>
            <h2>人员池准备中心</h2>
            <span>先处理待完善人员，再确认人员信息</span>
          </div>
          <div className="inline-actions">
            <button className="button" type="button" onClick={addPerson}>
              <UserCog size={15} />
              新增人员
            </button>
            <button className="button primary" type="button" onClick={confirmRoster}>
              <ShieldCheck size={15} />
              确认人员信息
            </button>
          </div>
        </div>
        <div className="people-metrics">
          {overviewStats.map(({ label, value, tone, filter, helperText, context }) => (
            <MetricAction
              active={statusFilter === filter}
              className={`people-metric ${context ? "context-metric" : ""}`}
              href={viewHref("peopleInput", { personStatus: filter, section: "peopleTable" })}
              key={label}
              label={label}
              onClick={(event) => {
                event.preventDefault();
                handleOverviewCardClick(filter);
              }}
              tone={tone}
              title={helperText}
              value={value}
            />
          ))}
        </div>
        <div className="people-summary-strip">
          <span>共 {peopleInPool.length} 人</span>
          <span>资产主责 {assetOwnerCount} 人</span>
          <span>专项能力 {specialtyCount} 人</span>
          <span>{missingFieldPeople.length ? `字段待补 ${missingFieldPeople.length} 人` : "字段完整"}</span>
        </div>
      </section>

      <section className="panel people-list-panel" ref={tableSectionRef}>
        <div className="section-title">
          <div>
            <h2>人员列表</h2>
            <span>{rows.length} 名人员 · 当前筛选 {statusOptions.find((item) => item.value === statusFilter)?.label}</span>
          </div>
          <ListFilter size={18} color="#0f7578" />
        </div>
        <div className="filters">
          <label><Search size={14} /></label>
          <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、部门或城市" />
          <select className="select" value={poolFilter} onChange={(event) => setPoolFilter(event.target.value as PersonPoolFilter)}>
            {poolOptions.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PersonReadinessFilter)}>
            {statusOptions.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table className="people-table">
            <thead>
              <tr>
                <th>人员</th>
                <th>排期状态</th>
                <th>分派条件</th>
                <th>关系匹配</th>
                <th>产能</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => {
                const readiness = readinessByPerson.get(person.id) ?? personSchedulingReadiness(person, projects, poolFilter, planning.year);
                const statusClass = personStatusChipClass(readiness.status);
                const actionLabel = readiness.status === "missing_fields" ? "补充信息" : "编辑";
                const roleNames = responsibilityRoleNames(person);
                const issueLabels = personIssueLabels(readiness);
                return (
                  <tr key={person.id}>
                    <td>
                      <div className="project-name">{person.name || "未命名人员"}</div>
                      <div className="muted">{person.dept || "部门待补"} · {person.baseCity || "城市待补"}</div>
                    </td>
                    <td>
                      <span className={`chip ${statusClass}`}>{readiness.statusLabel}</span>
                      {issueLabels.length ? <CompactChipList items={issueLabels} emptyText="已具备" chipClassName={readiness.fieldRequirements.length ? "chip danger-chip" : "chip warning-chip"} limit={2} /> : null}
                    </td>
                    <td>
                      <div className="people-condition-stack">
                        <div><span>人员池</span><CompactChipList items={person.pool.map((mode) => poolLabels[mode])} emptyText="人员池待维护" chipClassName="chip neutral-chip" emptyClassName="chip danger-chip" /></div>
                        <div><span>职责</span><CompactChipList items={roleNames} emptyText="职责待维护" chipClassName="chip neutral-chip" emptyClassName="chip danger-chip" /></div>
                        <div><span>专项</span><CompactChipList items={person.specialTags} emptyText="待完善" chipClassName="chip neutral-chip" emptyClassName="chip warning-chip" /></div>
                      </div>
                    </td>
                    <td>
                      <div className="project-name">可匹配 {readiness.matchableProjectCount} 个项目</div>
                      <div className="muted">长期项目 {person.longTermProjectIds.length} / 长期集团 {person.longTermGroupIds.length}</div>
                    </td>
                    <td>
                      <div className="people-capacity-cell">
                        <strong>现场 {person.annualOnsiteWeekCapacity ?? "待补"} 周/年</strong>
                        <span>月上限 {person.monthlyOnsiteLimit ?? "待补"} · 非现场 {person.offsiteTaskCapacity ?? "待补"}</span>
                        <span>{readiness.availabilityLabel}</span>
                      </div>
                    </td>
                    <td><button className="button" type="button" onClick={() => openPersonEditor(person)}>{actionLabel}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <PeopleHandlingDrawer
        open={isPeopleDrawerOpen}
        person={selectedPerson}
        readiness={selectedReadiness}
        validationMessage={validationMessage}
        onClose={() => setIsPeopleDrawerOpen(false)}
        onSave={() => void saveDraft()}
        onSaveAndValidate={() => void saveDraftAndValidate()}
        onUpdate={updateDraft}
        onUpdatePool={updateDraftPool}
      />
    </div>
  );
}

function RulesInputView({
  planning,
  run,
  orders,
  evidence,
  ruleRegistry,
  ruleRegistryGroups,
  tagLibrary,
  systemMap,
  tagTaxonomy,
  ruleDrafts,
  latestRuleSimulation,
  latestRuleSuggestionBatch,
  tagCoverage,
  issueBoard,
  projects,
  people,
  routeState,
  request
}: {
  planning: PlanningYearWorkspace;
  run: SchedulingRun;
  orders: BusinessRuleOrder[];
  evidence: RuleEvidence[];
  ruleRegistry: RuleRegistryItem[];
  ruleRegistryGroups: RuleRegistryGroup[];
  tagLibrary: TagDefinition[];
  systemMap: RuleSystemMap;
  tagTaxonomy: TagTaxonomyNode[];
  ruleDrafts: RuleDecisionDraft[];
  latestRuleSimulation: RuleSimulationResult | null;
  latestRuleSuggestionBatch: RuleSuggestionBatch | null;
  tagCoverage: TagCoverageSummary;
  issueBoard: IssueBoard;
  projects: Project[];
  people: Person[];
  routeState: RouteState;
  request: WorkspaceRequest;
}) {
  const rules = run.audit.ruleHitDistribution;
  const rows = Object.entries(rules).sort(([a], [b]) => a.localeCompare(b));
  const currentRuleIssueIds = new Set(issueBoard.issues.filter((issue) => issue.kind === "rule_gap" && issue.technicalRuleId).map((issue) => issue.technicalRuleId!));
  const currentPendingDecisions = systemMap.pendingDecisions.filter((decision) => currentRuleIssueIds.has(decision.technicalRuleId));
  const currentProjectDataIssues = issueBoard.issues.filter((issue) => issue.kind === "project_data_gap");
  const currentManualIssues = issueBoard.issues.filter((issue) => issue.kind === "manual_confirm");
  const currentConflictIssues = issueBoard.issues.filter((issue) => issue.kind === "time_conflict" || issue.kind === "hint");
  const [layer, setLayer] = useState<"business" | "evidence" | "tags" | "system">("business");
  const [selectedPending, setSelectedPending] = useState<PendingRuleDecision | null>(currentPendingDecisions[0] ?? null);
  const [highlightEvidenceIds, setHighlightEvidenceIds] = useState<string[]>([]);
  const [activeRulePanel, setActiveRulePanel] = useState<RuleActionPanelMode | null>(null);
  const [isRuleDrawerOpen, setIsRuleDrawerOpen] = useState(false);
  const [impact, setImpact] = useState<RuleImpactResponse | null>(null);
  const [draftEditor, setDraftEditor] = useState<RuleDecisionDraft | null>(null);
  const [simulation, setSimulation] = useState<RuleSimulationResult | null>(latestRuleSimulation);
  const [suggestionBatch, setSuggestionBatch] = useState<RuleSuggestionBatch | null>(latestRuleSuggestionBatch);
  const [submitResult, setSubmitResult] = useState<RuleSubmitResult | null>(null);
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "warn" | "error"; text: string } | null>(null);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const routeAppliedKey = useRef("");
  const nonRuleIssuesRef = useRef<HTMLDivElement | null>(null);
  const ruleIssuesRef = useRef<HTMLDivElement | null>(null);
  const registryRef = useRef<HTMLDetailsElement | null>(null);
  const coverageRef = useRef<HTMLDetailsElement | null>(null);
  const impactedCount = (item: BusinessRuleItem) => rules[item.technicalRuleId] ?? 0;
  const draftByRule = useMemo(() => new Map(ruleDrafts.map((draft) => [draft.technicalRuleId, draft])), [ruleDrafts]);
  const suggestionByRule = useMemo(
    () => new Map((suggestionBatch?.ruleSuggestions ?? []).map((suggestion) => [suggestion.technicalRuleId, suggestion])),
    [suggestionBatch]
  );

  useEffect(() => {
    if (!currentPendingDecisions.length) {
      if (!routeState.rule) setSelectedPending(null);
      return;
    }
    if (selectedPending && currentRuleIssueIds.has(selectedPending.technicalRuleId)) return;
    setSelectedPending(currentPendingDecisions[0] ?? null);
  }, [currentPendingDecisions, currentRuleIssueIds, routeState.rule, selectedPending?.technicalRuleId]);

  useEffect(() => {
    setSimulation(latestRuleSimulation);
  }, [latestRuleSimulation]);

  useEffect(() => {
    setSuggestionBatch(latestRuleSuggestionBatch);
  }, [latestRuleSuggestionBatch]);

  useEffect(() => {
    if (!selectedPending || activeRulePanel !== "draft") return;
    const existing = draftByRule.get(selectedPending.technicalRuleId);
    if (!existing) return;
    setDraftEditor((current) => {
      if (!current || current.technicalRuleId !== existing.technicalRuleId) return existing;
      if (current.updatedAt === existing.updatedAt && current.status === existing.status) return current;
      return existing;
    });
  }, [activeRulePanel, draftByRule, selectedPending?.technicalRuleId]);

  useEffect(() => {
    if (!selectedPending) {
      setImpact(null);
      return;
    }
    let cancelled = false;
    request<RuleImpactResponse>(`/rules/${selectedPending.technicalRuleId}/impact`)
      .then((result) => {
        if (!cancelled) setImpact(result);
      })
      .catch(() => {
        if (!cancelled) setImpact(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPending?.technicalRuleId]);

  const ensureSelected = () => {
    if (!selectedPending) throw new Error("请先选择一个待补口径工单");
    return selectedPending;
  };

  const openEvidence = (decision: PendingRuleDecision) => {
    setSelectedPending(decision);
    setHighlightEvidenceIds(decision.evidenceRefs);
    setLayer("evidence");
    setActiveRulePanel("evidence");
    setIsRuleDrawerOpen(true);
    setActionMessage({ tone: "success", text: `已定位到 ${decision.title} 的制度依据` });
  };

  const openImpact = async (decision: PendingRuleDecision) => {
    setSelectedPending(decision);
    const result = await request<RuleImpactResponse>(`/rules/${decision.technicalRuleId}/impact`);
    setImpact(result);
    setActiveRulePanel("impact");
    setIsRuleDrawerOpen(true);
    setActionMessage({ tone: "success", text: `已打开 ${decision.title} 的影响分析` });
  };

  const openDraft = (decision: PendingRuleDecision) => {
    setSelectedPending(decision);
    const existing = draftByRule.get(decision.technicalRuleId);
    setDraftEditor(existing ?? createDefaultDraft(decision));
    setActiveRulePanel("draft");
    setIsRuleDrawerOpen(true);
    setActionMessage({ tone: "warn", text: "请先确认或补充口径。试算不会影响正式排期，确认纳入后才会刷新候选方案。" });
  };

  const saveDraft = async (draft: RuleDecisionDraft, successText = "口径草稿已保存，可进行试算") => {
    const decision = ensureSelected();
    const saved = await request<RuleDecisionDraft>(`/rules/pending-decisions/${decision.id}/draft`, {
      method: "PATCH",
      body: JSON.stringify(draft)
    });
    setDraftEditor(saved);
    setActionMessage({ tone: "success", text: successText });
    return saved;
  };

  const generateSuggestions = async () => {
    setGeneratingSuggestions(true);
    try {
      const batch = await request<RuleSuggestionBatch>("/rules/suggestions/generate", {
        method: "POST",
        body: JSON.stringify({ scope: "current_run", apply: true })
      });
      setSuggestionBatch(batch);
      setActionMessage({
        tone: batch.summary.generatedDrafts ? "success" : "warn",
        text: `已生成 ${batch.summary.generatedDrafts} 条规则草稿建议、${batch.summary.manualSuggestions} 条人工确认建议`
      });
      const first = batch.ruleSuggestions[0];
      if (first) {
        const decision = currentPendingDecisions.find((item) => item.technicalRuleId === first.technicalRuleId)
          ?? systemMap.pendingDecisions.find((item) => item.technicalRuleId === first.technicalRuleId);
        if (decision) {
          setSelectedPending(decision);
          setDraftEditor({
            ...createDefaultDraft(decision),
            id: first.draftId,
            onsite: first.onsite,
            offsite: first.offsite,
            businessNote: first.businessNote,
            confirmerNote: first.confirmerNote,
            suggestionMeta: {
              batchId: batch.id,
              source: "system_template",
              confidence: first.confidence,
              reviewStatus: "needs_review",
              generatedAt: batch.createdAt
            }
          });
          setActiveRulePanel("draft");
          setIsRuleDrawerOpen(true);
        }
      }
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? readableApiError(error.message) : "生成补充建议失败" });
    } finally {
      setGeneratingSuggestions(false);
    }
  };

  const simulateDraft = async (decision = selectedPending) => {
    if (!decision) return;
    try {
      await runSimulation(decision, "试算已完成，可查看发布前问题变化");
    } catch (error) {
      setSelectedPending(decision);
      setActiveRulePanel("draft");
      setIsRuleDrawerOpen(true);
      setDraftEditor(draftByRule.get(decision.technicalRuleId) ?? createDefaultDraft(decision));
      setActionMessage({ tone: "error", text: error instanceof Error ? readableApiError(error.message) : "试算失败" });
    }
  };

  const runSimulation = async (decision: PendingRuleDecision, successText: string) => {
    const result = await request<RuleSimulationResult>(`/rules/pending-decisions/${decision.id}/what-if`, { method: "POST" });
    setSelectedPending(decision);
    setSimulation(result);
    setActiveRulePanel("simulation");
    setIsRuleDrawerOpen(true);
    setActionMessage({ tone: "success", text: successText });
    return result;
  };

  const saveAndSimulateDraft = async () => {
    if (!draftEditor || !selectedPending) return;
    try {
      await saveDraft(draftEditor, "口径草稿已保存，正在试算对排期的影响");
      const result = await request<RuleSimulationResult>(`/rules/pending-decisions/${selectedPending.id}/what-if`, { method: "POST" });
      setSimulation(result);
      setActiveRulePanel("draft");
      setIsRuleDrawerOpen(true);
      setActionMessage({ tone: "success", text: "试算已完成，请确认影响后再纳入正式排期规则" });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? readableApiError(error.message) : "试算影响失败" });
    }
  };

  const acceptSuggestionAndSimulate = async () => {
    if (!draftEditor?.suggestionMeta) return;
    const accepted: RuleDecisionDraft = {
      ...draftEditor,
      suggestionMeta: { ...draftEditor.suggestionMeta, reviewStatus: "accepted" }
    };
    await saveDraft(accepted, "已采纳补充建议，正在进行试算");
    if (selectedPending) {
      const result = await request<RuleSimulationResult>(`/rules/pending-decisions/${selectedPending.id}/what-if`, { method: "POST" });
      setSimulation(result);
      setActiveRulePanel("draft");
      setIsRuleDrawerOpen(true);
      setActionMessage({ tone: "success", text: "已使用系统建议并完成试算，请确认影响后再纳入正式排期规则" });
    }
  };

  const submitDraft = async (decision = selectedPending) => {
    if (!decision) return;
    try {
      if (draftEditor?.technicalRuleId === decision.technicalRuleId) {
        await saveDraft(draftEditor, "口径已保存，正在纳入正式排期规则");
      }
      const result = await request<RuleSubmitResult>(`/rules/pending-decisions/${decision.id}/submit`, { method: "POST" });
      setSelectedPending(decision);
      setSubmitResult(result);
      setDraftEditor(result.draft);
      setSimulation(result.simulation);
      setActiveRulePanel("submit");
      setIsRuleDrawerOpen(true);
      setActionMessage({
        tone: result.publishable ? "success" : "warn",
        text: result.publishable ? "已纳入正式排期规则，当前规则闸门已通过" : `已纳入正式排期规则，但仍有 ${result.blockers.length} 项待处理`
      });
    } catch (error) {
      setSelectedPending(decision);
      setActiveRulePanel("draft");
      setIsRuleDrawerOpen(true);
      setDraftEditor(draftByRule.get(decision.technicalRuleId) ?? createDefaultDraft(decision));
      setActionMessage({ tone: "error", text: error instanceof Error ? readableApiError(error.message) : "纳入正式排期规则失败" });
    }
  };

  useEffect(() => {
    if (!routeState.rule) {
      routeAppliedKey.current = "";
      return;
    }
    const target = currentPendingDecisions.find((decision) => decision.technicalRuleId === routeState.rule || decision.id === routeState.rule)
      ?? systemMap.pendingDecisions.find((decision) => decision.technicalRuleId === routeState.rule || decision.id === routeState.rule);
    if (!target) return;
    const panel = routeState.panel ?? "draft";
    const routeKey = `${target.id}:${panel}`;
    if (routeAppliedKey.current === routeKey) return;
    routeAppliedKey.current = routeKey;
    if (panel === "evidence") {
      openEvidence(target);
      return;
    }
    if (panel === "impact") {
      void openImpact(target);
      return;
    }
    if (panel === "simulation") {
      setSelectedPending(target);
      setActiveRulePanel("simulation");
      setIsRuleDrawerOpen(true);
      setActionMessage({ tone: "success", text: `已定位到 ${target.title} 的试算结果区` });
      return;
    }
    openDraft(target);
  }, [routeState.rule, routeState.panel, currentPendingDecisions, systemMap.pendingDecisions]);

  const scrollRulesSection = (section: string) => {
    if (section === "ruleCoverage") setLayer("system");
    const target =
      section === "ruleIssues"
        ? ruleIssuesRef.current
        : section === "ruleCoverage"
          ? coverageRef.current
          : section === "ruleRegistry"
            ? registryRef.current
            : nonRuleIssuesRef.current;
    scrollToSectionElement(target);
  };

  const navigateRulesSection = (section: string) => {
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", viewHref("rulesInput", { section }));
    }
    scrollRulesSection(section);
  };

  useEffect(() => {
    if (!routeState.section) return;
    scrollRulesSection(routeState.section);
  }, [routeState.section]);

  const unpassedGates = planning.readiness.filter((gate) => !gate.passed).map((gate) => gate.label);
  const ruleDiagnosis = run.audit.ruleGap
    ? `${run.audit.ruleGap} 个规则阻断需要补充口径`
    : run.audit.hardConflicts
      ? `${run.audit.hardConflicts} 个硬冲突需要处理`
      : unpassedGates.length
        ? `规则侧已通过，当前不可发布来自${unpassedGates.join("、")}`
        : run.audit.pendingManual
          ? "规则侧已通过，发布前仍有待人工确认"
          : "规则侧已通过，可进入正式发布";

  return (
    <div className="stack">
      <section className="panel rule-command-bar">
        <div className="section-title compact-title">
          <div>
            <h2>当前发布诊断</h2>
            <span>{ruleDiagnosis}</span>
          </div>
          <GateBadge gate={planning.readiness[2]!} />
        </div>
        <div className="audit-grid compact-grid padded">
          <MetricAction href={viewHref("rulesInput", { section: "ruleIssues" })} label="规则阻断" onClick={(event) => { event.preventDefault(); navigateRulesSection("ruleIssues"); }} tone={issueBoard.summary.rule_gap ? "bad" : "good"} value={issueBoard.summary.rule_gap} />
          <MetricAction href={viewHref("rulesInput", { section: "projectData" })} label="待补数据" onClick={(event) => { event.preventDefault(); navigateRulesSection("projectData"); }} tone={issueBoard.summary.project_data_gap ? "bad" : "good"} value={issueBoard.summary.project_data_gap} />
          <MetricAction href={viewHref("rulesInput", { section: "manualConfirm" })} label="待人工" onClick={(event) => { event.preventDefault(); navigateRulesSection("manualConfirm"); }} tone={issueBoard.summary.manual_confirm ? "warn" : "good"} value={issueBoard.summary.manual_confirm} />
          <MetricAction href={viewHref("rulesInput", { section: "timeConflict" })} label="硬冲突" onClick={(event) => { event.preventDefault(); navigateRulesSection("timeConflict"); }} tone={issueBoard.summary.time_conflict ? "bad" : "good"} value={issueBoard.summary.time_conflict} />
          <MetricAction href={viewHref("rulesInput", { section: "ruleCoverage" })} label="规则库覆盖率" onClick={(event) => { event.preventDefault(); navigateRulesSection("ruleCoverage"); }} tone="good" value={`${planning.ruleReport.coverageRate}%`} />
        </div>
        <details className="inline-disclosure">
          <summary>{planning.ruleReport.issues.length ? `待处理说明 ${planning.ruleReport.issues.length}` : "无待处理说明"}</summary>
          <IssueList issues={planning.ruleReport.issues} />
        </details>
      </section>

      <div ref={nonRuleIssuesRef}>
        <CurrentIssueBoardPanel issues={[...currentProjectDataIssues, ...currentManualIssues, ...currentConflictIssues]} />
      </div>

      <div ref={ruleIssuesRef}>
        <PendingDecisionBoard
          decisions={currentPendingDecisions}
          selected={selectedPending}
          evidence={evidence}
          tagLibrary={tagLibrary}
          draftByRule={draftByRule}
          suggestionBatch={suggestionBatch}
          generatingSuggestions={generatingSuggestions}
          actionMessage={actionMessage}
          onGenerateSuggestions={() => void generateSuggestions()}
          onSelect={setSelectedPending}
          onOpenDraft={openDraft}
        />
      </div>

      <details className="context-panel" open={routeState.section === "ruleRegistry" ? true : undefined} ref={registryRef}>
        <summary>制度规则库观察区</summary>
        <RuleRegistryBoard
          registry={ruleRegistry}
          groups={ruleRegistryGroups}
          draftByRule={draftByRule}
          onSelect={(technicalRuleId) => {
            const decision = systemMap.pendingDecisions.find((item) => item.technicalRuleId === technicalRuleId);
            if (decision) {
              setSelectedPending(decision);
              if (draftByRule.get(technicalRuleId)?.status !== "submitted") openDraft(decision);
            }
          }}
        />
      </details>

      <RuleHandlingDrawer
        open={isRuleDrawerOpen}
        active={activeRulePanel}
        selected={selectedPending}
        draft={draftEditor}
        actionMessage={actionMessage}
        onClose={() => setIsRuleDrawerOpen(false)}
      >
        <RuleActionPanel
          active={activeRulePanel}
          selected={selectedPending}
          impact={impact}
          draft={draftEditor}
          simulation={simulation}
          submitResult={submitResult}
          suggestion={selectedPending ? suggestionByRule.get(selectedPending.technicalRuleId) ?? null : null}
          tagLibrary={tagLibrary}
          evidenceEntries={evidence}
          onDraftChange={setDraftEditor}
          onSaveDraft={saveDraft}
          onSaveAndSimulate={saveAndSimulateDraft}
          onAcceptSuggestion={acceptSuggestionAndSimulate}
          onSubmit={async () => { await submitDraft(); }}
          onClose={() => setIsRuleDrawerOpen(false)}
        />
      </RuleHandlingDrawer>

      <details className="context-panel" open={routeState.section === "ruleCoverage" ? true : undefined} ref={coverageRef}>
        <summary>规则地图、制度依据、标签体系和覆盖统计</summary>
        <div className="segmented rule-tabs">
          <button className={layer === "business" ? "active" : ""} onClick={() => setLayer("business")}>
            规则地图
          </button>
          <button className={layer === "evidence" ? "active" : ""} onClick={() => setLayer("evidence")}>
            制度依据
          </button>
          <button className={layer === "tags" ? "active" : ""} onClick={() => setLayer("tags")}>
            标签体系
          </button>
          <button className={layer === "system" ? "active" : ""} onClick={() => setLayer("system")}>
            覆盖统计
          </button>
        </div>

        {layer === "business" ? <BusinessRuleOrdering systemMap={systemMap} orders={orders} tagLibrary={tagLibrary} impactForRule={impactedCount} /> : null}
        {layer === "evidence" ? <EvidenceLibraryView evidence={evidence} orders={orders} impactForRule={impactedCount} highlightIds={highlightEvidenceIds} /> : null}
        {layer === "tags" ? <TagLibraryView tagLibrary={tagLibrary} taxonomy={tagTaxonomy} orders={orders} projects={projects} people={people} tagCoverage={tagCoverage} /> : null}
        {layer === "system" ? (
          <div className="rules-grid">
            <section className="inset-panel">
              <div className="section-title">
                <div>
                  <h2>规则命中统计</h2>
                  <span>按业务规则统计当前项目池命中情况</span>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>业务规则</th>
                      <th>命中数</th>
                      <th>发布影响</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([rule, count]) => {
                      const businessRule = businessRuleByTechnicalId(rule);
                      return (
                        <tr key={rule}>
                          <td>{businessRule?.businessTitle ?? (rule === "RULE_GAP" ? "待业务规则补全" : "排期约束")}</td>
                          <td>{count}</td>
                          <td>{rule.startsWith("P") || rule === "RULE_GAP" ? "阻断" : "可发布"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="inset-panel">
              <div className="section-title">
                <div>
                  <h2>规则口径示例</h2>
                  <span>用于说明制度如何转成检查安排</span>
                </div>
                <button className="button" disabled>
                  <Play size={15} />
                  试算
                </button>
              </div>
              <div className="decision-list">
                <div className="decision-item">
                  <div className="decision-head">
                    <span>外部/协同B客户，剩余敞口大于 3 亿元</span>
                    <span className="chip">可执行</span>
                  </div>
                  <p>安排每年 2 次现场检查，并保留年度非现场检查。</p>
                </div>
                <div className="decision-item">
                  <div className="decision-head">
                    <span>外部/协同B小额客户</span>
                    <span className="chip">待补口径</span>
                  </div>
                  <p>制度写明以资产管理部要求为准，正式发布前需要补充检查频次。</p>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </details>
    </div>
  );
}

const suggestionReviewLabel = {
  needs_review: "补充建议待审核",
  accepted: "已采纳建议",
  edited: "员工已编辑"
} as const;

function SuggestionBatchSummary({ batch }: { batch: RuleSuggestionBatch }) {
  const generatedText = `已生成 ${batch.summary.generatedDrafts} 条规则草稿，${batch.summary.manualSuggestions} 条仅供人工确认，${batch.summary.skipped} 条未生成。`;
  return (
    <div className="suggestion-batch" aria-live="polite">
      <div className="suggestion-batch-head">
        <div>
          <strong>一键建议生成结果</strong>
          <span>{generatedText}生成时间 {batch.createdAt.slice(0, 19).replace("T", " ")}</span>
        </div>
        <div className="chips">
          <span className="chip success-chip">自动草稿 {batch.summary.generatedDrafts}</span>
          <span className="chip warning-chip">需人工确认 {batch.summary.manualSuggestions}</span>
          <span className={batch.summary.skipped ? "chip danger-chip" : "chip"}>未生成 {batch.summary.skipped}</span>
        </div>
      </div>
      <div className="suggestion-result-sections">
        <section className="suggestion-result-section">
          <div className="suggestion-result-title">
            <span>自动生成规则草稿</span>
            <strong>{batch.ruleSuggestions.length}</strong>
            <em>需员工审核、试算后才能提交规则</em>
          </div>
          <div className="suggestion-batch-grid">
            {batch.ruleSuggestions.map((suggestion) => (
              <div className="suggestion-mini" key={suggestion.id}>
                <span>{suggestion.status === "draft_refreshed" ? "已刷新草稿" : "已生成草稿"} · {suggestion.technicalRuleId} · 置信度 {Math.round(suggestion.confidence * 100)}%</span>
                <strong>{suggestion.title}</strong>
                <p>建议：现场 {frequencyLabel(suggestion.onsite)} / 非现场 {frequencyLabel(suggestion.offsite)}。</p>
                <p>影响项目：{suggestion.affectedProjectNames.join("、") || "当前未列出项目"}。</p>
                <small>员工动作：打开对应工单，先确认口径，再试算影响，最后确认纳入正式排期规则。</small>
                <a className="button compact-button" href={viewHref("rulesInput", { rule: suggestion.technicalRuleId, panel: "draft", section: "ruleIssues" })}>
                  打开工单
                  <ChevronRight size={14} />
                </a>
              </div>
            ))}
            {!batch.ruleSuggestions.length ? <div className="empty compact">本次没有可自动生成的规则草稿。</div> : null}
          </div>
        </section>

        <section className="suggestion-result-section">
          <div className="suggestion-result-title">
            <span>仅生成处理建议</span>
            <strong>{batch.manualSuggestions.length}</strong>
            <em>不自动改负责人或日期，需到排期页确认</em>
          </div>
          <div className="suggestion-batch-grid">
            {batch.manualSuggestions.map((suggestion) => (
              <div className="suggestion-mini manual" key={suggestion.taskId}>
                <span>{suggestion.projectId} · {checkTypeText(suggestion.checkType)} · 任务 {suggestion.taskId}</span>
                <strong>{suggestion.projectName}</strong>
                <p>待确认：{suggestion.missingItems.join("、")}。</p>
                <p>{suggestion.recommendation}</p>
                <small>员工动作：到排期方案确认任务信息，并保留“发布前人工确认”原因。</small>
                <a className="button compact-button" href={viewHref("schedule", { filter: "manual", project: suggestion.projectId, task: suggestion.taskId, section: "manualQueue" })}>
                  去排期确认
                  <ChevronRight size={14} />
                </a>
              </div>
            ))}
            {!batch.manualSuggestions.length ? <div className="empty compact">本次没有需要人工确认的任务建议。</div> : null}
          </div>
        </section>

        {batch.skippedItems.length ? (
          <section className="suggestion-result-section">
            <div className="suggestion-result-title">
              <span>未生成建议</span>
              <strong>{batch.skippedItems.length}</strong>
              <em>通常因为口径冲突、已提交或员工已编辑</em>
            </div>
            <div className="suggestion-batch-grid">
              {batch.skippedItems.map((item) => (
                <div className="suggestion-mini skipped" key={`${item.technicalRuleId ?? item.projectId ?? item.title}-${item.reason}`}>
                  <span>{item.technicalRuleId ?? item.projectId ?? "未匹配对象"}</span>
                  <strong>{item.title}</strong>
                  <p>{item.reason}</p>
                  {item.technicalRuleId ? (
                    <a className="button compact-button" href={viewHref("rulesInput", { rule: item.technicalRuleId, panel: "draft", section: "ruleIssues" })}>
                      追溯工单
                      <ChevronRight size={14} />
                    </a>
                  ) : item.projectId ? (
                    <a className="button compact-button" href={viewHref("projectInput", { project: item.projectId, section: "projectTable" })}>
                      查看项目
                      <ChevronRight size={14} />
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function RuleRegistryBoard({
  registry,
  groups,
  draftByRule,
  onSelect
}: {
  registry: RuleRegistryItem[];
  groups: RuleRegistryGroup[];
  draftByRule: Map<string, RuleDecisionDraft>;
  onSelect: (technicalRuleId: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const totalPending = registry.filter((item) => item.status === "pending_action" || item.status === "pending_data" || item.status === "draft" || item.status === "simulated").length;
  const summary = {
    manual: registry.filter((item) => item.authorityType === "manual_confirmed").length,
    data: registry.filter((item) => item.status === "pending_data").length,
    effective: registry.filter((item) => item.status === "effective").length
  };
  const toggleGroup = (groupId: string, defaultExpanded: boolean) => {
    setExpandedGroups((current) => ({ ...current, [groupId]: !(current[groupId] ?? defaultExpanded) }));
  };

  return (
    <section className="panel rule-registry-panel">
      <div className="section-title">
        <div>
          <h2>整体排期规则列表</h2>
          <span>按排期主线分级查看：先看规则段落，再展开具体口径</span>
        </div>
        <div className="chips">
          <span className="chip">规则 {registry.length}</span>
          <span className={totalPending ? "chip danger-chip" : "chip success-chip"}>待处理 {totalPending}</span>
          <span className={summary.data ? "chip warning-chip" : "chip success-chip"}>待补数据 {summary.data}</span>
          <span className="chip success-chip">人工确认 {summary.manual}</span>
          <span className="chip">已生效 {summary.effective}</span>
        </div>
      </div>

      <div className="rule-registry-groups">
        {groups.map((group) => {
          const attentionCount = group.statusSummary.pendingAction + group.statusSummary.pendingData + group.statusSummary.draft + group.statusSummary.simulated;
          const defaultExpanded = attentionCount > 0;
          const expanded = expandedGroups[group.id] ?? defaultExpanded;
          const authorityLabels = Array.from(new Set(group.items.map((item) => item.authorityLabel)));
          const isSummaryGroup = group.id === "G7" && group.items.length === 0;
          return (
            <article className={`rule-registry-group ${group.primaryStatus}`} key={group.id}>
              <button
                className="rule-registry-group-head"
                onClick={() => toggleGroup(group.id, defaultExpanded)}
                type="button"
                aria-expanded={expanded}
              >
                <div className="rule-group-title">
                  <span>第 {group.order} 段</span>
                  <strong>{group.title}</strong>
                  <p>{group.description}</p>
                </div>
                <div className="rule-group-summary">
                  <span className={`registry-status group-${group.primaryStatus}`}>{ruleGroupStatusLabel[group.primaryStatus]}</span>
                  <span>{isSummaryGroup ? `汇总 ${group.statusSummary.total}` : `规则 ${group.items.length}`}</span>
                  <span>待处理 {attentionCount}</span>
                  <span>影响 {group.affectedProjectCount} 个项目</span>
                  <span>{authorityLabels.join("、") || "待补口径汇总"}</span>
                  <ChevronRight className={expanded ? "chevron open" : "chevron"} size={18} />
                </div>
              </button>

              {expanded ? (
                <div className="rule-registry-group-body">
                  {isSummaryGroup ? (
                    <div className="rule-registry-summary-note">
                      <strong>待补口径汇总</strong>
                      <p>这些事项已在对应业务主线中标记为待处理；下方“待处理事项”会给出具体补充路径，不在这里重复列出规则。</p>
                      <div className="chips">
                        <span className="chip">待补口径 {group.statusSummary.pendingAction + group.statusSummary.draft + group.statusSummary.simulated}</span>
                        <span className="chip warning-chip">待补数据 {group.statusSummary.pendingData}</span>
                        <span className="chip success-chip">已纳入 {group.statusSummary.manualConfirmed}</span>
                      </div>
                    </div>
                  ) : (
                    group.items.map((item) => <RuleRegistryBoardRow item={item} draft={draftByRule.get(item.technicalRuleId)} key={item.id} onSelect={onSelect} />)
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CurrentIssueBoardPanel({ issues }: { issues: PublishIssue[] }) {
  const groups: Array<{ kind: PublishIssue["kind"]; label: string; helper: string; empty: string }> = [
    { kind: "project_data_gap", label: "补项目字段", helper: "规则判断缺少项目字段，回项目维护页补齐。", empty: "当前没有需要回项目页补充的数据。" },
    { kind: "manual_confirm", label: "确认人工排期", helper: "系统已有排期建议，但负责人、日期或原因需员工确认留痕。", empty: "当前没有规则侧人工确认事项。" },
    { kind: "time_conflict", label: "处理硬冲突", helper: "当前方案存在正式发布阻断，回排期方案处理。", empty: "当前没有硬冲突。" },
    { kind: "hint", label: "确认软提示", helper: "不阻断发布，但建议在发布前完成业务确认。", empty: "当前没有软提示。" }
  ];
  const hasIssues = issues.length > 0;
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>项目数据与排期确认</h2>
          <span>这里不是补规则口径：缺字段回项目维护，人工和冲突回排期方案处理</span>
        </div>
        <div className="chips">
          <span className={hasIssues ? "chip warning-chip" : "chip success-chip"}>{hasIssues ? `非规则待办 ${issues.length}` : "已清零"}</span>
        </div>
      </div>
      <div className="home-todo-list">
        {groups.map((group) => {
          const items = issues.filter((issue) => issue.kind === group.kind);
          if (!items.length) return null;
          return (
            <div className="home-todo-group" key={group.kind}>
              <div className="home-todo-group-title">
                <div>
                  <span>{group.label}</span>
                  <small>{group.helper}</small>
                </div>
                <strong>{items.length}</strong>
              </div>
              {items.map((issue) => {
                const todo = releaseTodoFromIssue(issue);
                return (
                  <div className={`home-blocker ${todo.group}`} key={issue.id}>
                    <div>
                      <span>{issue.objectLabel}</span>
                      <strong>{issue.title}</strong>
                      <p>{issue.description}</p>
                      <small>{issue.requiredAction}</small>
                    </div>
                    <a className="button compact-button" href={viewHref(todo.target.view, todo.target.params)}>
                      {todo.actionLabel}
                      <ChevronRight size={15} />
                    </a>
                  </div>
                );
              })}
            </div>
          );
        })}
        {!hasIssues ? <div className="empty compact">项目数据、人工确认和冲突待办已清零。</div> : null}
      </div>
    </section>
  );
}

const ruleGroupStatusLabel: Record<RuleRegistryGroup["primaryStatus"], string> = {
  ready: "已就绪",
  needs_action: "待处理",
  needs_data: "待补数据",
  in_progress: "处理中"
};

function RuleRegistryBoardRow({
  item,
  draft,
  onSelect
}: {
  item: RuleRegistryItem;
  draft?: RuleDecisionDraft;
  onSelect: (technicalRuleId: string) => void;
}) {
  const canHandle = item.status !== "effective" && item.status !== "manual_confirmed" && item.status !== "pending_data";
  const basis = item.authorityType === "manual_confirmed" ? item.authorityDetail : item.evidenceLabels.join("；") || item.authorityDetail || "待补充依据";
  return (
    <div className={`rule-registry-row ${item.status}`}>
      <div className="rule-registry-row-head">
        <div>
          <span className="technical-rule-chip">{item.technicalRuleId}</span>
          <strong>{item.businessTitle}</strong>
        </div>
        <span className={`registry-status ${item.status}`}>{item.statusLabel}</span>
      </div>
      <div className="rule-registry-logic">
        <div>
          <span>当前状况</span>
          <p>{item.businessCondition}</p>
        </div>
        <div>
          <span>判断依据</span>
          <p>{basis}</p>
          <span className={`authority-chip ${item.authorityType}`}>{item.authorityLabel}</span>
        </div>
        <div>
          <span>判断结果</span>
          <p>{item.businessOutcome}</p>
          {item.onsite && item.offsite ? (
            <div className="chips registry-frequency">
              <span className="chip">现场 {frequencyLabel(item.onsite)}</span>
              <span className="chip">非现场 {frequencyLabel(item.offsite)}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="rule-registry-row-foot">
        <span className="muted">影响 {item.affectedProjectCount} 个项目</span>
        {item.status === "pending_data" ? (
          <a className="button compact-button" href="/?view=projectInput">去项目维护</a>
        ) : canHandle ? (
          <button className="button compact-button" onClick={() => onSelect(item.technicalRuleId)} type="button">
            {draft?.status === "simulated" ? "纳入规则" : "处理"}
          </button>
        ) : (
          <span className="muted">{item.status === "manual_confirmed" ? "已纳入" : "已生效"}</span>
        )}
      </div>
    </div>
  );
}

function PendingDecisionBoard({
  decisions,
  selected,
  evidence,
  tagLibrary,
  draftByRule,
  suggestionBatch,
  generatingSuggestions,
  actionMessage,
  onGenerateSuggestions,
  onSelect,
  onOpenDraft
}: {
  decisions: PendingRuleDecision[];
  selected: PendingRuleDecision | null;
  evidence: RuleEvidence[];
  tagLibrary: TagDefinition[];
  draftByRule: Map<string, RuleDecisionDraft>;
  suggestionBatch: RuleSuggestionBatch | null;
  generatingSuggestions: boolean;
  actionMessage: { tone: "success" | "warn" | "error"; text: string } | null;
  onGenerateSuggestions: () => void;
  onSelect: (decision: PendingRuleDecision) => void;
  onOpenDraft: (decision: PendingRuleDecision) => void;
}) {
  const [filter, setFilter] = useState<"active" | "impacted" | "suggested" | "submitted">("active");
  const evidenceById = new Map(evidence.map((entry) => [entry.id, entry]));
  const selectedEvidence = selected?.evidenceRefs.map((id) => evidenceById.get(id)).filter((entry): entry is RuleEvidence => Boolean(entry)) ?? [];
  const suggestionRuleIds = new Set((suggestionBatch?.ruleSuggestions ?? []).map((item) => item.technicalRuleId));
  const filteredDecisions = decisions.filter((decision) => {
    const draft = draftByRule.get(decision.technicalRuleId);
    const isSubmitted = draft?.status === "submitted";
    if (filter === "submitted") return isSubmitted;
    if (filter === "impacted") return !isSubmitted && decision.affectedProjectCount > 0;
    if (filter === "suggested") return !isSubmitted && (suggestionRuleIds.has(decision.technicalRuleId) || Boolean(draft?.suggestionMeta));
    return !isSubmitted;
  });
  const selectedTags = selected ? tagNamesByIds(selected.tagRefs, tagLibrary) : [];
  const selectedTitleModel = selected ? pendingDecisionTitleFor(selected) : null;
  const selectedDraft = selected ? draftByRule.get(selected.technicalRuleId) : undefined;
  const selectedWorkflowStatus = decisionWorkflowStatusFor(selectedDraft, selected);
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>规则口径阻断处理</h2>
          <span>只处理当前方案真实命中的 P 类规则阻断：生成建议、审核草稿、试算并提交</span>
        </div>
        <div className="inline-actions rule-suggestion-action">
          <button className="button primary" disabled={generatingSuggestions} onClick={onGenerateSuggestions} type="button">
            <Sparkles size={15} />
            {generatingSuggestions ? "生成中" : "一键生成补充建议"}
          </button>
          <small>只生成待审核草稿，不自动发布规则</small>
        </div>
      </div>
      {suggestionBatch ? <SuggestionBatchSummary batch={suggestionBatch} /> : null}
      <div className="segmented compact-filter">
        <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>待处理</button>
        <button className={filter === "impacted" ? "active" : ""} onClick={() => setFilter("impacted")}>有影响项目</button>
        <button className={filter === "suggested" ? "active" : ""} onClick={() => setFilter("suggested")}>已有建议</button>
        <button className={filter === "submitted" ? "active" : ""} onClick={() => setFilter("submitted")}>已纳入规则</button>
      </div>
      <div className="pending-workbench">
        <div className="pending-list">
          {filteredDecisions.map((decision) => {
            const draft = draftByRule.get(decision.technicalRuleId);
            const reviewStatus = draft?.suggestionMeta?.reviewStatus;
            const titleModel = pendingDecisionTitleFor(decision);
            const impactSummary = decision.affectedProjectCount ? `影响 ${decision.affectedProjectCount} 个项目` : "当前项目池未命中";
            const workflowStatus = decisionWorkflowStatusFor(draft, decision);
            return (
              <button
                className={`pending-card ${selected?.id === decision.id ? "active" : ""} ${decision.publishImpact} ${workflowStatus.className}`}
                key={decision.id}
                onClick={() => {
                  onSelect(decision);
                  if (reviewStatus && workflowStatus.className !== "submitted") onOpenDraft(decision);
                }}
                type="button"
              >
                <span className={`pending-card-status ${workflowStatus.className}`}>{workflowStatus.label}</span>
                <strong className="pending-card-title">
                  <span className="pending-rule-code">{decision.technicalRuleId}</span>
                  <span className="pending-title-type">{titleModel.problemType}</span>
                  <span className="pending-title-divider">｜</span>
                  <span className="pending-title-subject">{titleModel.subject}</span>
                </strong>
                <small>{workflowStatus.className === "submitted" ? "已确认" : workflowStatus.className === "data" ? "待补数据" : "待确认"}：{titleModel.confirmationTarget} · {impactSummary} · {workflowStatus.className === "submitted" ? "已纳入正式排期规则" : workflowStatus.className === "data" ? "补齐数据后重新校验" : processingImpactFor(decision)}</small>
                <em className={`processing-impact ${workflowStatus.className}`}>{workflowStatus.detail}</em>
                {reviewStatus ? <em className={`suggestion-status ${reviewStatus}`}>{suggestionReviewLabel[reviewStatus]}</em> : null}
              </button>
            );
          })}
          {!filteredDecisions.length ? <div className="empty compact">{filter === "submitted" ? "当前还没有已纳入正式排期规则的口径。" : "当前没有规则口径阻断。"}</div> : null}
        </div>
        <div className="pending-detail">
          {selected ? (
            <>
              <div className="pending-detail-head">
                <div>
                  <span>{selectedWorkflowStatus.detail} · {selected.technicalRuleId} · {selectedTitleModel?.problemType}</span>
                  <h3>{selected.technicalRuleId} · {selectedTitleModel?.subject}</h3>
                </div>
                <div className="chips">
                  <span className={`chip ${selectedWorkflowStatus.className === "submitted" ? "success-chip" : ""}`}>{selectedWorkflowStatus.label}</span>
                  <span className="chip pending-confirmation-chip">{selectedWorkflowStatus.className === "submitted" ? "已确认" : selectedWorkflowStatus.className === "data" ? "待补数据" : "待确认"}：{selectedTitleModel?.confirmationTarget}</span>
                </div>
              </div>
              <div className="decision-fields">
                <div>
                  <span>当前状况</span>
                  <p>{selected.businessQuestion}</p>
                </div>
                <div>
                  <span>判断依据</span>
                  <p>{selectedEvidence.map(citationLabel).join("；") || "待补充依据"}</p>
                </div>
                <div>
                  <span>影响范围</span>
                  <p>
                    {selected.affectedProjectCount ? `影响 ${selected.affectedProjectCount} 个项目` : "当前项目池未命中"}
                    {selectedTags.length ? `；关联标签：${selectedTags.slice(0, 3).join("、")}` : ""}
                  </p>
                </div>
                <div>
                  <span>需要处理</span>
                  <p>{selected.requiredInput}；{selected.suggestedAction}</p>
                </div>
              </div>
              <details className="inline-disclosure compact-info">
                <summary>依据与影响摘要</summary>
                <div className="rule-info-grid">
                  <div>
                    <h4>制度依据</h4>
                    <p>{selectedEvidence.map(citationLabel).join("；") || "待补充依据"}</p>
                  </div>
                  <div>
                    <h4>项目影响</h4>
                    <p>{selected.affectedProjectCount ? `当前项目池命中 ${selected.affectedProjectCount} 个项目` : "当前项目池未命中该事项"}；{processingImpactFor(selected)}</p>
                  </div>
                  <div>
                    <h4>关联标签</h4>
                    <div className="chips">
                      {(selectedTags.length ? selectedTags : ["暂无关联标签"]).map((tagName) => (
                        <span className="chip" key={`${selected.id}-${tagName}`}>{tagName}</span>
                      ))}
                    </div>
                  </div>
                  <details className="technical-detail">
                    <summary>系统追溯</summary>
                    <span>{selected.technicalRuleId} · {selected.publishImpact}</span>
                  </details>
                </div>
              </details>
              <div className="inline-actions primary-only">
                <button className="button primary" onClick={() => onOpenDraft(selected)}>{isDataGapDecision(selected) ? "补项目数据" : "补充规则口径"}</button>
              </div>
              {actionMessage ? <div className={`action-message ${actionMessage.tone}`}>{actionMessage.text}</div> : null}
            </>
          ) : (
            <div className="empty compact">当前没有待处理事项。</div>
          )}
        </div>
      </div>
    </section>
  );
}

function RuleHandlingDrawer({
  open,
  active,
  selected,
  draft,
  actionMessage,
  onClose,
  children
}: {
  open: boolean;
  active: RuleActionPanelMode | null;
  selected: PendingRuleDecision | null;
  draft: RuleDecisionDraft | null;
  actionMessage: { tone: "success" | "warn" | "error"; text: string } | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !selected || !active) return null;
  const titleModel = pendingDecisionTitleFor(selected);
  const workflowStatus = decisionWorkflowStatusFor(draft ?? undefined, selected);
  const modeLabel: Record<RuleActionPanelMode, string> = {
    draft: "补充规则口径",
    impact: "影响摘要",
    evidence: "制度依据",
    simulation: "试算结果",
    submit: "纳入结果"
  };
  const drawerStatusText = active === "draft" && workflowStatus.className !== "submitted"
    ? "等待业务确认"
    : workflowStatus.detail;

  return (
    <div className="rule-drawer-layer">
      <button className="rule-drawer-backdrop" aria-label="关闭规则处理抽屉" onClick={onClose} type="button" />
      <aside className="rule-handling-drawer" aria-label={`正在处理：${selected.technicalRuleId} ${titleModel.subject}`} aria-modal="true" role="dialog">
        <header className="rule-drawer-header">
          <div>
            <span>{modeLabel[active]} · {drawerStatusText}</span>
            <h2>正在处理：{selected.technicalRuleId} {titleModel.subject}</h2>
          </div>
          <button className="button" onClick={onClose} type="button">
            收起
          </button>
        </header>
        <div className="rule-drawer-summary">
          <span className={`chip ${workflowStatus.className === "submitted" ? "success-chip" : workflowStatus.className === "data" ? "warning-chip" : ""}`}>{workflowStatus.label}</span>
          <span className="chip pending-confirmation-chip">待确认：{titleModel.confirmationTarget}</span>
          <span className="chip">{selected.affectedProjectCount ? `影响 ${selected.affectedProjectCount} 个项目` : "当前项目池未命中"}</span>
        </div>
        {actionMessage ? <div className={`action-message ${actionMessage.tone}`}>{actionMessage.text}</div> : null}
        <div className="rule-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

function RuleActionProgress({
  step,
  stale
}: {
  step: "draft" | "simulation" | "submit";
  stale: boolean;
}) {
  const order = ["draft", "simulation", "submit"] as const;
  const labels: Record<typeof order[number], string> = {
    draft: "补口径",
    simulation: "看影响",
    submit: "纳入规则"
  };
  const activeIndex = order.indexOf(step);
  return (
    <div className="rule-action-progress" aria-label="规则口径处理步骤">
      {order.map((item, index) => (
        <span
          className={`${index < activeIndex ? "done" : index === activeIndex ? "active" : ""} ${item === "simulation" && stale ? "stale" : ""}`}
          key={item}
        >
          <i>{index + 1}</i>
          {labels[item]}
        </span>
      ))}
    </div>
  );
}

function RuleActionFooter({
  helperText,
  stale,
  onSaveDraft,
  onSecondary,
  secondaryLabel,
  primaryLabel,
  primaryDisabled,
  onPrimary
}: {
  helperText: string;
  stale: boolean;
  onSaveDraft: () => void;
  onSecondary?: () => void;
  secondaryLabel?: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
}) {
  return (
    <div className="rule-action-footer">
      <div>
        <span>{stale ? "口径已调整，需要重新试算" : "当前动作影响"}</span>
        <p>{helperText}</p>
      </div>
      <div className="rule-action-buttons">
        <button className="button" onClick={onSaveDraft} type="button">保存草稿</button>
        {onSecondary && secondaryLabel ? <button className="button" onClick={onSecondary} type="button">{secondaryLabel}</button> : null}
        <button className="button primary" disabled={primaryDisabled} onClick={onPrimary} type="button">{primaryLabel}</button>
      </div>
    </div>
  );
}

function RuleActionPanel({
  active,
  selected,
  impact,
  draft,
  simulation,
  submitResult,
  suggestion,
  tagLibrary,
  evidenceEntries,
  onDraftChange,
  onSaveDraft,
  onSaveAndSimulate,
  onAcceptSuggestion,
  onSubmit,
  onClose
}: {
  active: RuleActionPanelMode | null;
  selected: PendingRuleDecision | null;
  impact: RuleImpactResponse | null;
  draft: RuleDecisionDraft | null;
  simulation: RuleSimulationResult | null;
  submitResult: RuleSubmitResult | null;
  suggestion: RuleSupplementSuggestion | null;
  tagLibrary: TagDefinition[];
  evidenceEntries: RuleEvidence[];
  onDraftChange: (draft: RuleDecisionDraft) => void;
  onSaveDraft: (draft: RuleDecisionDraft) => Promise<RuleDecisionDraft>;
  onSaveAndSimulate: () => Promise<void>;
  onAcceptSuggestion: () => Promise<void>;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}) {
  const [reviewMode, setReviewMode] = useState<"suggestion" | "editing">("suggestion");
  const [simulatedDraftSignature, setSimulatedDraftSignature] = useState<string | null>(null);
  const onsiteFrequencyRef = useRef<HTMLInputElement | null>(null);
  const isManualOnly = selected?.publishImpact === "manual_needed";
  const isDataGapOnly = selected ? isDataGapDecision(selected) : false;
  const isAlreadySubmitted = draft?.status === "submitted";
  const canRunRuleActions = Boolean(selected && selected.publishImpact === "blocks_publish" && !isDataGapOnly && isDraftReadyForRuleAction(draft));
  const canSubmitManual = isManualOnly && Boolean(draft?.businessNote.trim() && draft.confirmerNote.trim());
  const selectedEvidence = selected ? selected.evidenceRefs.map((id) => evidenceEntries.find((entry) => entry.id === id)).filter((entry): entry is RuleEvidence => Boolean(entry)) : [];
  const currentDraftSignature = draftActionSignature(draft);
  const simulationMatchesRule = Boolean(selected && simulation?.technicalRuleId === selected.technicalRuleId);
  const simulationReady =
    !isManualOnly &&
    Boolean(
      simulationMatchesRule &&
        ((draft?.status === "simulated" && draft.simulationRunId === simulation?.runId) || simulatedDraftSignature === currentDraftSignature)
    );
  const simulationStale =
    !isManualOnly &&
    Boolean(simulationMatchesRule && !simulationReady && draft?.simulationRunId === simulation?.runId && isDraftReadyForRuleAction(draft));
  const actionStep = isAlreadySubmitted || active === "submit" ? "submit" : simulationReady ? "simulation" : "draft";

  useEffect(() => {
    setReviewMode(draft?.suggestionMeta && suggestion && draft.suggestionMeta.reviewStatus !== "edited" ? "suggestion" : "editing");
    setSimulatedDraftSignature(null);
  }, [selected?.technicalRuleId, draft?.id, suggestion?.technicalRuleId]);

  useEffect(() => {
    if (draft?.status === "simulated" && simulationMatchesRule && draft.simulationRunId === simulation?.runId) {
      setSimulatedDraftSignature(draftActionSignature(draft));
    }
  }, [draft?.status, draft?.simulationRunId, simulation?.runId, simulationMatchesRule]);

  const updateDraft = (draft: RuleDecisionDraft, next: Partial<RuleDecisionDraft>) => {
    const suggestionMeta = draft.suggestionMeta
      ? { ...draft.suggestionMeta, reviewStatus: "edited" as const }
      : undefined;
    onDraftChange({
      ...draft,
      ...next,
      status: draft.status === "submitted" ? "submitted" : "draft",
      ...(suggestionMeta ? { suggestionMeta } : {})
    });
  };
  const handleManualAdjust = () => {
    setReviewMode("editing");
    setSimulatedDraftSignature(null);
    if (draft) updateDraft(draft, {});
    window.setTimeout(() => onsiteFrequencyRef.current?.focus(), 0);
  };
  const saveDraftOnly = async () => {
    if (!draft) return;
    await onSaveDraft(draft);
  };
  const acceptSuggestion = async () => {
    await onAcceptSuggestion();
    setSimulatedDraftSignature(currentDraftSignature);
  };
  const simulateCurrentDraft = async () => {
    await onSaveAndSimulate();
    setSimulatedDraftSignature(currentDraftSignature);
  };
  const primaryLabel = isManualOnly
    ? "确认纳入正式排期规则"
    : simulationReady
      ? "确认纳入正式排期规则"
      : reviewMode === "suggestion" && draft?.suggestionMeta && suggestion
        ? "使用系统建议并试算"
        : "试算对排期的影响";
  const primaryDisabled = isManualOnly ? !canSubmitManual : !canRunRuleActions;
  const primaryAction = () => {
    if (isManualOnly || simulationReady) {
      void onSubmit();
      return;
    }
    if (reviewMode === "suggestion" && draft?.suggestionMeta && suggestion) {
      void acceptSuggestion();
      return;
    }
    void simulateCurrentDraft();
  };
  const footerHelperText = isManualOnly
    ? "保存后会进入规则版本，用于后续排期待办解释；具体负责人和日期仍在排期页确认。"
    : simulationReady
      ? "确认后会刷新首页、排期页和导出报告的候选方案。"
      : "试算只用于查看影响，不会改变正式排期；确认纳入后才会生效。";
  if (!active || !selected) return null;
  return (
    <section className={`rule-action-panel ${active}`}>
      <div className="section-title">
        <div>
          <h2>{active === "impact" ? "影响摘要" : active === "draft" ? "补充规则口径" : active === "evidence" ? "制度依据" : active === "simulation" ? "试算结果" : "纳入规则结果"}</h2>
          <span>{selected.title}</span>
        </div>
        <button className="button" onClick={onClose}>收起</button>
      </div>

      {active === "evidence" ? (
        <div className="rule-panel-body">
          <div className="detail-grid mini">
            <div><span>工单编号</span><strong>{selected.technicalRuleId}</strong></div>
            <div><span>影响范围</span><strong>{selected.affectedProjectCount ? `影响 ${selected.affectedProjectCount} 个项目` : "当前项目池未命中"}</strong></div>
            <div><span>发布影响</span><strong>{processingImpactFor(selected)}</strong></div>
            <div><span>待确认事项</span><strong>{selected.requiredInput}</strong></div>
          </div>
          <div className="evidence-library drawer-evidence-list">
            {selectedEvidence.map((entry) => (
              <article className="evidence-card highlight" key={entry.id}>
                <div className="evidence-card-head">
                  <div>
                    <h3>{citationLabel(entry)}</h3>
                    <p>{entry.sourceParagraph}</p>
                  </div>
                  <span>{entry.policyCitation?.articleNo ?? "制度依据"}</span>
                </div>
                <blockquote>{entry.sourceExcerpt}</blockquote>
                <p>{entry.interpretation}</p>
              </article>
            ))}
            {!selectedEvidence.length ? (
              <div className="empty compact">当前工单没有可展示的制度依据。</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {active === "impact" && impact ? (
        <div className="rule-panel-body">
          <div className="detail-grid mini">
            <div><span>影响项目</span><strong>{impact.affectedProjectCount}</strong></div>
            <div><span>影响人员</span><strong>{impact.affectedPersonCount}</strong></div>
            <div><span>影响步骤</span><strong>{impact.affectedSchedulerStep}</strong></div>
            <div><span>处理影响</span><strong>{processingImpactFor(selected)}</strong></div>
          </div>
          <div className="rule-panel-grid">
            <div>
              <h3>关联标签</h3>
              <div className="chips">
                {(impact.tags.length ? impact.tags.map((tag) => tag.name) : tagNamesByIds(selected.tagRefs, tagLibrary)).map((tag) => (
                  <span className="chip" key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <div>
              <h3>规则如何影响排期</h3>
              {impact.influences.map((item) => <p key={`${item.target}-${item.description}`}>{item.description}</p>)}
            </div>
          </div>
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>项目</th>
                  <th>客户类型</th>
                  <th>风险</th>
                  <th>敞口</th>
                </tr>
              </thead>
              <tbody>
                {(impact.affectedProjects.length ? impact.affectedProjects : []).map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{labelMaps.customerType[project.customerType]}</td>
                    <td>{labelMaps.riskGrade[project.riskGrade]}</td>
                    <td>{(project.exposureBalance / 100_000_000).toFixed(2)} 亿</td>
                  </tr>
                ))}
                {!impact.affectedProjects.length ? (
                  <tr><td colSpan={4}>当前项目池未命中该规则。</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {active === "draft" && draft ? (
        <div className="rule-panel-body">
          {!isDataGapOnly ? <RuleActionProgress step={actionStep} stale={simulationStale} /> : null}
          {isAlreadySubmitted ? (
            <div className="submit-result success">
              <strong>已纳入正式排期规则</strong>
              <p>后续生成排期将使用该口径；当前页面仅保留结果查看，不再展示编辑按钮。</p>
              {draft.confirmerNote ? <p>{draft.confirmerNote}</p> : null}
            </div>
          ) : null}
          {!isAlreadySubmitted && isDataGapOnly ? (
            <div className="data-gap-action">
              <div>
                <span>需要先补项目数据</span>
                <strong>{selected.requiredInput}</strong>
                <p>{selected.currentGap}</p>
                <p>{selected.suggestedAction}</p>
              </div>
              <a className="button primary" href="/?view=projectInput">去项目维护补充数据</a>
            </div>
          ) : null}
          {!isAlreadySubmitted && !isDataGapOnly && draft.suggestionMeta && suggestion && reviewMode === "suggestion" ? (
            <div className="suggestion-review-card">
              <div className="suggestion-review-head">
                <div>
                  <span>{suggestionReviewLabel[draft.suggestionMeta.reviewStatus]}</span>
                  <strong>建议依据 · 置信度 {Math.round(suggestion.confidence * 100)}%</strong>
                </div>
                <Sparkles size={17} />
              </div>
              <div className="detail-grid mini">
                <div><span>建议现场</span><strong>{frequencyLabel(suggestion.onsite)}</strong></div>
                <div><span>建议非现场</span><strong>{frequencyLabel(suggestion.offsite)}</strong></div>
                <div><span>影响项目</span><strong>{suggestion.affectedProjectNames.join("、") || "当前项目池"}</strong></div>
                <div><span>来源</span><strong>内置模板</strong></div>
              </div>
              <p>{suggestion.reason}</p>
              <div className="chips">
                {suggestion.evidenceLabels.map((label) => <span className="chip" key={label}>{label}</span>)}
              </div>
            </div>
          ) : null}
          {!isAlreadySubmitted && !isDataGapOnly && draft.suggestionMeta && suggestion && reviewMode === "editing" ? (
            <div className="suggestion-summary-strip">
              <Sparkles size={15} />
              <span>系统建议已收起，当前为人工调整中。可修改频次和说明后重新试算。</span>
            </div>
          ) : null}
          {!isAlreadySubmitted && !isDataGapOnly && isManualOnly ? (
            <div className="draft-grid manual-draft-grid">
              <label className="wide-field">
                处理说明
                <textarea value={draft.businessNote} onChange={(event) => updateDraft(draft, { businessNote: event.target.value })} />
              </label>
              <label className="wide-field">
                责任人/确认说明
                <textarea value={draft.confirmerNote} onChange={(event) => updateDraft(draft, { confirmerNote: event.target.value })} />
              </label>
              <div className="manual-next-action">
                <span>后续动作</span>
                <p>{selected.suggestedAction}</p>
              </div>
            </div>
          ) : !isAlreadySubmitted && !isDataGapOnly ? (
            <div className="draft-grid">
              <FrequencyEditor
                title="现场检查"
                value={draft.onsite}
                inputRef={onsiteFrequencyRef}
                onChange={(value) => updateDraft(draft, { onsite: value })}
              />
              <FrequencyEditor
                title="非现场检查"
                value={draft.offsite}
                onChange={(value) => updateDraft(draft, { offsite: value })}
              />
              <label className="wide-field">
                业务说明
                <textarea value={draft.businessNote} onChange={(event) => updateDraft(draft, { businessNote: event.target.value })} />
              </label>
              <label className="wide-field">
                确认人说明
                <textarea value={draft.confirmerNote} onChange={(event) => updateDraft(draft, { confirmerNote: event.target.value })} />
              </label>
            </div>
          ) : null}
          {!isAlreadySubmitted && !isDataGapOnly ? (
            <RuleActionFooter
              helperText={footerHelperText}
              stale={simulationStale}
              onSaveDraft={() => void saveDraftOnly()}
              onSecondary={reviewMode === "suggestion" && draft.suggestionMeta && suggestion ? handleManualAdjust : undefined}
              secondaryLabel={reviewMode === "suggestion" && draft.suggestionMeta && suggestion ? "我要调整口径" : undefined}
              primaryLabel={primaryLabel}
              primaryDisabled={primaryDisabled}
              onPrimary={primaryAction}
            />
          ) : null}
          {!isAlreadySubmitted && simulation?.technicalRuleId === selected.technicalRuleId ? (
            <div className="draft-simulation-preview">
              <SimulationSummary simulation={simulation} />
            </div>
          ) : null}
        </div>
      ) : null}

      {active === "simulation" && simulation ? (
        <SimulationSummary simulation={simulation} />
      ) : null}

      {active === "submit" && submitResult ? (
        <div className="rule-panel-body">
          <div className={`submit-result ${submitResult.publishable ? "success" : "warn"}`}>
            <strong>{submitResult.publishable ? "已纳入正式排期规则，规则闸门已通过" : "已纳入正式排期规则，但仍有事项需处理"}</strong>
            <p>本次口径已纳入规则版本，后续生成排期将按新的业务口径判断。</p>
            {submitResult.blockers.length ? <p>{submitResult.blockers.join("；")}</p> : null}
          </div>
          <SimulationSummary simulation={submitResult.simulation} />
        </div>
      ) : null}
    </section>
  );
}

function FrequencyEditor({
  title,
  value,
  inputRef,
  onChange
}: {
  title: string;
  value: FrequencyValue;
  inputRef?: { current: HTMLInputElement | null };
  onChange: (value: FrequencyValue) => void;
}) {
  const [count, setCount] = useState(frequencyCount(value));
  const [period, setPeriod] = useState<FrequencyValue["period"]>(frequencyPeriod(value));
  useEffect(() => {
    setCount(frequencyCount(value));
    setPeriod(frequencyPeriod(value));
  }, [value]);
  const commit = (nextCount = count, nextPeriod = period) => onChange(valueFromCountPeriod(nextCount, nextPeriod));
  return (
    <div className="frequency-editor">
      <span>{title}</span>
      <input
        className="search"
        min={0}
        ref={inputRef}
        type="number"
        value={count}
        onChange={(event) => {
          setCount(event.target.value);
          commit(event.target.value, period);
        }}
      />
      <select
        className="select"
        value={period}
        onChange={(event) => {
          const next = event.target.value as FrequencyValue["period"];
          setPeriod(next);
          commit(count, next);
        }}
      >
        <option value="year">每年</option>
        <option value="two_years">每两年</option>
      </select>
    </div>
  );
}

function SimulationSummary({ simulation }: { simulation: RuleSimulationResult }) {
  const deltas = [
    ["待补口径", simulation.before.ruleGap, simulation.after.ruleGap, simulation.delta.ruleGap],
    ["现场任务", simulation.before.onsiteTasks, simulation.after.onsiteTasks, simulation.delta.onsiteTasks],
    ["非现场任务", simulation.before.offsiteTasks, simulation.after.offsiteTasks, simulation.delta.offsiteTasks],
    ["硬冲突", simulation.before.hardConflicts, simulation.after.hardConflicts, simulation.delta.hardConflicts],
    ["待人工", simulation.before.pendingManual, simulation.after.pendingManual, simulation.delta.pendingManual]
  ] as const;
  return (
    <div className="rule-panel-body">
      <div className="simulation-head">
        <strong>{simulation.publishable ? "试算结果可发布" : "试算仍存在发布前问题"}</strong>
        <span>{simulation.createdAt.slice(0, 19).replace("T", " ")}</span>
      </div>
      <div className="simulation-grid">
        {deltas.map(([label, before, after, delta]) => (
          <div className="simulation-metric" key={label}>
            <span>{label}</span>
            <strong>{before} → {after}</strong>
            <small>{delta > 0 ? `+${delta}` : delta}</small>
          </div>
        ))}
      </div>
      {simulation.blockers.length ? (
        <div className="issue-item warn">
          <div className="issue-head"><span>仍需处理</span><span>提示</span></div>
          <p>{simulation.blockers.join("；")}</p>
        </div>
      ) : null}
    </div>
  );
}

function ImpactBadge({ item, count }: { item: BusinessRuleItem; count: number }) {
  const tone = item.publishImpact === "blocks_publish" ? "blocked" : item.publishImpact === "manual_needed" ? "needs_attention" : "ready";
  return (
    <span className={`gate-badge ${tone}`}>
      {item.publishImpact === "blocks_publish" ? <AlertTriangle size={14} /> : <Check size={14} />}
      {item.publishImpact === "blocks_publish" ? "阻断发布" : item.publishImpact === "manual_needed" ? "待人工" : "可发布"}
      {count ? ` · 命中${count}` : ""}
    </span>
  );
}

function BusinessRuleOrdering({
  systemMap,
  orders,
  tagLibrary,
  impactForRule
}: {
  systemMap: RuleSystemMap;
  orders: BusinessRuleOrder[];
  tagLibrary: TagDefinition[];
  impactForRule: (item: BusinessRuleItem) => number;
}) {
  return (
    <div className="business-rule-list rule-map-business">
      <RuleMapStrip systemMap={systemMap} />
      {orders.map((order) => (
        <section className="business-rule-group" key={order.id}>
          <div className="business-group-head">
            <span>{order.order}</span>
            <div>
              <h3>{order.title}</h3>
              <p>{order.description}</p>
            </div>
          </div>
          <div className="business-rule-cards">
            {order.items.map((item) => {
              const evidence = evidenceForRule(item.technicalRuleId)[0];
              return (
                <article className={`business-rule-card ${item.publishImpact}`} key={`${order.id}-${item.id}`}>
                  <div className="business-rule-top">
                    <div>
                      <h4>{item.businessTitle}</h4>
                      <p>业务判断以制度依据、适用对象和排期影响为主。</p>
                    </div>
                    <ImpactBadge item={item} count={impactForRule(item)} />
                  </div>
                  <div className="rule-card-columns">
                    <div>
                      <span>当前状况</span>
                      <p>{item.businessCondition}</p>
                    </div>
                    <div>
                      <span>适用标签/字段</span>
                      <p>{(item.tagRefs?.length ? tagNamesByIds(item.tagRefs, tagLibrary) : ["未绑定标签"]).join(" / ")}</p>
                    </div>
                    <div>
                      <span>判断依据</span>
                      <p>{citationLabel(evidence)}</p>
                    </div>
                    <div>
                      <span>判断结果</span>
                      <p>{item.businessOutcome}</p>
                    </div>
                    <div>
                      <span>发布影响</span>
                      <p>{impactTypeLabel[item.impactType]} · {item.publishImpact === "blocks_publish" ? "阻断正式发布" : item.publishImpact === "manual_needed" ? "进入发布前待办" : "可执行"}</p>
                    </div>
                  </div>
                  <div className="rule-tags">
                    <span className="chip">{impactTypeLabel[item.impactType]}</span>
                    {(item.assignmentPriority ?? []).map((priority) => (
                      <span className="chip" key={`${item.id}-${priority}`}>{assignmentPriorityLabel[priority] ?? priority}</span>
                    ))}
                    {(item.tagRefs?.length ? tagNamesByIds(item.tagRefs, tagLibrary) : ["未绑定标签"]).map((tagName) => (
                      <span className="chip" key={tagName}>{tagName}</span>
                    ))}
                  </div>
                  <div className="rule-evidence-inline">
                    <strong>依据</strong>
                    <span>{evidence ? `${compactDocName(evidence.sourceDocument)} · ${shortCitation(evidence)}` : "待补充依据"}</span>
                  </div>
                  <details className="technical-detail">
                    <summary>查看业务审计说明</summary>
                    <span>{businessRuleLabel(item.technicalRuleId)}</span>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function EvidenceLibraryView({
  evidence,
  orders,
  impactForRule,
  highlightIds = []
}: {
  evidence: RuleEvidence[];
  orders: BusinessRuleOrder[];
  impactForRule: (item: BusinessRuleItem) => number;
  highlightIds?: string[];
}) {
  const byEvidence = evidence.map((entry) => ({
    evidence: entry,
    rules: orders.flatMap((order) => order.items).filter((item) => item.evidenceRefs.includes(entry.id))
  }));
  return (
    <div className="evidence-library">
      {byEvidence.map(({ evidence: entry, rules }) => (
        <article className={`evidence-card ${highlightIds.includes(entry.id) ? "highlight" : ""}`} key={entry.id}>
          <div className="evidence-card-head">
            <div>
              <h3>{citationLabel(entry)}</h3>
              <p>{entry.sourceDocument}</p>
            </div>
            <span>{rules.length} 条规则引用</span>
          </div>
          <blockquote>{entry.sourceExcerpt}</blockquote>
          <p>{entry.interpretation}</p>
          <div className="chips">
            {rules.map((item) => (
              <span className={`chip ${item.publishImpact === "blocks_publish" ? "danger-chip" : ""}`} key={`${entry.id}-${item.id}`}>
                {item.businessTitle}
                {impactForRule(item) ? ` · ${impactForRule(item)}` : ""}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function TagLibraryView({
  tagLibrary,
  taxonomy,
  orders,
  projects,
  people,
  tagCoverage
}: {
  tagLibrary: TagDefinition[];
  taxonomy: TagTaxonomyNode[];
  orders: BusinessRuleOrder[];
  projects: Project[];
  people: Person[];
  tagCoverage: TagCoverageSummary;
}) {
  const ruleItems = orders.flatMap((order) => order.items);
  const tagById = new Map(tagLibrary.map((tag) => [tag.id, tag]));
  return (
    <div className="tag-taxonomy">
      <section className="tag-taxonomy-root">
        <div className="tag-taxonomy-head">
          <div>
            <h3>对象值关系标签配对</h3>
            <p>项目侧需求标签和人员侧供给标签围绕同一个业务对象闭合，供规则和排期解释使用。</p>
          </div>
          <span>项目覆盖 {tagCoverage.projectTagCoverageRate}% · 人员关系 {tagCoverage.personRelationshipCoverageRate}%</span>
        </div>
        <div className="relation-pair-list wide">
          {tagCoverage.relationPairs.slice(0, 18).map((pair) => (
            <div className={`relation-pair ${pair.status}`} key={`${pair.type}-${pair.objectId}`}>
              <span>{relationTypeLabel[pair.type]}{pair.type === "group" ? "（项目集团 ↔ 长期负责集团）" : ""}</span>
              <strong>{pair.objectName}</strong>
              <small>{relationStatusLabel[pair.status]} · 项目 {pair.projectCount} / 人员 {pair.personCount}</small>
              <p>{pair.projectTagCode ? "项目侧已维护" : "缺项目侧"} ↔ {pair.personTagCode ? "人员侧已维护" : "缺人员侧"}</p>
            </div>
          ))}
        </div>
      </section>
      {taxonomy.map((root) => (
        <section className="tag-taxonomy-root" key={root.id}>
          <div className="tag-taxonomy-head">
            <div>
              <h3>{root.title}</h3>
              <p>{root.description}</p>
            </div>
            <span>规则 {root.impact.ruleCount} · 项目 {root.impact.projectCount} · 人员 {root.impact.personCount}</span>
          </div>
          <div className="tag-category-grid">
            {root.children.map((category) => (
              <article className="tag-category-card" key={category.id}>
                <div className="tag-card-head">
                  <div>
                    <h3>{category.title}</h3>
                    <p>{category.description}</p>
                  </div>
                  <span>{category.impact.schedulerSteps.join(" / ") || "维护输入"}</span>
                </div>
                <div className="detail-grid mini">
                  <div><span>影响项目</span><strong>{category.impact.projectCount}</strong></div>
                  <div><span>影响人员</span><strong>{category.impact.personCount}</strong></div>
                  <div><span>关联规则</span><strong>{category.impact.ruleCount}</strong></div>
                  <div><span>标签项</span><strong>{category.tagIds.length}</strong></div>
                </div>
                <div className="tag-leaf-list">
                  {category.children.map((leaf) => {
                    const tag = tagById.get(leaf.tagIds[0]!);
                    const rules = ruleItems.filter((item) => item.tagRefs?.some((id) => leaf.tagIds.includes(id)));
                    return (
                      <div className="tag-leaf" key={leaf.id}>
                        <div>
                          <strong>{leaf.title}</strong>
                          <p>{tag?.description ?? "用于业务分类和排期判断"}</p>
                        </div>
                        <span>{leaf.impact.projectCount || leaf.impact.personCount || leaf.impact.ruleCount}</span>
                        <div className="tag-rule-popover">
                          <span>关联业务规则</span>
                          {(rules.length ? rules : []).slice(0, 4).map((rule) => (
                            <p key={`${leaf.id}-${rule.id}`}>{rule.businessTitle}</p>
                          ))}
                          {!rules.length ? <p>暂无规则引用，作为维护分类保留。</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type ScheduleFilterOptions = {
  assignees: Array<{ value: string; label: string }>;
  personTypes: string[];
  projectTypes: ScheduleProjectTypeFacet[];
  checkTypes: Task["checkType"][];
};

type ScheduleProjectTypeFacet =
  | {
      kind: "customerType";
      value: Project["customerType"];
      label: string;
      badge: string;
      tooltip: string;
    }
  | {
      kind: "bizType";
      value: Project["bizType"];
      label: string;
      badge: string;
      tooltip: string;
    };

const toggleStringValue = <T extends string>(items: T[], value: T) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

function ScheduleFilterBar({
  filters,
  options,
  filterMode,
  projectCount,
  totalProjectCount,
  manualCount,
  totalManualCount,
  onChange,
  onToggleManual,
  onToggleIssues,
  onClear
}: {
  filters: ScheduleFilterState;
  options: ScheduleFilterOptions;
  filterMode: ScheduleFilter;
  projectCount: number;
  totalProjectCount: number;
  manualCount: number;
  totalManualCount: number;
  onChange: (filters: ScheduleFilterState) => void;
  onToggleManual: () => void;
  onToggleIssues: () => void;
  onClear: () => void;
}) {
  const hasFilters = scheduleFilterHasValue(filters);
  const update = (next: Partial<ScheduleFilterState>) => onChange({ ...filters, ...next });
  return (
    <div className={`schedule-filter-panel ${hasFilters || filterMode ? "has-active-filters" : ""}`}>
      <div className="schedule-filter-head">
        <div>
          <h3>筛选条件</h3>
          <span>已作用到下方列表：{projectCount} / 共 {totalProjectCount} 个项目 · 待人工 {manualCount} / 共 {totalManualCount} 个任务</span>
        </div>
        <div className="inline-actions">
          <button className={`button compact-button ${filterMode === "manual" ? "primary" : ""}`} onClick={onToggleManual} type="button">
            <ListFilter size={14} />
            只看待人工
          </button>
          <button className={`button compact-button ${filterMode === "issues" ? "primary" : ""}`} onClick={onToggleIssues} type="button">
            <AlertTriangle size={14} />
            只看异常
          </button>
          <button className="button compact-button" disabled={!hasFilters && !filterMode} onClick={onClear} type="button">
            清空筛选
          </button>
        </div>
      </div>
      <div className="schedule-filter-groups">
        <div className="schedule-filter-group">
          <span>人员姓名</span>
          <div className="schedule-filter-chips">
            {options.assignees.map((option) => (
              <button
                className={`schedule-filter-chip ${filters.assignees.includes(option.value) ? "active" : ""}`}
                key={option.value}
                onClick={() => update({ assignees: toggleStringValue(filters.assignees, option.value) })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="schedule-filter-group">
          <span>人员类型</span>
          <div className="schedule-filter-chips">
            {options.personTypes.map((type) => (
              <button
                className={`schedule-filter-chip ${filters.personTypes.includes(type) ? "active" : ""}`}
                key={type}
                onClick={() => update({ personTypes: toggleStringValue(filters.personTypes, type) })}
                type="button"
              >
                {type}
              </button>
            ))}
            {!options.personTypes.length ? <span className="muted">当前任务未命中规则人员类型标签</span> : null}
          </div>
        </div>
        <div className="schedule-filter-group">
          <span>项目类型</span>
          <div className="schedule-filter-chips">
            {options.projectTypes.map((facet) => (
              <button
                aria-label={`${facet.label}：${facet.tooltip.replace(/\n/g, "；")}`}
                className={`schedule-filter-chip with-meta ${
                  facet.kind === "customerType"
                    ? filters.customerTypes.includes(facet.value) ? "active" : ""
                    : filters.bizTypes.includes(facet.value) ? "active" : ""
                }`}
                key={`${facet.kind}-${facet.value}`}
                onClick={() => {
                  if (facet.kind === "customerType") {
                    update({ customerTypes: toggleStringValue(filters.customerTypes, facet.value) });
                  } else {
                    update({ bizTypes: toggleStringValue(filters.bizTypes, facet.value) });
                  }
                }}
                title={facet.tooltip}
                type="button"
              >
                <span>{facet.label}</span>
                <small>{facet.badge}</small>
              </button>
            ))}
            {!options.projectTypes.length ? <span className="muted">当前项目没有可追溯到规则标签的项目类型</span> : null}
          </div>
        </div>
        <div className="schedule-filter-group">
          <span>检查形式</span>
          <div className="schedule-filter-chips">
            {options.checkTypes.map((type) => (
              <button
                aria-label={`${checkTypeText(type)}：由规则频次计算生成的排期输出，不作为项目类型标签`}
                className={`schedule-filter-chip ${filters.checkTypes.includes(type) ? "active" : ""}`}
                key={type}
                onClick={() => update({ checkTypes: toggleStringValue(filters.checkTypes, type) })}
                title="检查形式是规则判断后的排期输出，用于筛选现场/非现场任务，不属于项目类型标签。"
                type="button"
              >
                {checkTypeText(type)}
              </button>
            ))}
            {!options.checkTypes.length ? <span className="muted">当前排期没有现场或非现场任务</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualTaskQueue({
  run,
  projects,
  people,
  algorithmPersonTypeLabels,
  selectedTaskId,
  filterMode,
  filters,
  onSelectTask,
  onToggleManual
}: {
  run: SchedulingRun;
  projects: Project[];
  people: Person[];
  algorithmPersonTypeLabels: Set<string>;
  selectedTaskId: string | null;
  filterMode: ScheduleFilter;
  filters: ScheduleFilterState;
  onSelectTask: (task: Task) => void;
  onToggleManual: () => void;
}) {
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const personByName = useMemo(() => new Map(people.map((person) => [person.name, person])), [people]);
  const allManualTasks = useMemo(() => run.tasks.filter(isManualTask), [run.tasks]);
  const manualTasks = useMemo(
    () =>
      allManualTasks.filter((task) => {
        const project = projectById.get(task.projectId);
        return project ? taskWithProjectMatchesScheduleFilters(project, task, personById, personByName, filters, algorithmPersonTypeLabels) : false;
      }),
    [algorithmPersonTypeLabels, allManualTasks, filters, personById, personByName, projectById]
  );
  const active = filterMode === "manual";
  return (
    <section className={`panel manual-queue ${active ? "active" : "collapsed"}`}>
      <div className="section-title">
        <div>
          <h2>待人工任务</h2>
          <span>{manualTasks.length ? `已筛选 ${manualTasks.length} / 共 ${allManualTasks.length} 个任务需要发布前确认` : `当前筛选下没有待人工任务 · 共 ${allManualTasks.length} 个`}</span>
        </div>
        <button className={`button ${active ? "primary" : ""}`} onClick={onToggleManual} type="button">
          <ListFilter size={15} />
          {active ? "查看全部项目" : "只看待人工"}
        </button>
      </div>
      {active ? (
        <div className="manual-task-list">
          {manualTasks.map((task) => (
            <button
              className={`manual-task ${selectedTaskId === task.id ? "active" : ""}`}
              key={task.id}
              onClick={() => onSelectTask(task)}
              type="button"
            >
              <div>
                <span>项目编号 {task.projectId} · {checkTypeText(task.checkType)}</span>
                <strong>{task.projectName}</strong>
              </div>
              <p>缺失：{taskMissingItems(task).join("、")}</p>
              <small>{assigneeDisplayNameForTask(task, personById, personByName)}｜选择负责人/日期</small>
            </button>
          ))}
          {!manualTasks.length ? <div className="empty compact">当前筛选下没有待人工任务。</div> : null}
        </div>
      ) : (
        <div className="manual-queue-summary">
          {manualTasks.slice(0, 4).map((task) => (
            <button className="chip action-chip" key={task.id} onClick={() => onSelectTask(task)} type="button">
              {task.projectId} · {taskMissingItems(task).join("、")}
            </button>
          ))}
          {manualTasks.length > 4 ? <span className="chip">+{manualTasks.length - 4}</span> : null}
        </div>
      )}
    </section>
  );
}

function ProjectMatrix({
  run,
  projects,
  people,
  algorithmPersonTypeLabels,
  selectedId,
  selectedTaskId,
  filterMode,
  filters,
  filterBar,
  onlyIssues,
  onSelect
}: {
  run: SchedulingRun;
  projects: Project[];
  people: Person[];
  algorithmPersonTypeLabels: Set<string>;
  selectedId: string;
  selectedTaskId: string | null;
  filterMode: ScheduleFilter;
  filters: ScheduleFilterState;
  filterBar: React.ReactNode;
  onlyIssues: boolean;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const personByName = useMemo(() => new Map(people.map((person) => [person.name, person])), [people]);
  const projectIds = useMemo(() => [...new Set(run.decisionLogs.map((entry) => entry.projectId))], [run.decisionLogs]);

  const rows = useMemo(
    () =>
      projectIds
        .map((id) => {
          const project = projectById.get(id);
          if (!project) return null;
          const tasks = tasksForProject(run, id);
          const status = projectStatus(run, id);
          return { project, tasks, status, stepMap: stepStatus(run, id), monthClasses: monthTaskClasses(tasks) };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .filter((row) => projectMatchesScheduleFilters(row.project, row.tasks, personById, personByName, filters, algorithmPersonTypeLabels))
        .filter((row) => (query ? row.project.name.includes(query) || row.project.id.includes(query.toUpperCase()) : true))
        .filter((row) => (filterMode === "manual" ? row.tasks.some((task) => isManualTask(task) && taskWithProjectMatchesScheduleFilters(row.project, task, personById, personByName, filters, algorithmPersonTypeLabels)) : true))
        .filter((row) => (onlyIssues ? row.status === "warn" || row.status === "block" : true)),
    [algorithmPersonTypeLabels, filterMode, filters, onlyIssues, personById, personByName, projectById, projectIds, query, run]
  );

  const hasActiveControls = scheduleFilterHasValue(filters) || Boolean(filterMode) || Boolean(query);

  return (
    <section className={`panel schedule-result-panel ${hasActiveControls ? "has-active-filters" : ""}`}>
      <div className="section-title schedule-result-title">
        <div>
          <h2>{filterMode === "manual" ? "待人工项目矩阵" : "项目规则覆盖矩阵"}</h2>
          <span>筛选、搜索与下方列表同步生效 · 当前显示 {rows.length} 个项目</span>
        </div>
        {hasActiveControls ? <span className="schedule-result-badge">已筛选</span> : <span className="schedule-result-badge neutral">全量</span>}
      </div>
      {filterBar}
      <div className="filters schedule-result-toolbar">
        <label>
          <Search size={14} />
        </label>
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="在当前筛选结果中搜索项目编号或名称" />
        <span className="schedule-result-count">下方列表 {rows.length} 项</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th>画像</th>
              <th>五步覆盖</th>
              <th>年度时间线</th>
              <th>负责人</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const firstTask = row.tasks[0];
              return (
                <tr
                  className={selectedId === row.project.id || (selectedTaskId ? row.tasks.some((task) => task.id === selectedTaskId) : false) ? "selected-row" : ""}
                  key={row.project.id}
                  onClick={() => onSelect(row.project.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <div className="project-name">{row.project.name}</div>
                    <div className="muted">{row.project.groupName ?? `项目编号 ${row.project.id}`}</div>
                  </td>
                  <td>
                    <div className="chips">
                      <span className="chip">{labelMaps.customerType[row.project.customerType]}</span>
                      <span className="chip">{labelMaps.riskGrade[row.project.riskGrade]}</span>
                      <span className="chip">{(row.project.exposureBalance / 100_000_000).toFixed(2)}亿</span>
                    </div>
                  </td>
                  <td>
                    <div className="status-row">
                      {(["scope", "frequency", "assignee", "time", "validation"] as const).map((step) => (
                        <StatusDot key={step} result={row.stepMap.get(step) ?? "pass"} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="timeline">
                      {row.monthClasses.map((className, index) => (
                        <span className={`month ${className}`} key={index} title={`${index + 1}月`} />
                      ))}
                    </div>
                  </td>
                  <td>{firstTask ? assigneeDisplayNameForTask(firstTask, personById, personByName) : "待人工"}</td>
                  <td>
                    <span className="chip">{matrixTaskStatusLabel(row.status, row.tasks)}</span>
                    {selectedId === row.project.id ? <ChevronRight size={14} /> : null}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty compact">当前筛选下没有匹配项目，请调整或清空筛选。</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const impactLabel: Record<DecisionExplanation["impact"], string> = {
  can_publish: "可继续",
  manual_needed: "需人工确认",
  blocks_publish: "阻断发布",
  excluded: "免除检查"
};

type DrawerDecisionExplanation = {
  id: string;
  impact: DecisionExplanation["impact"];
  title: string;
  question: string;
  answer: string;
  keyFacts: DecisionExplanation["keyFacts"];
  policyBasis: DecisionExplanation["policyBasis"];
  systemAction: string;
  traceRuleLabel: string;
  traceStatusLabel: string;
};

const drawerExplanationFromLog = (entry: DecisionExplanation, title: string): DrawerDecisionExplanation => ({
  id: entry.id,
  impact: entry.impact,
  title,
  question: entry.businessQuestion,
  answer: entry.businessAnswer,
  keyFacts: entry.keyFacts,
  policyBasis: entry.policyBasis,
  systemAction: entry.systemAction,
  traceRuleLabel: businessRuleLabel(entry.trace.technicalRuleId),
  traceStatusLabel: "已留痕"
});

const compactTagFacts = (projectTagGroups: Record<string, string[]>): DecisionExplanation["keyFacts"] => {
  const entries = Object.entries(projectTagGroups);
  if (!entries.length) return [{ label: "标签状态", value: "暂无可用标签" }];
  return entries.slice(0, 6).map(([group, names]) => ({
    label: group,
    value: names.length ? `${names.slice(0, 4).join("、")}${names.length > 4 ? ` 等${names.length}项` : ""}` : "无"
  }));
};

const summarizeTagGroups = (projectTagGroups: Record<string, string[]>) => {
  const total = Object.values(projectTagGroups).reduce((sum, names) => sum + names.length, 0);
  if (!total) return "当前项目暂无可展示标签，后续规则只能依赖项目字段判断。";
  const groupNames = Object.keys(projectTagGroups).join("、");
  return `系统已将项目字段归一为 ${total} 个业务标签，覆盖${groupNames}，后续规则判断和人员匹配均基于这些标签及原始字段共同执行。`;
};

const fallbackDrawerExplanation = ({
  id,
  impact = "can_publish",
  title,
  question,
  answer,
  keyFacts = [],
  systemAction,
  traceRuleLabel = "系统判断",
  traceStatusLabel = "无独立日志"
}: {
  id: string;
  impact?: DecisionExplanation["impact"];
  title: string;
  question: string;
  answer: string;
  keyFacts?: DecisionExplanation["keyFacts"];
  systemAction: string;
  traceRuleLabel?: string;
  traceStatusLabel?: string;
}): DrawerDecisionExplanation => ({
  id,
  impact,
  title,
  question,
  answer,
  keyFacts,
  policyBasis: [],
  systemAction,
  traceRuleLabel,
  traceStatusLabel
});

const createDrawerDecisionExplanations = ({
  project,
  explanations,
  tasks,
  selectedTask,
  projectTagGroups
}: {
  project: Project;
  explanations: DecisionExplanation[];
  tasks: Task[];
  selectedTask: Task | null;
  projectTagGroups: Record<string, string[]>;
}): DrawerDecisionExplanation[] => {
  const scope = explanations.find((entry) => entry.step === "scope");
  const frequency = explanations.find((entry) => entry.step === "frequency");
  const assignee =
    (selectedTask ? explanations.find((entry) => entry.step === "assignee" && entry.trace.rawLog.taskId === selectedTask.id) : undefined) ??
    explanations.find((entry) => entry.step === "assignee");
  const time =
    (selectedTask ? explanations.find((entry) => entry.step === "time" && entry.trace.rawLog.taskId === selectedTask.id) : undefined) ??
    explanations.find((entry) => entry.step === "time");
  const isExcluded = scope?.impact === "excluded";
  const hasTasks = tasks.length > 0;
  const taskFacts = selectedTask
    ? [
        { label: "当前任务", value: `${checkTypeText(selectedTask.checkType)} · 第 ${selectedTask.occurrenceIndex}/${selectedTask.occurrenceTotal} 次` },
        { label: "任务状态", value: taskStatusLabel[selectedTask.status] },
        { label: "负责人", value: selectedTask.assigneeName ?? "待人工确认" }
      ]
    : [{ label: "任务状态", value: hasTasks ? `${tasks.length} 项任务` : "未生成检查任务" }];

  return [
    scope
      ? drawerExplanationFromLog(scope, "数据准备")
      : fallbackDrawerExplanation({
          id: `${project.id}-scope-fallback`,
          title: "数据准备",
          question: "项目是否具备进入排期判断的基础数据？",
          answer: "当前未找到独立的数据准备日志，系统将按项目字段继续尝试规则判断。",
          keyFacts: [{ label: "项目", value: project.name }],
          systemAction: "系统保留项目字段，进入后续标签归一和规则判断。"
        }),
    fallbackDrawerExplanation({
      id: `${project.id}-tag-normalization`,
      title: "标签归一",
      question: "项目字段被归一成哪些业务标签？",
      answer: summarizeTagGroups(projectTagGroups),
      keyFacts: compactTagFacts(projectTagGroups),
      systemAction: "系统把客户类型、行业、业务类型、关系归属、敞口分档等字段归一为标签快照，供规则和人员匹配复核。",
      traceRuleLabel: "标签体系",
      traceStatusLabel: "由字段派生"
    }),
    frequency
      ? drawerExplanationFromLog(frequency, "规则判断")
      : fallbackDrawerExplanation({
          id: `${project.id}-frequency-fallback`,
          impact: isExcluded ? "excluded" : "manual_needed",
          title: "规则判断",
          question: "项目命中了哪条检查频次或免检规则？",
          answer: isExcluded
            ? "项目已在数据准备阶段被判定为免检或不纳入，因此无需继续计算检查频次。"
            : "当前项目没有形成独立频次判断日志，通常意味着仍需补规则口径、补项目数据或重新生成候选排期。",
          keyFacts: taskFacts,
          systemAction: isExcluded ? "系统停止生成检查任务。" : "系统等待规则或数据补齐后重新计算排期。",
          traceRuleLabel: isExcluded ? "免检/不纳入" : "检查口径待确认",
          traceStatusLabel: isExcluded ? "不适用" : "待补充"
        }),
    assignee
      ? drawerExplanationFromLog(assignee, "人员匹配")
      : fallbackDrawerExplanation({
          id: `${project.id}-assignee-fallback`,
          impact: isExcluded || !hasTasks ? "excluded" : "manual_needed",
          title: "人员匹配",
          question: "负责人如何匹配？",
          answer: isExcluded || !hasTasks
            ? "项目未生成检查任务，因此无需匹配负责人。"
            : "当前任务还没有形成自动负责人建议，需要业务人员在排期页确认负责人。",
          keyFacts: taskFacts,
          systemAction: isExcluded || !hasTasks ? "系统不执行人员分派。" : "系统将任务保留为待人工确认。",
          traceRuleLabel: "人员匹配策略",
          traceStatusLabel: isExcluded || !hasTasks ? "不适用" : "待人工"
        }),
    time
      ? drawerExplanationFromLog(time, "时间安排")
      : fallbackDrawerExplanation({
          id: `${project.id}-time-fallback`,
          impact: isExcluded || !hasTasks ? "excluded" : "manual_needed",
          title: "时间安排",
          question: "检查窗口如何安排？",
          answer: isExcluded || !hasTasks
            ? "项目未生成现场或非现场任务，因此没有计划开始日和结束日。"
            : "当前任务未形成自动时间窗口，需要业务人员补充或确认开始日期。",
          keyFacts: taskFacts,
          systemAction: isExcluded || !hasTasks ? "系统不写入排期时间。" : "系统保留待人工时间安排，处理后会刷新矩阵、审计数字和导出报告。",
          traceRuleLabel: "时间安排策略",
          traceStatusLabel: isExcluded || !hasTasks ? "不适用" : "待人工"
        })
  ];
};

const scheduleMatrixStatusLabel: Record<DecisionResult, string> = {
  pass: "已覆盖",
  warn: "待确认",
  block: "阻断",
  excluded: "免检"
};

function TaskResolutionCard({
  run,
  task,
  people,
  request
}: {
  run: SchedulingRun;
  task: Task | null;
  people: Person[];
  request: WorkspaceRequest;
}) {
  const [assigneeId, setAssigneeId] = useState(() => assigneeFormValueForTask(task, people));
  const [scheduledDate, setScheduledDate] = useState(task?.scheduledDate ?? "");
  const [manualReason, setManualReason] = useState("发布前人工确认：本年不安排检查");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "warn" | "error"; text: string } | null>(null);
  const [editingPlacedTask, setEditingPlacedTask] = useState(false);
  const peopleOptions = useMemo(
    () => [...people].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "zh-CN")),
    [people]
  );

  useEffect(() => {
    setAssigneeId(assigneeFormValueForTask(task, people));
    setScheduledDate(task?.scheduledDate ?? "");
    setManualReason(task?.status === "exempted" ? "发布前人工确认：重新安排检查" : "发布前人工确认：本年不安排检查");
    setEditingPlacedTask(false);
  }, [people, task?.assigneeId, task?.assigneeName, task?.id, task?.scheduledDate, task?.status]);

  useEffect(() => {
    setMessage(null);
  }, [task?.id]);

  if (!task) return null;

  const assigneeChanged = assigneeId !== (task.assigneeId ?? "");
  const dateChanged = scheduledDate !== (task.scheduledDate ?? "");
  const isSkipped = task.status === "exempted";
  const needsManualAction = isManualTask(task);
  const showArrangementEditor = needsManualAction || editingPlacedTask;
  const editState = runEditState(run);
  const canSave = editState.editable && !isSkipped && showArrangementEditor && (assigneeChanged || dateChanged) && !saving;
  const defaultArrangeReason = "发布前人工确认：安排检查";
  const skipReason = manualReason.trim() || "发布前人工确认：本年不安排检查";
  const reopenReason = manualReason.trim() || "发布前人工确认：重新安排检查";

  const save = async () => {
    if (!editState.editable) {
      setMessage({ tone: "warn", text: editState.reason });
      return;
    }
    if (!canSave) {
      setMessage({ tone: "warn", text: "负责人或开始日期没有变化" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (assigneeChanged) {
        await request<SchedulingRun>(`/runs/${run.id}/tasks/${task.id}/override`, {
          method: "POST",
          body: JSON.stringify({ field: "assigneeId", value: assigneeId || null, reason: defaultArrangeReason })
        });
      }
      if (dateChanged) {
        await request<SchedulingRun>(`/runs/${run.id}/tasks/${task.id}/override`, {
          method: "POST",
          body: JSON.stringify({ field: "scheduledDate", value: scheduledDate || null, reason: defaultArrangeReason })
        });
      }
      setMessage({ tone: "success", text: "人工确认已保存，矩阵和审计条已刷新" });
      setEditingPlacedTask(false);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? readableApiError(error.message) : "保存人工确认失败" });
    } finally {
      setSaving(false);
    }
  };

  const saveDisposition = async (value: "skip" | "reopen") => {
    if (!editState.editable) {
      setMessage({ tone: "warn", text: editState.reason });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await request<SchedulingRun>(`/runs/${run.id}/tasks/${task.id}/override`, {
        method: "POST",
        body: JSON.stringify({
          field: "manualDisposition",
          value,
          reason: value === "skip" ? skipReason : reopenReason
        })
      });
      setMessage({
        tone: "success",
        text: value === "skip" ? "已确认本年不安排，任务已移出待人工队列" : "已恢复为待人工确认，可继续安排负责人和日期"
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? readableApiError(error.message) : "保存人工确认失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="task-resolution-card">
      <div className="decision-head">
        <span>当前任务</span>
        <span className="chip">{taskArrangementStatus(task)}</span>
      </div>
      <div className="task-readonly-grid">
        <div><span>检查形式</span><strong>{taskShortTitle(task)}</strong></div>
        <div><span>负责人</span><strong>{task.assigneeName ?? "待人工确认"}</strong></div>
        <div><span>计划窗口</span><strong>{taskWindowText(task)}</strong></div>
        <div><span>任务状态</span><strong>{taskArrangementStatus(task)}</strong></div>
      </div>
      {!editState.editable ? <div className="action-message warn">{editState.reason}</div> : null}
      {!showArrangementEditor && !isSkipped ? (
        <div className="task-readonly-note">
          <span>{needsManualAction ? "需要补齐负责人或开始日期。" : "已排入任务默认只读，避免误改正式方案。"}</span>
          <button className="button" disabled={!editState.editable || saving} onClick={() => setEditingPlacedTask(true)} type="button">
            调整此任务
          </button>
        </div>
      ) : null}
      {showArrangementEditor && !isSkipped ? (
        <>
          <div className="manual-action-tabs" aria-label="人工确认动作">
            <span className="chip success-chip">安排检查</span>
            <span className="chip">本年不安排</span>
          </div>
          <div className="form-grid compact-form">
            <label>
              负责人
              <select
                className="select"
                disabled={!editState.editable}
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.currentTarget.value)}
                onInput={(event) => setAssigneeId(event.currentTarget.value)}
              >
                <option value="">待选择负责人</option>
                {peopleOptions.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.name} · {person.dept}{person.isActive ? "" : " · 停用"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              开始日期
              <input
                className="search"
                disabled={!editState.editable}
                type="date"
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.currentTarget.value)}
                onInput={(event) => setScheduledDate(event.currentTarget.value)}
              />
            </label>
          </div>
          <div className="inline-actions left">
            <button className="button primary" disabled={!canSave} onClick={() => void save()} type="button">
              <Check size={15} />
              {saving ? "保存中" : "保存人工确认"}
            </button>
            <button className="button" disabled={!editState.editable || saving} onClick={() => { setAssigneeId(assigneeFormValueForTask(task, people)); setScheduledDate(task.scheduledDate ?? ""); setEditingPlacedTask(false); }} type="button">
              取消调整
            </button>
          </div>
        </>
      ) : null}
      {(needsManualAction || isSkipped || editingPlacedTask) ? (
        <div className="manual-disposition-box">
          <label>
            人工处理原因
            <textarea
              className="search"
              disabled={!editState.editable}
              rows={3}
              value={manualReason}
              onChange={(event) => setManualReason(event.currentTarget.value)}
              placeholder="填写本次人工确认原因"
            />
          </label>
          {isSkipped ? (
            <button className="button" disabled={!editState.editable || saving} onClick={() => void saveDisposition("reopen")} type="button">
              重新处理该任务
            </button>
          ) : (
            <button className="button danger-button" disabled={!editState.editable || saving} onClick={() => void saveDisposition("skip")} type="button">
              本年不安排检查
            </button>
          )}
        </div>
      ) : null}
      {message ? <div className={`action-message ${message.tone}`}>{message.text}</div> : null}
    </div>
  );
}

function DecisionDrawer({
  run,
  projects,
  people,
  tagLibrary,
  projectId,
  selectedTaskId,
  onTaskSelect,
  request
}: {
  run: SchedulingRun;
  projects: Project[];
  people: Person[];
  tagLibrary: TagDefinition[];
  projectId: string;
  selectedTaskId: string | null;
  onTaskSelect: (taskId: string) => void;
  request: WorkspaceRequest;
}) {
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const project = projectById.get(projectId);
  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const personByName = useMemo(() => new Map(people.map((person) => [person.name, person])), [people]);
  const projectTagGroups = project ? tagNamesByCategory(project.tagIds ?? [], tagLibrary) : {};
  const tasks = tasksForProject(run, projectId);
  const selectedTask = (selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) : null) ?? tasks.find(isManualTask) ?? tasks[0] ?? null;
  const logs = run.decisionLogs.filter((entry) => entry.projectId === projectId);
  const explanations = project ? createDecisionExplanations({ project, logs, tasks, conflicts: run.conflicts }) : [];
  const drawerExplanations = project
    ? createDrawerDecisionExplanations({ project, explanations, tasks, selectedTask, projectTagGroups })
    : [];
  const onsiteTasks = tasks.filter((task) => task.checkType === "onsite");
  const offsiteTasks = tasks.filter((task) => task.checkType === "offsite");
  const owners = [...new Set(tasks.map((task) => assigneeDisplayNameForTask(task, personById, personByName)))].join("、") || "无需分派";
  const windows = tasks
    .filter((task) => task.scheduledDate)
    .map((task) => `${task.checkType === "onsite" ? "现场" : "非现场"} ${task.scheduledDate}${task.endDate ? ` 至 ${task.endDate}` : ""}`);
  const mostImportant =
    explanations.find((entry) => entry.impact === "blocks_publish") ??
    explanations.find((entry) => entry.impact === "manual_needed") ??
    explanations.find((entry) => entry.result === "warn") ??
    explanations[explanations.length - 1];
  const blockingLog = logs.find((entry) => entry.result === "block");
  const manualTask = tasks.find(isManualTask);
  const allSkipped = tasks.length > 0 && tasks.every((task) => task.status === "exempted");
  const isExcluded = explanations.some((entry) => entry.impact === "excluded");
  const isDataGapBlock = blockingLog?.ruleHit === "P5" || blockingLog?.ruleHit === "P6";
  const conclusionLabel =
    blockingLog
      ? "规则阻断"
      : allSkipped
        ? "人工确认不安排"
        : isExcluded || !tasks.length
          ? "免检"
          : manualTask
            ? "待人工确认"
            : "已排入";
  const conclusionTone =
    blockingLog
      ? "danger"
      : manualTask
        ? "warn"
        : allSkipped || isExcluded || !tasks.length
          ? "neutral"
          : "good";
  const nextAction =
    blockingLog
      ? isDataGapBlock
        ? "回项目维护补齐项目字段后重新生成候选方案。"
        : "到规则维护补充检查口径后重新试算。"
      : manualTask
        ? `需要处理：${missingItemsBusinessText(manualTask)}。保存后会刷新矩阵、待办数字和导出报告。`
        : allSkipped
          ? "已确认本年不安排，导出报告会作为人工确认结果展示。"
          : isExcluded || !tasks.length
            ? "本项目不生成检查任务，无需处理。"
            : "当前任务已排入，如需调整可在任务区进入编辑。";
  const currentTaskTitle = selectedTask ? taskShortTitle(selectedTask) : "无检查任务";
  const keyTagEntries = Object.entries(projectTagGroups).slice(0, 4);
  const allPolicyBasis = drawerExplanations.flatMap((entry) => entry.policyBasis);
  const uniquePolicyBasis = [...new Map(allPolicyBasis.map((basis) => [basis.id, basis])).values()];

  return (
    <aside className="panel drawer">
      <div className={`schedule-conclusion-card ${conclusionTone}`}>
        <div className="schedule-conclusion-head">
          <div>
            <span className="decision-kicker">项目排期结论</span>
            <h3>{conclusionLabel}</h3>
          </div>
          <span className={`chip ${conclusionTone === "danger" ? "danger-chip" : conclusionTone === "warn" ? "warning-chip" : conclusionTone === "good" ? "success-chip" : ""}`}>
            {mostImportant?.operatorMessage ?? "无待处理事项"}
          </span>
        </div>
        <p>{nextAction}</p>
        <div className="schedule-conclusion-metrics">
          <div><span>现场次数</span><strong>{onsiteTasks.length} 次</strong></div>
          <div><span>非现场次数</span><strong>{offsiteTasks.length} 次</strong></div>
          <div><span>负责人</span><strong>{owners}</strong></div>
          <div><span>计划窗口</span><strong>{windows.length ? windows.join("；") : tasks.length ? "待人工确认" : "不生成任务"}</strong></div>
        </div>
      </div>

      <section className="schedule-detail-section">
        <div className="schedule-detail-heading">
          <div>
            <span className="decision-kicker">当前任务</span>
            <h3>{currentTaskTitle}</h3>
          </div>
          <span className="chip">{taskArrangementStatus(selectedTask)}</span>
        </div>
        {tasks.length ? (
          <div className="task-switcher">
            {tasks.map((task) => (
              <button className={`task-chip ${selectedTask?.id === task.id ? "active" : ""}`} key={task.id} onClick={() => onTaskSelect(task.id)} type="button">
                {taskShortTitle(task)}
                <span>{taskWindowText(task)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty compact">本项目不生成检查任务。</div>
        )}
        <TaskResolutionCard run={run} task={selectedTask} people={people} request={request} />
      </section>

      <section className="schedule-detail-section">
        <div className="schedule-detail-heading">
          <div>
            <span className="decision-kicker">为什么这样排</span>
            <h3>五步业务解释</h3>
          </div>
          <ShieldCheck size={16} color="#0f7578" />
        </div>
        <div className="decision-step-rail" aria-label="排期决策步骤">
          {["数据准备", "标签归一", "规则判断", "人员匹配", "时间安排"].map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
        <div className="decision-list compact">
          {drawerExplanations.map((entry) => {
            const shouldOpen = entry.impact !== "can_publish";
            return (
              <details className={`decision-item impact-${entry.impact}`} key={entry.id} open={shouldOpen}>
                <summary className="decision-head">
                  <span>{entry.title}</span>
                  <span className="chip">{impactLabel[entry.impact]}</span>
                </summary>
                <div className="decision-question">
                  <strong>{entry.question}</strong>
                  <p>{entry.answer}</p>
                </div>
                {entry.keyFacts.length ? (
                  <div className="fact-pills">
                    {entry.keyFacts.map((fact) => (
                      <span key={`${entry.id}-${fact.label}`}>{fact.label}：{fact.value}</span>
                    ))}
                  </div>
                ) : null}
                {entry.policyBasis.length ? (
                  <details className="policy-basis">
                    <summary>查看制度依据</summary>
                    {entry.policyBasis.map((basis) => (
                      <p key={`${entry.id}-${basis.id}`}>
                        {compactDocName(basis.sourceDocument)} · {citationLabel(basis)}：{basis.sourceExcerpt}
                      </p>
                    ))}
                  </details>
                ) : null}
                <p className="system-action">{entry.systemAction}</p>
              </details>
            );
          })}
        </div>
      </section>

      <section className="schedule-detail-section">
        <div className="schedule-detail-heading">
          <div>
            <span className="decision-kicker">关键业务标签</span>
            <h3>影响规则与人员匹配的标签</h3>
          </div>
        </div>
        <div className="tag-summary-grid compact">
          {keyTagEntries.map(([group, names]) => (
            <div className="tag-field-group" key={group}>
              <span>{group}</span>
              <div className="chips">{names.slice(0, 4).map((name) => <span className="chip" key={name}>{name}</span>)}</div>
            </div>
          ))}
          {!keyTagEntries.length ? <div className="empty compact">暂无可展示标签。</div> : null}
        </div>
        {Object.keys(projectTagGroups).length > keyTagEntries.length ? (
          <details className="schedule-audit-details">
            <summary>查看全部标签</summary>
            <div className="tag-summary-grid compact">
              {Object.entries(projectTagGroups).map(([group, names]) => (
                <div className="tag-field-group" key={`all-${group}`}>
                  <span>{group}</span>
                  <div className="chips">{names.map((name) => <span className="chip" key={`${group}-${name}`}>{name}</span>)}</div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <details className="schedule-detail-section schedule-audit-details">
        <summary className="schedule-detail-heading">
          <div>
            <span className="decision-kicker">审计追溯</span>
            <h3>制度依据、系统动作与导出口径</h3>
          </div>
          <CalendarDays size={16} color="#667085" />
        </summary>
        <div className="decision-list compact">
          {drawerExplanations.map((entry) => (
            <div className="trace-grid compact" key={`trace-${entry.id}`}>
              <span>{entry.title}</span>
              <strong>{entry.traceRuleLabel}</strong>
              <span>记录状态</span>
              <strong>{entry.traceStatusLabel}</strong>
            </div>
          ))}
        </div>
        {uniquePolicyBasis.length ? (
          <div className="audit-policy-list">
            {uniquePolicyBasis.map((basis) => (
              <p key={`audit-${basis.id}`}>{compactDocName(basis.sourceDocument)} · {citationLabel(basis)}：{basis.sourceExcerpt}</p>
            ))}
          </div>
        ) : null}
        <div className="decision-item">
          <div className="decision-head">
            <span>导出报告口径</span>
            <CalendarDays size={15} />
          </div>
          <p>导出报告会记录项目结论、检查次数、负责人、计划窗口、人工确认结果和规则判断说明。</p>
        </div>
      </details>
    </aside>
  );
}

function ScheduleTaskDrawer({
  open,
  run,
  projects,
  people,
  tagLibrary,
  projectId,
  selectedTaskId,
  onTaskSelect,
  onClose,
  request
}: {
  open: boolean;
  run: SchedulingRun;
  projects: Project[];
  people: Person[];
  tagLibrary: TagDefinition[];
  projectId: string;
  selectedTaskId: string | null;
  onTaskSelect: (taskId: string) => void;
  onClose: () => void;
  request: WorkspaceRequest;
}) {
  const project = projects.find((item) => item.id === projectId);
  const tasks = tasksForProject(run, projectId);
  const selectedTask = (selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) : null) ?? tasks.find(isManualTask) ?? tasks[0] ?? null;
  const editState = runEditState(run);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || !project) return null;

  return (
    <div className="schedule-drawer-layer">
      <button className="schedule-drawer-backdrop" aria-label="关闭排期处理抽屉" onClick={onClose} type="button" />
      <aside className="schedule-task-drawer" aria-label={`正在处理：${project.name}`} aria-modal="true" role="dialog">
        <header className="schedule-drawer-header">
          <div>
            <span>排期项目详情</span>
            <h2>{project.id} · {project.name}</h2>
            <p>{selectedTask ? `${taskShortTitle(selectedTask)} · ${taskArrangementStatus(selectedTask)}` : "本项目不生成检查任务"}</p>
          </div>
          <button className="icon-button" aria-label="收起排期处理抽屉" onClick={onClose} type="button">
            <X size={17} />
          </button>
        </header>
        {!editState.editable ? (
          <div className="schedule-drawer-lock">
            <Lock size={15} />
            <span>{editState.reason}</span>
          </div>
        ) : null}
        <div className="schedule-drawer-body">
          <DecisionDrawer
            run={run}
            projects={projects}
            people={people}
            tagLibrary={tagLibrary}
            projectId={projectId}
            selectedTaskId={selectedTask?.id ?? selectedTaskId}
            onTaskSelect={onTaskSelect}
            request={request}
          />
        </div>
      </aside>
    </div>
  );
}

function PeopleView({ run }: { run: SchedulingRun }) {
  const rows = peopleCapacity(run);
  return (
    <div className="capacity-grid">
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>全队产能条</h2>
            <span>现场容量按 44 周测算</span>
          </div>
          <Users size={18} color="#0f7578" />
        </div>
        <div className="capacity-list">
          {rows.map((row) => {
            const pct = Math.round((row.onsite / 44) * 100);
            return (
              <div className="capacity-row" key={row.name}>
                <strong>{row.name}</strong>
                <div className="bar">
                  <div className={`bar-fill ${pct >= 100 ? "bad" : pct >= 80 ? "warn" : ""}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <span className="muted">{pct}%</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>月度负荷热力</h2>
            <span>人 × 12 月现场周数</span>
          </div>
          <BarChart3 size={18} color="#0f7578" />
        </div>
        <div className="heatmap">
          <span className="heat-label">负责人</span>
          {Array.from({ length: 12 }, (_, index) => (
            <span className="heat-cell" key={index}>
              {index + 1}
            </span>
          ))}
          {rows.map((row) => (
            <div style={{ display: "contents" }} key={row.name}>
              <span className="heat-label">{row.name}</span>
              {row.months.map((value, index) => (
                <span className={`heat-cell level-${value >= 4 ? 3 : value >= 2 ? 2 : value >= 1 ? 1 : 0}`} key={index}>
                  {value || ""}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function WhatIfView({ run, assetRun }: { run: SchedulingRun; assetRun: SchedulingRun }) {
  const runDiff = diffRuns(run, assetRun);
  return (
    <div className="diff-grid">
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>试算方案对比</h2>
            <span>按样表维护人排期 → 按资产部 7 人池排期</span>
          </div>
          <button className="button primary">
            <Play size={15} />
            试算
          </button>
        </div>
        <div className="audit-grid compact-grid padded">
          <div className="metric">
            <div className="metric-label">当前现场</div>
            <div className="metric-value">{run.audit.onsiteTasks}</div>
          </div>
          <div className="metric">
            <div className="metric-label">试算现场</div>
            <div className="metric-value">{assetRun.audit.onsiteTasks}</div>
          </div>
          <div className={`metric ${assetRun.audit.hardConflicts ? "bad" : "good"}`}>
            <div className="metric-label">阻断冲突</div>
            <div className="metric-value">{assetRun.audit.hardConflicts}</div>
          </div>
          <div className={`metric ${assetRun.audit.ruleGap ? "bad" : "good"}`}>
            <div className="metric-label">待补口径</div>
            <div className="metric-value">{assetRun.audit.ruleGap}</div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <h2>差异项目</h2>
          <span>{runDiff.length} 项</span>
        </div>
        <div className="decision-list">
          {runDiff.slice(0, 8).map((item, index) => (
            <div className="decision-item" key={`${item.projectId}-${index}`}>
              <div className="decision-head">
                <span>{item.projectName}</span>
                <span>{scheduleDiffKindLabel(item.kind)}</span>
              </div>
              <p>{item.reason}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScheduleView({
  run,
  assetRun,
  projects,
  people,
  tagLibrary,
  selectedId,
  routeState,
  onSelect,
  onNavigate,
  request
}: {
  run: SchedulingRun;
  assetRun: SchedulingRun;
  projects: Project[];
  people: Person[];
  tagLibrary: TagDefinition[];
  selectedId: string;
  routeState: RouteState;
  onSelect: (id: string) => void;
  onNavigate: (view: View, params?: RouteState) => void;
  request: WorkspaceRequest;
}) {
  const [filterMode, setFilterMode] = useState<ScheduleFilter>(routeState.filter ?? null);
  const [scheduleFilters, setScheduleFilters] = useState<ScheduleFilterState>(() => scheduleFilterStateFromRoute(routeState));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(routeState.task ?? null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(Boolean(routeState.project || routeState.task));
  const manualQueueRef = useRef<HTMLDivElement | null>(null);
  const matrixRef = useRef<HTMLDivElement | null>(null);
  const editState = runEditState(run);
  const runRoute = useMemo(() => routeState.run ? { run: routeState.run } : {}, [routeState.run]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const personByName = useMemo(() => new Map(people.map((person) => [person.name, person])), [people]);
  const algorithmPersonTypeLabels = useMemo(() => schedulePersonTypeLabelsFromTagLibrary(tagLibrary), [tagLibrary]);
  const projectIds = useMemo(() => [...new Set(run.decisionLogs.map((entry) => entry.projectId))], [run.decisionLogs]);
  const allManualTasks = useMemo(() => run.tasks.filter(isManualTask), [run.tasks]);
  const filteredManualTasks = useMemo(
    () =>
      allManualTasks.filter((task) => {
        const project = projectById.get(task.projectId);
        return project ? taskWithProjectMatchesScheduleFilters(project, task, personById, personByName, scheduleFilters, algorithmPersonTypeLabels) : false;
      }),
    [algorithmPersonTypeLabels, allManualTasks, personById, personByName, projectById, scheduleFilters]
  );
  const projectIdsForFilters = (filters: ScheduleFilterState, mode: ScheduleFilter) =>
    projectIds.filter((projectId) => {
      const project = projectById.get(projectId);
      if (!project) return false;
      const tasks = tasksForProject(run, projectId);
      if (!projectMatchesScheduleFilters(project, tasks, personById, personByName, filters, algorithmPersonTypeLabels)) return false;
      if (mode === "manual") return tasks.some((task) => isManualTask(task) && taskWithProjectMatchesScheduleFilters(project, task, personById, personByName, filters, algorithmPersonTypeLabels));
      if (mode === "issues") {
        const status = projectStatus(run, projectId);
        return status === "warn" || status === "block";
      }
      return true;
    });
  const filteredProjectIds = useMemo(
    () => projectIdsForFilters(scheduleFilters, filterMode),
    [algorithmPersonTypeLabels, filterMode, personById, personByName, projectById, projectIds, run, scheduleFilters]
  );
  const scheduleFilterOptions = useMemo<ScheduleFilterOptions>(() => {
    const taskPersonTypes = new Set<string>();
    run.tasks.forEach((task) => personTypesForPerson(personForTask(task, personById, personByName), algorithmPersonTypeLabels).forEach((type) => taskPersonTypes.add(type)));
    const projectSet = projectIds.map((id) => projectById.get(id)).filter((project): project is Project => Boolean(project));
    const checkTypeSet = new Set(run.tasks.map((task) => task.checkType));
    const assigneeNames = [...new Set(run.tasks.map((task) => assigneeDisplayNameForTask(task, personById, personByName)).filter((name) => name !== "待人工"))].sort((a, b) => a.localeCompare(b, "zh-CN"));
    return {
      assignees: [
        { value: manualAssigneeFilterValue, label: "待人工" },
        ...assigneeNames.map((name) => ({ value: name, label: name }))
      ],
      personTypes: [...taskPersonTypes].sort((a, b) => a.localeCompare(b, "zh-CN")),
      projectTypes: scheduleProjectTypeFacetsFromTagLibrary(tagLibrary, projectSet),
      checkTypes: (Object.keys(labelMaps.checkType) as Task["checkType"][]).filter((type) => checkTypeSet.has(type))
    };
  }, [algorithmPersonTypeLabels, personById, personByName, projectById, projectIds, run.tasks, tagLibrary]);

  useEffect(() => {
    setFilterMode(routeState.filter ?? null);
    const nextFilters = normalizeScheduleFiltersForPersonTypes(scheduleFilterStateFromRoute(routeState), algorithmPersonTypeLabels);
    setScheduleFilters((current) => sameScheduleFilterState(current, nextFilters) ? current : nextFilters);
    setSelectedTaskId(routeState.task ?? null);
    if (routeState.project) onSelect(routeState.project);
    if (routeState.project || routeState.task) setIsTaskDrawerOpen(true);
  }, [algorithmPersonTypeLabels, routeState.assignee, routeState.bizType, routeState.checkType, routeState.customerType, routeState.filter, routeState.personType, routeState.project, routeState.task, onSelect]);

  useEffect(() => {
    if (routeState.section === "manualQueue") {
      scrollToSectionElement(manualQueueRef.current);
    }
    if (routeState.section === "scheduleMatrix") {
      scrollToSectionElement(matrixRef.current);
    }
  }, [routeState.section]);

  useEffect(() => {
    if (!filteredProjectIds.length) return;
    if (routeState.project && filteredProjectIds.includes(routeState.project)) {
      if (selectedId !== routeState.project) onSelect(routeState.project);
      return;
    }
    if (filteredProjectIds.includes(selectedId)) return;
    const nextProjectId = filteredProjectIds[0]!;
    const nextTask = filterMode === "manual" ? filteredManualTasks.find((task) => task.projectId === nextProjectId) : undefined;
    onSelect(nextProjectId);
    setSelectedTaskId(nextTask?.id ?? null);
  }, [filterMode, filteredManualTasks, filteredProjectIds, onNavigate, onSelect, routeState.project, runRoute, scheduleFilters, selectedId]);

  const navigateWithScheduleFilters = (
    nextFilterMode: ScheduleFilter,
    nextFilters: ScheduleFilterState,
    projectId: string | undefined,
    taskId: string | undefined,
    section: string | undefined
  ) => {
    const nextProjectIds = projectIdsForFilters(nextFilters, nextFilterMode);
    const resolvedProjectId = projectId ?? (nextProjectIds.includes(selectedId) ? selectedId : nextProjectIds[0]);
    const resolvedTask =
      taskId ? run.tasks.find((task) => task.id === taskId) :
      nextFilterMode === "manual" && resolvedProjectId ? run.tasks.find((task) => {
        const project = projectById.get(task.projectId);
        return task.projectId === resolvedProjectId && isManualTask(task) && project ? taskWithProjectMatchesScheduleFilters(project, task, personById, personByName, nextFilters, algorithmPersonTypeLabels) : false;
      }) : undefined;
    onNavigate("schedule", {
      ...runRoute,
      ...scheduleFilterRouteParams(nextFilters),
      filter: nextFilterMode,
      project: resolvedProjectId,
      task: resolvedTask?.id,
      section
    });
  };

  const navigateFilterOnly = (nextFilterMode: ScheduleFilter, nextFilters: ScheduleFilterState, section: string | undefined) => {
    const nextProjectIds = projectIdsForFilters(nextFilters, nextFilterMode);
    if (nextProjectIds.length && !nextProjectIds.includes(selectedId)) {
      const nextProjectId = nextProjectIds[0]!;
      const nextTask = nextFilterMode === "manual" ? run.tasks.find((task) => {
        const project = projectById.get(task.projectId);
        return task.projectId === nextProjectId && isManualTask(task) && project ? taskWithProjectMatchesScheduleFilters(project, task, personById, personByName, nextFilters, algorithmPersonTypeLabels) : false;
      }) : undefined;
      onSelect(nextProjectId);
      setSelectedTaskId(nextTask?.id ?? null);
    }
    onNavigate("schedule", {
      ...runRoute,
      ...scheduleFilterRouteParams(nextFilters),
      filter: nextFilterMode,
      section
    });
  };

  const updateScheduleFilters = (nextFilters: ScheduleFilterState) => {
    const normalizedFilters = normalizeScheduleFiltersForPersonTypes(nextFilters, algorithmPersonTypeLabels);
    setScheduleFilters(normalizedFilters);
    navigateFilterOnly(filterMode, normalizedFilters, filterMode === "manual" ? "manualQueue" : "scheduleMatrix");
  };

  const selectTask = (task: Task) => {
    setFilterMode("manual");
    setSelectedTaskId(task.id);
    setIsTaskDrawerOpen(true);
    onSelect(task.projectId);
    navigateWithScheduleFilters("manual", scheduleFilters, task.projectId, task.id, "manualQueue");
  };

  const selectProject = (projectId: string) => {
    onSelect(projectId);
    const nextTask = filterMode === "manual" ? run.tasks.find((task) => {
      const project = projectById.get(task.projectId);
      return task.projectId === projectId && isManualTask(task) && project ? taskWithProjectMatchesScheduleFilters(project, task, personById, personByName, scheduleFilters, algorithmPersonTypeLabels) : false;
    }) : undefined;
    setSelectedTaskId(nextTask?.id ?? null);
    setIsTaskDrawerOpen(true);
    navigateWithScheduleFilters(filterMode, scheduleFilters, projectId, nextTask?.id, "scheduleMatrix");
  };

  const selectTaskInDrawer = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsTaskDrawerOpen(true);
    navigateWithScheduleFilters(filterMode, scheduleFilters, selectedId, taskId, "scheduleMatrix");
  };

  const toggleManual = () => {
    const nextFilter: ScheduleFilter = filterMode === "manual" ? null : "manual";
    setFilterMode(nextFilter);
    navigateFilterOnly(nextFilter, scheduleFilters, "scheduleMatrix");
  };

  const toggleIssues = () => {
    const nextFilter: ScheduleFilter = filterMode === "issues" ? null : "issues";
    setFilterMode(nextFilter);
    setSelectedTaskId(null);
    navigateFilterOnly(nextFilter, scheduleFilters, "scheduleMatrix");
  };

  const clearScheduleFilters = () => {
    setFilterMode(null);
    setScheduleFilters(emptyScheduleFilterState);
    setSelectedTaskId(null);
    navigateFilterOnly(null, emptyScheduleFilterState, "scheduleMatrix");
  };

  return (
    <div className="stack">
      {routeState.run ? (
        <div className={`action-message ${editState.editable ? "success" : "warn"}`}>
          {editState.editable
            ? `${run.status === "archived" ? "正在查看归档排期" : "已生成正式排期草案"}，${editState.reason}`
            : editState.reason}
        </div>
      ) : null}
      <AuditStrip run={run} onNavigate={onNavigate} />
      <details className="context-panel schedule-context">
        <summary>查看试算方案对比</summary>
        <WhatIfView run={run} assetRun={assetRun} />
      </details>
      <div className="content-grid schedule-content-grid">
        <div ref={matrixRef}>
          <ProjectMatrix
            run={run}
            projects={projects}
            people={people}
            algorithmPersonTypeLabels={algorithmPersonTypeLabels}
            selectedId={selectedId}
            selectedTaskId={selectedTaskId}
            filterMode={filterMode}
            filters={scheduleFilters}
            filterBar={
              <ScheduleFilterBar
                filters={scheduleFilters}
                options={scheduleFilterOptions}
                filterMode={filterMode}
                projectCount={filteredProjectIds.length}
                totalProjectCount={projectIds.length}
                manualCount={filteredManualTasks.length}
                totalManualCount={allManualTasks.length}
                onChange={updateScheduleFilters}
                onToggleManual={toggleManual}
                onToggleIssues={toggleIssues}
                onClear={clearScheduleFilters}
              />
            }
            onlyIssues={filterMode === "issues"}
            onSelect={selectProject}
          />
        </div>
      </div>
      <div ref={manualQueueRef}>
        <ManualTaskQueue
          run={run}
          projects={projects}
          people={people}
          algorithmPersonTypeLabels={algorithmPersonTypeLabels}
          selectedTaskId={selectedTaskId}
          filterMode={filterMode}
          filters={scheduleFilters}
          onSelectTask={selectTask}
          onToggleManual={toggleManual}
        />
      </div>
      <ScheduleTaskDrawer
        open={isTaskDrawerOpen}
        run={run}
        projects={projects}
        people={people}
        tagLibrary={tagLibrary}
        projectId={selectedId}
        selectedTaskId={selectedTaskId}
        onTaskSelect={selectTaskInDrawer}
        onClose={() => setIsTaskDrawerOpen(false)}
        request={request}
      />
    </div>
  );
}

function TasksView({ run }: { run: SchedulingRun }) {
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>任务执行</h2>
          <span>{run.tasks.length} 条检查任务</span>
        </div>
        <RefreshCw size={18} color="#0f7578" />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th>检查形式</th>
              <th>负责人</th>
              <th>建议时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {run.tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.projectName}</td>
                <td>{task.checkType === "onsite" ? "现场" : "非现场"}</td>
                <td>{task.assigneeName ?? "待安排"}</td>
                <td>{task.scheduledDate ? `${task.scheduledDate}~${task.endDate?.slice(5)}` : "待人工"}</td>
                <td>
                  <span className="chip">{taskStatusLabel[task.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ArchiveView({
  runs,
  selectedRunId,
  onNavigate,
  request
}: {
  runs: SchedulingRun[];
  selectedRunId?: string;
  onNavigate: (view: View, params?: RouteState) => void;
  request: WorkspaceRequest;
}) {
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "warn" | "error"; text: string } | null>(null);
  const officialRuns = useMemo(
    () => [...runs].filter((run) => run.runType === "official").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [runs]
  );
  const archivedCount = officialRuns.filter((run) => run.status === "archived").length;
  const editableCount = officialRuns.filter((run) => runEditState(run).editable).length;
  const lockedCount = officialRuns.length - editableCount;

  const archiveRun = async (run: SchedulingRun) => {
    if (run.status === "archived") {
      setMessage({ tone: "warn", text: "该排期已经归档" });
      return;
    }
    setArchivingId(run.id);
    setMessage(null);
    try {
      await request<SchedulingRun>(`/runs/${run.id}/archive`, { method: "POST" });
      setMessage({ tone: "success", text: "已归档，未超过最晚计划结束日前仍可继续编辑" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? readableApiError(error.message) : "归档失败，请稍后重试" });
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div className="stack">
      <section className="panel archive-hero-panel">
        <div className="section-title">
          <div>
            <h2>正式排期台账</h2>
            <span>只管理正式排期草案和历史方案；试算方案不进入归档</span>
          </div>
          <Archive size={18} color="#0f7578" />
        </div>
        <div className="archive-metrics">
          <div className="metric">
            <div className="metric-label">正式排期</div>
            <div className="metric-value">{officialRuns.length}</div>
          </div>
          <div className="metric">
            <div className="metric-label">已归档</div>
            <div className="metric-value">{archivedCount}</div>
          </div>
          <div className="metric good">
            <div className="metric-label">仍可编辑</div>
            <div className="metric-value">{editableCount}</div>
          </div>
          <div className={`metric ${lockedCount ? "warn" : ""}`}>
            <div className="metric-label">已锁定</div>
            <div className="metric-value">{lockedCount}</div>
          </div>
        </div>
        {message ? <div className={`action-message ${message.tone}`}>{message.text}</div> : null}
      </section>

      <section className="panel archive-list-panel">
        <div className="section-title">
          <div>
            <h2>排期列表</h2>
            <span>超过最晚计划结束日后自动锁定，只允许查看和导出</span>
          </div>
          <Table2 size={18} color="#0f7578" />
        </div>
        {officialRuns.length ? (
          <div className="table-wrap">
            <table className="archive-table">
              <thead>
                <tr>
                  <th>排期名称</th>
                  <th>状态</th>
                  <th>规模</th>
                  <th>待处理</th>
                  <th>最晚计划结束日</th>
                  <th>编辑状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {officialRuns.map((run, index) => {
                  const editState = runEditState(run);
                  const name = officialRunName(run, index);
                  return (
                    <tr className={selectedRunId === run.id ? "selected-row" : ""} key={run.id}>
                      <td>
                        <div className="project-name">{name}</div>
                        <div className="muted">生成时间 {formatBusinessDateTime(run.createdAt)}</div>
                      </td>
                      <td>
                        <span className={`chip ${run.status === "archived" ? "" : "success-chip"}`}>{runStatusLabel[run.status]}</span>
                      </td>
                      <td>
                        <div className="archive-cell-stack">
                          <strong>{run.audit.inputProjects} 项目</strong>
                          <span>{run.tasks.length} 任务</span>
                        </div>
                      </td>
                      <td>
                        <div className="archive-cell-stack">
                          <strong>{run.audit.pendingManual} 待人工</strong>
                          <span>{run.audit.hardConflicts} 硬冲突</span>
                        </div>
                      </td>
                      <td>{editState.latestEndDate ?? "无计划结束日"}</td>
                      <td>
                        <span className={`chip ${editState.editable ? "success-chip" : "warning-chip"}`}>
                          {editState.editable ? "可编辑" : "已锁定"}
                        </span>
                        <div className="muted">{editState.reason}</div>
                      </td>
                      <td>
                        <div className="archive-actions">
                          <button className="button" onClick={() => onNavigate("schedule", { run: run.id, section: "scheduleMatrix" })} type="button">
                            查看排期
                          </button>
                          <button className="button" disabled={!editState.editable} onClick={() => onNavigate("schedule", { run: run.id, section: "scheduleMatrix" })} type="button">
                            继续编辑
                          </button>
                          <button className="button" disabled={run.status === "archived" || archivingId === run.id} onClick={() => void archiveRun(run)} type="button">
                            {archivingId === run.id ? "归档中" : run.status === "archived" ? "已归档" : "归档"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">暂无正式排期。准备完成后，可在首页生成正式排期草案。</div>
        )}
      </section>
    </div>
  );
}

function ExportView({ run, onNavigate }: { run: SchedulingRun; onNavigate: (view: View, params?: RouteState) => void }) {
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("按当前发布候选方案导出");
  const [exportFilePath, setExportFilePath] = useState<string | null>(null);
  const [exportFileName, setExportFileName] = useState<string | null>(null);
  const sheets = [
    { name: "发布摘要", note: "项目分类、任务数量、待人工和冲突概览", audience: "管理层", status: "核心" },
    { name: "正式排期", note: "执行主表：项目、检查形式、日期、负责人", audience: "执行团队", status: "核心" },
    { name: "项目规则说明", note: "每个项目的规则来源和处理原因", audience: "业务复核", status: "审计" },
    { name: "人员负荷", note: "负责人年度任务和月度分布", audience: "资源统筹", status: "审计" },
    { name: "异常与待人工", note: "待人工、未排入、冲突和建议动作", audience: "发布处理", status: "风险" },
    { name: "审计留痕", note: "规则判断、人工调整和处理说明", audience: "内控审计", status: "审计" },
    { name: "字段说明", note: "报告字段口径说明", audience: "数据口径", status: "说明" }
  ];
  const exportLabel = exportStatus === "exporting" ? "正在生成报告..." : exportStatus === "success" ? "已保存文件" : "导出 Excel";
  const runRoute = run.runType === "official" ? { run: run.id } : {};
  const exportUrl = `/api/export?runId=${encodeURIComponent(run.id)}`;

  const handleExport = (source = "排期报告包") => {
    if (exportStatus === "exporting") return;
    setExportStatus("exporting");
    setExportFilePath(null);
    setExportFileName(null);
    setExportMessage(`正在生成${source}，将保存到工作区 outputs 文件夹`);
    void (async () => {
      try {
        const response = await fetch(`/api/export/save?runId=${encodeURIComponent(run.id)}`, { method: "POST", cache: "no-store" });
        if (!response.ok) {
          let message = "导出失败，请稍后重试";
          try {
            const payload = await response.clone().json() as { error?: string };
            if (payload.error) message = payload.error;
          } catch {
            const text = await response.text();
            if (text) message = text;
          }
          throw new Error(message);
        }
        const payload = await response.json() as { fileName: string; filePath: string };
        setExportFileName(payload.fileName);
        setExportFilePath(payload.filePath);
        const anchor = document.createElement("a");
        anchor.href = `${exportUrl}&t=${Date.now()}`;
        anchor.download = `现场检查排期报告-${run.planPeriod.year}.xlsx`;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setExportStatus("success");
        setExportMessage(`已保存${source}，浏览器也已尝试下载`);
      } catch (error) {
        setExportStatus("error");
        setExportMessage(error instanceof Error ? readableApiError(error.message) : "后台数据不可用，无法导出当前方案");
      }
    })();
  };

  const exportFolder = exportFilePath?.split("/").slice(0, -1).join("/") ?? null;

  const copyExportPath = async () => {
    if (!exportFilePath) return;
    try {
      await navigator.clipboard.writeText(exportFilePath);
      setExportMessage("已复制完整文件路径");
    } catch {
      setExportMessage("复制失败，请手动选中路径复制");
    }
  };

  const revealExportFile = async () => {
    if (!exportFilePath) return;
    setExportMessage("正在打开文件所在位置");
    try {
      const response = await fetch("/api/export/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: exportFilePath })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "无法打开所在文件夹");
      }
      setExportMessage("已在 Finder 中定位导出文件");
    } catch (error) {
      setExportMessage(error instanceof Error ? readableApiError(error.message) : "无法打开所在文件夹");
    }
  };

  return (
    <div className="export-grid">
      <section className="panel export-package-panel">
        <div className="section-title">
          <div>
            <h2>排期报告包</h2>
            <span>按当前发布候选方案导出：摘要、执行、规则、负荷、异常、留痕</span>
          </div>
          <div className="export-actions">
            <button className="button primary" disabled={exportStatus === "exporting"} onClick={() => handleExport()} type="button">
              {exportStatus === "success" ? <Check size={15} /> : exportStatus === "error" ? <AlertTriangle size={15} /> : <Download size={15} />}
              {exportLabel}
            </button>
            <span className={`export-feedback ${exportStatus}`} aria-live="polite">{exportMessage}</span>
          </div>
        </div>
        {exportFilePath ? (
          <div className="export-result-card" aria-live="polite">
            <div className="export-result-icon">
              <Check size={18} />
            </div>
            <div className="export-result-copy">
              <span>文件已保存到本地</span>
              <strong>{exportFileName ?? exportFilePath.split("/").at(-1)}</strong>
              <div className="export-location-grid">
                <span>保存位置</span>
                <code>{exportFolder}</code>
                <span>完整路径</span>
                <code>{exportFilePath}</code>
              </div>
            </div>
            <div className="export-result-actions">
              <button className="button primary" onClick={() => void revealExportFile()} type="button">
                <FolderOpen size={15} />
                打开所在文件夹
              </button>
              <button className="button" onClick={() => void copyExportPath()} type="button">
                <Copy size={15} />
                复制路径
              </button>
            </div>
          </div>
        ) : null}
        <div className="export-report-list">
          {sheets.map((sheet, index) => (
            <article className="export-report-row" key={sheet.name}>
              <span className="report-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="report-copy">
                <div className="report-head">
                  <strong>{sheet.name}</strong>
                  <span className={`report-status ${sheet.status === "风险" ? "risk" : sheet.status === "核心" ? "core" : ""}`}>{sheet.status}</span>
                </div>
                <p>{sheet.note}</p>
                <div className="report-meta">
                  <span>{sheet.audience}</span>
                  <span>{run.planPeriod.year} 年度</span>
                </div>
              </div>
              <button
                className="export-report-download"
                disabled={exportStatus === "exporting"}
                onClick={() => handleExport(sheet.name)}
                type="button"
                aria-label={`下载${sheet.name}报告包`}
              >
                <Download size={15} />
                下载
              </button>
            </article>
          ))}
        </div>
      </section>
      <section className="panel export-summary-panel">
        <div className="section-title">
          <h2>摘要口径</h2>
          <span>{run.planPeriod.year} 年度</span>
        </div>
        <div className="audit-grid compact-grid padded">
          <MetricAction href={viewHref("projectInput", { projectStatus: "all", section: "projectTable" })} label="项目总数" onClick={(event) => { event.preventDefault(); onNavigate("projectInput", { projectStatus: "all", section: "projectTable" }); }} value={run.audit.inputProjects} />
          <MetricAction href={viewHref("projectInput", { projectStatus: "ready", section: "projectTable" })} label="纳入检查" onClick={(event) => { event.preventDefault(); onNavigate("projectInput", { projectStatus: "ready", section: "projectTable" }); }} tone="good" value={run.audit.inScope} />
          <MetricAction href={viewHref("projectInput", { projectStatus: "excluded", section: "projectTable" })} label="免检/不纳入" onClick={(event) => { event.preventDefault(); onNavigate("projectInput", { projectStatus: "excluded", section: "projectTable" }); }} value={run.audit.excluded} />
          <MetricAction href={viewHref("schedule", { ...runRoute, filter: "manual", section: "manualQueue" })} label="待人工" onClick={(event) => { event.preventDefault(); onNavigate("schedule", { ...runRoute, filter: "manual", section: "manualQueue" }); }} tone={run.audit.pendingManual ? "warn" : "good"} value={run.audit.pendingManual} />
        </div>
        <div className="decision-list">
          <div className="decision-item">
            <div className="decision-head"><span>摘要不写发布结论</span><FileDiff size={15} /></div>
            <p>摘要页只做分类统计和排期概览；发布状态留在产品页处理中心。</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Route size={18} />
          </div>
          <div className="brand-copy">
            <div className="brand-title">现场检查调度</div>
            <div className="brand-subtitle">输入维护优先</div>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className="nav-button" disabled key={item.id} type="button">
                <Icon size={17} />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="top-title">
            <h1>现场检查调度</h1>
            <p>正在加载工作区</p>
          </div>
        </div>
        <footer className="app-credit">Created by Hank Zhao</footer>
      </main>
    </div>
  );
}

export default function Home() {
  const { data, loading, message, request } = useWorkspaceSummary();
  const [view, setView] = useState<View>("readiness");
  const [routeState, setRouteState] = useState<RouteState>({});
  const [selectedProjectId, setSelectedProjectId] = useState("P001");
  const [hydrated, setHydrated] = useState(false);
  const [generation, setGeneration] = useState<GenerationState>({ open: false, status: "idle", step: 0, result: null, error: null });
  const navigateTo = (nextView: View, params: RouteState = {}) => {
    const shouldScroll = nextView !== view;
    setView(nextView);
    setRouteState(params);
    if (params.project) setSelectedProjectId(params.project);
    if (typeof window === "undefined") return;
    window.history.pushState(null, "", viewHref(nextView, params));
    if (shouldScroll) window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  useEffect(() => {
    setHydrated(true);
    setView(viewFromLocation());
    const nextRouteState = routeStateFromLocation();
    setRouteState(nextRouteState);
    if (nextRouteState.project) setSelectedProjectId(nextRouteState.project);
    const handlePopState = () => {
      setView(viewFromLocation());
      const next = routeStateFromLocation();
      setRouteState(next);
      if (next.project) setSelectedProjectId(next.project);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (!hydrated) return <LoadingShell />;

  const run = data.publishCandidateRun ?? data.currentRun;
  const selectedOfficialRun = routeState.run ? data.officialRuns.find((item) => item.id === routeState.run) : undefined;
  const displayRun = selectedOfficialRun ?? run;
  const assetRun = data.asset7Run ?? run;
  const planning = data.planningYear;
  const meta = getViewMeta(view, ["schedule", "tasks", "export"].includes(view) ? displayRun : run);
  const officialStatus = releaseStatus(run, planning);
  const generationBusy = generation.open && generation.status === "running";

  const generateOfficialRun = async () => {
    if (generationBusy) return;
    setGeneration({ open: true, status: "running", step: 0, result: null, error: null });
    try {
      await wait(400);
      setGeneration((current) => ({ ...current, step: 1 }));
      const generated = await request<SchedulingRun>(`/planning-years/${planning.year}/runs/generate`, {
        method: "POST",
        body: JSON.stringify({ runType: "official", assigneePoolMode: planning.rosterVersion.poolMode })
      });
      setGeneration({ open: true, status: "running", step: 2, result: generated, error: null });
      await wait(550);
      setGeneration({ open: true, status: "success", step: 2, result: generated, error: null });
      navigateTo("schedule", { run: generated.id, section: "scheduleMatrix" });
    } catch (error) {
      setGeneration({
        open: true,
        status: "error",
        step: 1,
        result: null,
        error: error instanceof Error ? readableApiError(error.message) : "生成正式排期失败"
      });
    }
  };

  const closeGeneration = () => setGeneration((current) => ({ ...current, open: false }));
  const viewGeneratedSchedule = () => {
    if (generation.result) navigateTo("schedule", { run: generation.result.id, section: "scheduleMatrix" });
    closeGeneration();
  };
  const archiveGeneratedRun = async () => {
    if (!generation.result) return;
    try {
      await request<SchedulingRun>(`/runs/${generation.result.id}/archive`, { method: "POST" });
      closeGeneration();
      navigateTo("archive", { run: generation.result.id });
    } catch (error) {
      setGeneration((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? readableApiError(error.message) : "归档失败，请稍后重试"
      }));
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Route size={18} />
          </div>
          <div className="brand-copy">
            <div className="brand-title">现场检查调度</div>
            <div className="brand-subtitle">输入维护优先</div>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={`nav-button ${view === item.id ? "active" : ""}`} key={item.id} onClick={() => navigateTo(item.id)} type="button">
                <Icon size={17} />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="top-title">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}｜{loading ? "正在加载" : message}</p>
          </div>
          <div className="toolbar">
            <button className="button" onClick={() => navigateTo("schedule")} type="button">
              <PanelLeft size={15} />
              查看方案
            </button>
            <button className={`button ${officialStatus.className}`} disabled={officialStatus.disabled}>
              <ShieldCheck size={15} />
              {officialStatus.label}
            </button>
          </div>
        </div>

        {view === "readiness" ? (
          <ReadinessCenter
            planning={planning}
            run={run}
            projects={data.projects}
            people={data.people}
            issueBoard={data.issueBoard}
            systemMap={data.ruleSystemMap}
            tagCoverage={data.tagCoverageSummary}
            routeState={routeState}
            generationBusy={generationBusy}
            onGenerateOfficial={generateOfficialRun}
            onNavigate={navigateTo}
          />
        ) : null}
        {view === "projectInput" ? (
          <ProjectInputView
            planning={planning}
            projects={data.projects}
            people={data.people}
            officialRuns={data.officialRuns}
            tagLibrary={data.tagLibrary}
            tagCoverage={data.tagCoverageSummary}
            issueBoard={data.issueBoard}
            routeState={routeState}
            request={request}
          />
        ) : null}
        {view === "peopleInput" ? (
          <PeopleInputView planning={planning} people={data.people} projects={data.projects} tagLibrary={data.tagLibrary} routeState={routeState} request={request} />
        ) : null}
        {view === "rulesInput" ? (
          <RulesInputView
            planning={planning}
            run={run}
            orders={data.businessRuleOrders}
            evidence={data.evidenceLibrary}
            ruleRegistry={data.ruleRegistry}
            tagLibrary={data.tagLibrary}
            systemMap={data.ruleSystemMap}
            tagTaxonomy={data.tagTaxonomy}
            ruleDrafts={data.ruleDrafts}
            ruleRegistryGroups={data.ruleRegistryGroups}
            latestRuleSimulation={data.latestRuleSimulation}
            latestRuleSuggestionBatch={data.latestRuleSuggestionBatch}
            tagCoverage={data.tagCoverageSummary}
            issueBoard={data.issueBoard}
            projects={data.projects}
            people={data.people}
            routeState={routeState}
            request={request}
          />
        ) : null}
        {view === "schedule" ? (
          <ScheduleView
            run={displayRun}
            assetRun={assetRun}
            projects={data.projects}
            people={data.people}
            tagLibrary={data.tagLibrary}
            selectedId={selectedProjectId}
            routeState={routeState}
            onSelect={setSelectedProjectId}
            onNavigate={navigateTo}
            request={request}
          />
        ) : null}
        {view === "tasks" ? <TasksView run={displayRun} /> : null}
        {view === "export" ? <ExportView run={displayRun} onNavigate={navigateTo} /> : null}
        {view === "archive" ? <ArchiveView runs={data.officialRuns} selectedRunId={routeState.run} onNavigate={navigateTo} request={request} /> : null}
        <GenerationProgressOverlay state={generation} onClose={closeGeneration} onViewSchedule={viewGeneratedSchedule} onArchive={archiveGeneratedRun} />
        <footer className="app-credit">Created by Hank Zhao</footer>
      </main>
    </div>
  );
}
