const searchInput = document.getElementById("search-input");
const tabCountEl = document.getElementById("tab-count");
const createGroupBtn = document.getElementById("create-group-btn");
const ungroupedListEl = document.getElementById("ungrouped-tabs");
const ungroupedCountEl = document.getElementById("ungrouped-count");
const groupsRootEl = document.getElementById("groups-root");
const ungroupedSection = document.querySelector('[data-group-id="__ungrouped__"]');
const ungroupedHeader = ungroupedSection?.querySelector(".accordion-header");

if (ungroupedHeader && ungroupedSection) {
  ungroupedHeader.addEventListener("click", () => {
    ungroupedSection.classList.toggle("collapsed");
  });
}

const GROUP_COLORS = [
    "#F97373", // red
    "#FB923C", // orange
    "#FACC15", // yellow
    "#4ADE80", // green
    "#2DD4BF", // teal
    "#38BDF8", // blue
    "#A855F7"  // purple
  ];
  
let allTabs = [];
let groups = []; // [{ id: string, name: string, tabIds: number[] }]

const STORAGE_KEY = "tabOrganizerGroups";   
function getRandomGroupColor() {
    const idx = Math.floor(Math.random() * GROUP_COLORS.length);
    return GROUP_COLORS[idx];
  }

/* ---------- storage ---------- */
function loadGroups() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      groups = JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse stored groups:", e);
      groups = [];
    }
  } else {
    groups = [];
  }
}

function saveGroups() {
   localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

function ensureGroupColors() {
    let changed = false;
    groups.forEach((g) => {
      if (!g.color) {
        g.color = getRandomGroupColor();
        changed = true;
      }
    });
    if (changed) {
      // best-effort, no need to await here
      saveGroups();
    }
  }
/* ---------- tabs ---------- */
async function fetchTabs() {
  allTabs = await chrome.tabs.query({ currentWindow: true });
  tabCountEl.textContent = `Tabs open: ${allTabs.length}`;
}

function getDomain(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/* ---------- group helpers ---------- */
function createGroupObject(name) {
  // simple id generator
  
  return {
    id: `g_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name,
    tabIds: [],
    color: getRandomGroupColor()
  };
}

function removeTabFromAllGroups(tabId) {
  groups.forEach((g) => {
    g.tabIds = g.tabIds.filter((id) => id !== tabId);
  });
}

function getGroupById(id) {
  return groups.find((g) => g.id === id) || null;
}

function getGroupForTab(tabId) {
  return groups.find((g) => g.tabIds.includes(tabId)) || null;
}

/* ---------- rendering ---------- */
function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function buildTabRow(tab, groupOptions) {
  const li = document.createElement("li");
  li.className = "tab-row";
  if (tab.active) li.classList.add("active");

  // Apply group color to tab border
  const currentGroup = getGroupForTab(tab.id);
  if (currentGroup && currentGroup.color) {
    li.style.borderLeftColor = currentGroup.color;
    li.style.borderColor = currentGroup.color;
    // Add a subtle background tint based on group color
    const rgb = hexToRgb(currentGroup.color);
    if (rgb) {
      li.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
    }
  } else {
    // Ungrouped tabs get a neutral gray border
    li.style.borderLeftColor = "#6b7280";
    li.style.borderColor = "#6b7280";
  }

  // favicon – avoid chrome://favicon to fix your error
  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  if (tab.favIconUrl) {
    favicon.src = tab.favIconUrl;
  } else {
    favicon.style.display = "none";
  }

  const main = document.createElement("div");
  main.className = "tab-main";

  const titleEl = document.createElement("span");
  titleEl.className = "tab-title";
  titleEl.textContent = tab.title || "(no title)";

  const domainEl = document.createElement("span");
  domainEl.className = "tab-domain";
  domainEl.textContent = getDomain(tab.url || "");

  main.appendChild(titleEl);
  main.appendChild(domainEl);

  const controls = document.createElement("div");
  controls.className = "tab-controls";

  // group select
  const select = document.createElement("select");
  select.className = "group-select";

  groupOptions.forEach((opt) => {
    const optionEl = document.createElement("option");
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    select.appendChild(optionEl);
  });

  select.value = currentGroup ? currentGroup.id : "__ungrouped__";

  // prevent row click when using dropdown
  select.addEventListener("click", (e) => e.stopPropagation());

  select.addEventListener("change", async (e) => {
    const newGroupId = e.target.value;
    const tabId = tab.id;

    removeTabFromAllGroups(tabId);

    if (newGroupId !== "__ungrouped__") {
      const targetGroup = getGroupById(newGroupId);
      if (targetGroup && !targetGroup.tabIds.includes(tabId)) {
        targetGroup.tabIds.push(tabId);
      }
    }

    saveGroups();
    render();
  });

  controls.appendChild(select);

  li.appendChild(favicon);
  li.appendChild(main);
  li.appendChild(controls);

  // Activate tab on row click
  li.addEventListener("click", async () => {
    await chrome.tabs.update(tab.id, { active: true });
  });

  return li;
}

function buildGroupSection(group, groupTabs, groupOptions) {
    const section = document.createElement("section");
    section.className = "accordion-section";
    section.dataset.groupId = group.id;
  
    const header = document.createElement("button");
    header.className = "accordion-header";
  
    // LEFT: color block (half header width)
    const colorBlock = document.createElement("div");
    colorBlock.className = "group-color-block";
    colorBlock.style.backgroundColor = group.color || getRandomGroupColor();
  
    // RIGHT: header content
    const headerMain = document.createElement("div");
    headerMain.className = "group-header-main";
  
    const headerRow = document.createElement("div");
    headerRow.className = "group-header-row";
  
    const nameEl = document.createElement("span");
    nameEl.className = "group-name";
    nameEl.textContent = group.name;
  
    headerRow.appendChild(nameEl);
  
    const countEl = document.createElement("span");
    countEl.className = "accordion-count";
    countEl.textContent = groupTabs.length;
  
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-group-btn";
    deleteBtn.textContent = "×";
    deleteBtn.title = "Delete group";
  
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete group "${group.name}"? Tabs will stay open and move to Ungrouped.`)) {
        return;
      }
      groups = groups.filter((g) => g.id !== group.id);
      await saveGroups();
      render();
    });
  
    const chevron = document.createElement("span");
    chevron.className = "accordion-chevron";
    chevron.textContent = "▾";
  
    // Put name + count on the left of headerMain, controls on right
    const headerLeft = document.createElement("div");
    headerLeft.className = "group-header-left";
    headerLeft.appendChild(headerRow);
  
    const headerRight = document.createElement("div");
    headerRight.className = "group-header-right";
    headerRight.appendChild(countEl);
    headerRight.appendChild(deleteBtn);
    headerRight.appendChild(chevron);
  
    headerMain.appendChild(headerLeft);
    headerMain.appendChild(headerRight);
  
    header.appendChild(colorBlock);
    header.appendChild(headerMain);
  
    const body = document.createElement("div");
    body.className = "accordion-body";
  
    const list = document.createElement("ul");
    list.className = "tab-list";
  
    groupTabs.forEach((tab) => {
      const row = buildTabRow(tab, groupOptions);
      list.appendChild(row);
    });
  
    body.appendChild(list);
  
    // Toggle accordion
    header.addEventListener("click", () => {
      section.classList.toggle("collapsed");
    });
  


    section.appendChild(header);
    section.appendChild(body);
  
    return section;
  }
  

