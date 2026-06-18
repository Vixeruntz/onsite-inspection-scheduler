import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunsController } from "./runs.controller.js";
import { WorkspaceService } from "./workspace.service.js";

const originalStatePath = process.env.WORKSPACE_STATE_PATH;
const originalAdminToken = process.env.WORKSPACE_ADMIN_TOKEN;

const restoreEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

afterEach(() => {
  restoreEnv("WORKSPACE_STATE_PATH", originalStatePath);
  restoreEnv("WORKSPACE_ADMIN_TOKEN", originalAdminToken);
});

describe("WorkspaceService project bulk delete", () => {
  it("removes selected projects from the current project pool and refreshes the candidate run", () => {
    const service = new WorkspaceService();
    const before = service.summary();
    const idsToDelete = ["T04", "T05", "T08"];

    const result = service.bulkDeleteProjects({ projectIds: [...idsToDelete, "not-exists"] });
    const after = service.summary();

    expect(result).toEqual({
      deletedCount: idsToDelete.length,
      deletedProjectIds: idsToDelete,
      remainingProjects: before.projects.length - idsToDelete.length
    });
    expect(after.projects.map((project) => project.id)).not.toEqual(expect.arrayContaining(idsToDelete));
    expect(after.planningYear.projectBatch.dataRows).toBe(before.projects.length - idsToDelete.length);
    expect(after.planningYear.projectBatch.worksheetRows).toBe(before.projects.length - idsToDelete.length + 1);
    expect(after.publishCandidateRun.audit.inputProjects).toBe(before.projects.length - idsToDelete.length);
    expect(after.issueBoard.summary.manual_confirm).toBeLessThanOrEqual(before.issueBoard.summary.manual_confirm);
    expect(after.planningYear.activeSnapshotId).toBeNull();
  });

  it("keeps existing official runs unchanged after projects are removed from the pool", () => {
    const service = new WorkspaceService();
    const official = { ...service.summary().currentRun, id: "run-official-test", runType: "official" as const };
    const internal = service as unknown as { runs: Map<string, typeof official> };
    internal.runs.set(official.id, official);
    const officialTaskCount = official.tasks.length;
    const officialT04TaskCount = official.tasks.filter((task) => task.projectId === "T04").length;

    service.bulkDeleteProjects({ projectIds: ["T04", "T05"] });
    const archivedOfficial = service.summary().officialRuns.find((run) => run.id === official.id);

    expect(archivedOfficial).toBeTruthy();
    expect(archivedOfficial?.tasks.length).toBe(officialTaskCount);
    expect(archivedOfficial?.tasks.filter((task) => task.projectId === "T04").length).toBe(officialT04TaskCount);
    expect(service.summary().projects.some((project) => project.id === "T04")).toBe(false);
  });

  it("rejects an empty bulk delete request", () => {
    const service = new WorkspaceService();
    expect(() => service.bulkDeleteProjects({ projectIds: [] })).toThrow("请选择需要移出项目池的项目");
  });
});

