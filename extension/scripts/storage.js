var StorageManager = {
  // Check if extension context is valid
  isContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  },

  // Environment check: Is this running in a popup or a content script?
  isPopup() {
    try {
      if (!this.isContextValid()) return false;
      // In MV3, we check if we're in the extension's own origin but not in a content script context
      // chrome.extension.getBackgroundPage is often unavailable in MV3
      return typeof window !== 'undefined' && 
             window.location.protocol === 'chrome-extension:' && 
             !window.location.href.includes('background');
    } catch (e) {
      return false;
    }
  },

  async getNotebookConfig(notebookId) {
    if (!this.isContextValid()) return { folders: [], unassigned: [] };

    // If in Popup, request data from Content Script (LocalStorage is on the page)
    if (this.isPopup()) {
      return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs[0]) return resolve({ folders: [], unassigned: [] });
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getNotebookConfig', notebookId }, (response) => {
            resolve(response || { folders: [], unassigned: [] });
          });
        });
      });
    }

    // If in Content Script, use LocalStorage directly
    try {
      const key = `notebook_config_${notebookId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : { folders: [], unassigned: [] };
    } catch (e) {
      return { folders: [], unassigned: [] };
    }
  },

  async saveNotebookConfig(notebookId, config) {
    if (!this.isContextValid()) return;

    if (this.isPopup()) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'saveNotebookConfig', notebookId, config });
      });
      return;
    }

    try {
      const key = `notebook_config_${notebookId}`;
      localStorage.setItem(key, JSON.stringify(config));
    } catch (e) {}
  },

  async getLicenseInfo() {
    if (!this.isContextValid()) return { installDate: Date.now(), licenseKey: null, isLicensed: false, trialDays: 7 };
    try {
      // Use chrome.storage.sync for settings
      const data = await chrome.storage.sync.get(['nb_ext_install_date', 'nb_ext_license_key', 'nb_ext_is_licensed']);
      
      if (!data.nb_ext_install_date) {
        const now = Date.now();
        await chrome.storage.sync.set({ 'nb_ext_install_date': now });
        return { installDate: now, licenseKey: null, isLicensed: false, trialDays: 7 };
      }
      
      return {
        installDate: data.nb_ext_install_date,
        licenseKey: data.nb_ext_license_key || null,
        isLicensed: !!data.nb_ext_is_licensed,
        trialDays: 7
      };
    } catch (e) {
      return { installDate: Date.now(), licenseKey: null, isLicensed: false, trialDays: 7 };
    }
  },

  async setLicense(key, isLicensed) {
    if (!this.isContextValid()) return;
    try {
      await chrome.storage.sync.set({ 
        'nb_ext_license_key': key,
        'nb_ext_is_licensed': isLicensed 
      });
    } catch (e) {}
  },

  async getEnabledState() {
    if (!this.isContextValid()) return true;
    try {
      const result = await chrome.storage.sync.get('nb_ext_enabled');
      return result.nb_ext_enabled !== false; 
    } catch (e) {
      return true;
    }
  },

  async setEnabledState(isEnabled) {
    if (!this.isContextValid()) return;
    try {
      await chrome.storage.sync.set({ 'nb_ext_enabled': isEnabled });
    } catch (e) {}
  },

  async getToolbarEnabled() {
    if (!this.isContextValid()) return true;
    try {
      const result = await chrome.storage.local.get('nb_ext_toolbar_enabled');
      return result.nb_ext_toolbar_enabled !== false;
    } catch (e) {
      return true;
    }
  },

  async setToolbarEnabled(isEnabled) {
    if (!this.isContextValid()) return;
    try {
      await chrome.storage.local.set({ 'nb_ext_toolbar_enabled': isEnabled });
    } catch (e) {}
  },

  async getToolbarExpanded() {
    if (!this.isContextValid()) return true;
    try {
      const result = await chrome.storage.local.get('nb_ext_toolbar_expanded');
      return result.nb_ext_toolbar_expanded !== false;
    } catch (e) {
      return true;
    }
  },

  async setToolbarExpanded(isExpanded) {
    if (!this.isContextValid()) return;
    try {
      await chrome.storage.local.set({ 'nb_ext_toolbar_expanded': isExpanded });
    } catch (e) {}
  },

  extractNotebookId() {
    const match = window.location.href.match(/notebook\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  }
};
