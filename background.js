const RULES = {
    x: {
      id: 100,
      rule: {
        id: 100,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: "||x.com^",
          resourceTypes: ["main_frame"]
        }
      }
    },
  
    reddit: {
      id: 101,
      rule: {
        id: 101,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: "||reddit.com^",
          resourceTypes: ["main_frame"]
        }
      }
    },
  
    instagram: {
      id: 102,
      rule: {
        id: 102,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: "||instagram.com^",
          resourceTypes: ["main_frame"]
        }
      }
    },
  
    shorts: {
      id: 103,
      rule: {
        id: 103,
        priority: 1,
        action: { type: "block" },
        condition: {
            urlFilter: "|https://www.youtube.com/shorts",
            "resourceTypes": [
            "main_frame",
            "sub_frame",
            "xmlhttprequest",
            "script"
          ]
        }
      }
    }
  };
  
  
  // Handle popup toggle messages
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type !== "toggle") return;
  
    const { site, enabled } = message;
    const ruleData = RULES[site];
    if (!ruleData) return;
  
    if (enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [ruleData.rule],
        removeRuleIds: []
      });
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [],
        removeRuleIds: [ruleData.id]
      });
    }
  
    await chrome.storage.local.set({ [site]: enabled });
  });