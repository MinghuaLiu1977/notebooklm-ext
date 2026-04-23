var UIRenderer = {
  async renderSidebarUI(manager, config) {
    if (manager.isRendering) return;
    manager.isRendering = true;

    try {
      if (!config) config = await StorageManager.getNotebookConfig(manager.notebookId);

      const sourcePanel = document.querySelector('[class*="source-panel"]');
      const scrollAreaOuter = document.querySelector('.scroll-area-desktop') || document.querySelector('.mat-drawer-inner-container');
      let sidebarContent = scrollAreaOuter ? scrollAreaOuter.parentElement : (sourcePanel || document.querySelector('.source-panel-content'));

      if (!sidebarContent) {
        console.warn("[NB-Ext] renderSidebarUI: Sidebar content not found, retrying...");
        manager.isRendering = false;
        setTimeout(() => this.renderSidebarUI(manager, config), 1000);
        return;
      }

      let container = document.getElementById('nb-ext-container');

      if (!container) {
        container = document.createElement('div');
        container.id = 'nb-ext-container';
        container.className = 'nb-ext-sidebar nb-ext-full-width';
      }

      if (!sidebarContent.contains(container)) {
        sidebarContent.appendChild(container);
      }

      container.textContent = '';

      await ToolbarManager.initToolbar(manager);

      if (manager.treeViewEnabled) {
        this.renderTreeView(manager, container, config);
      } else {
        this.renderFlatView(manager, container);
      }

      LayoutEngine.syncContainerSize(manager);
      this.applyFilter(manager);

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

  renderFolderRenamer(manager, folder) {
    const overlay = document.createElement('div');
    overlay.className = 'nb-ext-modal-overlay';

    const content = document.createElement('div');
    content.className = 'nb-ext-modal-content';

    const title = document.createElement('div');
    title.className = 'nb-ext-modal-title';
    title.textContent = 'Rename Folder';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'nb-ext-modal-input';
    input.value = folder.name;
    input.placeholder = 'Enter folder name...';

    const actions = document.createElement('div');
    actions.className = 'nb-ext-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'nb-ext-btn nb-ext-btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const okBtn = document.createElement('button');
    okBtn.className = 'nb-ext-btn nb-ext-btn-primary';
    okBtn.textContent = 'Save';

    const doSave = () => {
      const name = input.value.trim();
      if (name) {
        manager.renameFolder(folder.id, name);
        overlay.remove();
      }
    };

    okBtn.addEventListener('click', doSave);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSave();
      if (e.key === 'Escape') overlay.remove();
    });

    actions.append(cancelBtn, okBtn);
    content.append(title, input, actions);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  },

  renderFolderDeleter(manager, folder) {
    const overlay = document.createElement('div');
    overlay.className = 'nb-ext-modal-overlay';

    const content = document.createElement('div');
    content.className = 'nb-ext-modal-content';

    const title = document.createElement('div');
    title.className = 'nb-ext-modal-title';
    title.textContent = 'Delete Folder';

    const desc = document.createElement('div');
    desc.style.marginBottom = '20px';
    desc.style.fontSize = '14px';
    desc.style.color = 'var(--nb-ext-text-soft)';
    desc.style.lineHeight = '1.6';
    desc.innerHTML = `Are you sure you want to delete folder <b>"${folder.name}"</b>?<br/><span style="font-size: 13px; opacity: 0.8;">Note: This only removes the folder organization. Your documents will remain safe in NotebookLM.</span>`;

    const actions = document.createElement('div');
    actions.className = 'nb-ext-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'nb-ext-btn nb-ext-btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const okBtn = document.createElement('button');
    okBtn.className = 'nb-ext-btn nb-ext-btn-primary';
    okBtn.style.backgroundColor = '#d32f2f'; // Danger Red
    okBtn.textContent = 'Delete Folder';
    okBtn.addEventListener('click', () => {
      manager.removeFolderOnly(folder.id);
      overlay.remove();
    });

    actions.append(cancelBtn, okBtn);
    content.append(title, desc, actions);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
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
    unassignedTitle.textContent = `/ (${unassignedItems.length})`;
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

    const nameSpan = document.createElement('span');
    const pool = [...manager.sources, ...manager.notes];
    const activeCount = folder.itemIds.filter(id => pool.some(i => i.id === id)).length;
    nameSpan.className = 'nb-ext-text-truncate nb-ext-folder-name';
    nameSpan.textContent = `${folder.name} (${activeCount})`;
    folderTitle.addEventListener('click', () => {
      if (isCollapsed) manager.collapsedFolderIds = manager.collapsedFolderIds.filter(id => id !== folder.id);
      else manager.collapsedFolderIds.push(folder.id);
      chrome.storage.local.set({ 'nb_ext_collapsed_ids': manager.collapsedFolderIds });
      manager.refreshData(true);
    });
    folderTitle.appendChild(nameSpan);

    const editBtn = this.createActionIcon('edit', 'Rename', (e) => {
      e.stopPropagation();
      this.renderFolderRenamer(manager, folder);
    });
    const delBtn = this.createActionIcon('delete', 'Delete', (e) => {
      e.stopPropagation();
      this.renderFolderDeleter(manager, folder);
    });
    folderTitle.append(editBtn, delBtn);
    folderDiv.appendChild(folderTitle);

    if (!isCollapsed) {
      const folderContent = document.createElement('div');
      folderContent.className = 'nb-ext-folder-content';
      folder.itemIds.forEach(itemId => {
        const item = pool.find(i => i.id === itemId);
        if (item) folderContent.appendChild(this.createItemRow(manager, item, true));
      });
      folderDiv.appendChild(folderContent);
    }
    return folderDiv;
  },

  createItemRow(manager, item, isNested = false) {
    const row = document.createElement('div');
    row.className = `${isNested ? 'nb-ext-item' : 'nb-ext-item-row'} nb-ext-display-${manager.displayMode}`;
    
    if (item.isUnavailable) {
      row.classList.add('nb-ext-item-unavailable');
    }

    const mainContent = document.createElement('div');
    mainContent.className = 'nb-ext-item-main';
    mainContent.style.display = 'flex';
    mainContent.style.alignItems = 'center';
    mainContent.style.width = '100%';

    const itemBox = document.createElement('span');
    
    if (item.isUnavailable) {
      itemBox.className = 'nb-ext-checkbox-native material-symbols-outlined';
      itemBox.textContent = 'error';
      itemBox.title = 'Source unavailable or failed';
      itemBox.style.cursor = 'not-allowed';
      itemBox.style.color = '#d32f2f'; // Native red
    } else if (item.isLoading) {
      itemBox.className = 'nb-ext-loading-spinner material-symbols-outlined';
      itemBox.textContent = 'progress_activity';
      itemBox.title = 'Loading...';
      // Loading items shouldn't be interactable via checkbox
      itemBox.style.cursor = 'default';
    } else {
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
    }
    mainContent.appendChild(itemBox);

    const iconInfo = NotebookUtils.getFileIcon(item.name);
    const icon = document.createElement('span');
    icon.className = `nb-ext-item-icon material-symbols-outlined nb-ext-icon-${iconInfo.type}`;
    icon.textContent = iconInfo.icon;
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

    // ====== 新增：AI重绘/幻灯片功能（已移除） ====== //
    // ================================ //


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

    // / Option
    const isUnassigned = !config.folders.some(f => f.itemIds.includes(item.id));
    menu.appendChild(this.createMenuItem('/', isUnassigned ? 'check' : '', () => {
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

    // Adjust position to prevent rendering off-screen
    const menuRect = menu.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 5;

    if (rect.left + menuRect.width > window.innerWidth) {
      left = window.innerWidth - menuRect.width - 10;
    }
    if (rect.bottom + menuRect.height + 5 > window.innerHeight) {
      top = rect.top + window.scrollY - menuRect.height - 5;
    }

    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.top = `${Math.max(10, top)}px`;

    const closeHandler = (e) => {
      if (!menu.contains(e.target) && !trigger.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 50);
  },

  handleFileAction(manager, item, action) {
    return new Promise((resolve) => {
      const nativeMoreBtn = document.getElementById(`source-item-more-button-${item.id}`);
      if (!nativeMoreBtn) {
        const buttons = document.querySelectorAll('[id^="source-item-more-button-"]');
        const fallbackBtn = Array.from(buttons).find(b => b.id.includes(item.id));
        if (!fallbackBtn) {
          console.warn(`[NB-Ext] Native "${action}" button not found for item:`, item.id);
          resolve(false);
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
          
          if (action === 'Delete') {
            const row = document.querySelector(`[data-id="${item.id}"]`);
            if (row) {
               row.style.opacity = '0.3';
               row.style.pointerEvents = 'none';
            }

            setTimeout(() => {
              const dialogBtns = document.querySelectorAll('.mdc-dialog__actions button, .mat-mdc-dialog-actions button');
              const confirmBtn = Array.from(dialogBtns).find(btn => /Remove|Delete|Confirm|Yes/i.test(btn.innerText));
              if (confirmBtn) {
                 confirmBtn.click();
              }
              manager.scheduleRefresh([300, 800, 2000]);
              resolve(true);
            }, 350);
          } else {
            manager.scheduleRefresh([300, 800]);
            resolve(true);
          }
        } else if (attempts < 10) {
          attempts++;
          setTimeout(findAndClick, 150);
        } else {
          resolve(false);
        }
      };

      setTimeout(findAndClick, 150);
    });
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
    const container = document.getElementById('nb-ext-container');
    if (container) {
      if (manager.isSearchOpen) {
        container.classList.add('nb-ext-searching');
      } else {
        container.classList.remove('nb-ext-searching');
      }
    }

    const andGroups = query.split('+').map(g => g.trim()).filter(g => g);
    const matches = (text) => {
      if (!query) return true;
      text = text.toLowerCase();
      return andGroups.every(group => group.split(/\s+/).filter(t => t).some(term => text.includes(term)));
    };

    items.forEach(el => {
      const labelEl = el.querySelector('.nb-ext-source-label');
      const text = labelEl ? labelEl.textContent : el.textContent;
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

    // Scroll to top AFTER all visibility changes
    if (query && container) {
      const scrollAll = (el) => {
        while (el) {
          if (el.scrollTop > 0) el.scrollTop = 0;
          el = el.parentElement;
        }
      };
      scrollAll(container);
      setTimeout(() => scrollAll(container), 10);
      setTimeout(() => scrollAll(container), 100);
      setTimeout(() => scrollAll(container), 500);
    }
  },


  /**
   * 渲染现代化确认模态框 (Promise 封装)
   */
  showConfirm(titleText, messageHtml) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'nb-ext-modal-overlay';
      overlay.style.zIndex = '1000200'; // 确保在所有 UI 之上

      const content = document.createElement('div');
      content.className = 'nb-ext-modal-content';
      content.style.animation = 'nb-ext-fade-in-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

      const title = document.createElement('div');
      title.className = 'nb-ext-modal-title';
      title.style.display = 'flex';
      title.style.alignItems = 'center';
      title.style.gap = '12px';
      title.innerHTML = `<span class="material-symbols-outlined" style="color:var(--nb-ext-primary); font-size:28px;">auto_fix_high</span> ${titleText}`;

      const desc = document.createElement('div');
      desc.style.lineHeight = '1.6';
      desc.style.fontSize = '15px';
      desc.style.color = 'var(--nb-ext-text-soft)';
      desc.innerHTML = messageHtml.replace(/\n/g, '<br>');

      const actions = document.createElement('div');
      actions.className = 'nb-ext-modal-actions';
      actions.style.marginTop = '8px';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'nb-ext-btn nb-ext-btn-ghost';
      cancelBtn.textContent = '取消';
      cancelBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });

      const okBtn = document.createElement('button');
      okBtn.className = 'nb-ext-btn nb-ext-btn-primary';
      okBtn.textContent = '开始去字导出';
      okBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });

      actions.append(cancelBtn, okBtn);
      content.append(title, desc, actions);
      overlay.appendChild(content);
      document.body.appendChild(overlay);

      // 点击背景关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(false);
        }
      });
    });
  }
};

if (typeof window !== 'undefined') {
  window.UIRenderer = UIRenderer;
}

if (typeof window !== 'undefined') {
  window.UIRenderer = UIRenderer;
}

// Explicit global export for cross-script reliability
if (typeof window !== 'undefined') {
  window.UIRenderer = UIRenderer;
}
