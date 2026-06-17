import type { WorkspaceService as WorkspaceServiceType } from "../../../../../api/src/workspace.service.js";
import { WorkspaceService } from "../../../../../api/src/workspace.service.js";

const globalWorkspace = globalThis as typeof globalThis & {
  __inspectionWorkspaceService?: WorkspaceServiceType;
};

export const workspaceService = () => {
  globalWorkspace.__inspectionWorkspaceService ??= new WorkspaceService();
  return globalWorkspace.__inspectionWorkspaceService;
};

