var StorageManager = {
  // Check if extension context is valid
  isContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  },

  async getNotebookConfig(notebookId) {
    if (!this.isContextValid()) return { folders: [], unassigned: [] };
    try {
      const key = `notebook_config_${notebookId}`;
      const result = await chrome.storage.local.get(key);
      return result[key] || { folders: [], unassigned: [] };
    } catch (e) {
      return { folders: [], unassigned: [] };
    }
  },

  async saveNotebookConfig(notebookId, config) {
    if (!this.isContextValid()) return;
    try {
      const key = `notebook_config_${notebookId}`;
      await chrome.storage.local.set({ [key]: config });
    } catch (e) {}
  },

  async getLicenseInfo() {
    if (!this.isContextValid()) return { installDate: Date.now(), licenseKey: null, isLicensed: false, trialDays: 7 };
    try {
      const data = await chrome.storage.local.get(['nb_ext_install_date', 'nb_ext_license_key', 'nb_ext_is_licensed']);
      
      if (!data.nb_ext_install_date) {
        const now = Date.now();
        await chrome.storage.local.set({ 'nb_ext_install_date': now });
        return { 
          installDate: now, 
          licenseKey: null, 
          isLicensed: false,
          trialDays: 7
        };
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
      await chrome.storage.local.set({ 
        'nb_ext_license_key': key,
        'nb_ext_is_licensed': isLicensed 
      });
    } catch (e) {}
  },

  extractNotebookId() {
    const match = window.location.href.match(/notebook\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  }
};
