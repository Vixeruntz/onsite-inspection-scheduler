import { runToWorkbook } from "@inspection/scheduler";
import type { Project, SchedulingRun } from "@inspection/domain";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

type WorkspaceExportSummary = {
  projects: Project[];
  currentRun: SchedulingRun;
  publishCandidateRun?: SchedulingRun | null;
  asset7Run?: SchedulingRun | null;
  officialRuns?: SchedulingRun[];
};

const apiBase = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

const dispositionFor = (filename: string) => {
  const fallback = "inspection-schedule-report.xlsx";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};

const pickRun = (workspace: WorkspaceExportSummary, requestedRunId: string | null) => {
  const candidates = [workspace.publishCandidateRun, workspace.currentRun, workspace.asset7Run, ...(workspace.officialRuns ?? [])].filter(Boolean) as SchedulingRun[];
  if (!requestedRunId) return workspace.publishCandidateRun ?? workspace.currentRun;
  return candidates.find((run) => run.id === requestedRunId) ?? null;
};

export const GET = async (request: Request) => {
  let workspace: WorkspaceExportSummary;
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, "")}/workspace`, { cache: "no-store" });
    if (!response.ok) return jsonError("后台数据不可用，无法导出当前方案", 503);
    workspace = await response.json() as WorkspaceExportSummary;
  } catch {
    return jsonError("后台数据不可用，无法导出当前方案", 503);
  }

  const requestedRunId = new URL(request.url).searchParams.get("runId");
  const run = pickRun(workspace, requestedRunId);
  if (!run) return jsonError("当前页面方案已变化，请刷新后重新导出", 409);

  try {
    const workbook = runToWorkbook(run, { projects: workspace.projects });
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `现场检查排期报告-${run.planPeriod.year}-${formatTimestamp()}.xlsx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": dispositionFor(filename)
      }
    });
  } catch {
    return jsonError("报告生成失败，请稍后重试", 500);
  }
};
