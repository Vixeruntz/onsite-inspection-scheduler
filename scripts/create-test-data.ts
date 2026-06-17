import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { labelMaps, type Person, type Project, type SchedulingRun, type Task } from "../packages/domain/src/index.js";
import { createAcceptanceFixture, createIssueBoard, generateRun, syncProjectTags } from "../packages/scheduler/src/index.js";

type WorkbookRow = Record<string, string | number | boolean | null>;

const outputDir = path.resolve("outputs");
const workbookPath = path.join(outputDir, "端到端测试数据包.xlsx");
const jsonPath = path.join(outputDir, "端到端测试数据包.json");
const now = "2026-05-29T08:00:00.000Z";
const period = { year: 2026, scope: "full_year" as const };

const boolText = (value: boolean | null | undefined) => (value === true ? "是" : value === false ? "否" : "");

const hospitalTypeLabel = (value: Project["hospitalType"]) =>
  value === "public_hospital" ? "公立医院" : value === "private_hospital" ? "民营医院" : "";

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

const settlementText = (project: Project) => {
  if (project.isSettledThisYear) return "结清";
  if (project.isWarning) return "预警";
  return "";
};

const makeProject = (source: Project, id: string, name: string, input: Partial<Project> = {}): Project =>
  syncProjectTags({
    ...source,
    tagIds: [],
    ...input,
    id,
    name
  });

const createFiftyProjectFixture = () => {
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

  return {
    ...fixture,
    projects: applyBusinessProjectNames([...firstSixteen, ...extraProjects])
  };
};

const projectToImportRow = (project: Project): WorkbookRow => ({
  项目编号: project.id,
  商业伙伴名称: project.name,
  类型: labelMaps.partyType[project.partyType],
  所属集团编号: project.groupId ?? "",
  所属集团: project.groupName ?? "",
  业务部门: project.dept,
  五级分类: labelMaps.riskGrade[project.riskGrade],
  客户类型: labelMaps.customerType[project.customerType],
  行业: labelMaps.industry[project.industry],
  医院类型: hospitalTypeLabel(project.hospitalType),
  业务类型: labelMaps.bizType[project.bizType],
  初始风险敞口: project.exposureInit,
  计划时剩余风险敞口: project.exposureBalance,
  最早授信开始日: project.creditStart,
  最晚授信结束日: project.creditEnd,
  期限过半时: project.termHalf ?? "",
  授信后检查要求: settlementText(project),
  现场检查次数: project.expectedOnsiteCount ?? 0,
  非现场检查次数: project.expectedOffsiteCount ?? 0,
  现场维护人: project.onsiteMaintainerName ?? "",
  非现场维护人: project.offsiteMaintainerName ?? "",
  现场维护人ID: project.onsiteMaintainerId ?? "",
  非现场维护人ID: project.offsiteMaintainerId ?? "",
  集团旗下存量客户数: project.partyType === "group" ? project.memberCount ?? null : null,
  担保人旗下存量客户数: project.partyType === "guarantor" ? project.relatedPartyStockCount ?? null : null,
  是否并网: boolText(project.gridConnected),
  是否账户监管: boolText(project.accountMonitored),
  是否连入监控: boolText(project.realtimeMonitored),
  近三年还款正常: boolText(project.repayClean3y),
  最近现场检查日期: project.lastOnsiteDate ?? "",
  预警处理方案: project.warningPlan ?? "",
  主责部门: project.primaryResponsibleDept ? labelMaps.primaryResponsibleDept[project.primaryResponsibleDept] : "资产管理部主责/业务部门配合",
  不可排月份: (project.unavailableMonths ?? []).join(","),
  非现场资料渠道: (project.offsiteInfoChannels ?? []).join("、"),
  资产部酌情增减: boolText(project.manualFrequencyRequested)
});

const personToRow = (person: Person): WorkbookRow => ({
  人员编号: person.id,
  姓名: person.name,
  所属部门: person.dept,
  常驻城市: person.baseCity,
  当前状态: person.isActive ? "可参与排期" : "停用/未生效",
  人员池: person.pool.join("、"),
  专项能力: person.specialTags.join("、") || "无专项标签",
  长期负责集团: person.longTermGroupIds.join("、") || "无",
  长期负责项目: person.longTermProjectIds.join("、") || "无",
  年度现场容量: person.annualOnsiteWeekCapacity ?? 0,
  月度现场上限: person.monthlyOnsiteLimit ?? 0,
  非现场容量: person.offsiteTaskCapacity ?? 0,
  不可用月份: (person.unavailableMonths ?? []).join(",")
});

const tasksFor = (run: SchedulingRun, projectId: string) => run.tasks.filter((task) => task.projectId === projectId);

const countTasks = (tasks: Task[], checkType: Task["checkType"]) => tasks.filter((task) => task.checkType === checkType).length;

const frequencyLog = (run: SchedulingRun, projectId: string) =>
  run.decisionLogs.find((log) => log.projectId === projectId && log.step === "frequency");

const scopeLog = (run: SchedulingRun, projectId: string) =>
  run.decisionLogs.find((log) => log.projectId === projectId && log.step === "scope");

const assigneeLog = (run: SchedulingRun, projectId: string) =>
  run.decisionLogs.find((log) => log.projectId === projectId && log.step === "assignee");

