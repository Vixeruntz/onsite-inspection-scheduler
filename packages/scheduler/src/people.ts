import type { AssigneePoolMode, AssignmentPriorityKey, Person, Project } from "@inspection/domain";

const person = (
  id: string,
  name: string,
  pool: AssigneePoolMode[],
  specialTags: string[] = [],
  activeFrom: string | null = null,
  responsibilityRoles: string[] = ["asset_management_owner", "report_owner", "rectification_owner"]
): Person => ({
  id,
  name,
  baseCity: "深圳",
  dept: "资产管理部",
  specialTags,
  longTermGroupIds: [],
  longTermProjectIds: [],
  isActive: activeFrom ? activeFrom <= "2026-12-31" : true,
  activeFrom,
  activeTo: null,
  pool,
  responsibilityRoles,
  annualOnsiteWeekCapacity: 44,
  monthlyOnsiteLimit: 4,
  offsiteTaskCapacity: 36,
  unavailableMonths: []
});

export const assetPeople: Person[] = [
  person("asset-001", "徐珺", ["asset5", "asset7", "all26"]),
  person("asset-002", "姚浩", ["asset5", "asset7", "all26"]),
  person("asset-003", "杨天荣", ["asset5", "asset7", "all26"]),
  person("asset-004", "林凡", ["asset5", "asset7", "all26"], ["问题项目专员"]),
  person("asset-005", "巫俊乐", ["asset5", "asset7", "all26"], ["直租专员"]),
  person("asset-006", "新增经理A", ["asset7", "all26"], [], "2026-07-01"),
  person("asset-007", "新增经理B", ["asset7", "all26"], [], "2026-07-01")
];

export const buildPeopleFromProjects = (projects: Project[]) => {
  const names = new Set<string>();
  for (const project of projects) {
    if (project.onsiteMaintainerName) names.add(project.onsiteMaintainerName);
    if (project.offsiteMaintainerName) names.add(project.offsiteMaintainerName);
  }
  const samplePeople = [...names].sort((a, b) => a.localeCompare(b, "zh-CN")).map<Person>((name, index) => ({
    id: `sample-${String(index + 1).padStart(3, "0")}`,
    name,
    baseCity: "深圳",
    dept: "样表维护人",
    specialTags: [],
    longTermGroupIds: [],
    longTermProjectIds: [],
    isActive: true,
    activeFrom: null,
    activeTo: null,
    pool: ["sampleMaintainers", "businessSupport", "all26"],
    responsibilityRoles: ["business_owner", "business_support", "report_owner"],
    annualOnsiteWeekCapacity: 24,
    monthlyOnsiteLimit: 2,
    offsiteTaskCapacity: 24,
    unavailableMonths: []
  }));

  const byName = new Map<string, Person>();
  for (const p of [...assetPeople, ...samplePeople]) {
    byName.set(p.name, {
      ...p,
      pool: [...new Set([...(byName.get(p.name)?.pool ?? []), ...p.pool])]
    });
  }
  return [...byName.values()];
};

export const peopleForMode = (people: Person[], mode: AssigneePoolMode) =>
  people.filter((person) => person.pool.includes(mode));

export type PickAssigneeResult = {
  person: Person | null;
  basis: string;
  alternatives: Person[];
  requiresManual?: boolean;
};

const defaultAssignmentPriority: AssignmentPriorityKey[] = [
  "ownership_project",
  "ownership_group",
  "capability",
  "maintainer",
  "load_balance"
];

export const pickAssignee = (
  project: Project,
  people: Person[],
  mode: AssigneePoolMode,
  onsiteLoad: Map<string, number>,
  priority: AssignmentPriorityKey[] = defaultAssignmentPriority,
  forceOwnershipMatch = false
): PickAssigneeResult => {
  if (project.dept.includes("上海")) {
    return {
      person: null,
      basis: "上海分公司自检",
      alternatives: []
    };
  }

  const pool = peopleForMode(people, mode);
  const byName = new Map(pool.map((person) => [person.name, person]));

  const findByMaintainerId = () => {
    const ids = [project.onsiteMaintainerId, project.offsiteMaintainerId].filter((id): id is string => Boolean(id));
    return ids.map((id) => pool.find((person) => person.id === id)).find((person): person is Person => Boolean(person));
  };

  const sortedByLoad = () => [...pool].sort((a, b) => {
    const loadDiff = (onsiteLoad.get(a.id) ?? 0) - (onsiteLoad.get(b.id) ?? 0);
    return loadDiff || a.name.localeCompare(b.name, "zh-CN");
  });

  const forceOwnership = forceOwnershipMatch && priority.some((item) => item === "ownership_group");

  for (const item of priority.length ? priority : defaultAssignmentPriority) {
    if (item === "ownership_project") {
      const owner = pool.find((person) => person.longTermProjectIds.includes(project.id));
      if (owner) return { person: owner, basis: "A-1 长期负责项目", alternatives: pool.slice(0, 3) };
    }
    if (item === "ownership_group") {
      const owner = project.groupId ? pool.find((person) => person.longTermGroupIds.includes(project.groupId!)) : null;
      if (owner) return { person: owner, basis: "A-1 长期负责集团", alternatives: pool.slice(0, 3) };
      if (forceOwnership && project.groupId) {
        return {
          person: null,
          basis: "A-1 长期负责集团缺失，需人工确认",
          alternatives: pool.slice(0, 3),
          requiresManual: true
        };
      }
    }
    if (item === "capability") {
      if (project.bizType === "direct_lease") {
        const specialist = pool.find((person) => person.specialTags.includes("直租专员"));
        if (specialist) return { person: specialist, basis: "A-2 直租专员", alternatives: pool.slice(0, 3) };
      }
      if (project.isNpl) {
        const specialist = pool.find((person) => person.specialTags.includes("问题项目专员"));
        if (specialist) return { person: specialist, basis: "A-2 问题项目专员", alternatives: pool.slice(0, 3) };
      }
    }
    if (item === "maintainer") {
      const maintainerById = findByMaintainerId();
      if (maintainerById) return { person: maintainerById, basis: "A-3 历史维护人", alternatives: pool.slice(0, 3) };
      const maintainerName = project.onsiteMaintainerName ?? project.offsiteMaintainerName;
      if (mode === "sampleMaintainers" && maintainerName && byName.has(maintainerName)) {
        return { person: byName.get(maintainerName)!, basis: "A-3 沿用样表维护人", alternatives: pool.slice(0, 3) };
      }
    }
    if (item === "load_balance") {
      const loadSorted = sortedByLoad();
      return {
        person: loadSorted[0] ?? null,
        basis: loadSorted[0] ? "A-4 负荷参考" : "未找到可用资产经理",
        alternatives: loadSorted.slice(1, 4),
        requiresManual: !loadSorted[0]
      };
    }
  }

  const loadSorted = sortedByLoad();
  return {
    person: loadSorted[0] ?? null,
    basis: loadSorted[0] ? "A-4 负荷参考" : "未找到可用资产经理",
    alternatives: loadSorted.slice(1, 4),
    requiresManual: !loadSorted[0]
  };
};