describe("WorkspaceService energy exemption bulk update", () => {
  it("confirms missing energy fields in bulk and refreshes R5 scheduling", () => {
    const service = new WorkspaceService();
    service.updateProject("T27", { gridConnected: null, accountMonitored: null, repayClean3y: null });

    const result = service.bulkUpdateEnergyFields({
      projectIds: ["T27"],
      updates: { gridConnected: true, accountMonitored: true, repayClean3y: true },
      reason: "导入后批量确认能源豁免条件"
    });
    const summary = service.summary();
    const project = summary.projects.find((item) => item.id === "T27");
    const frequencyLog = summary.publishCandidateRun.decisionLogs.find((log) => log.projectId === "T27" && log.step === "frequency");
    const tasks = summary.publishCandidateRun.tasks.filter((task) => task.projectId === "T27");

    expect(result.updatedCount).toBe(1);
    expect(result.afterSummary.pendingEnergyProjects).toBeLessThan(result.beforeSummary.pendingEnergyProjects);
    expect(result.r5CandidateProjectIds).toContain("T27");
    expect(project?.gridConnected).toBe(true);
    expect(project?.accountMonitored).toBe(true);
    expect(project?.repayClean3y).toBe(true);
    expect(project?.tagIds?.length).toBeGreaterThan(0);
    expect(frequencyLog?.ruleHit).toBe("R5");
    expect(tasks.filter((task) => task.checkType === "onsite")).toHaveLength(0);
    expect(tasks.filter((task) => task.checkType === "offsite")).toHaveLength(1);
    expect(summary.planningYear.activeSnapshotId).toBeNull();
  });

  it("keeps projects out of R5 when a confirmed energy condition is false", () => {
    const service = new WorkspaceService();
    service.updateProject("T27", { gridConnected: null, accountMonitored: null, realtimeMonitored: false, repayClean3y: null });

    service.bulkUpdateEnergyFields({
      projectIds: ["T27"],
      updates: { gridConnected: true, accountMonitored: false, repayClean3y: true },
      reason: "导入后批量确认能源豁免条件"
    });
    const summary = service.summary();
    const frequencyLog = summary.publishCandidateRun.decisionLogs.find((log) => log.projectId === "T27" && log.step === "frequency");

    expect(frequencyLog?.ruleHit).not.toBe("R5");
  });

  it("rejects non-energy-field updates", () => {
    const service = new WorkspaceService();

    expect(() =>
      service.bulkUpdateEnergyFields({
        projectIds: ["T27"],
        updates: { exposureBalance: 1 },
        reason: "导入后批量确认能源豁免条件"
      })
    ).toThrow("仅允许更新能源豁免三项字段");
  });
});

describe("WorkspaceService snapshot persistence", () => {
  it("exports and restores the full workspace state", () => {
    const service = new WorkspaceService();
    const official = { ...service.summary().currentRun, id: "snapshot-official-run", runType: "official" as const, status: "archived" as const };
    const internal = service as unknown as { runs: Map<string, typeof official> };
    internal.runs.set(official.id, official);
    const snapshot = service.workspaceSnapshot();
    const projectCount = snapshot.workspace.projects.length;
    const officialCount = snapshot.runs.filter((run) => run.runType === "official").length;
    const archivedCount = snapshot.runs.filter((run) => run.runType === "official" && run.status === "archived").length;

    service.bulkDeleteProjects({ projectIds: ["T04", "T05", "T06"] });
    service.restoreWorkspaceSnapshot(snapshot);
    const restored = service.summary();

    expect(restored.projects).toHaveLength(projectCount);
    expect(restored.officialRuns).toHaveLength(officialCount);
    expect(restored.officialRuns.filter((run) => run.status === "archived")).toHaveLength(archivedCount);
    expect(restored.projects.some((project) => project.id === "T04")).toBe(true);
  });

  it("persists mutations to WORKSPACE_STATE_PATH and reloads them on startup", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "inspection-workspace-"));
    const statePath = path.join(tempDir, "workspace-state.json");
    process.env.WORKSPACE_STATE_PATH = statePath;

    const service = new WorkspaceService();
    service.updateProject("T27", { name: "云端已导入项目持久化验证" });

    const reloaded = new WorkspaceService();
    expect(fs.existsSync(statePath)).toBe(true);
    expect(reloaded.summary().projects.find((project) => project.id === "T27")?.name).toBe("云端已导入项目持久化验证");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("Workspace snapshot admin token", () => {
  it("rejects snapshot export without the configured admin token", () => {
    process.env.WORKSPACE_ADMIN_TOKEN = "secret-token";
    const controller = new RunsController(new WorkspaceService());

    expect(() => controller.workspaceSnapshot(undefined, undefined)).toThrow("工作区快照接口未授权");
    expect(() => controller.workspaceSnapshot("Bearer wrong-token", undefined)).toThrow("工作区快照接口未授权");
    expect(controller.workspaceSnapshot("Bearer secret-token", undefined).workspace.projects.length).toBeGreaterThan(0);
  });
});
