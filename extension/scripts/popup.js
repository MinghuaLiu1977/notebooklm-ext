document.addEventListener('DOMContentLoaded', async () => {
    const statusText = document.getElementById('status-text');
    const trialDesc = document.getElementById('trial-desc');
    const licenseInput = document.getElementById('license-input');
    const activateBtn = document.getElementById('activate-btn');
    const errorMsg = document.getElementById('error-msg');
    const activationSection = document.getElementById('activation-section');

    const licenseInfo = await StorageManager.getLicenseInfo();
    
    const updateUI = () => {
        if (licenseInfo.isLicensed) {
            statusText.textContent = 'MASTER VERSION';
            statusText.className = 'status-badge status-licensed';
            trialDesc.textContent = 'Lifetime access activated (NotebookLM Enhancer). Thank you for your support!';
            activationSection.style.display = 'none';
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

    activateBtn.addEventListener('click', async () => {
        const key = licenseInput.value.trim();
        if (!key) return;

        activateBtn.disabled = true;
        activateBtn.textContent = 'Verifying...';
        errorMsg.style.display = 'none';

        try {
            const success = await verifyLicense(key);
            if (success) {
                licenseInfo.isLicensed = true;
                updateUI();
                // Notify all pages to refresh
                chrome.tabs.query({url: "https://notebooklm.google.com/*"}, (tabs) => {
                    tabs.forEach(tab => chrome.tabs.reload(tab.id));
                });
            } else {
                errorMsg.textContent = 'Invalid license key.';
                errorMsg.style.display = 'block';
                activateBtn.disabled = false;
                activateBtn.textContent = 'Activate Lifetime Access';
            }
        } catch (err) {
            errorMsg.textContent = 'Connection error.';
            errorMsg.style.display = 'block';
            activateBtn.disabled = false;
            activateBtn.textContent = 'Activate Lifetime Access';
        }
    });

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
});
