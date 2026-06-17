import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AssigneePoolMode, Person, Project, RuleDecisionDraft, TagDefinition, TagScope, Task } from "@inspection/domain";
import { WorkspaceService } from "./workspace.service.js";

@Controller()
export class RunsController {
  constructor(@Inject(WorkspaceService) private readonly workspace: WorkspaceService) {}

  @Get("workspace")
  workspaceSummary() {
    return this.workspace.summary();
  }

  @Get("tags")
  tags(@Query("scope") scope?: TagScope) {
    return this.workspace.tags(scope);
  }

  @Get("tags/taxonomy")
  tagTaxonomy(@Query("scope") scope?: TagScope) {
    return this.workspace.tagTaxonomy(scope);
  }

  @Post("tags")
  createTag(@Body() body: Partial<TagDefinition>) {
    return this.workspace.createTag(body);
  }

  @Patch("tags/:id")
  updateTag(@Param("id") id: string, @Body() body: Partial<TagDefinition>) {
    return this.workspace.updateTag(id, body);
  }

  @Get("rules/business-ordering")
  businessOrdering() {
    return this.workspace.businessOrdering();
  }

  @Get("rules/system-map")
  ruleSystemMap() {
    return this.workspace.ruleSystemMap();
  }

  @Get("rules/pending-decisions")
  pendingRuleDecisions() {
    return this.workspace.pendingRuleDecisions();
  }

  @Patch("rules/pending-decisions/:id/draft")
  saveRuleDecisionDraft(@Param("id") id: string, @Body() body: Partial<RuleDecisionDraft>) {
    return this.workspace.saveRuleDecisionDraft(id, body);
  }

  @Post("rules/pending-decisions/:id/what-if")
  simulateRuleDecision(@Param("id") id: string) {
    return this.workspace.simulateRuleDecision(id);
  }

  @Post("rules/pending-decisions/:id/submit")
  submitRuleDecision(@Param("id") id: string) {
    return this.workspace.submitRuleDecision(id);
  }

  @Post("rules/suggestions/generate")
  generateRuleSuggestions(@Body() body: { scope: "current_run"; apply: true }) {
    return this.workspace.generateRuleSuggestions(body);
  }

  @Get("rules/evidence-library")
  evidenceLibrary() {
    return this.workspace.evidenceLibrary();
  }

  @Get("rules/:id/impact")
  ruleImpact(@Param("id") id: string) {
    return this.workspace.ruleImpact(id);
  }

  @Get("rules/:id/evidence")
  ruleEvidence(@Param("id") id: string) {
    return this.workspace.ruleEvidence(id);
  }

  @Get("planning-years/:year/readiness")
  readiness(@Param("year") year: string) {
    return this.workspace.readiness(Number(year));
  }

  @Post("planning-years/:year/projects/import")
  @UseInterceptors(FileInterceptor("file"))
  importProjects(@Param("year") year: string, @UploadedFile() file?: { originalname: string; buffer: Buffer; mimetype?: string; size?: number }) {
    return this.workspace.importProjects(Number(year), file);
  }

  @Get("planning-years/:year/projects/diff")
  projectDiff(@Param("year") year: string) {
    return this.workspace.projectDiff(Number(year));
  }

  @Post("planning-years/:year/projects/freeze")
  freezeProjects(@Param("year") year: string) {
    return this.workspace.freezeProjects(Number(year));
  }

  @Post("planning-years/:year/people/versions")
  createRosterVersion(@Param("year") year: string) {
    return this.workspace.createRosterVersion(Number(year));
  }

  @Post("planning-years/:year/people/versions/confirm")
  confirmRosterVersion(@Param("year") year: string) {
    return this.workspace.confirmRosterVersion(Number(year));
  }

  @Post("projects")
  createProject(@Body() body: Partial<Project> & { member_count?: unknown; related_party_stock_count?: unknown }) {
    return this.workspace.createProject(body);
  }

  @Patch("projects/:id")
  updateProject(@Param("id") id: string, @Body() body: Partial<Project> & { member_count?: unknown; related_party_stock_count?: unknown }) {
    return this.workspace.updateProject(id, body);
  }

  @Post("projects/bulk-tags")
  bulkProjectTags(@Body() body: { projectIds: string[]; tagIds: string[]; mode: "add" | "remove" }) {
    return this.workspace.bulkProjectTags(body);
  }

  @Post("projects/bulk-delete")
  bulkDeleteProjects(@Body() body: { projectIds: string[] }) {
    return this.workspace.bulkDeleteProjects(body);
  }

  @Post("people")
  createPerson(@Body() body: Partial<Person>) {
    return this.workspace.createPerson(body);
  }

  @Patch("people/:id")
  updatePerson(@Param("id") id: string, @Body() body: Partial<Person>) {
    return this.workspace.updatePerson(id, body);
  }

  @Post("people/bulk-tags")
  bulkPersonTags(@Body() body: { personIds: string[]; tagIds: string[]; mode: "add" | "remove" }) {
    return this.workspace.bulkPersonTags(body);
  }

  @Post("planning-years/:year/rulesets/copy-from")
  copyRuleset(@Param("year") year: string) {
    return this.workspace.copyRuleset(Number(year));
  }

  @Post("planning-years/:year/rulesets/:rulesetId/publish")
  publishRuleset(@Param("year") year: string, @Param("rulesetId") rulesetId: string) {
    return this.workspace.publishRuleset(Number(year), rulesetId);
  }

  @Post("planning-years/:year/runs/generate")
  generateForPlanningYear(@Param("year") year: string, @Body() body: { assigneePoolMode?: AssigneePoolMode; runType?: "official" | "what_if" }) {
    return this.workspace.generateForPlanningYear(Number(year), body.assigneePoolMode, body.runType);
  }

  @Get("runs")
  listRuns(@Query("runType") runType?: "official" | "manual_recompute" | "what_if") {
    return this.workspace.listRuns(runType);
  }

  @Get("runs/diff")
  diff(@Query("from") from: string, @Query("to") to: string) {
    return this.workspace.diff(from, to);
  }

  @Get("runs/:id")
  getRun(@Param("id") id: string) {
    return this.workspace.getRun(id);
  }

  @Post("runs/generate")
  generate(@Body() body: { assigneePoolMode?: AssigneePoolMode; runType?: "official" | "what_if" }) {
    return this.workspace.generate(body.assigneePoolMode, body.runType);
  }

  @Post("runs/:id/publish")
  publish(@Param("id") id: string) {
    return this.workspace.publishRun(id);
  }

  @Post("runs/:id/archive")
  archive(@Param("id") id: string) {
    return this.workspace.archiveRun(id);
  }

  @Post("runs/:id/tasks/:taskId/override")
  overrideTask(
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() body: { field: "assigneeId" | "scheduledDate" | "manualDisposition"; value: string | null; reason: string }
  ) {
    return this.workspace.overrideTask(id, taskId, body);
  }

  @Patch("runs/:id/tasks/:taskId/status")
  updateTaskStatus(
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() body: { status?: Task["status"]; actualCompletedAt?: string | null; reportRef?: string | null }
  ) {
    return this.workspace.updateTaskStatus(id, taskId, body);
  }

  @Get("runs/:id/projects/:projectId/decision-chain")
  decisionChain(@Param("id") id: string, @Param("projectId") projectId: string) {
    return this.workspace.decisionChain(id, projectId);
  }

}
