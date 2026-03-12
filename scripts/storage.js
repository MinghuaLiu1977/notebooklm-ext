const StorageManager = {
  async getNotebookConfig(notebookId) {
    const key = `notebook_config_${notebookId}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || { folders: [], unassigned: [] };
  },

  async saveNotebookConfig(notebookId, config) {
    const key = `notebook_config_${notebookId}`;
    await chrome.storage.local.set({ [key]: config });
  },

  extractNotebookId() {
    const match = window.location.href.match(/notebook\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  }
};
