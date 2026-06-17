import { labelMaps, type Project } from "@inspection/domain";
import { createAcceptanceFixture } from "./acceptance-fixtures.js";
import { createPlanningYearWorkspace } from "./planning.js";
import { defaultRuleSet } from "./rulesets.js";
import { generateRun } from "./scheduler.js";
import { defaultTagLibrary, extendTagLibraryWithRelationships, syncPersonTags, syncProjectTags } from "./tags.js";

const now = "2026-05-29T08:00:00.000Z";
const period = { year: 2026, scope: "full_year" as const };

const projectScenarioLabels: Record<string, string> = {
  T01: "零敞口",
  T02: "当年结清",
  T03: "当年新增短期限",
  T04: "大额",
  T05: "中额",
  T06: "较小两年一次",
  T07: "小额待补规则",
  T08: "待人工确认",
  T09: "非现场",
  T10: "能源豁免条件齐备",
  T11: "能源大额",
  T12: "公立医院大额",
  T13: "集团存量大于三",
  T14: "集团存量缺失",
  T15: "担保人存量不超过三",
  T16: "待补规则",
  T17: "大额",
  T18: "大额",
  T19: "中额",
  T20: "中额",
  T21: "公立医院小额待补规则",
  T22: "较小到期",
  T23: "内部客户一",
  T24: "内部客户二",
  T25: "非现场回租",
  T26: "非现场直租",
  T27: "能源豁免账户监管",
  T28: "能源豁免实时监控",
  T29: "能源大额并网",
  T30: "能源超大额",
  T31: "公立医院中期六月",
  T32: "民营医院待补规则",
  T33: "大型集团检查对象一",
  T34: "大型集团检查对象二",
  T35: "中型集团检查对象一",
  T36: "中型集团检查对象二",
  T37: "担保人存量大于三一",
  T38: "担保人存量大于三二",
  T39: "担保人存量不超过三一",
  T40: "担保人存量缺失",
  T41: "不良次级",
  T42: "不良可疑",
  T43: "风险预警一",
  T44: "资产部酌情增减",
  T45: "中额",
  T46: "大额",
  T47: "小额一",
  T48: "小额二",
  T49: "零敞口补充",
  T50: "当年新增短期限补充"
};

const projectOrder = (project: Project) => Number(project.id.replace(/\D/g, "")) || 0;

const formatBusinessProjectName = (project: Project) => {
  const order = projectOrder(project);
  const scenario = projectScenarioLabels[project.id] ?? project.name.replace(/项目$/u, "");
  return `测试项目 ${order}-${labelMaps.bizType[project.bizType]}业务 ${labelMaps.customerType[project.customerType]}客户 ${scenario}项目`;
};

const applyBusinessProjectNames = (projects: Project[]) =>
  projects.map((project) =>
    syncProjectTags({
      ...project,
      name: formatBusinessProjectName(project),
      tagIds: []
    })
  );

const makeProject = (source: Project, id: string, name: string, input: Partial<Project> = {}): Project =>
  syncProjectTags({
    ...source,
    tagIds: [],
    ...input,
    id,
    name
  });

