/**
 * NotebookLM Enhancer - Utilities
 */
var NotebookUtils = {
  // File extension identification
  getFileIcon(filename) {
    if (!filename) return 'description';
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      'pdf': 'picture_as_pdf',
      'doc': 'article', 'docx': 'article',
      'xls': 'table_view', 'xlsx': 'table_view', 'csv': 'table_view',
      'ppt': 'present_to_all', 'pptx': 'present_to_all',
      'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'webp': 'image',
      'txt': 'notes', 'md': 'description',
      'zip': 'folder_zip', 'rar': 'folder_zip', '7z': 'folder_zip',
      'html': 'html', 'js': 'javascript', 'css': 'css',
      'mp3': 'audio_file', 'wav': 'audio_file',
      'mp4': 'video_file', 'mov': 'video_file'
    };
    return map[ext] || 'description';
  },

  /**
   * Change the state of Material Checkbox
   * @param {HTMLElement} element - DOM element containing material-symbols-outlined class
   * @param {string} state - Target state: 'all', 'none', 'partial'
   */
  setCheckboxState(element, state) {
    if (!element) return;
    
    element.setAttribute('data-checked-state', state);
    
    if (state === 'all') {
      element.textContent = 'check_box';
      element.setAttribute('data-checked', 'true');
    } else if (state === 'partial') {
      element.textContent = 'indeterminate_check_box';
      element.setAttribute('data-checked', 'partial');
    } else {
      element.textContent = 'check_box_outline_blank';
      element.setAttribute('data-checked', 'false');
    }
  }
};
