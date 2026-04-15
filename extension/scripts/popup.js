document.addEventListener('DOMContentLoaded', () => {
    const initPopup = async () => {
        try {
            const enabledToggle = document.getElementById('enabled-toggle');
            const shareBtn = document.getElementById('share-btn');

            if (!enabledToggle) {
                console.error("[NB-Ext] Essential popup elements missing");
                return;
            }

            const isEnabled = await StorageManager.getEnabledState();
            enabledToggle.checked = isEnabled;

            // Sync version number
            const versionEl = document.getElementById('ext-version');
            if (versionEl) {
                versionEl.textContent = `v${chrome.runtime.getManifest().version} (Free)`;
            }

            enabledToggle.addEventListener('change', async () => {
                const newState = enabledToggle.checked;
                await StorageManager.setEnabledState(newState);
                if (newState) await StorageManager.setToolbarEnabled(true);

                // Refresh all NotebookLM tabs
                chrome.tabs.query({url: "https://notebooklm.google.com/*"}, (tabs) => {
                    if (tabs) tabs.forEach(tab => chrome.tabs.reload(tab.id));
                });
            });

            // Share Functionality (Update URL to GitHub/Coming Soon)
            if (shareBtn) {
                shareBtn.addEventListener('click', async () => {
                    const shareData = {
                        title: 'NotebookLM Enhancer',
                        text: "I'm using NotebookLM Enhancer to supercharge my workflow! It's now permanently free. Check it out: ",
                        url: 'https://github.com/MinghuaLiu1977/notebooklm-enhance'
                    };
                    try {
                        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                             await navigator.share(shareData);
                        } else if (navigator.clipboard) {
                            const shareText = `${shareData.text}${shareData.url}`;
                            await navigator.clipboard.writeText(shareText);
                            const originalHTML = shareBtn.innerHTML;
                            shareBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">done</span> Copied!';
                            setTimeout(() => shareBtn.innerHTML = originalHTML, 2000);
                        }
                    } catch (err) {
                        if (err.name !== 'AbortError') console.error("Share failed:", err);
                    }
                });
            }

            // SlideRev Promotion Handling
            const learnMoreBtn = document.getElementById('learn-more-btn');
            if (learnMoreBtn) {
                learnMoreBtn.addEventListener('click', () => {
                    chrome.tabs.create({ url: 'sliderev.html' });
                });
            }



        } catch (e) {
            console.error("[NB-Ext] Popup Init Failed:", e);
        }
    };
    initPopup();
});
