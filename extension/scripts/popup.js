document.addEventListener('DOMContentLoaded', () => {
    const initPopup = async () => {
        try {
            const statusText = document.getElementById('status-text');
            const trialDesc = document.getElementById('trial-desc');
            const licenseInput = document.getElementById('license-input');
            const activateBtn = document.getElementById('activate-btn');
            const errorMsg = document.getElementById('error-msg');
            const activationSection = document.getElementById('activation-section');
            const enabledToggle = document.getElementById('enabled-toggle');
            const buyLink = document.getElementById('buy-link');
            const shareBtn = document.getElementById('share-btn');

            if (!statusText || !trialDesc || !enabledToggle) {
                console.error("[NB-Ext] Essential popup elements missing");
                return;
            }

            const licenseInfo = await StorageManager.getLicenseInfo();
            const isEnabled = await StorageManager.getEnabledState();
            
            // Initialize toggle state
            enabledToggle.checked = isEnabled;

            enabledToggle.addEventListener('change', async () => {
                const newState = enabledToggle.checked;
                await StorageManager.setEnabledState(newState);
                
                // Refresh all NotebookLM tabs
                chrome.tabs.query({url: "https://notebooklm.google.com/*"}, (tabs) => {
                    if (tabs) tabs.forEach(tab => chrome.tabs.reload(tab.id));
                });
            });
            
            const updateUI = () => {
                if (licenseInfo.isLicensed) {
                    statusText.textContent = 'Pro Version';
                    statusText.className = 'status-badge status-licensed';
                    trialDesc.textContent = 'Lifetime access activated (NotebookLM Enhancer). Thank you for your support!';
                    if (activationSection) activationSection.style.display = 'none';
                    
                    // Disable Buy Link
                    if (buyLink) {
                        buyLink.classList.add('disabled');
                        buyLink.removeAttribute('href');
                        buyLink.style.pointerEvents = 'none';
                        buyLink.style.opacity = '0.5';
                        buyLink.textContent = 'Licensed (Lifetime)';
                    }
                } else {
                    const now = Date.now();
                    const trialPeriod = licenseInfo.trialDays * 24 * 60 * 60 * 1000;
                    const daysLeft = Math.max(0, licenseInfo.trialDays - Math.floor((now - licenseInfo.installDate) / (24 * 60 * 60 * 1000)));
                    const isExpired = now - licenseInfo.installDate > trialPeriod;

                    if (isExpired) {
                        statusText.textContent = 'TRIAL EXPIRED';
                        statusText.className = 'status-badge status-expired';
                        trialDesc.textContent = 'Your 7-day free trial of NotebookLM Enhancer has ended. Please activate to continue.';
                    } else {
                        statusText.textContent = 'FREE TRIAL';
                        statusText.className = 'status-badge status-trial';
                        trialDesc.textContent = `${daysLeft} days remaining in your free trial.`;
                    }
                }
            };

            updateUI();

            // Share Functionality
            if (shareBtn) {
                shareBtn.addEventListener('click', async () => {
                    const shareData = {
                        title: 'NotebookLM Enhancer',
                        text: "I'm using NotebookLM Enhancer to supercharge my workflow! Check it out here: ",
                        url: 'https://gumroad.com/l/cxzucm'
                    };

                    try {
                        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                             await navigator.share(shareData);
                        } else {
                            // Fallback to clipboard
                            if (navigator.clipboard) {
                                const shareText = `${shareData.text}${shareData.url}`;
                                await navigator.clipboard.writeText(shareText);
                                const originalHTML = shareBtn.innerHTML;
                                shareBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">done</span> Copied!';
                                setTimeout(() => {
                                    shareBtn.innerHTML = originalHTML;
                                }, 2000);
                            }
                        }
                    } catch (err) {
                        if (err.name !== 'AbortError') {
                            console.error("Share failed:", err);
                        }
                    }
                });
            }

            if (activateBtn) {
                activateBtn.addEventListener('click', async () => {
                    const key = licenseInput ? licenseInput.value.trim() : '';
                    if (!key) return;

                    activateBtn.disabled = true;
                    activateBtn.textContent = 'Verifying...';
                    if (errorMsg) errorMsg.style.display = 'none';

                    try {
                        const success = await verifyLicense(key);
                        if (success) {
                            licenseInfo.isLicensed = true;
                            updateUI();
                            // Notify all pages to refresh
                            chrome.tabs.query({url: "https://notebooklm.google.com/*"}, (tabs) => {
                                if (tabs) tabs.forEach(tab => chrome.tabs.reload(tab.id));
                            });
                        } else {
                            if (errorMsg) {
                                errorMsg.textContent = 'Invalid license key.';
                                errorMsg.style.display = 'block';
                            }
                            activateBtn.disabled = false;
                            activateBtn.textContent = 'Activate Lifetime Access';
                        }
                    } catch (err) {
                        if (errorMsg) {
                            errorMsg.textContent = 'Connection error.';
                            errorMsg.style.display = 'block';
                        }
                        activateBtn.disabled = false;
                        activateBtn.textContent = 'Activate Lifetime Access';
                    }
                });
            }
        } catch (e) {
            console.error("[NB-Ext] Popup Init Failed:", e);
        }
    };

    async function verifyLicense(licenseKey) {
        try {
            const params = new URLSearchParams();
            params.append('product_id', '9KnEA4Z1DE6BlSSJRqONvg==');
            params.append('license_key', licenseKey);

            const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("[NB-Ext] Verify API (Popup) Error:", response.status, errorText);
                return false;
            }

            const data = await response.json();
            if (data.success && !data.uses_limit_reached) {
                await StorageManager.setLicense(licenseKey, true);
                return true;
            }
            return false;
        } catch (error) {
            console.error("License verification failed:", error);
            throw error;
        }
    }

    initPopup();
});
