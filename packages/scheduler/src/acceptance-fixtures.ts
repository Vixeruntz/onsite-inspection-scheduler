import type { AssigneePoolMode, Person, Project, TagDefinition } from "@inspection/domain";
import { defaultTagLibrary, extendTagLibraryWithRelationships, syncPersonTags, syncProjectTags } from "./tags.js";

const allPools: AssigneePoolMode[] = ["sampleMaintainers", "asset7", "all26"];

const person = (
  id: string,
  name: string,
  input: Partial<Person> = {}
): Person => ({
  id,
  name,
  baseCity: input.baseCity ?? "深圳",
  dept: input.dept ?? "资产管理部",
  specialTags: input.specialTags ?? [],
  longTermGroupIds: input.longTermGroupIds ?? [],
  longTermProjectIds: input.longTermProjectIds ?? [],
  isActive: input.isActive ?? true,
  activeFrom: input.activeFrom ?? null,
  activeTo: input.activeTo ?? null,
  pool: input.pool ?? allPools,
  responsibilityRoles: input.responsibilityRoles ?? ["asset_management_owner", "report_owner", "rectification_owner"],
  annualOnsiteWeekCapacity: input.annualOnsiteWeekCapacity ?? 44,
  monthlyOnsiteLimit: input.monthlyOnsiteLimit ?? 4,
  offsiteTaskCapacity: input.offsiteTaskCapacity ?? 36,
  unavailableMonths: input.unavailableMonths ?? []
});

export const acceptancePeopleRaw: Person[] = [
  person("qa-project-owner", "陈启明", { longTermProjectIds: ["T04"] }),
  person("qa-group-owner", "周闻达", { longTermGroupIds: ["G-LARGE", "G-MOTHER"] }),
  person("qa-npl-specialist", "赵明川", { specialTags: ["问题项目专员"] }),
  person("qa-direct-specialist", "沈嘉宁", { specialTags: ["直租专员"] }),
  person("qa-maintainer", "李思远"),
  person("qa-load-balance", "王亦然")
];

const baseProject: Omit<Project, "id" | "name"> = {
  partyType: "lessee",
  groupId: null,
  groupName: null,
  dept: "资产管理部",
  riskGrade: "normal",
  isNpl: false,
  customerType: "external",
  industry: "other",
  hospitalType: null,
  bizType: "leaseback",
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
  onsiteMaintainerName: "李思远",
  offsiteMaintainerName: "李思远",
  onsiteMaintainerId: "qa-maintainer",
  offsiteMaintainerId: "qa-maintainer",
  memberCount: null,
  relatedPartyStockCount: null,
  primaryResponsibleDept: "joint",
  companySpecialRequirement: false,
  unavailableMonths: [],
  offsiteInfoChannels: []
};

const project = (id: string, name: string, input: Partial<Project> = {}): Project =>
  syncProjectTags({
    ...baseProject,
    ...input,
    id,
    name
  });