function render() {
  const filter = searchInput.value.toLowerCase().trim();

  // dropdown options for all rows
  const groupOptions = [
    { value: "__ungrouped__", label: "Ungrouped" },
    ...groups.map((g) => ({ value: g.id, label: g.name }))
  ];

  // filter tabs
  const visibleTabs = allTabs.filter((tab) => {
    if (!filter) return true;
    const title = (tab.title || "").toLowerCase();
    const url = (tab.url || "").toLowerCase();
    return title.includes(filter) || url.includes(filter);
  });

  // split into grouped / ungrouped
  const groupTabMap = new Map();
  groups.forEach((g) => groupTabMap.set(g.id, []));

  const ungroupedTabs = [];

  visibleTabs.forEach((tab) => {
    const groupForTab = getGroupForTab(tab.id);
    if (groupForTab) {
      const arr = groupTabMap.get(groupForTab.id);
      if (arr) arr.push(tab);
    } else {
      ungroupedTabs.push(tab);
    }
  });

  // render ungrouped
  clearElement(ungroupedListEl);
  ungroupedTabs.forEach((tab) => {
    const row = buildTabRow(tab, groupOptions);
    ungroupedListEl.appendChild(row);
  });
  ungroupedCountEl.textContent = ungroupedTabs.length;

  // render groups
  clearElement(groupsRootEl);
  groups.forEach((group) => {
    const tabsForGroup = groupTabMap.get(group.id) || [];
    const section = buildGroupSection(group, tabsForGroup, groupOptions);
    groupsRootEl.appendChild(section);
  });
}

/* ---------- events ---------- */
searchInput.addEventListener("input", () => {
  render();
});

createGroupBtn.addEventListener("click", async () => {
  const name = prompt("New group name:");
  if (!name) return;

  const trimmed = name.trim();
  if (!trimmed) return;

  if (groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) {
    alert("A group with this name already exists.");
    return;
  }

  groups.push(createGroupObject(trimmed));
  await saveGroups();
  render();
});


/* ---------- init + polling ---------- */
async function init() {
  loadGroups();
  ensureGroupColors();
  await fetchTabs();
  render();



  // keep in sync periodically
  setInterval(async () => {
    await fetchTabs();
    render();
  }, 5000);
}

init().catch((e) => {
  console.error("Failed to initialize tab organizer:", e);
});