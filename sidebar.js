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
let tabNotes = {}; // { tabId: noteText }

const STORAGE_KEY = "tabOrganizerGroups";
const NOTES_STORAGE_KEY = "tabOrganizerNotes";   
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

function loadNotes() {
  const stored = localStorage.getItem(NOTES_STORAGE_KEY);
  if (stored) {
    try {
      tabNotes = JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse stored notes:", e);
      tabNotes = {};
    }
  } else {
    tabNotes = {};
  }
}

function saveNotes() {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(tabNotes));
}

function getNoteForTab(tabId) {
  return tabNotes[tabId] || "";
}

function setNoteForTab(tabId, note) {
  if (note && note.trim()) {
    tabNotes[tabId] = note.trim();
  } else {
    delete tabNotes[tabId];
  }
  saveNotes();
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
  const borderColor = currentGroup && currentGroup.color ? currentGroup.color : "#6b7280";
  const borderWidth = tab.active ? "6px" : "4px";
  
  // Set data attribute for CSS fallback
  if (currentGroup && currentGroup.color) {
    li.setAttribute("data-group-color", currentGroup.color);
    li.style.setProperty("--group-color", currentGroup.color);
  }
  
  // Set the full border-left property to override CSS shorthand
  li.style.borderLeft = `${borderWidth} solid ${borderColor}`;
  li.style.borderColor = borderColor;
  
  // Add a subtle background tint based on group color
  if (currentGroup && currentGroup.color) {
    const rgb = hexToRgb(currentGroup.color);
    if (rgb) {
      li.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
    }
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

  // Note icon button
  const noteBtn = document.createElement("button");
  noteBtn.className = "note-btn";
  noteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 3.5C3 2.67157 3.67157 2 4.5 2H9.5L13 5.5V12.5C13 13.3284 12.3284 14 11.5 14H4.5C3.67157 14 3 13.3284 3 12.5V3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.5 7H10.5M5.5 9.5H10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  noteBtn.title = "Add/edit note";
  noteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const noteBox = li.querySelector(".note-box");
    if (noteBox) {
      noteBox.classList.toggle("visible");
      if (noteBox.classList.contains("visible")) {
        const textarea = noteBox.querySelector("textarea");
        textarea.focus();
      }
    }
  });

  // Check if tab has a note and add indicator
  const existingNote = getNoteForTab(tab.id);
  if (existingNote) {
    noteBtn.classList.add("has-note");
  }

  controls.appendChild(noteBtn);

  li.appendChild(favicon);
  li.appendChild(main);
  li.appendChild(controls);

  // Note box (hidden by default)
  const noteBox = document.createElement("div");
  noteBox.className = "note-box";

  const noteTextarea = document.createElement("textarea");
  noteTextarea.className = "note-textarea";
  noteTextarea.placeholder = "Add a note for this tab...";
  noteTextarea.value = existingNote;
  noteTextarea.addEventListener("click", (e) => e.stopPropagation());

  const noteActions = document.createElement("div");
  noteActions.className = "note-actions";

  const saveNoteBtn = document.createElement("button");
  saveNoteBtn.className = "note-save-btn";
  saveNoteBtn.textContent = "Save";
  saveNoteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setNoteForTab(tab.id, noteTextarea.value);
    noteBox.classList.remove("visible");
    // Update the note button indicator
    if (noteTextarea.value.trim()) {
      noteBtn.classList.add("has-note");
    } else {
      noteBtn.classList.remove("has-note");
    }
  });

  const cancelNoteBtn = document.createElement("button");
  cancelNoteBtn.className = "note-cancel-btn";
  cancelNoteBtn.textContent = "Cancel";
  cancelNoteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    noteTextarea.value = getNoteForTab(tab.id);
    noteBox.classList.remove("visible");
  });

  noteActions.appendChild(saveNoteBtn);
  noteActions.appendChild(cancelNoteBtn);

  noteBox.appendChild(noteTextarea);
  noteBox.appendChild(noteActions);

  li.appendChild(noteBox);

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
  
    // Ensure group has a color
    if (!group.color) {
      group.color = getRandomGroupColor();
      saveGroups(); // Save the updated color
    }
  
    const header = document.createElement("button");
    header.className = "accordion-header";

    // Apply unique background color to accordion header
    if (group.color) {
      const rgb = hexToRgb(group.color);
      if (rgb) {
        header.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
      }
      header.style.borderLeftColor = group.color;
    }

    // LEFT: color block (hidden by CSS now)
    const colorBlock = document.createElement("div");
    colorBlock.className = "group-color-block";
  
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
  loadNotes();
  ensureGroupColors();

  // Set dynamic color for ungrouped accordion header
  if (ungroupedHeader) {
    const ungroupedColor = '#94A3B8'; // Slate blue-gray for ungrouped
    const rgb = hexToRgb(ungroupedColor);
    if (rgb) {
      ungroupedHeader.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
    }
    ungroupedHeader.style.borderLeftColor = ungroupedColor;
  }

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