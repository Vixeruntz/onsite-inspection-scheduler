import type { Person, Project, SchedulingRun, TagCoverageIssue, TagCoverageSummary, TagDefinition, TagRelationCoverage } from "@inspection/domain";

const pct = (numerator: number, denominator: number) =>
  denominator ? Math.round((numerator / denominator) * 1000) / 10 : 100;

const tagByCode = (tagLibrary: TagDefinition[]) => new Map(tagLibrary.map((tag) => [tag.code, tag]));

const relationStatus = (projectCount: number, personCount: number): TagRelationCoverage["status"] => {
  if (projectCount > 0 && personCount > 0) return "matched";
  if (projectCount > 0) return "project_only";
  if (personCount > 0) return "person_only";
  return "missing";
};

const maintainerIdFor = (project: Project, people: Person[]) => {
  if (project.onsiteMaintainerId) return project.onsiteMaintainerId;
  if (project.offsiteMaintainerId) return project.offsiteMaintainerId;
  const maintainerName = project.onsiteMaintainerName ?? project.offsiteMaintainerName;
  if (!maintainerName) return null;
  const matches = people.filter((person) => person.name === maintainerName);
  return matches.length === 1 ? matches[0]!.id : null;
};

const stockCountAffectsFrequency = (project: Project) =>
  (project.partyType === "group" || project.partyType === "guarantor") &&
  project.exposureBalance > 0 &&
  !project.isSettledThisYear &&
  !project.isNewWithin1y &&
  !project.isWarning &&
  !project.isNpl &&
  project.customerType !== "internal" &&
  project.customerType !== "collab_a" &&
  project.industry !== "energy" &&
  !project.hospitalType &&
  project.bizType !== "factoring";

const projectIssues = (projects: Project[], people: Person[]) => {
  const issues: TagCoverageIssue[] = [];
  const peopleById = new Set(people.map((person) => person.id));
  for (const project of projects) {
    if (project.partyType === "group" && stockCountAffectsFrequency(project) && (project.memberCount === null || project.memberCount === undefined)) {
      issues.push({
        id: `project-${project.id}-member-count`,
        scope: "project",
        severity: "block",
        title: "集团旗下存量客户数字段缺失",
        message: `${project.id} ${project.name} 需要维护 member_count（旗下我司存量客户数），才能判断 R8/R9 频次。`,
        recordId: project.id,
        field: "memberCount",
        suggestedAction: "在项目维护页补齐集团旗下存量客户数"
      });
    }
    if (project.partyType === "guarantor" && stockCountAffectsFrequency(project) && (project.relatedPartyStockCount === null || project.relatedPartyStockCount === undefined)) {
      issues.push({
        id: `project-${project.id}-related-party-stock`,
        scope: "project",
        severity: "block",
        title: "担保人/母公司旗下存量客户数字段缺失",
        message: `${project.id} ${project.name} 需要维护担保人、实控人或母公司旗下存量客户数，才能判断 R13/R14 频次。`,
        recordId: project.id,
        field: "relatedPartyStockCount",
        suggestedAction: "在项目维护页补齐担保人/母公司旗下存量客户数"
      });
    }
    const maintainerId = maintainerIdFor(project, people);
    if ((project.onsiteMaintainerName || project.offsiteMaintainerName) && !maintainerId) {
      issues.push({
        id: `project-${project.id}-maintainer-id`,
        scope: "project",
        severity: "warn",
        title: "维护人未映射到人员 ID",
        message: `${project.id} ${project.name} 的维护人姓名无法唯一匹配到人员，维护人关系标签无法生成。`,
        recordId: project.id,
        field: "onsiteMaintainerId/offsiteMaintainerId",
        suggestedAction: "在项目维护页选择稳定维护人 ID"
      });
    } else if (maintainerId && !peopleById.has(maintainerId)) {
      issues.push({
        id: `project-${project.id}-maintainer-missing-person`,
        scope: "person",
        severity: "warn",
        title: "维护人 ID 不在人员表",
        message: `${project.id} ${project.name} 的维护人 ID 不存在于当前人员版本。`,
        recordId: maintainerId,
        field: "id",
        suggestedAction: "在人员维护页补齐该人员或重新选择维护人"
      });
    }
  }
  return issues;
};

const personIssues = (projects: Project[], people: Person[]) => {
  const issues: TagCoverageIssue[] = [];
  const directProjects = projects.filter((project) => project.bizType === "direct_lease");
  const nplProjects = projects.filter((project) => project.isNpl);
  if (directProjects.length && !people.some((person) => person.specialTags.includes("直租专员"))) {
    issues.push({
      id: "person-specialist-direct-missing",
      scope: "person",
      severity: "warn",
      title: "直租专员未配置",
      message: `${directProjects.length} 个直租项目需要直租专项能力标签。`,
      recordId: directProjects[0]?.id ?? null,
      field: "specialTags",
      suggestedAction: "在人员维护页给可承接人员添加直租专员标签"
    });
  }
  if (nplProjects.length && !people.some((person) => person.specialTags.includes("问题项目专员"))) {
    issues.push({
      id: "person-specialist-npl-missing",
      scope: "person",
      severity: "warn",
      title: "问题项目专员未配置",
      message: `${nplProjects.length} 个不良类项目需要问题项目专项能力标签。`,
      recordId: nplProjects[0]?.id ?? null,
      field: "specialTags",
      suggestedAction: "在人员维护页给可承接人员添加问题项目专员标签"
    });
  }
  return issues;
};

