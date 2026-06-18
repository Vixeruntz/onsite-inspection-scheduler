import type { AssigneePoolMode, Person, Project, RuleDecisionDraft, TagDefinition, TagScope, Task } from "@inspection/domain";
import { workspaceService } from "../workspace-runtime.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const noStore = { "Cache-Control": "no-store" };

const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers: noStore });

const assertAdminToken = (request: Request) => {
  const expected = process.env.WORKSPACE_ADMIN_TOKEN?.trim();
  const provided =
    request.headers.get("x-workspace-admin-token")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || provided !== expected) {
    return json({ error: "工作区快照接口未授权" }, 401);
  }
  return null;
};

const jsonError = (error: unknown) => {
  const maybeHttpError = error as {
    getStatus?: () => number;
    getResponse?: () => string | { message?: string | string[]; error?: string };
    message?: string;
  };
  const status = maybeHttpError.getStatus?.() ?? 500;
  const response = maybeHttpError.getResponse?.();
  const responseMessage =
    typeof response === "string"
      ? response
      : Array.isArray(response?.message)
        ? response.message.join("；")
        : response?.message ?? response?.error;
  return json({ error: responseMessage ?? maybeHttpError.message ?? "请求处理失败" }, status);
};

const readJson = async <T,>(request: Request): Promise<T> => {
  const text = await request.text();
  return (text ? JSON.parse(text) : {}) as T;
};

const segmentsFrom = async (context: RouteContext) => (await context.params).path ?? [];

const handleGet = async (request: Request, segments: string[]) => {
  const service = workspaceService();
  const url = new URL(request.url);

  if (segments.join("/") === "admin/workspace-snapshot") {
    const unauthorized = assertAdminToken(request);
    if (unauthorized) return unauthorized;
    return json(service.workspaceSnapshot());
  }
  if (segments[0] === "workspace" && segments.length === 1) return json(service.summary());
  if (segments[0] === "tags" && segments.length === 1) return json(service.tags(url.searchParams.get("scope") as TagScope | undefined));
  if (segments[0] === "tags" && segments[1] === "taxonomy") return json(service.tagTaxonomy(url.searchParams.get("scope") as TagScope | undefined));
  if (segments.join("/") === "rules/business-ordering") return json(service.businessOrdering());
  if (segments.join("/") === "rules/system-map") return json(service.ruleSystemMap());
  if (segments.join("/") === "rules/pending-decisions") return json(service.pendingRuleDecisions());
  if (segments.join("/") === "rules/evidence-library") return json(service.evidenceLibrary());
  if (segments[0] === "rules" && segments[2] === "impact") return json(service.ruleImpact(segments[1] ?? ""));
  if (segments[0] === "rules" && segments[2] === "evidence") return json(service.ruleEvidence(segments[1] ?? ""));
  if (segments[0] === "planning-years" && segments[2] === "readiness") return json(service.readiness(Number(segments[1])));
  if (segments[0] === "planning-years" && segments[2] === "projects" && segments[3] === "diff") return json(service.projectDiff(Number(segments[1])));
  if (segments[0] === "runs" && segments.length === 1) return json(service.listRuns(url.searchParams.get("runType") as "official" | "manual_recompute" | "what_if" | undefined));
  if (segments.join("/") === "runs/diff") return json(service.diff(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? ""));
  if (segments[0] === "runs" && segments[2] === "projects" && segments[4] === "decision-chain") return json(service.decisionChain(segments[1] ?? "", segments[3] ?? ""));
  if (segments[0] === "runs" && segments.length === 2) return json(service.getRun(segments[1] ?? ""));

  return json({ error: "接口不存在" }, 404);
};

