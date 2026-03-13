/**
 * NotebookLM Enhancer - Core Manager
 */
var NotebookManager = {
  notebookId: null,
  sources: [],
  notes: [],
  displayMode: 'single', 
  collapsedFolderIds: [], 
  searchQuery: '',
  isSearchOpen: false,
  isComposing: false,
  isAddingFolder: false,
  editingFolderId: null,
  licenseInfo: null,
  isRendering: false,
  lastContainerFixTime: 0,
  scanTimer: null,
  sidebarObserver: null,

  async init() {
    this.notebookId = StorageManager.extractNotebookId();
    if (!this.notebookId) return;

    // Font set
    if (!document.getElementById('nb-ext-material-icons')) {
      const link = document.createElement('link');
      link.id = 'nb-ext-material-icons';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0';
      document.head.appendChild(link);
    }

    // Safety check to prevent context invalidation leading to undefined chrome.storage.local
    let settings = { nb_ext_tree_enabled: true, nb_ext_display_mode: 'single', nb_ext_collapsed_ids: [] };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      settings = await chrome.storage.local.get(['nb_ext_tree_enabled', 'nb_ext_display_mode', 'nb_ext_collapsed_ids']);
    }

    this.treeViewEnabled = settings.nb_ext_tree_enabled ?? true;
    this.displayMode = settings.nb_ext_display_mode ?? 'single';
    this.collapsedFolderIds = settings.nb_ext_collapsed_ids ?? [];

    document.body.classList.add('nb-ext-deep-mode');

    // Lifecycle monitoring
    this.observer = new MutationObserver(() => {
      if (this.scanTimer) clearTimeout(this.scanTimer);
      this.scanTimer = setTimeout(() => this.scanDom(), 500);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    
    // URL fallback enhancement
    this.refreshData();

    // Minimal timed synchronization (once per second)
    setInterval(() => {
      LayoutEngine.syncContainerSize(this);
    }, 1000);

    // Global click capture - ensures sync whenever the header area is clicked, regardless of DOM changes
    document.addEventListener('click', (e) => {
      const header = e.target.closest('.source-panel-header') || e.target.closest('[role="row"]');
      if (header && (e.target.closest('mat-checkbox') || e.target.closest('input[type="checkbox"]'))) {
        console.log("[NB-Ext] Global Capture: Native Select Area clicked");
        this.scheduleRefresh([100, 300, 1000]);
      }
    }, true);
  },

  async checkLicense() {
    this.licenseInfo = await StorageManager.getLicenseInfo();
    const trialPeriod = this.licenseInfo.trialDays * 86400000;
    this.licenseInfo.isExpired = !this.licenseInfo.isLicensed && (Date.now() - this.licenseInfo.installDate > trialPeriod);
    return this.licenseInfo;
  },

  async refreshData(force = false) {
    try {
      await this.checkLicense();
      const needsRender = this.scanDom(force);
      if (needsRender || force) {
        UIRenderer.renderSidebarUI(this);
      }
    } catch (e) {
      console.error("[NB-Ext] Refresh failure:", e);
    }
  },

  // Multi-stage refresh to ensure native asynchronous operations are eventually captured
  scheduleRefresh(delays = [100, 300, 600]) {
    delays.forEach(ms => {
      setTimeout(() => this.refreshData(true), ms);
    });
  },

  scanDom() {
    const scrollArea = document.querySelector('.scroll-area-desktop') || document.querySelector('.mat-drawer-inner-container');
    const container = document.getElementById('nb-ext-container');

    const forceRender = !container || !document.contains(container) || (container.style.display === 'none' && scrollArea?.offsetWidth >= 150);

    if (!scrollArea) {
      // LayoutEngine.syncContainerSize(this); // Moved to init()
      return;
    }

    // Scraper logic
    const sourceElements = scrollArea.querySelectorAll('.source-stretched-button, button[class*="stretched-button"]');
    
    // Locate native "Select all" button (precision targeting via aria-label)
    let nativeSelectAll = document.querySelector('input[aria-label="Select all sources"]');
    
    // Compatibility fallback
    if (!nativeSelectAll) {
      nativeSelectAll = document.querySelector('.source-panel-header input[type="checkbox"]');
    }

    if (nativeSelectAll && !nativeSelectAll.getAttribute('data-nb-ext-watched')) {
      nativeSelectAll.setAttribute('data-nb-ext-watched', 'true');
      
      const nativeContainer = nativeSelectAll.closest('.mat-mdc-checkbox') || nativeSelectAll.parentElement;
      const headerArea = nativeSelectAll.closest('.source-panel-header') || nativeSelectAll.closest('[role="row"]') || nativeContainer;

      // 1. Area click listener - capture even if Angular intercepts checkbox changes
      if (headerArea) {
        headerArea.addEventListener('click', () => {
          console.log("[NB-Ext] Native Header Area clicked, scheduling multi-stage refresh...");
          this.scheduleRefresh([100, 300, 1000]); 
        }, true);
      }

      // 2. Native change listener
      nativeSelectAll.addEventListener('change', () => {
        console.log("[NB-Ext] Native Select All changed, scheduling refresh...");
        this.scheduleRefresh([100, 500]);
      });

      // 3. Deep monitoring of native status changes
      if (this.nativeObserver) this.nativeObserver.disconnect();
      this.nativeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'aria-checked')) {
            console.log("[NB-Ext] Native Checkbox attributes changed, refreshing...");
            this.refreshData(true);
            break;
          }
        }
      });
      
      this.nativeObserver.observe(nativeSelectAll, { attributes: true });
      if (nativeContainer) this.nativeObserver.observe(nativeContainer, { attributes: true });
    }
    this.nativeSelectAll = nativeSelectAll;

    const newSources = Array.from(sourceElements).map(el => {
      const parent = el.closest('.mat-mdc-list-item') || el.parentElement;
      const moreBtn = parent.querySelector('[id^="source-item-more-button-"]');
      const name = el.getAttribute('aria-label') || el.innerText || "Unknown";
      return { 
        id: moreBtn ? moreBtn.id.replace('source-item-more-button-', '') : `auto-${name.replace(/\s+/g, '')}`,
        name, element: el, checkbox: parent.querySelector('input[type="checkbox"]') 
      };
    });

    const hasChanged = JSON.stringify(newSources.map(s => ({ id: s.id, name: s.name, checked: !!s.checkbox?.checked }))) !== 
                      JSON.stringify(this.sources.map(s => ({ id: s.id, name: s.name, checked: !!s.checkbox?.checked })));

    if (hasChanged || forceRender) {
      if (this.isRendering && !forceRender) return false;
      
      // Rate limit for forceRender to avoid overkill, but don't stall completely
      if (!hasChanged && forceRender && Date.now() - this.lastContainerFixTime < 500) return false;
      
      this.lastContainerFixTime = Date.now();
      this.sources = newSources;
      return true; // Inform caller that redraw is needed
    }
    return false;
  },

  async addFolderWithName(name) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders.push({ id: Date.now().toString(), name, itemIds: [] });
    await StorageManager.saveNotebookConfig(this.notebookId, config);
    this.refreshData(true);
  },

  async renameFolder(folderId, newName) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    const folder = config.folders.find(f => f.id === folderId);
    if (folder && newName) {
      folder.name = newName;
      await StorageManager.saveNotebookConfig(this.notebookId, config);
    }
    this.editingFolderId = null;
    this.refreshData(true);
  },

  async removeFolderOnly(folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders = config.folders.filter(f => f.id !== folderId);
    await StorageManager.saveNotebookConfig(this.notebookId, config);
    this.refreshData(true);
  },

  async removeFolderAndItems(folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders = config.folders.filter(f => f.id !== folderId);
    await StorageManager.saveNotebookConfig(this.notebookId, config);
    alert("Folder config removed. Note: Documents must be deleted manually in NotebookLM.");
    this.refreshData(true);
  },

  async moveItemToFolder(itemId, folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders.forEach(f => f.itemIds = f.itemIds.filter(id => id !== itemId));
    if (folderId) {
      const folder = config.folders.find(f => f.id === folderId);
      if (folder) folder.itemIds.push(itemId);
    }
    await StorageManager.saveNotebookConfig(this.notebookId, config);
    this.refreshData(true);
  },

  async toggleGlobalSelection(isChecked) {
    console.log(`[NB-Ext] toggleGlobalSelection: ${isChecked}`);
    this.sources.forEach(item => {
      if (item.checkbox && item.checkbox.checked !== isChecked) {
        item.checkbox.click();
      }
    });
    this.scheduleRefresh([100, 500]);
  },

  async toggleFolderSelection(folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    const folder = config.folders.find(f => f.id === folderId);
    if (!folder) return;
    
    // If partial state is clicked, behavior is typically "Select All"
    const state = this.getSelectionState(folder.itemIds);
    const targetChecked = state === 'all' ? false : true;

    folder.itemIds.forEach(itemId => {
      const item = this.sources.find(i => i.id === itemId);
      if (item?.checkbox && item.checkbox.checked !== targetChecked) {
        item.checkbox.click();
      }
    });
    this.scheduleRefresh([100, 500]);
  },

  getSelectionState(itemIds) {
    if (!itemIds || itemIds.length === 0) return 'none';
    
    let checkedCount = 0;
    itemIds.forEach(id => {
      const item = this.sources.find(s => s.id === id);
      if (item?.checkbox?.checked) checkedCount++;
    });

    if (checkedCount === 0) return 'none';
    if (checkedCount === itemIds.length) return 'all';
    return 'partial';
  },

  getGlobalSelectionState() {
    return this.getSelectionState(this.sources.map(s => s.id));
  },

  async verifyLicense(key) {
    const params = new URLSearchParams({ product_id: '9KnEA4Z1DE6BlSSJRqONvg==', license_key: key });
    try {
      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const data = await response.json();
      if (data.success && !data.uses_limit_reached) {
        await StorageManager.setLicense(key, true);
        return true;
      }
    } catch {}
    return false;
  }
};

setTimeout(() => NotebookManager.init(), 2000);