export const createFiftyProjectFixture = () => {
  const fixture = createAcceptanceFixture();
  const byId = new Map(fixture.projects.map((project) => [project.id, project]));
  const base = byId.get("T05")!;
  const externalMedium = byId.get("T05")!;
  const externalSmall = byId.get("T07")!;
  const internal = byId.get("T08")!;
  const collabA = byId.get("T09")!;
  const energyExempt = byId.get("T10")!;
  const energyLarge = byId.get("T11")!;
  const publicHospital = byId.get("T12")!;
  const groupLarge = byId.get("T13")!;
  const guarantorSmall = byId.get("T15")!;
  const factoring = byId.get("T16")!;
  const firstSixteen = fixture.projects.filter((project) => projectOrder(project) <= 16);

  const extraProjects: Project[] = [
    makeProject(base, "T17", "协同B大额项目", {
      customerType: "collab_b",
      exposureBalance: 520_000_000,
      onsiteMaintainerId: null,
      offsiteMaintainerId: null,
      onsiteMaintainerName: null,
      offsiteMaintainerName: null,
      expectedOnsiteCount: 2,
      expectedOffsiteCount: 1
    }),
    makeProject(base, "T18", "外部大额直租项目", {
      bizType: "direct_lease",
      exposureBalance: 380_000_000,
      onsiteMaintainerId: null,
      offsiteMaintainerId: null,
      onsiteMaintainerName: null,
      offsiteMaintainerName: null,
      expectedOnsiteCount: 2,
      expectedOffsiteCount: 1
    }),
    makeProject(externalMedium, "T19", "外部中额回租项目", { exposureBalance: 260_000_000 }),
    makeProject(externalMedium, "T20", "协同B中额项目", { customerType: "collab_b", exposureBalance: 220_000_000 }),
    makeProject(publicHospital, "T21", "公立医院小额待补规则", {
      exposureInit: 50_000_000,
      exposureBalance: 40_000_000,
      expectedOnsiteCount: 0,
      expectedOffsiteCount: 0
    }),
    makeProject(base, "T22", "协同B较小到期项目", {
      customerType: "collab_b",
      exposureBalance: 52_000_000,
      exposureInit: 52_000_000,
      lastOnsiteDate: "2024-01-08",
      expectedOnsiteCount: 1,
      expectedOffsiteCount: 1
    }),
    makeProject(internal, "T23", "内部客户一", { exposureBalance: 210_000_000 }),
    makeProject(internal, "T24", "内部客户二", {
      exposureBalance: 80_000_000,
      onsiteMaintainerId: null,
      offsiteMaintainerId: null,
      onsiteMaintainerName: null,
      offsiteMaintainerName: null
    }),
    makeProject(collabA, "T25", "协同A回租项目", { exposureBalance: 130_000_000 }),
    makeProject(collabA, "T26", "协同A直租项目", { bizType: "direct_lease", exposureBalance: 65_000_000 }),
    makeProject(energyExempt, "T27", "能源豁免账户监管项目", {
      exposureBalance: 110_000_000,
      gridConnected: true,
      accountMonitored: true,
      realtimeMonitored: false,
      repayClean3y: true
    }),
    makeProject(energyExempt, "T28", "能源豁免实时监控项目", {
      exposureBalance: 230_000_000,
      gridConnected: true,
      accountMonitored: false,
      realtimeMonitored: true,
      repayClean3y: true
    }),
    makeProject(energyLarge, "T29", "能源大额并网项目", { exposureBalance: 360_000_000 }),
    makeProject(energyLarge, "T30", "能源超大额项目", {
      customerType: "collab_b",
      exposureBalance: 620_000_000,
      gridConnected: true
    }),
    makeProject(publicHospital, "T31", "公立医院中期六月项目", {
      exposureInit: 95_000_000,
      exposureBalance: 70_000_000,
      termHalf: "2026-06-15"
    }),
    makeProject(publicHospital, "T32", "民营医院待补规则", {
      hospitalType: "private_hospital",
      exposureInit: 80_000_000,
      exposureBalance: 70_000_000,
      expectedOnsiteCount: 0,
      expectedOffsiteCount: 0
    }),
    makeProject(groupLarge, "T33", "大型集团检查对象一", {
      groupId: "G-LARGE",
      groupName: "大型集团",
      memberCount: 5,
      exposureBalance: 260_000_000
    }),
    makeProject(groupLarge, "T34", "大型集团检查对象二", {
      groupId: "G-LARGE",
      groupName: "大型集团",
      memberCount: 6,
      exposureBalance: 420_000_000
    }),
    makeProject(groupLarge, "T35", "中型集团检查对象一", {
      groupId: "G-MOTHER",
      groupName: "母公司集团",
      memberCount: 2,
      exposureBalance: 130_000_000,
      expectedOnsiteCount: 1,
      expectedOffsiteCount: 1
    }),
    makeProject(groupLarge, "T36", "中型集团检查对象二", {
      groupId: "G-MOTHER",
      groupName: "母公司集团",
      memberCount: 3,
      exposureBalance: 190_000_000,
      expectedOnsiteCount: 1,
      expectedOffsiteCount: 1
    }),
    makeProject(guarantorSmall, "T37", "担保人存量大于三项目一", {
      relatedPartyStockCount: 4,
      exposureBalance: 160_000_000,
      expectedOnsiteCount: 2,
      expectedOffsiteCount: 1
    }),
    makeProject(guarantorSmall, "T38", "担保人存量大于三项目二", {
      groupId: "G-LARGE",
      groupName: "大型集团",
      relatedPartyStockCount: 6,
      exposureBalance: 320_000_000,
      expectedOnsiteCount: 2,
      expectedOffsiteCount: 1
    }),
    makeProject(guarantorSmall, "T39", "担保人存量不超过三项目一", {
      groupId: null,
      groupName: null,
      relatedPartyStockCount: 1,
      exposureBalance: 70_000_000
    }),
    makeProject(guarantorSmall, "T40", "担保人存量缺失项目", {
      groupId: null,
      groupName: null,
      relatedPartyStockCount: null,
      exposureBalance: 240_000_000,
      expectedOnsiteCount: 0,
      expectedOffsiteCount: 0
    }),
    makeProject(base, "T41", "不良次级项目", {
      bizType: "leaseback",
      riskGrade: "substandard",
      isNpl: true,
      exposureBalance: 180_000_000,
      expectedOnsiteCount: 2,
      expectedOffsiteCount: 0
    }),
    makeProject(base, "T42", "不良可疑项目", {
      bizType: "leaseback",
      riskGrade: "doubtful",
      isNpl: true,
      exposureBalance: 90_000_000,
      expectedOnsiteCount: 2,
      expectedOffsiteCount: 0
    }),
    makeProject(base, "T43", "风险预警项目一", {
      isWarning: true,
      exposureBalance: 150_000_000,
      warningPlan: "按预警处置方案安排检查，重点核查还款来源和抵质押物状态。",
      expectedOnsiteCount: 1,
      expectedOffsiteCount: 1
    }),
    makeProject(base, "T44", "资产部酌情增减项目", {
      customerType: "collab_b",
      exposureBalance: 48_000_000,
      manualFrequencyRequested: true,
      warningPlan: "资产部负责人要求按项目进度酌情增减检查次数。",
      expectedOnsiteCount: 0,
      expectedOffsiteCount: 0
    }),
    makeProject(factoring, "T45", "保理中额项目", { exposureBalance: 210_000_000 }),
    makeProject(factoring, "T46", "保理大额项目", {
      exposureBalance: 420_000_000,
      expectedOnsiteCount: 2,
      expectedOffsiteCount: 1
    }),
    makeProject(externalSmall, "T47", "外部小额项目一", { exposureBalance: 18_000_000 }),
    makeProject(externalSmall, "T48", "协同B小额项目二", { customerType: "collab_b", exposureBalance: 28_000_000 }),
    makeProject(base, "T49", "零敞口补充项目", {
      exposureBalance: 0,
      exposureInit: 0,
      isSettledThisYear: false,
      expectedOnsiteCount: 0,
      expectedOffsiteCount: 0
    }),
    makeProject(base, "T50", "当年新增短期限补充项目", {
      isNewWithin1y: true,
      creditStart: "2026-03-01",
      creditEnd: "2026-12-15",
      termHalf: "2026-07-20",
      expectedOnsiteCount: 0,
      expectedOffsiteCount: 0
    })
  ];

  const rawProjects = applyBusinessProjectNames([...firstSixteen, ...extraProjects]);
  const tagLibrary = extendTagLibraryWithRelationships(defaultTagLibrary, rawProjects, fixture.people);
  return {
    projects: rawProjects.map((project) => syncProjectTags(project, tagLibrary)),
    people: fixture.people.map((person) => syncPersonTags(person, tagLibrary)),
    tagLibrary
  };
};

export const createFiftyProjectWorkspace = () => {
  const { projects, people, tagLibrary } = createFiftyProjectFixture();
  const currentRun = generateRun(period, projects, {
    people,
    assigneePoolMode: "sampleMaintainers",
    now
  });
  const asset7Run = generateRun(period, projects, {
    people,
    assigneePoolMode: "asset7",
    now
  });
  const planningYear = createPlanningYearWorkspace({
    year: 2026,
    projects,
    people,
    ruleset: defaultRuleSet,
    currentRun,
    poolMode: "asset7",
    sampleDataRows: projects.length,
    worksheetRows: projects.length + 1,
    sourceFilename: "端到端测试数据包.xlsx",
    expectedOnsiteTotal: projects.reduce((total, project) => total + (project.expectedOnsiteCount ?? 0), 0),
    expectedOffsiteTotal: projects.reduce((total, project) => total + (project.expectedOffsiteCount ?? 0), 0),
    now
  });
  return { projects, people, currentRun, asset7Run, planningYear, tagLibrary };
};
