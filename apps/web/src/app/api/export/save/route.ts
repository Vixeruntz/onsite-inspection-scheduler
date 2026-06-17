import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runToWorkbook } from "@inspection/scheduler";
import type { Project, SchedulingRun } from "@inspection/domain";
import * as XLSX from "xlsx";
import { workspaceService } from "../../backend/workspace-runtime.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkspaceExportSummary = {
  projects: Project[];
  currentRun: SchedulingRun;
  publishCandidateRun?: SchedulingRun | null;
  asset7Run?: SchedulingRun | null;
  officialRuns?: SchedulingRun[];
};

const apiBase = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

const formatTimestamp = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("");
};

const pickRun = (workspace: WorkspaceExportSummary, requestedRunId: string | null) => {
  const candidates = [workspace.publishCandidateRun, workspace.currentRun, workspace.asset7Run, ...(workspace.officialRuns ?? [])].filter(Boolean) as SchedulingRun[];
  if (!requestedRunId) return workspace.publishCandidateRun ?? workspace.currentRun;
  return candidates.find((run) => run.id === requestedRunId) ?? null;
};

const workspaceRoot = () => {
  const cwd = process.cwd();
  return cwd.endsWith(path.join("apps", "web")) ? path.resolve(cwd, "../..") : cwd;
};

export const POST = async (request: Request) => {
  let workspace: WorkspaceExportSummary;
  if (apiBase) {
    try {
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/workspace`, { cache: "no-store" });
      if (!response.ok) return jsonError("后台数据不可用，无法保存当前方案", 503);
      workspace = await response.json() as WorkspaceExportSummary;
    } catch {
      return jsonError("后台数据不可用，无法保存当前方案", 503);
    }
  } else {
    workspace = workspaceService().summary() as WorkspaceExportSummary;
  }

  const requestedRunId = new URL(request.url).searchParams.get("runId");
  const run = pickRun(workspace, requestedRunId);
  if (!run) return jsonError("当前页面方案已变化，请刷新后重新导出", 409);

  try {
    const workbook = runToWorkbook(run, { projects: workspace.projects });
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const fileName = `现场检查排期报告-${run.planPeriod.year}-${formatTimestamp()}.xlsx`;
    const outputDir = process.env.VERCEL ? path.join(os.tmpdir(), "inspection-exports") : path.join(workspaceRoot(), "outputs");
    const filePath = path.join(outputDir, fileName);
    await mkdir(outputDir, { recursive: true });
    await writeFile(filePath, buffer);
    return Response.json(
      { fileName, filePath, runId: run.id },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return jsonError("报告保存失败，请稍后重试", 500);
  }
};
