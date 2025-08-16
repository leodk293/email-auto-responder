// Background service worker for Chrome extension

// Install event
chrome.runtime.onInstalled.addListener(() => {
    console.log('Email Auto Responder extension installed');

    // Initialize default settings
    chrome.storage.sync.set({
        autoResponderEnabled: false,
        emailTemplates: [
            {
                id: Date.now(),
                name: 'Out of Office',
                subject: 'Auto Reply: Out of Office',
                body: 'Thank you for your email. I am currently out of office and will respond to your message when I return. If this is urgent, please contact my colleague at colleague@company.com.',
                keywords: ['urgent', 'meeting', 'schedule']
            }
        ]
    });
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSettings') {
        chrome.storage.sync.get(['autoResponderEnabled', 'emailTemplates'], (result) => {
            sendResponse(result);
        });
        return true; // Keep message channel open for async response
    }

    if (request.action === 'updateSettings') {
        chrome.storage.sync.set(request.settings, () => {
            sendResponse({ success: true });
        });
        return true;
    }
});

// Handle tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const isEmailSite = tab.url.includes('mail.google.com') ||
            tab.url.includes('outlook.live.com') ||
            tab.url.includes('outlook.office.com');

        if (isEmailSite) {
            // Inject content script if not already injected
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    // Check if content script is already loaded
                    return window.autoResponderLoaded === true;
                }
            }).then((results) => {
                if (!results[0]?.result) {
                    // Content script not loaded, inject it
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: () => {
                            window.autoResponderLoaded = true;
                        }
                    });
                }
            }).catch(err => {
                console.log('Could not inject script:', err);
            });
        }
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // This will open the popup automatically due to manifest settings
    console.log('Extension icon clicked');
});

// Clean up old processed emails periodically
setInterval(() => {
    chrome.storage.local.get(['processedEmails'], (result) => {
        const processed = result.processedEmails || {};
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        // Remove entries older than 1 day
        const cleaned = {};
        Object.keys(processed).forEach(key => {
            if (now - processed[key] < oneDay) {
                cleaned[key] = processed[key];
            }
        });

        chrome.storage.local.set({ processedEmails: cleaned });
    });
}, 60 * 60 * 1000); // Run every hour