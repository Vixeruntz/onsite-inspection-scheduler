import type { Project } from "@inspection/domain";
import { buildPeopleFromProjects } from "./people.js";
import { createPlanningYearWorkspace } from "./planning.js";
import { defaultRuleSet } from "./rulesets.js";
import { generateRun } from "./scheduler.js";
import { defaultTagLibrary, extendTagLibraryWithRelationships, syncPersonTags, syncProjectTags } from "./tags.js";

const base = {
  partyType: "lessee" as const,
  groupId: null,
  groupName: null,
  dept: "资产管理部",
  riskGrade: "normal" as const,
  isNpl: false,
  customerType: "external" as const,
  industry: "other" as const,
  hospitalType: null,
  bizType: "leaseback" as const,
  exposureInit: 120_000_000,
  exposureBalance: 120_000_000,
  creditStart: "2024-05-10",
  creditEnd: "2028-05-09",
  termHalf: "2026-05-10",
  gridConnected: null,
  accountMonitored: null,
  realtimeMonitored: null,
  repayClean3y: null,
  isWarning: false,
  isSettledThisYear: false,
  isNewWithin1y: false,
  lastOnsiteDate: null,
  expectedOnsiteCount: 1,
  expectedOffsiteCount: 1,
  onsiteMaintainerName: "徐珺",
  offsiteMaintainerName: "徐珺",
  onsiteMaintainerId: null,
  offsiteMaintainerId: null,
  memberCount: null,
  relatedPartyStockCount: null
};

const rawDemoProjects: Project[] = [
  { ...base, id: "P001", name: "三亚崖州湾科技城", groupId: "G001", groupName: "崖州湾集团", exposureBalance: 136_000_000 },
  {
    ...base,
    id: "P002",
    name: "京运通新能源",
    groupId: "G002",
    groupName: "京运通集团",
    industry: "energy",
    exposureBalance: 480_000_000,
    onsiteMaintainerName: "杨天荣",
    offsiteMaintainerName: "杨天荣"
  },
  {
    ...base,
    id: "P003",
    name: "协同A绿色项目",
    customerType: "collab_a",
    exposureBalance: 90_000_000,
    onsiteMaintainerName: "姚浩",
    offsiteMaintainerName: "姚浩"
  },
  {
    ...base,
    id: "P004",
    name: "问题项目专项",
    riskGrade: "substandard",
    isNpl: true,
    exposureBalance: 220_000_000,
    onsiteMaintainerName: "林凡",
    offsiteMaintainerName: "林凡"
  },
  {
    ...base,
    id: "P005",
    name: "公立医院中期检查",
    industry: "healthcare",
    hospitalType: "public_hospital",
    exposureInit: 80_000_000,
    exposureBalance: 60_000_000,
    termHalf: "2026-09-08",
    onsiteMaintainerName: "巫俊乐",
    offsiteMaintainerName: "巫俊乐"
  },
  {
    ...base,
    id: "P006",
    name: "小额外部待补全",
    exposureBalance: 18_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 1,
    onsiteMaintainerName: "徐珺",
    offsiteMaintainerName: "徐珺"
  },
  {
    ...base,
    id: "P007",
    name: "内部监控项目",
    customerType: "internal",
    exposureBalance: 330_000_000,
    onsiteMaintainerName: "姚浩",
    offsiteMaintainerName: "姚浩"
  },
  {
    ...base,
    id: "P008",
    name: "能源豁免项目",
    industry: "energy",
    exposureBalance: 88_000_000,
    gridConnected: true,
    accountMonitored: true,
    realtimeMonitored: true,
    repayClean3y: true,
    onsiteMaintainerName: "杨天荣",
    offsiteMaintainerName: "杨天荣"
  },
  {
    ...base,
    id: "P009",
    name: "上海分公司自检项目",
    dept: "上海分公司",
    exposureBalance: 110_000_000,
    onsiteMaintainerName: "上海资产经理",
    offsiteMaintainerName: "上海资产经理"
  },
  {
    ...base,
    id: "P010",
    name: "直租设备项目",
    bizType: "direct_lease",
    exposureBalance: 160_000_000,
    onsiteMaintainerName: "巫俊乐",
    offsiteMaintainerName: "巫俊乐"
  },
  {
    ...base,
    id: "P011",
    name: "当年结清项目",
    exposureBalance: 0,
    isSettledThisYear: true,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  },
  {
    ...base,
    id: "P012",
    name: "保理待确认项目",
    bizType: "factoring",
    exposureBalance: 150_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }
];

export const demoProjects: Project[] = rawDemoProjects.map((project) => syncProjectTags(project));

export const createDemoWorkspace = () => {
  const rawProjects = demoProjects.map((project) => syncProjectTags(project));
  const rawPeople = buildPeopleFromProjects(rawProjects);
  const personByName = new Map(rawPeople.map((person) => [person.name, person.id]));
  const projectsWithMaintainerIds = rawProjects.map((project) => ({
    ...project,
    onsiteMaintainerId: project.onsiteMaintainerId ?? (project.onsiteMaintainerName ? personByName.get(project.onsiteMaintainerName) ?? null : null),
    offsiteMaintainerId: project.offsiteMaintainerId ?? (project.offsiteMaintainerName ? personByName.get(project.offsiteMaintainerName) ?? null : null)
  }));
  const tagLibrary = extendTagLibraryWithRelationships(defaultTagLibrary, projectsWithMaintainerIds, rawPeople);
  const projects = projectsWithMaintainerIds.map((project) => syncProjectTags(project, tagLibrary));
  const people = rawPeople.map((person) => syncPersonTags(person, tagLibrary));
  const currentRun = generateRun(
    { year: 2026, scope: "full_year" },
    projects,
    {
      people,
      assigneePoolMode: "sampleMaintainers",
      now: "2026-05-29T08:00:00.000Z"
    }
  );
  const asset7Run = generateRun(
    { year: 2026, scope: "full_year" },
    projects,
    {
      people,
      assigneePoolMode: "asset7",
      now: "2026-05-29T08:00:00.000Z"
    }
  );
  const planningYear = createPlanningYearWorkspace({
    year: 2026,
    projects,
    people,
    ruleset: defaultRuleSet,
    currentRun,
    sampleDataRows: 304,
    worksheetRows: 305,
    expectedOnsiteTotal: 266,
    expectedOffsiteTotal: 253,
    now: "2026-05-29T08:00:00.000Z"
  });
  return { projects, people, currentRun, asset7Run, planningYear, tagLibrary };
};