export const acceptanceProjectsRaw: Project[] = [
  project("T01", "零敞口项目", {
    exposureBalance: 0,
    exposureInit: 0,
    isSettledThisYear: false,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T02", "当年结清项目", {
    exposureBalance: 20_000_000,
    isSettledThisYear: true,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T03", "当年新增短期限", {
    isNewWithin1y: true,
    creditStart: "2026-02-01",
    creditEnd: "2026-11-30",
    termHalf: "2026-07-01",
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T04", "外部大额项目", {
    exposureBalance: 420_000_000,
    onsiteMaintainerId: null,
    offsiteMaintainerId: null,
    onsiteMaintainerName: null,
    offsiteMaintainerName: null,
    expectedOnsiteCount: 2,
    expectedOffsiteCount: 0
  }),
  project("T05", "外部中额直租项目", {
    bizType: "direct_lease",
    exposureBalance: 180_000_000,
    onsiteMaintainerId: null,
    offsiteMaintainerId: null,
    onsiteMaintainerName: null,
    offsiteMaintainerName: null
  }),
  project("T06", "外部较小两年一次", {
    exposureBalance: 60_000_000,
    exposureInit: 60_000_000,
    lastOnsiteDate: "2024-06-01",
    termHalf: "2026-06-15"
  }),
  project("T07", "外部小额待补规则", {
    exposureBalance: 20_000_000,
    exposureInit: 20_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T08", "内部客户待人工", {
    customerType: "internal",
    exposureBalance: 160_000_000
  }),
  project("T09", "协同A非现场项目", {
    customerType: "collab_a",
    exposureBalance: 90_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 1
  }),
  project("T10", "能源豁免条件齐备", {
    industry: "energy",
    exposureBalance: 88_000_000,
    gridConnected: true,
    accountMonitored: true,
    realtimeMonitored: false,
    repayClean3y: true,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 1
  }),
  project("T11", "能源大额项目", {
    industry: "energy",
    exposureBalance: 480_000_000,
    gridConnected: true,
    accountMonitored: false,
    realtimeMonitored: false,
    repayClean3y: false,
    onsiteMaintainerId: null,
    offsiteMaintainerId: null,
    onsiteMaintainerName: null,
    offsiteMaintainerName: null
  }),
  project("T12", "公立医院大额项目", {
    industry: "healthcare",
    hospitalType: "public_hospital",
    exposureInit: 90_000_000,
    exposureBalance: 80_000_000,
    termHalf: "2026-09-08"
  }),
  project("T13", "集团存量大于三项目", {
    partyType: "group",
    groupId: "G-LARGE",
    groupName: "大型集团",
    memberCount: 4,
    exposureBalance: 170_000_000,
    onsiteMaintainerId: null,
    offsiteMaintainerId: null,
    onsiteMaintainerName: null,
    offsiteMaintainerName: null,
    expectedOnsiteCount: 2,
    expectedOffsiteCount: 1
  }),
  project("T14", "集团存量缺失项目", {
    partyType: "group",
    groupId: "G-MISSING",
    groupName: "待补集团",
    memberCount: null,
    exposureBalance: 160_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T15", "担保人存量不超过三项目", {
    partyType: "guarantor",
    groupId: "G-MOTHER",
    groupName: "母公司集团",
    relatedPartyStockCount: 3,
    exposureBalance: 140_000_000,
    onsiteMaintainerId: null,
    offsiteMaintainerId: null,
    onsiteMaintainerName: null,
    offsiteMaintainerName: null
  }),
  project("T16", "保理业务待补规则", {
    bizType: "factoring",
    exposureBalance: 150_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T17", "风险预警项目", {
    isWarning: true,
    warningPlan: "按预警处理方案由业务人工确认检查方式和时间。",
    exposureBalance: 150_000_000,
    expectedOnsiteCount: 1,
    expectedOffsiteCount: 0
  }),
  project("T18", "不良类客户项目", {
    riskGrade: "substandard",
    exposureBalance: 180_000_000,
    onsiteMaintainerId: null,
    offsiteMaintainerId: null,
    onsiteMaintainerName: null,
    offsiteMaintainerName: null,
    expectedOnsiteCount: 2,
    expectedOffsiteCount: 0
  }),
  project("T19", "集团存量不超过三项目", {
    partyType: "group",
    groupId: "G-MOTHER",
    groupName: "母公司集团",
    memberCount: 2,
    exposureBalance: 130_000_000,
    onsiteMaintainerId: null,
    offsiteMaintainerId: null,
    onsiteMaintainerName: null,
    offsiteMaintainerName: null
  }),
  project("T20", "担保人存量大于三项目", {
    partyType: "guarantor",
    groupId: "G-LARGE",
    groupName: "大型集团",
    relatedPartyStockCount: 4,
    exposureBalance: 160_000_000,
    onsiteMaintainerId: null,
    offsiteMaintainerId: null,
    onsiteMaintainerName: null,
    offsiteMaintainerName: null,
    expectedOnsiteCount: 2,
    expectedOffsiteCount: 1
  }),
  project("T21", "公立医院小额待补规则", {
    industry: "healthcare",
    hospitalType: "public_hospital",
    exposureInit: 50_000_000,
    exposureBalance: 40_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T22", "民营医院待补规则", {
    industry: "healthcare",
    hospitalType: "private_hospital",
    exposureInit: 80_000_000,
    exposureBalance: 70_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T23", "担保人存量缺失项目", {
    partyType: "guarantor",
    groupId: "G-MISSING-GUARANTOR",
    groupName: "待补担保集团",
    relatedPartyStockCount: null,
    exposureBalance: 160_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  }),
  project("T24", "资产部酌情增减项目", {
    manualFrequencyRequested: true,
    exposureBalance: 120_000_000,
    expectedOnsiteCount: 0,
    expectedOffsiteCount: 0
  })
];

export const createAcceptanceFixture = () => {
  const tagLibrary = extendTagLibraryWithRelationships(acceptanceTagLibrarySeed, acceptanceProjectsRaw, acceptancePeopleRaw);
  const people = acceptancePeopleRaw.map((item) => syncPersonTags(item, tagLibrary));
  const projects = acceptanceProjectsRaw.map((item) => syncProjectTags(item, tagLibrary));
  return { projects, people, tagLibrary };
};

const acceptanceTagLibrarySeed: TagDefinition[] = defaultTagLibrary;
