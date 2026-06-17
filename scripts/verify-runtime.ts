import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { generateRun, importProjectsFromXlsx } from "@inspection/scheduler";

type RuntimeCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

const root = process.cwd();

const findFreePort = async (preferred: number) =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(preferred, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : preferred;
      server.close(() => resolve(port));
    });
  }).catch(
    () =>
      new Promise<number>((resolve, reject) => {
        const server = net.createServer();
        server.on("error", reject);
        server.listen(0, () => {
          const address = server.address();
          const port = typeof address === "object" && address ? address.port : 0;
          server.close(() => resolve(port));
        });
      })
  );

const startProcess = (name: string, command: string, args: string[], env: Record<string, string>) => {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32"
  });

  child.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.log(`[${name}] ${text}`);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.error(`[${name}] ${text}`);
  });
  return child;
};

const stopProcess = async (child: ChildProcess) => {
  if (!child.pid || child.killed) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([once(child, "exit"), delay(2_000)]);
  if (!child.killed) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Process already exited.
    }
  }
};

const fetchWithRetry = async (url: string, options: RequestInit = {}, attempts = 30) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(3_000) });
      if (response.status >= 200 && response.status < 500) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const assert = (condition: boolean, detail: string) => {
  if (!condition) throw new Error(detail);
};