const buildExpectedRows = (projects: Project[], run: SchedulingRun): WorkbookRow[] => {
  const issueBoard = createIssueBoard({ run, projects });
  const issueByProject = new Map(issueBoard.issues.map((issue) => [issue.projectId, issue]));
  return projects.map((project) => {
    const tasks = tasksFor(run, project.id);
    const issue = issueByProject.get(project.id);
    const assignee = assigneeLog(run, project.id);
    return {
      项目编号: project.id,
      项目名称: project.name,
      覆盖类型:
        scopeLog(run, project.id)?.result === "excluded"
          ? "免检/不纳入"
          : issue?.kind === "rule_gap"
            ? "规则口径阻断"
            : issue?.kind === "project_data_gap"
              ? "项目数据待补"
              : issue?.kind === "manual_confirm"
                ? "待人工确认"
                : "正常排期",
      入池规则: scopeLog(run, project.id)?.ruleHit ?? "无",
      频次规则: frequencyLog(run, project.id)?.ruleHit ?? "无频次任务",
      现场任务数: countTasks(tasks, "onsite"),
      非现场任务数: countTasks(tasks, "offsite"),
      负责人匹配: assignee?.output.assigneeName ?? tasks.find((task) => task.assigneeName)?.assigneeName ?? "待人工",
      匹配依据: assignee?.reason ?? "无",
      待处理事项: issue?.title ?? "无",
      处理入口: issue?.kind === "rule_gap" ? "规则维护" : issue?.kind === "project_data_gap" ? "项目维护" : issue?.kind === "manual_confirm" ? "排期方案" : "无",
      是否影响发布: issue?.kind === "rule_gap" || issue?.kind === "project_data_gap" ? "阻断" : issue?.kind === "manual_confirm" ? "提醒" : "不影响"
    };
  });
};

const coverageRows: WorkbookRow[] = [
  { 覆盖维度: "免检/不纳入", 数据编号: "T01/T02/T03", 说明: "零敞口、当年结清、当年新增短期限，不生成排期任务。" },
  { 覆盖维度: "外部敞口分档", 数据编号: "T04/T05/T06/T07", 说明: ">3亿、1-3亿、3000万-1亿、≤3000万，覆盖 R10/R11/R12/P1。" },
  { 覆盖维度: "客户类型", 数据编号: "T08/T09", 说明: "内部客户进入待人工，协同A只保留非现场。" },
  { 覆盖维度: "能源环保", 数据编号: "T10/T11", 说明: "能源豁免条件齐备、能源大额非豁免两种情况。" },
  { 覆盖维度: "医疗健康", 数据编号: "T12/T21/T31/T32", 说明: "公立医院大额、公立医院小额待补、民营医院待补，覆盖 R7/P2/P3。" },
  { 覆盖维度: "关系标签", 数据编号: "T13/T15/T33-T40", 说明: "集团、担保人/母公司对象值关系，覆盖 R8/R9/R13/R14/P5/P6。" },
  { 覆盖维度: "数据缺口", 数据编号: "T14/T40", 说明: "集团或担保人检查对象缺少旗下存量客户数，进入补项目数据。" },
  { 覆盖维度: "业务类型口径", 数据编号: "T16/T45/T46", 说明: "保理业务命中 P4，进入补充规则口径。" },
  { 覆盖维度: "人工规则", 数据编号: "T43/T44", 说明: "预警客户进入人工确认，资产部酌情增减命中 P7。" }
];

const appendSheet = (workbook: XLSX.WorkBook, rows: WorkbookRow[], name: string) => {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
};

const main = () => {
  const fixture = createFiftyProjectFixture();
  const run = generateRun(period, fixture.projects, {
    people: fixture.people,
    assigneePoolMode: "sampleMaintainers",
    now
  });
  const expectedRows = buildExpectedRows(fixture.projects, run);
  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, fixture.projects.map(projectToImportRow), "项目数据");
  appendSheet(workbook, fixture.people.map(personToRow), "人员数据");
  appendSheet(workbook, expectedRows, "预期规则结果");
  appendSheet(workbook, coverageRows, "覆盖说明");
  appendSheet(
    workbook,
    [
      { 项目: "用途", 内容: "用于端到端验证项目、人员、规则、排期、导出闭环。" },
      { 项目: "导入说明", 内容: "第一张表“项目数据”可用于项目维护页导入；后续表用于业务复核。" },
      { 项目: "项目数", 内容: fixture.projects.length },
      { 项目: "人员数", 内容: fixture.people.length },
      { 项目: "规则阻断", 内容: run.audit.ruleGap },
      { 项目: "待人工", 内容: run.audit.pendingManual },
      { 项目: "硬冲突", 内容: run.audit.hardConflicts }
    ],
    "使用说明"
  );

  fs.mkdirSync(outputDir, { recursive: true });
  XLSX.writeFile(workbook, workbookPath);
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        workbook: workbookPath,
        projects: fixture.projects.length,
        people: fixture.people.length,
        audit: run.audit,
        expectedRows,
        coverageRows
      },
      null,
      2
    )}\n`
  );

  console.log(`Created ${workbookPath}`);
  console.log(`Created ${jsonPath}`);
};

main();
