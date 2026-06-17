import type { BizType, CustomerType, HospitalType, Industry, PartyType, Project, RiskGrade } from "@inspection/domain";
import { syncProjectTags } from "./tags.js";
import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";

const xlsxNamespace = XLSX as typeof XLSX & { [key: string]: typeof XLSX | undefined };
const xlsxModule = xlsxNamespace["default"] ?? XLSX;
const { read, readFile, utils } = xlsxModule;

type RawRow = Record<string, unknown>;

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const num = (value: unknown) => {
  if (typeof value === "number") return value;
  const cleaned = str(value).replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstPresent = (row: RawRow, keys: string[]) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && str(row[key]) !== "") return row[key];
  }
  return undefined;
};

const optionalInt = (row: RawRow, keys: string[]) => {
  const value = firstPresent(row, keys);
  if (value === undefined) return null;
  const parsed = Math.trunc(num(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const optionalString = (row: RawRow, keys: string[]) => {
  const value = firstPresent(row, keys);
  const text = str(value);
  return text || null;
};

const excelDateToIso = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
  }
  const text = str(value).replace(/\//g, "-");
  const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`;
};

const normalizeRiskGrade = (value: string): RiskGrade => {
  if (value.includes("损失")) return "loss";
  if (value.includes("可疑")) return "doubtful";
  if (value.includes("次级")) return "substandard";
  if (value.includes("关注")) return "watch";
  return "normal";
};

const normalizeCustomerType = (value: string): CustomerType => {
  const text = value.replace(/\s/g, "");
  if (/协同项目?A|协同A/i.test(text)) return "collab_a";
  if (/协同项目?B|协同B/i.test(text)) return "collab_b";
  if (/^内部|内部项目|华润集团及下属控股企业/.test(text)) return "internal";
  if (/^外部|外部项目|外部客户/.test(text)) return "external";
  return "external";
};

const normalizeIndustry = (value: string): Industry => {
  if (value.includes("能源") || value.includes("环保")) return "energy";
  if (value.includes("医疗") || value.includes("医院") || value.includes("健康")) return "healthcare";
  if (value.includes("民生") || value.includes("公用")) return "public_services";
  return "other";
};

const normalizePartyType = (value: string): PartyType => {
  if (value.includes("集团")) return "group";
  if (value.includes("担保")) return "guarantor";
  return "lessee";
};

const normalizeGroupName = (value: string) => {
  const text = value.trim();
  if (!text || text === "无集团" || text === "无" || text === "无归属集团") return null;
  return text;
};

const normalizeBizType = (value: string): BizType => {
  if (value.includes("直租")) return "direct_lease";
  if (value.includes("保理")) return "factoring";
  return "leaseback";
};

const normalizeHospitalType = (value: string): HospitalType | null => {
  if (value.includes("公立")) return "public_hospital";
  if (value.includes("民营")) return "private_hospital";
  return null;
};

const yesNo = (value: unknown): boolean | null => {
  const text = str(value);
  if (!text) return null;
  if (["是", "已接入", "已监管", "正常", "Y", "YES", "TRUE", "1"].includes(text.toUpperCase())) return true;
  if (["否", "未接入", "未监管", "异常", "N", "NO", "FALSE", "0"].includes(text.toUpperCase())) return false;
  return null;
};

const yesNoFirst = (row: RawRow, keys: string[]) => {
  const value = firstPresent(row, keys);
  return value === undefined ? null : yesNo(value);
};

const termMonths = (start: string | null, end: string | null) => {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth();
};

export type ImportProjectsOptions = {
  desensitize?: boolean;
  year?: number;
};

const memberCountColumns = ["member_count", "memberCount", "集团存量客户数", "集团旗下存量客户数", "旗下我司存量客户数", "旗下存量客户数"];
const relatedPartyStockCountColumns = [
  "relatedPartyStockCount",
  "related_party_stock_count",
  "担保人旗下存量客户数",
  "母公司旗下存量客户数",
  "实控人旗下存量客户数",
  "关联方旗下存量客户数",
  "旗下存量客户数"
];
const gridConnectedColumns = ["gridConnected", "是否并网", "是否并网/连入电网监控", "是否连入电网监控", "电网监控"];
const accountMonitoredColumns = ["accountMonitored", "是否账户监管", "是否纳入账户监管", "账户监管"];
const realtimeMonitoredColumns = ["realtimeMonitored", "是否连入监控", "是否实时监控", "实时监控"];
const repayClean3yColumns = ["repayClean3y", "近三年还款正常", "近三年无欠息逾期", "三年无欠息逾期"];
const lastOnsiteDateColumns = ["lastOnsiteDate", "最近现场检查日期", "上次现场检查日期", "最近一次现场检查日期"];
const onsiteMaintainerIdColumns = ["onsiteMaintainerId", "现场维护人ID", "现场负责人ID"];
const offsiteMaintainerIdColumns = ["offsiteMaintainerId", "非现场维护人ID", "非现场负责人ID"];
const groupIdColumns = ["groupId", "所属集团编号", "集团编号"];
const projectIdColumns = ["id", "ID", "项目编号", "项目ID"];
const primaryResponsibleDeptColumns = ["primaryResponsibleDept", "主责部门", "检查主责", "责任分工"];
const unavailableMonthsColumns = ["unavailableMonths", "不可排月份", "不可安排月份", "避开月份"];
const offsiteInfoChannelColumns = ["offsiteInfoChannels", "非现场资料渠道", "资料渠道"];
const warningPlanColumns = ["warningPlan", "预警处理方案", "预警方案", "授信后预警处理方案"];
const manualFrequencyRequestedColumns = ["manualFrequencyRequested", "资产部酌情增减", "是否资产部酌情增减", "人工增减频次"];

const normalizePrimaryResponsibleDept = (value: string): Project["primaryResponsibleDept"] => {
  if (value.includes("业务部门") && !value.includes("资产")) return "business_department";
  if (value.includes("资产") && !value.includes("配合") && !value.includes("联合")) return "asset_management";
  return "joint";
};

const parseMonthList = (value: string) =>
  value
    .split(/[、,，;；\s]+/)
    .map((item) => Number(item.replace("月", "")))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 12);

const parseTextList = (value: string) => value.split(/[、,，;；]+/).map((item) => item.trim()).filter(Boolean);

export const rowToProject = (row: RawRow, index: number, options: ImportProjectsOptions = {}): Project => {
  const year = options.year ?? 2026;
  const importedId = optionalString(row, projectIdColumns);
  const realName = str(row["商业伙伴名称"]) || `项目${index}`;
  const realGroup = normalizeGroupName(str(row["所属集团"]));
  const importedGroupId = optionalString(row, groupIdColumns);
  const creditStart = excelDateToIso(row["最早授信开始日"]) ?? `${year}-01-01`;
  const creditEnd = excelDateToIso(row["最晚授信结束日"]) ?? `${year}-12-31`;
  const riskGrade = normalizeRiskGrade(str(row["五级分类"]));
  const exposureBalance = num(row["计划时剩余风险敞口"]);
  const settled = exposureBalance <= 0 || str(row["授信后检查要求"]).includes("结清");
  const months = termMonths(creditStart, creditEnd);
  const isNewWithin1y = new Date(creditStart).getFullYear() === year && months <= 12;
  const onsiteMaintainer = str(row["现场维护人"]) || null;
  const offsiteMaintainer = str(row["非现场维护人"]) || null;
  const partyType = normalizePartyType(str(row["类型"]));
  const importedMemberCount = optionalInt(row, memberCountColumns);
  const importedRelatedPartyStockCount = optionalInt(row, relatedPartyStockCountColumns);
  const unavailableMonthsText = str(firstPresent(row, unavailableMonthsColumns));
  const offsiteInfoChannelText = str(firstPresent(row, offsiteInfoChannelColumns));

  return syncProjectTags({
    id: importedId ?? `P${String(index).padStart(4, "0")}`,
    name: options.desensitize === false ? realName : `项目${String(index).padStart(3, "0")}`,
    partyType,
    groupId: importedGroupId ?? (realGroup ? `G-${realGroup}` : null),
    groupName: options.desensitize === false ? realGroup : realGroup ? `集团${String(index).padStart(3, "0")}` : null,
    dept: str(row["业务部门"]) || "未填",
    riskGrade,
    isNpl: ["substandard", "doubtful", "loss"].includes(riskGrade),
    customerType: normalizeCustomerType(str(row["客户类型"])),
    industry: normalizeIndustry(str(row["行业"])),
    hospitalType: normalizeHospitalType(str(row["医院类型"])),
    bizType: normalizeBizType(str(row["业务类型"])),
    exposureInit: num(row["初始风险敞口"]),
    exposureBalance,
    creditStart,
    creditEnd,
    termHalf: excelDateToIso(row["期限过半时"]),
    gridConnected: yesNoFirst(row, gridConnectedColumns),
    accountMonitored: yesNoFirst(row, accountMonitoredColumns),
    realtimeMonitored: yesNoFirst(row, realtimeMonitoredColumns),
    repayClean3y: yesNoFirst(row, repayClean3yColumns),
    isWarning: str(row["授信后检查要求"]).includes("预警"),
    isSettledThisYear: settled,
    isNewWithin1y,
    lastOnsiteDate: excelDateToIso(firstPresent(row, lastOnsiteDateColumns)),
    expectedOnsiteCount: num(row["现场检查次数"]),
    expectedOffsiteCount: num(row["非现场检查次数"]),
    onsiteMaintainerName: onsiteMaintainer,
    offsiteMaintainerName: offsiteMaintainer,
    onsiteMaintainerId: optionalString(row, onsiteMaintainerIdColumns),
    offsiteMaintainerId: optionalString(row, offsiteMaintainerIdColumns),
    memberCount: partyType === "group" ? importedMemberCount : null,
    relatedPartyStockCount: partyType === "guarantor" ? importedRelatedPartyStockCount : null,
    primaryResponsibleDept: normalizePrimaryResponsibleDept(str(firstPresent(row, primaryResponsibleDeptColumns))),
    manualFrequencyRequested:
      yesNoFirst(row, manualFrequencyRequestedColumns) === true ||
      str(firstPresent(row, warningPlanColumns)).includes("酌情增减"),
    warningPlan: optionalString(row, warningPlanColumns),
    unavailableMonths: parseMonthList(unavailableMonthsText),
    offsiteInfoChannels: parseTextList(offsiteInfoChannelText)
  });
};

const hydrateImportedStockCounts = (projects: Project[], rows: RawRow[]) => {
  const childrenByGroupName = new Map<string, number>();
  for (const row of rows) {
    if (normalizePartyType(str(row["类型"])) === "group") continue;
    const groupName = normalizeGroupName(str(row["所属集团"]));
    if (!groupName) continue;
    childrenByGroupName.set(groupName, (childrenByGroupName.get(groupName) ?? 0) + 1);
  }

  return projects.map((project, index) => {
    if (project.partyType !== "group" && project.partyType !== "guarantor") return project;
    const row = rows[index] ?? {};
    const rawName = str(row["商业伙伴名称"]);
    const rawGroupName = normalizeGroupName(str(row["所属集团"]));
    const inferredCount = childrenByGroupName.get(rawGroupName ?? rawName) ?? null;
    if (project.partyType === "group" && project.memberCount === null && inferredCount !== null) {
      return syncProjectTags({ ...project, memberCount: inferredCount });
    }
    if (project.partyType === "guarantor" && project.relatedPartyStockCount === null && inferredCount !== null) {
      return syncProjectTags({ ...project, relatedPartyStockCount: inferredCount });
    }
    return project;
  });
};

const projectsFromWorkbook = (workbook: WorkBook, options: ImportProjectsOptions = {}) => {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];
  const rows = utils.sheet_to_json<RawRow>(sheet, { defval: null });
  return hydrateImportedStockCounts(
    rows.map((row, index) => rowToProject(row, index + 1, { desensitize: true, ...options })),
    rows
  );
};

export const importProjectsFromXlsx = (filePath: string, options: ImportProjectsOptions = {}) =>
  projectsFromWorkbook(readFile(filePath, { cellDates: true }), options);

export const importProjectsFromXlsxBuffer = (buffer: Uint8Array, options: ImportProjectsOptions = {}) =>
  projectsFromWorkbook(read(buffer, { cellDates: true, type: "buffer" }), options);

export const buildGroupMemberCounts = (projects: Project[]) => {
  const counts = new Map<string, number>();
  for (const project of projects) {
    if (!project.groupId) continue;
    counts.set(project.groupId, (counts.get(project.groupId) ?? 0) + 1);
  }
  return counts;
};