const run = async () => {
  const webPort = await findFreePort(3100);
  const apiPort = await findFreePort(4100);
  const checks: RuntimeCheck[] = [];
  const children: ChildProcess[] = [];

  try {
    const api = startProcess("api", "npm", ["run", "start:api"], { PORT: String(apiPort) });
    const web = startProcess("web", "npm", ["run", "dev:web"], { PORT: String(webPort) });
    children.push(api, web);

    const webHome = await fetchWithRetry(`http://127.0.0.1:${webPort}/`);
    const webHomeText = await webHome.text();
    checks.push({
      name: "web-home",
      ok:
        webHome.status === 200 &&
        webHome.headers.get("content-type")?.includes("text/html") === true &&
        webHomeText.includes("现场检查调度系统") &&
        webHomeText.includes("/_next/static/"),
      detail: `${webHome.status} ${webHome.headers.get("content-type") ?? ""}`
    });

    const exportResponse = await fetchWithRetry(`http://127.0.0.1:${webPort}/api/export`);
    const exportBytes = await exportResponse.arrayBuffer();
    checks.push({
      name: "web-export",
      ok:
        exportResponse.status === 200 &&
        exportResponse.headers.get("content-type")?.includes("spreadsheetml.sheet") === true &&
        exportBytes.byteLength > 1_000,
      detail: `${exportResponse.status} ${exportResponse.headers.get("content-type") ?? ""} ${exportBytes.byteLength} bytes`
    });

    const apiWorkspace = await fetchWithRetry(`http://127.0.0.1:${apiPort}/workspace`);
    const workspace = (await apiWorkspace.json()) as {
      projects: Array<{ id: string }>;
      people: unknown[];
      currentRun: {
        id: string;
        tasks: Array<{ id: string; status: string; scheduledDate: string | null; assigneeId: string | null; projectId: string }>;
        decisionLogs: Array<{ projectId: string; step: string; result: string; ruleHit: string | null }>;
        audit: { hardConflicts: number; ruleGap: number; pendingManual: number; manualOverrides: number; publishable: boolean };
      };
      planningYear: { projectBatch: { dataRows: number }; canGenerateSandbox: boolean; canGenerateOfficial: boolean };
      tagLibrary: Array<{ id: string; code: string; name: string }>;
      tagCoverageSummary: {
        projectTagCoverageRate: number;
        personRelationshipCoverageRate: number;
        relationPairs: Array<{ type: string; status: string; objectId: string }>;
        outputTags: Array<{ code: string; count: number }>;
        missingFields: Array<{ id: string; scope: string; severity: string }>;
      };
      ruleDrafts: Array<{ technicalRuleId: string; suggestionMeta?: { reviewStatus: string } }>;
    };
    checks.push({
      name: "api-workspace",
      ok:
        apiWorkspace.status === 200 &&
        workspace.projects.length > 0 &&
        workspace.people.length > 0 &&
        workspace.currentRun.tasks.length > 0 &&
        workspace.planningYear.projectBatch.dataRows === workspace.projects.length &&
        typeof workspace.planningYear.canGenerateSandbox === "boolean" &&
        typeof workspace.planningYear.canGenerateOfficial === "boolean",
      detail: `${workspace.projects.length} projects, ${workspace.people.length} people, ${workspace.currentRun.tasks.length} tasks, planningRows=${workspace.planningYear.projectBatch.dataRows}, sandbox=${workspace.planningYear.canGenerateSandbox}, official=${workspace.planningYear.canGenerateOfficial}, publishable=${workspace.currentRun.audit.publishable}`
    });

    checks.push({
      name: "api-tag-coverage-summary",
      ok:
        workspace.tagCoverageSummary.projectTagCoverageRate > 0 &&
        workspace.tagCoverageSummary.personRelationshipCoverageRate > 0 &&
        workspace.tagCoverageSummary.relationPairs.some((pair) => pair.type === "group") &&
        workspace.tagCoverageSummary.relationPairs.some((pair) => pair.type === "maintainer" && pair.status === "matched") &&
        workspace.tagCoverageSummary.outputTags.some((tag) => tag.code === "schedule.publish_blocked" && tag.count > 0),
      detail: `projectCoverage=${workspace.tagCoverageSummary.projectTagCoverageRate}%, personRelations=${workspace.tagCoverageSummary.personRelationshipCoverageRate}%, relationPairs=${workspace.tagCoverageSummary.relationPairs.length}`
    });

    const readinessResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/planning-years/2026/readiness`);
    const readiness = (await readinessResponse.json()) as Array<{ key: string; passed: boolean }>;
    checks.push({
      name: "api-readiness",
      ok:
        readinessResponse.status === 200 &&
        readiness.some((gate) => gate.key === "projects") &&
        readiness.some((gate) => gate.key === "people") &&
        readiness.some((gate) => gate.key === "rules") &&
        readiness.some((gate) => gate.key === "rules" && gate.passed === (workspace.currentRun.audit.ruleGap === 0)),
      detail: readiness.map((gate) => `${gate.key}:${gate.passed ? "pass" : "block"}`).join(", ")
    });

    const projectTagsResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/tags?scope=project`);
    const projectTags = (await projectTagsResponse.json()) as Array<{ id: string; code: string; name: string }>;
    const collabATag = projectTags.find((tag) => tag.code === "customer.collab_a");
    assert(collabATag, "customer.collab_a tag missing");
    const editableProjectId = workspace.projects[0]?.id;
    assert(editableProjectId, "editable project missing");
    const editProjectResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/projects/${editableProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: [collabATag.id] })
    });
    const editedProject = (await editProjectResponse.json()) as { customerType: string; tagIds: string[] };
    checks.push({
      name: "api-project-edit-tags",
      ok:
        projectTagsResponse.status === 200 &&
        projectTags.length > 10 &&
        editProjectResponse.status === 200 &&
        editedProject.customerType === "collab_a" &&
        editedProject.tagIds.includes(collabATag.id),
      detail: `${projectTags.length} project tags, ${editableProjectId} customerType=${editedProject.customerType}`
    });

    await fetchWithRetry(`http://127.0.0.1:${apiPort}/planning-years/2026/projects/freeze`, { method: "POST" });

    const personTagsResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/tags?scope=person`);
    const personTags = (await personTagsResponse.json()) as Array<{ id: string; code: string; name: string }>;
    const directTag = personTags.find((tag) => tag.code === "person.specialist.direct_lease");
    assert(directTag, "person.specialist.direct_lease tag missing");
    const peopleWorkspace = await (await fetchWithRetry(`http://127.0.0.1:${apiPort}/workspace`)).json() as { people: Array<{ id: string; name: string }> };
    const targetPersonId = peopleWorkspace.people.find((person) => person.name === "徐珺")?.id ?? peopleWorkspace.people[0]?.id;
    assert(targetPersonId, "editable person missing");
    const editPersonResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/people/${targetPersonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: [directTag.id] })
    });
    const editedPerson = (await editPersonResponse.json()) as { specialTags: string[]; tagIds: string[] };
    const afterPeopleEdit = await (await fetchWithRetry(`http://127.0.0.1:${apiPort}/planning-years/2026/readiness`)).json() as Array<{ key: string; passed: boolean; status: string }>;
    checks.push({
      name: "api-person-edit-tags",
      ok:
        personTagsResponse.status === 200 &&
        editPersonResponse.status === 200 &&
        editedPerson.specialTags.includes("直租专员") &&
        editedPerson.tagIds.includes(directTag.id) &&
        afterPeopleEdit.some((gate) => gate.key === "people" && !gate.passed && gate.status === "needs_attention"),
      detail: `${personTags.length} person tags, ${targetPersonId} specialTags=${editedPerson.specialTags.join("/")}`
    });

    await fetchWithRetry(`http://127.0.0.1:${apiPort}/planning-years/2026/people/versions/confirm`, { method: "POST" });

    const businessRulesResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/rules/business-ordering`);
    const businessRules = (await businessRulesResponse.json()) as Array<{ title: string; items: Array<{ technicalRuleId: string; businessTitle: string; tagRefs: string[] }> }>;
    checks.push({
      name: "api-business-rules",
      ok:
        businessRulesResponse.status === 200 &&
        businessRules.length >= 6 &&
        businessRules.some((group) => group.items.some((item) => item.technicalRuleId === "R10" && item.businessTitle.includes("外部/协同B") && item.tagRefs.length > 0)),
      detail: `${businessRules.length} business-order groups`
    });

    const ruleSystemMapResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/rules/system-map`);
    const ruleSystemMap = (await ruleSystemMapResponse.json()) as {
      steps: Array<{ id: string; currentStateTitle: string; judgmentBasisTitle: string; decisionResultTitle: string }>;
      pendingDecisions: Array<{ technicalRuleId: string; publishImpact: string; affectedProjectCount: number }>;
    };
    checks.push({
      name: "api-rule-system-map",
      ok:
        ruleSystemMapResponse.status === 200 &&
        ruleSystemMap.steps.length === 5 &&
        ruleSystemMap.steps.every((step) => step.currentStateTitle === "当前状况" && step.judgmentBasisTitle === "判断依据" && step.decisionResultTitle === "判断结果") &&
        ruleSystemMap.pendingDecisions.some((decision) => decision.technicalRuleId?.startsWith("P") && decision.publishImpact === "blocks_publish"),
      detail: `${ruleSystemMap.steps.length} flow steps, ${ruleSystemMap.pendingDecisions.length} pending decisions`
    });

    const tagTaxonomyResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/tags/taxonomy`);
    const tagTaxonomy = (await tagTaxonomyResponse.json()) as Array<{ id: string; children: Array<{ title: string; impact: { ruleCount: number; schedulerSteps: string[] } }> }>;
    checks.push({
      name: "api-tag-taxonomy",
      ok:
        tagTaxonomyResponse.status === 200 &&
        tagTaxonomy.some((node) => node.id === "taxonomy-project" && node.children.some((child) => child.title === "客户类型" && child.impact.ruleCount > 0)) &&
        tagTaxonomy.some((node) => node.id === "taxonomy-person" && node.children.some((child) => child.title === "专项能力" && child.impact.schedulerSteps.includes("人员安排"))),
      detail: `${tagTaxonomy.length} taxonomy roots`
    });

    const evidenceResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/rules/evidence-library`);
    const evidence = (await evidenceResponse.json()) as Array<{ sourceParagraph: string; policyCitation: { citationLabel: string } }>;
    checks.push({
      name: "api-policy-citations",
      ok:
        evidenceResponse.status === 200 &&
        evidence.length > 0 &&
        evidence.every((entry) => !entry.sourceParagraph.includes("段落") && entry.policyCitation.citationLabel),
      detail: `${evidence.length} citations, first=${evidence[0]?.policyCitation.citationLabel ?? "missing"}`
    });

    const suggestionResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/rules/suggestions/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "current_run", apply: true })
    });
    const suggestionBatch = (await suggestionResponse.json()) as {
      summary: { generatedDrafts: number; manualSuggestions: number; skipped: number };
      ruleSuggestions: Array<{ technicalRuleId: string; status: string; confidence: number }>;
      manualSuggestions: Array<{ taskId: string; missingItems: string[] }>;
    };
    const afterSuggestionWorkspace = (await (await fetchWithRetry(`http://127.0.0.1:${apiPort}/workspace`)).json()) as typeof workspace;
    const suggestedRules = new Set(suggestionBatch.ruleSuggestions.map((item) => item.technicalRuleId));
    checks.push({
      name: "api-rule-suggestions",
      ok:
        suggestionResponse.status === 201 &&
        suggestionBatch.summary.generatedDrafts >= 1 &&
        suggestedRules.has("P1") &&
        suggestionBatch.ruleSuggestions.every((item) => item.status === "draft_generated" && item.confidence > 0) &&
        suggestionBatch.manualSuggestions.length === afterSuggestionWorkspace.currentRun.audit.pendingManual &&
        afterSuggestionWorkspace.currentRun.audit.pendingManual === workspace.currentRun.audit.pendingManual &&
        afterSuggestionWorkspace.ruleDrafts.some((draft) => draft.technicalRuleId === "P1" && draft.suggestionMeta?.reviewStatus === "needs_review"),
      detail: `drafts=${suggestionBatch.summary.generatedDrafts}, manualSuggestions=${suggestionBatch.summary.manualSuggestions}, skipped=${suggestionBatch.summary.skipped}`
    });

    const draftResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/rules/pending-decisions/pending-P1/draft`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        onsite: { count: 0, period: "year" },
        offsite: { count: 1, period: "year" },
        businessNote: "运行验证：小额外部/协同B客户不安排现场，保留一次非现场。",
        confirmerNote: "runtime verifier"
      })
    });
    const draft = (await draftResponse.json()) as { technicalRuleId: string; status: string; onsite: { count?: number }; offsite: { count?: number } };
    const whatIfResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/rules/pending-decisions/pending-P1/what-if`, { method: "POST" });
    const whatIf = (await whatIfResponse.json()) as { runId: string; before: { ruleGap: number }; after: { ruleGap: number }; delta: { ruleGap: number } };
    const submitResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/rules/pending-decisions/pending-P1/submit`, { method: "POST" });
    const submit = (await submitResponse.json()) as { rulesetVersion: string; publishable: boolean; blockers: string[]; simulation: { after: { ruleGap: number } } };
    checks.push({
      name: "api-rule-maintenance-actions",
      ok:
        draftResponse.status === 200 &&
        [200, 201].includes(whatIfResponse.status) &&
        [200, 201].includes(submitResponse.status) &&
        draft.technicalRuleId === "P1" &&
        whatIf.after.ruleGap < whatIf.before.ruleGap &&
        submit.rulesetVersion.includes("business-v") &&
        submit.simulation.after.ruleGap < whatIf.before.ruleGap,
      detail: `P1 draft ${draft.status}, whatIf=${whatIf.runId}, blockers=${submit.blockers.length}`
    });

    const manualTask = afterSuggestionWorkspace.currentRun.tasks.find((task) => task.status === "manual_needed" || task.status === "unplaceable");
    assert(manualTask, "manual task missing for override verification");
    const overrideDateResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/runs/${afterSuggestionWorkspace.currentRun.id}/tasks/${manualTask.id}/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "scheduledDate", value: "2026-09-07", reason: "发布前人工确认" })
    });
    const dateOverriddenRun = (await overrideDateResponse.json()) as typeof workspace.currentRun;
    const dateOverriddenTask = dateOverriddenRun.tasks.find((task) => task.id === manualTask.id);
    const assigneeId = afterSuggestionWorkspace.people[0] && typeof afterSuggestionWorkspace.people[0] === "object" && "id" in afterSuggestionWorkspace.people[0]
      ? String((afterSuggestionWorkspace.people[0] as { id: string }).id)
      : null;
    assert(assigneeId, "person missing for assignee override verification");
    const overrideAssigneeResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/runs/${afterSuggestionWorkspace.currentRun.id}/tasks/${manualTask.id}/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "assigneeId", value: assigneeId, reason: "发布前人工确认" })
    });
    const assigneeOverriddenRun = (await overrideAssigneeResponse.json()) as typeof workspace.currentRun;
    const assigneeOverriddenTask = assigneeOverriddenRun.tasks.find((task) => task.id === manualTask.id);
    checks.push({
      name: "api-manual-task-override",
      ok:
        overrideDateResponse.status === 201 &&
        overrideAssigneeResponse.status === 201 &&
        dateOverriddenTask?.scheduledDate === "2026-09-07" &&
        dateOverriddenTask.status === "pending" &&
        assigneeOverriddenTask?.assigneeId === assigneeId &&
        assigneeOverriddenRun.audit.manualOverrides >= afterSuggestionWorkspace.currentRun.audit.manualOverrides + 2 &&
        assigneeOverriddenRun.audit.pendingManual < afterSuggestionWorkspace.currentRun.audit.pendingManual,
      detail: `task=${manualTask.id}, pendingManual ${afterSuggestionWorkspace.currentRun.audit.pendingManual}->${assigneeOverriddenRun.audit.pendingManual}, overrides=${assigneeOverriddenRun.audit.manualOverrides}`
    });

    const ruleGapProjectId =
      workspace.currentRun.decisionLogs.find((log) => log.step === "frequency" && log.result === "block" && log.ruleHit === "P1")?.projectId ??
      workspace.currentRun.decisionLogs.find((log) => log.step === "frequency" && log.result === "block" && log.ruleHit?.startsWith("P"))?.projectId;
    assert(ruleGapProjectId, "rule-gap project missing for decision-chain verification");
    const afterRuleSubmitWorkspace = (await (await fetchWithRetry(`http://127.0.0.1:${apiPort}/workspace`)).json()) as typeof workspace & {
      publishCandidateRun?: typeof workspace.currentRun;
    };
    const decisionRun = afterRuleSubmitWorkspace.publishCandidateRun ?? afterRuleSubmitWorkspace.currentRun;
    const decisionChainResponse = await fetchWithRetry(`http://127.0.0.1:${apiPort}/runs/${decisionRun.id}/projects/${ruleGapProjectId}/decision-chain`);
    const decisionChainPayload = await decisionChainResponse.json();
    const decisionChain = (Array.isArray(decisionChainPayload) ? decisionChainPayload : []) as Array<{
      businessStepTitle: string;
      businessQuestion: string;
      businessAnswer: string;
      impact: string;
      trace: { technicalRuleId: string | null; rawLog: { id: string; tagSnapshot?: unknown } };
    }>;
    const frequencyExplanation = decisionChain.find((item) => item.trace.technicalRuleId === "P1" || item.businessStepTitle === "检查频次安排");
    checks.push({
      name: "api-decision-chain",
      ok:
        decisionChainResponse.status === 200 &&
        decisionChain.length >= 5 &&
        decisionChain.some((item) => item.trace.rawLog.tagSnapshot) &&
        decisionChain.every((item) => item.businessQuestion && item.businessAnswer && item.trace.rawLog.id) &&
        Boolean(frequencyExplanation) &&
        !frequencyExplanation!.businessStepTitle.includes("P1") &&
        !frequencyExplanation!.businessAnswer.includes("P1") &&
        decisionChain.some((item) => item.businessStepTitle === "人员安排") &&
        decisionChain.some((item) => item.businessStepTitle === "时间安排"),
      detail: `${ruleGapProjectId}: ${decisionChain.length} business explanations, frequency=${frequencyExplanation?.businessAnswer.slice(0, 24) ?? "missing"}`
    });

    const sampleProjects = importProjectsFromXlsx("1、2026（资产部）授信检查计划（样表）.xlsx", {
      desensitize: true,
      year: 2026
    });
    const sampleRun = generateRun({ year: 2026, scope: "full_year" }, sampleProjects, {
      assigneePoolMode: "sampleMaintainers",
      now: "2026-05-29T08:00:00.000Z"
    });
    checks.push({
      name: "sample-import",
      ok: sampleProjects.length === 304 && sampleRun.audit.hardConflicts === 0 && sampleRun.audit.ruleGap >= 0,
      detail: `${sampleProjects.length} data rows, hardConflicts=${sampleRun.audit.hardConflicts}, ruleGap=${sampleRun.audit.ruleGap}`
    });

    for (const check of checks) {
      assert(check.ok, `${check.name} failed: ${check.detail}`);
    }

    console.log("\nRuntime verification passed:");
    for (const check of checks) {
      console.log(`- ${check.name}: ${check.detail}`);
    }
  } finally {
    await Promise.all(children.map(stopProcess));
  }
};

run().catch((error) => {
  console.error("\nRuntime verification failed:");
  console.error(error);
  process.exitCode = 1;
});
