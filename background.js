chrome.runtime.onInstalled.addListener(() => {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  });
  
  // Fallback for older Chrome versions
  chrome.action.onClicked.addListener(async (tab) => {
    if (!chrome.sidePanel || !chrome.sidePanel.open) return;
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (e) {
      console.warn("Failed to open side panel:", e);
    }
  });
  
  