const handlePost = async (request: Request, segments: string[]) => {
  const service = workspaceService();

  if (segments.join("/") === "admin/workspace-snapshot/restore") {
    const unauthorized = assertAdminToken(request);
    if (unauthorized) return unauthorized;
    return json(service.restoreWorkspaceSnapshot(await readJson<ReturnType<typeof service.workspaceSnapshot>>(request)));
  }
  if (segments[0] === "tags" && segments.length === 1) return json(service.createTag(await readJson<Partial<TagDefinition>>(request)));
  if (segments[0] === "rules" && segments[1] === "pending-decisions" && segments[3] === "what-if") return json(service.simulateRuleDecision(segments[2] ?? ""));
  if (segments[0] === "rules" && segments[1] === "pending-decisions" && segments[3] === "submit") return json(service.submitRuleDecision(segments[2] ?? ""));
  if (segments.join("/") === "rules/suggestions/generate") return json(service.generateRuleSuggestions(await readJson<{ scope: "current_run"; apply: true }>(request)));
  if (segments[0] === "planning-years" && segments[2] === "projects" && segments[3] === "import") {
    const form = await request.formData();
    const file = form.get("file");
    const upload = file instanceof File
      ? {
          originalname: file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
          mimetype: file.type,
          size: file.size
        }
      : undefined;
    return json(service.importProjects(Number(segments[1]), upload));
  }
  if (segments[0] === "planning-years" && segments[2] === "projects" && segments[3] === "freeze") return json(service.freezeProjects(Number(segments[1])));
  if (segments[0] === "planning-years" && segments[2] === "people" && segments[3] === "versions" && segments[4] === "confirm") return json(service.confirmRosterVersion(Number(segments[1])));
  if (segments[0] === "planning-years" && segments[2] === "people" && segments[3] === "versions") return json(service.createRosterVersion(Number(segments[1])));
  if (segments[0] === "planning-years" && segments[2] === "rulesets" && segments[3] === "copy-from") return json(service.copyRuleset(Number(segments[1])));
  if (segments[0] === "planning-years" && segments[2] === "rulesets" && segments[4] === "publish") return json(service.publishRuleset(Number(segments[1]), segments[3] ?? ""));
  if (segments[0] === "planning-years" && segments[2] === "runs" && segments[3] === "generate") {
    const body = await readJson<{ assigneePoolMode?: AssigneePoolMode; runType?: "official" | "what_if" }>(request);
    return json(service.generateForPlanningYear(Number(segments[1]), body.assigneePoolMode, body.runType));
  }
  if (segments[0] === "projects" && segments.length === 1) return json(service.createProject(await readJson<Partial<Project>>(request)));
  if (segments.join("/") === "projects/bulk-tags") return json(service.bulkProjectTags(await readJson<{ projectIds: string[]; tagIds: string[]; mode: "add" | "remove" }>(request)));
  if (segments.join("/") === "projects/bulk-delete") return json(service.bulkDeleteProjects(await readJson<{ projectIds: string[] }>(request)));
  if (segments.join("/") === "projects/bulk-update-energy-fields") {
    return json(service.bulkUpdateEnergyFields(await readJson<{ projectIds: string[]; updates: Record<string, unknown>; reason?: string }>(request)));
  }
  if (segments[0] === "people" && segments.length === 1) return json(service.createPerson(await readJson<Partial<Person>>(request)));
  if (segments.join("/") === "people/bulk-tags") return json(service.bulkPersonTags(await readJson<{ personIds: string[]; tagIds: string[]; mode: "add" | "remove" }>(request)));
  if (segments.join("/") === "runs/generate") {
    const body = await readJson<{ assigneePoolMode?: AssigneePoolMode; runType?: "official" | "what_if" }>(request);
    return json(service.generate(body.assigneePoolMode, body.runType));
  }
  if (segments[0] === "runs" && segments[2] === "publish") return json(service.publishRun(segments[1] ?? ""));
  if (segments[0] === "runs" && segments[2] === "archive") return json(service.archiveRun(segments[1] ?? ""));
  if (segments[0] === "runs" && segments[2] === "tasks" && segments[4] === "override") {
    return json(service.overrideTask(
      segments[1] ?? "",
      segments[3] ?? "",
      await readJson<{ field: "assigneeId" | "scheduledDate" | "manualDisposition"; value: string | null; reason: string }>(request)
    ));
  }

  return json({ error: "接口不存在" }, 404);
};

const handlePatch = async (request: Request, segments: string[]) => {
  const service = workspaceService();

  if (segments[0] === "tags" && segments.length === 2) return json(service.updateTag(segments[1] ?? "", await readJson<Partial<TagDefinition>>(request)));
  if (segments[0] === "rules" && segments[1] === "pending-decisions" && segments[3] === "draft") {
    return json(service.saveRuleDecisionDraft(segments[2] ?? "", await readJson<Partial<RuleDecisionDraft>>(request)));
  }
  if (segments[0] === "projects" && segments.length === 2) return json(service.updateProject(segments[1] ?? "", await readJson<Partial<Project>>(request)));
  if (segments[0] === "people" && segments.length === 2) return json(service.updatePerson(segments[1] ?? "", await readJson<Partial<Person>>(request)));
  if (segments[0] === "runs" && segments[2] === "tasks" && segments[4] === "status") {
    return json(service.updateTaskStatus(
      segments[1] ?? "",
      segments[3] ?? "",
      await readJson<{ status?: Task["status"]; actualCompletedAt?: string | null; reportRef?: string | null }>(request)
    ));
  }

  return json({ error: "接口不存在" }, 404);
};

export const GET = async (request: Request, context: RouteContext) => {
  try {
    return await handleGet(request, await segmentsFrom(context));
  } catch (error) {
    return jsonError(error);
  }
};

export const POST = async (request: Request, context: RouteContext) => {
  try {
    return await handlePost(request, await segmentsFrom(context));
  } catch (error) {
    return jsonError(error);
  }
};

export const PATCH = async (request: Request, context: RouteContext) => {
  try {
    return await handlePatch(request, await segmentsFrom(context));
  } catch (error) {
    return jsonError(error);
  }
};