const relationPairs = (projects: Project[], people: Person[], tagLibrary: TagDefinition[]): TagRelationCoverage[] => {
  const tags = tagByCode(tagLibrary);
  const groupIds = new Map<string, string>();
  for (const project of projects) {
    if (project.groupId) groupIds.set(project.groupId, project.groupName ?? project.groupId);
  }
  for (const person of people) {
    for (const groupId of person.longTermGroupIds) {
      if (!groupIds.has(groupId)) groupIds.set(groupId, groupId);
    }
  }

  const groupPairs: TagRelationCoverage[] = [...groupIds.entries()].map(([groupId, groupName]) => {
    const projectCount = projects.filter((project) => project.groupId === groupId).length;
    const personCount = people.filter((person) => person.longTermGroupIds.includes(groupId)).length;
    const projectTag = [...tags.values()].find((tag) => tag.relationMeta?.objectType === "group" && tag.relationMeta.objectId === groupId && tag.relationMeta.subject === "project");
    const personTag = [...tags.values()].find((tag) => tag.relationMeta?.objectType === "group" && tag.relationMeta.objectId === groupId && tag.relationMeta.subject === "person");
    return {
      type: "group",
      objectId: groupId,
      objectName: groupName,
      projectTagCode: projectTag?.code ?? null,
      personTagCode: personTag?.code ?? null,
      projectCount,
      personCount,
      status: relationStatus(projectCount, personCount)
    };
  });

  const projectIds = new Set([...projects.map((project) => project.id), ...people.flatMap((person) => person.longTermProjectIds)]);
  const projectPairs: TagRelationCoverage[] = [...projectIds].map((projectId) => {
    const project = projects.find((item) => item.id === projectId);
    const personCount = people.filter((person) => person.longTermProjectIds.includes(projectId)).length;
    return {
      type: "project",
      objectId: projectId,
      objectName: project?.name ?? projectId,
      projectTagCode: `project.identity.${projectId.toLowerCase()}`,
      personTagCode: `person.ownership.project.${projectId.toLowerCase()}`,
      projectCount: project ? 1 : 0,
      personCount,
      status: relationStatus(project ? 1 : 0, personCount)
    };
  });

  const maintainerIds = new Set(projects.map((project) => maintainerIdFor(project, people)).filter((id): id is string => Boolean(id)));
  const maintainerPairs: TagRelationCoverage[] = [...maintainerIds].map((personId) => {
    const person = people.find((item) => item.id === personId);
    const projectCount = projects.filter((project) => maintainerIdFor(project, people) === personId).length;
    return {
      type: "maintainer",
      objectId: personId,
      objectName: person?.name ?? personId,
      projectTagCode: `project.maintainer.person.${personId.toLowerCase()}`,
      personTagCode: `person.identity.${personId.toLowerCase()}`,
      projectCount,
      personCount: person ? 1 : 0,
      status: relationStatus(projectCount, person ? 1 : 0)
    };
  });

  return [...groupPairs, ...projectPairs, ...maintainerPairs].sort((a, b) => a.type.localeCompare(b.type) || a.objectName.localeCompare(b.objectName, "zh-CN"));
};

export const createTagCoverageSummary = ({
  projects,
  people,
  run,
  tagLibrary
}: {
  projects: Project[];
  people: Person[];
  run: SchedulingRun;
  tagLibrary: TagDefinition[];
}): TagCoverageSummary => {
  const projectRequired = projects.length * 5;
  const projectCovered = projects.reduce((total, project) => {
    const tags = project.tagIds ?? [];
    return total + Number(tags.some((id) => tagLibrary.find((tag) => tag.id === id && tag.category === "customer_type"))) +
      Number(tags.some((id) => tagLibrary.find((tag) => tag.id === id && tag.category === "risk"))) +
      Number(tags.some((id) => tagLibrary.find((tag) => tag.id === id && tag.category === "business_type"))) +
      Number(tags.some((id) => tagLibrary.find((tag) => tag.id === id && tag.category === "derived"))) +
      Number(tags.some((id) => tagLibrary.find((tag) => tag.id === id && tag.category === "ownership")));
  }, 0);
  const relationProjectCount = projects.filter((project) => project.groupId || project.onsiteMaintainerId || project.offsiteMaintainerId).length;
  const relationPersonCount = people.filter((person) => person.longTermGroupIds.length || person.longTermProjectIds.length || person.tagIds?.some((id) => tagLibrary.find((tag) => tag.id === id)?.code.startsWith("person.identity."))).length;
  const outputTags = ["schedule.exempted", "schedule.manual_needed", "schedule.unplaceable", "schedule.publish_blocked"].map((code) => {
    const tag = tagByCode(tagLibrary).get(code);
    return {
      code,
      name: tag?.name ?? code,
      count: projects.filter((project) => (project.tagIds ?? []).includes(tag?.id ?? "")).length
    };
  });

  return {
    projectTagCoverageRate: pct(projectCovered, projectRequired),
    personRelationshipCoverageRate: pct(relationPersonCount, Math.max(1, relationProjectCount)),
    ruleHitDistribution: run.audit.ruleHitDistribution,
    missingFields: [...projectIssues(projects, people), ...personIssues(projects, people)],
    relationPairs: relationPairs(projects, people, tagLibrary),
    outputTags
  };
};
