import { describe, expect, it } from "vitest";
import { WorkspaceService } from "./workspace.service.js";

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
