import { importProjectsFromXlsx, generateRun, writeRunWorkbook } from "@inspection/scheduler";
import fs from "node:fs";
import path from "node:path";

const samplePath = path.resolve("1、2026（资产部）授信检查计划（样表）.xlsx");
const projects = importProjectsFromXlsx(samplePath, { desensitize: true, year: 2026 });
const run = generateRun({ year: 2026, scope: "full_year" }, projects, {
  assigneePoolMode: "sampleMaintainers",
  now: new Date().toISOString()
});

console.log(JSON.stringify(run.audit, null, 2));
fs.mkdirSync(path.resolve("outputs"), { recursive: true });
writeRunWorkbook(run, path.resolve("outputs/inspection-schedule-2026.xlsx"));
