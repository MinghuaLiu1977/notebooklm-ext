var UIRenderer = {
  async renderSidebarUI(manager, config) {
    if (manager.isRendering) return;
    manager.isRendering = true;
    console.log("[NB-Ext] renderSidebarUI: Rendering started");

    try {
      if (!config) config = await StorageManager.getNotebookConfig(manager.notebookId);

      const sourcePanel = document.querySelector('[class*="source-panel"]');
      const scrollAreaOuter = document.querySelector('.scroll-area-desktop') || document.querySelector('.mat-drawer-inner-container');
      let sidebarContent = scrollAreaOuter ? scrollAreaOuter.parentElement : (sourcePanel || document.querySelector('.source-panel-content'));

      if (!sidebarContent) {
        console.warn("[NB-Ext] renderSidebarUI: Sidebar content not found, retrying...");
        manager.isRendering = false;
        setTimeout(() => manager.renderSidebarUI(config), 1000);
        return;
      }

      let container = document.getElementById('nb-ext-container');
      if (manager.licenseInfo?.isExpired) {
        console.log("[NB-Ext] renderSidebarUI: License expired, showing paywall");
        if (!container) {
          container = document.createElement('div');
          container.id = 'nb-ext-container';
          container.className = 'nb-ext-sidebar nb-ext-full-width';
          sidebarContent.appendChild(container);
        }
        this.renderPaywall(manager, false, true);
        return;
      }

      if (!container) {
        console.log("[NB-Ext] renderSidebarUI: Creating container");
        container = document.createElement('div');
        container.id = 'nb-ext-container';
        container.className = 'nb-ext-sidebar nb-ext-full-width';
      }

      if (!sidebarContent.contains(container)) {
        sidebarContent.appendChild(container);
      }

      container.textContent = '';

      ToolbarManager.initToolbar(manager, container);

      if (manager.treeViewEnabled) {
        this.renderTreeView(manager, container, config);
      } else {
        this.renderFlatView(manager, container);
      }

      LayoutEngine.syncContainerSize(manager);
      this.applyFilter(manager);
      console.log("[NB-Ext] renderSidebarUI: Rendering finished");

    } catch (err) {
      console.error("[NB-Ext] Render Error:", err);
    } finally {
      manager.isRendering = false;
    }
  },

  renderFolderCreator(manager) {
    const overlay = document.createElement('div');
    overlay.className = 'nb-ext-modal-overlay';

    const content = document.createElement('div');
    content.className = 'nb-ext-modal-content';

    const title = document.createElement('div');
    title.className = 'nb-ext-modal-title';
    title.textContent = 'New Folder';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'nb-ext-modal-input';
    input.placeholder = 'Enter folder name...';

    const actions = document.createElement('div');
    actions.className = 'nb-ext-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'nb-ext-btn nb-ext-btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const okBtn = document.createElement('button');
    okBtn.className = 'nb-ext-btn nb-ext-btn-primary';
    okBtn.textContent = 'Create';

    const doCreate = () => {
      const name = input.value.trim();
      if (name) {
        manager.addFolderWithName(name);
        overlay.remove();
      }
    };

    okBtn.addEventListener('click', doCreate);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCreate();
      if (e.key === 'Escape') overlay.remove();
    });

    actions.append(cancelBtn, okBtn);
    content.append(title, input, actions);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    setTimeout(() => input.focus(), 50);
  },

  renderTreeView(manager, container, config) {
    const folderList = document.createElement('div');
    folderList.id = 'nb-ext-folder-list';

    config.folders.forEach(f => {
      folderList.appendChild(this.createFolderDiv(manager, f));
    });
    container.appendChild(folderList);

    const unassignedItems = manager.sources.filter(s => !config.folders.some(f => f.itemIds.includes(s.id)));
    const unassignedDiv = document.createElement('div');
    unassignedDiv.className = 'nb-ext-unassigned';
    const unassignedTitle = document.createElement('div');
    unassignedTitle.className = 'nb-ext-unassigned-title';
    unassignedTitle.textContent = `Unassigned (${unassignedItems.length})`;
    unassignedDiv.appendChild(unassignedTitle);
    unassignedItems.forEach(item => unassignedDiv.appendChild(this.createItemRow(manager, item)));
    container.appendChild(unassignedDiv);
  },

  renderFlatView(manager, container) {
    const flatList = document.createElement('div');
    flatList.className = 'nb-ext-flat-list';
    manager.sources.forEach(item => flatList.appendChild(this.createItemRow(manager, item)));
    container.appendChild(flatList);
  },

  createFolderDiv(manager, folder) {
    const folderDiv = document.createElement('div');
    const isCollapsed = manager.collapsedFolderIds.includes(folder.id);
    folderDiv.className = `nb-ext-folder ${isCollapsed ? 'collapsed' : ''}`;

    const folderTitle = document.createElement('div');
    folderTitle.className = 'nb-ext-folder-title';

    const folderState = manager.getSelectionState(folder.itemIds);
    const fbBox = document.createElement('span');
    fbBox.className = 'nb-ext-checkbox-native material-symbols-outlined';
    NotebookUtils.setCheckboxState(fbBox, folderState);
    fbBox.addEventListener('click', (e) => {
      e.stopPropagation();
      manager.toggleFolderSelection(folder.id);
    });
    folderTitle.appendChild(fbBox);

    const arrow = document.createElement('span');
    arrow.className = `nb-ext-folder-arrow material-symbols-outlined ${isCollapsed ? '' : 'expanded'}`;
    arrow.textContent = 'chevron_right';
    folderTitle.appendChild(arrow);

    const icon = document.createElement('span');
    icon.className = 'nb-ext-folder-icon material-symbols-outlined';
    icon.textContent = isCollapsed ? 'folder' : 'folder_open';
    folderTitle.appendChild(icon);

    if (manager.editingFolderId === folder.id) {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = folder.name;
      nameInput.className = 'nb-ext-inline-edit-input';
      nameInput.addEventListener('click', e => e.stopPropagation());
      nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') manager.renameFolder(folder.id, nameInput.value);
        if (e.key === 'Escape') { manager.editingFolderId = null; manager.refreshData(); }
      });
      nameInput.addEventListener('blur', () => manager.renameFolder(folder.id, nameInput.value));
      folderTitle.appendChild(nameInput);
      setTimeout(() => nameInput.focus(), 50);
    } else {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'nb-ext-text-truncate nb-ext-folder-name';
      nameSpan.textContent = `${folder.name} (${folder.itemIds.length})`;
      folderTitle.addEventListener('click', () => {
        if (isCollapsed) manager.collapsedFolderIds = manager.collapsedFolderIds.filter(id => id !== folder.id);
        else manager.collapsedFolderIds.push(folder.id);
        chrome.storage.local.set({ 'nb_ext_collapsed_ids': manager.collapsedFolderIds });
        manager.refreshData(true); // Ensure forced redraw
      });
      folderTitle.appendChild(nameSpan);

      const editBtn = this.createActionIcon('edit', 'Rename', (e) => {
        e.stopPropagation();
        manager.editingFolderId = folder.id;
        manager.refreshData(true);
      });
      const delBtn = this.createActionIcon('delete', 'Delete', (e) => {
        e.stopPropagation();
        const choice = confirm(`[OK]: Delete folder only\n[Cancel]: Delete folder AND documents`);
        if (choice) manager.removeFolderOnly(folder.id);
        else manager.removeFolderAndItems(folder.id);
      });
      folderTitle.append(editBtn, delBtn);
      folderDiv.appendChild(folderTitle);

      if (!isCollapsed) {
        const folderContent = document.createElement('div');
        folderContent.className = 'nb-ext-folder-content';
        folder.itemIds.forEach(itemId => {
          const item = [...manager.sources, ...manager.notes].find(i => i.id === itemId);
          if (item) folderContent.appendChild(this.createItemRow(manager, item, true));
        });
        folderDiv.appendChild(folderContent);
      }
    }
    return folderDiv;
  },

  createItemRow(manager, item, isNested = false) {
    const row = document.createElement('div');
    row.className = `${isNested ? 'nb-ext-item' : 'nb-ext-item-row'} nb-ext-display-${manager.displayMode}`;

    const mainContent = document.createElement('div');
    mainContent.className = 'nb-ext-item-main';
    mainContent.style.display = 'flex';
    mainContent.style.alignItems = 'center';
    mainContent.style.width = '100%';

    const itemBox = document.createElement('span');
    itemBox.className = 'nb-ext-checkbox-native material-symbols-outlined';
    NotebookUtils.setCheckboxState(itemBox, item.checkbox?.checked ? 'all' : 'none');

    itemBox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.checkbox) {
        item.checkbox.click();
        // Explicit multi-stage refresh to ensure state is updated instantly
        manager.scheduleRefresh([100, 400]);
      }
    });
    mainContent.appendChild(itemBox);

    const icon = document.createElement('span');
    icon.className = 'nb-ext-item-icon material-symbols-outlined';
    icon.textContent = NotebookUtils.getFileIcon(item.name);
    mainContent.appendChild(icon);

    const label = document.createElement('div');
    label.className = 'nb-ext-source-label';
    label.textContent = item.name;
    label.addEventListener('click', () => item.element.click());
    mainContent.appendChild(label);

    // Place the Actions trigger immediately after the filename (within mainContent)
    mainContent.appendChild(this.createItemActionsTrigger(manager, item));

    row.appendChild(mainContent);
    return row;
  },

  createItemActionsTrigger(manager, item) {
    const trigger = document.createElement('div');
    trigger.className = 'nb-ext-move-trigger'; // Reusing CSS class for unified styling
    trigger.title = 'More actions';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'more_vert';
    trigger.appendChild(icon);

    trigger.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.showItemMenu(manager, item, trigger);
    });

    return trigger;
  },

  async showItemMenu(manager, item, trigger) {
    document.querySelectorAll('.nb-ext-move-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'nb-ext-move-menu';

    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;


    // File Actions
    menu.appendChild(this.createMenuItem('Rename', 'edit', () => {
      menu.remove();
      this.handleFileAction(manager, item, 'Rename');
    }));

    menu.appendChild(this.createMenuItem('Delete', 'delete', () => {
      menu.remove();
      this.handleFileAction(manager, item, 'Delete');
    }));

    // Divider
    const hr = document.createElement('div');
    hr.style.height = '1px';
    hr.style.background = 'var(--nb-ext-border)';
    hr.style.margin = '4px 0';
    menu.appendChild(hr);


    // Folder section
    const folderHeader = document.createElement('div');
    folderHeader.className = 'nb-ext-move-menu-header';
    folderHeader.textContent = 'Move to';
    menu.appendChild(folderHeader);

    const config = await StorageManager.getNotebookConfig(manager.notebookId);

    // Unassigned Option
    const isUnassigned = !config.folders.some(f => f.itemIds.includes(item.id));
    menu.appendChild(this.createMenuItem('Unassigned', isUnassigned ? 'check' : '', () => {
      manager.moveItemToFolder(item.id, '');
      menu.remove();
    }));

    // Folders
    config.folders.forEach(f => {
      const isCurrent = f.itemIds.includes(item.id);
      menu.appendChild(this.createMenuItem(f.name, isCurrent ? 'check' : '', () => {
        manager.moveItemToFolder(item.id, f.id);
        menu.remove();
      }));
    });


    document.body.appendChild(menu);

    const closeHandler = (e) => {
      if (!menu.contains(e.target) && !trigger.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 50);
  },

  handleFileAction(manager, item, action) {
    const nativeMoreBtn = document.getElementById(`source-item-more-button-${item.id}`);
    if (!nativeMoreBtn) {
      const buttons = document.querySelectorAll('[id^="source-item-more-button-"]');
      const fallbackBtn = Array.from(buttons).find(b => b.id.includes(item.id));
      if (!fallbackBtn) {
        alert(`Native "${action}" button not found for this item. Please use the native NotebookLM interface.`);
        return;
      }
      fallbackBtn.click();
    } else {
      nativeMoreBtn.click();
    }

    const patterns = {
      'Rename': /Rename/i,
      'Delete': /Remove|Delete/i
    };

    let attempts = 0;
    const findAndClick = () => {
      const menuItems = document.querySelectorAll('.mat-mdc-menu-content button, .mat-menu-content button');
      const target = Array.from(menuItems).find(btn => patterns[action].test(btn.innerText));

      if (target) {
        target.click();
        console.log(`[NB-Ext] Successfully proxy-clicked native ${action}`);

        // Schedule multiple refreshes to catch the state change after dialog/async update
        manager.scheduleRefresh([500, 1000, 3000, 5000, 10000]);
      } else if (attempts < 8) {
        attempts++;
        setTimeout(findAndClick, 150);
      }
    };

    setTimeout(findAndClick, 150);
  },

  createMenuItem(name, iconName, onClick) {
    const div = document.createElement('div');
    div.className = 'nb-ext-move-menu-item';

    const icon = document.createElement('span');
    const isCheck = iconName === 'check';
    icon.className = 'material-symbols-outlined ' + (isCheck ? 'check-icon' : iconName ? '' : 'empty-icon');
    icon.textContent = iconName || '';
    div.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = name;
    div.appendChild(text);

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return div;
  },

  createActionIcon(iconName, title, onClick) {
    const span = document.createElement('span');
    span.className = 'nb-ext-action-icon material-symbols-outlined';
    span.textContent = iconName;
    span.title = title;
    span.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    return span;
  },

  applyFilter(manager) {
    const query = manager.searchQuery.trim().toLowerCase();
    const items = document.querySelectorAll('.nb-ext-item, .nb-ext-item-row');
    const folders = document.querySelectorAll('.nb-ext-folder');
    const unassignedArea = document.querySelector('.nb-ext-unassigned');

    const andGroups = query.split('+').map(g => g.trim()).filter(g => g);
    const matches = (text) => {
      if (!query) return true;
      text = text.toLowerCase();
      return andGroups.every(group => group.split(/\s+/).filter(t => t).some(term => text.includes(term)));
    };

    items.forEach(el => {
      const text = el.querySelector('.nb-ext-source-label')?.textContent || el.textContent;
      if (matches(text)) el.classList.remove('nb-ext-hidden');
      else el.classList.add('nb-ext-hidden');
    });

    folders.forEach(el => {
      if (!query) { el.classList.remove('nb-ext-hidden'); return; }
      const hasVisibleChild = !!el.querySelector('.nb-ext-item:not(.nb-ext-hidden)');
      el.classList.toggle('nb-ext-hidden', !hasVisibleChild);
      if (hasVisibleChild) {
        el.classList.remove('collapsed');
        el.querySelector('.nb-ext-folder-arrow')?.classList.add('expanded');
      }
    });

    if (unassignedArea) {
      const hasVisible = !!unassignedArea.querySelector('.nb-ext-item-row:not(.nb-ext-hidden)');
      unassignedArea.classList.toggle('nb-ext-hidden', !!query && !hasVisible);
      unassignedArea.querySelector('.nb-ext-unassigned-title')?.classList.toggle('nb-ext-hidden', !!query && !hasVisible);
    }
  },

  renderPaywall(manager, isManualOpen = false, isInline = false) {
    const paywallId = isInline ? 'nb-ext-paywall-inline' : 'nb-ext-paywall';
    let paywall = document.getElementById(paywallId);
    if (!paywall) {
      paywall = document.createElement('div');
      paywall.id = paywallId;
      paywall.className = paywallId;
      const host = isInline ? document.getElementById('nb-ext-container') : document.body;
      host?.appendChild(paywall);
    }

    if (!isInline && isManualOpen && !manager.licenseInfo.isExpired) {
      paywall.addEventListener('click', (e) => { if (e.target === paywall) paywall.remove(); });
    }

    const trialDaysLeft = Math.max(0, manager.licenseInfo.trialDays - Math.floor((Date.now() - manager.licenseInfo.installDate) / 86400000));
    paywall.textContent = '';
    const modal = document.createElement('div');
    modal.className = 'nb-ext-paywall-modal';

    if (!isInline && isManualOpen) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'material-symbols-outlined';
      closeBtn.style.cssText = 'position:absolute; top:16px; right:16px; cursor:pointer;';
      closeBtn.textContent = 'close';
      closeBtn.addEventListener('click', () => paywall.remove());
      modal.appendChild(closeBtn);
    }

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined nb-ext-paywall-icon';
    icon.textContent = manager.licenseInfo.isExpired ? 'lock' : 'verified_user';

    const title = document.createElement('div');
    title.className = 'nb-ext-paywall-title';
    title.textContent = manager.licenseInfo.isExpired ? 'Trial Expired' : 'Enhancer License';

    const desc = document.createElement('div');
    desc.className = 'nb-ext-paywall-desc';
    desc.textContent = manager.licenseInfo.isExpired ? 'Trial ended. Buy a license to continue.' : trialDaysLeft + ' days left.';

    const inputGroup = document.createElement('div');
    inputGroup.className = 'nb-ext-license-input-group';

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'nb-ext-license-input';
    inputEl.placeholder = 'License Key...';

    const activateBtn = document.createElement('button');
    activateBtn.className = 'nb-ext-activate-btn';
    activateBtn.textContent = 'Activate Access';

    const errorDivEl = document.createElement('div');
    errorDivEl.className = 'nb-ext-license-error';
    errorDivEl.style.display = 'none';

    inputGroup.append(inputEl, activateBtn, errorDivEl);

    const buyLink = document.createElement('a');
    buyLink.href = 'https://gumroad.com/l/cxzucm';
    buyLink.target = '_blank';
    buyLink.className = 'nb-ext-buy-link';
    buyLink.textContent = 'Buy Key on Gumroad';

    modal.append(icon, title, desc, inputGroup, buyLink);
    paywall.appendChild(modal);

    activateBtn.addEventListener('click', async () => {
      const key = inputEl.value.trim();
      if (!key) return;
      activateBtn.disabled = true; activateBtn.textContent = 'Verifying...';
      try {
        if (await manager.verifyLicense(key)) location.reload();
        else { errorDivEl.textContent = 'Invalid key.'; errorDivEl.style.display = 'block'; activateBtn.disabled = false; activateBtn.textContent = 'Activate Access'; }
      } catch { errorDivEl.textContent = 'Error.'; errorDivEl.style.display = 'block'; activateBtn.disabled = false; activateBtn.textContent = 'Activate Access'; }
    });
  }
};
