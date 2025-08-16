// Content script for email auto-responder
let autoResponderEnabled = false;
let emailTemplates = [];
let processedEmails = new Set();
let injectedScript = null;

// Inject the page-level script
function injectScript() {
    if (injectedScript) return;

    injectedScript = document.createElement('script');
    injectedScript.src = chrome.runtime.getURL('injected.js');
    injectedScript.onload = function () {
        this.remove();
        // Initialize email detection in the injected script
        window.postMessage({ type: 'INIT_EMAIL_DETECTION' }, '*');
    };
    (document.head || document.documentElement).appendChild(injectedScript);
}

// Listen for messages from the injected script
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    switch (event.data.type) {
        case 'EMAIL_DETECTED':
            if (autoResponderEnabled) {
                handleDetectedEmail(event.data.email);
            }
            break;

        case 'EMAIL_SENT':
            handleEmailSent(event.data.result, event.data.originalEmail, event.data.template);
            break;

        case 'EMAIL_SEND_ERROR':
            handleEmailSendError(event.data.error, event.data.originalEmail, event.data.template);
            break;

        case 'USER_EMAIL_RESPONSE':
            console.log('Current user email:', event.data.email);
            break;
    }
});

// Initialize the extension
chrome.storage.sync.get(['autoResponderEnabled', 'emailTemplates'], (result) => {
    autoResponderEnabled = result.autoResponderEnabled || false;
    emailTemplates = result.emailTemplates || [];
    if (autoResponderEnabled) {
        startEmailMonitoring();
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleAutoResponder') {
        autoResponderEnabled = request.enabled;
        if (autoResponderEnabled) {
            startEmailMonitoring();
        } else {
            stopEmailMonitoring();
        }
        sendResponse({ success: true });
    }
});

let observer;

function startEmailMonitoring() {
    console.log('Starting email monitoring...');

    // Inject the page-level script for deeper integration
    injectScript();

    // Also keep the original monitoring as backup
    if (window.location.hostname === 'mail.google.com') {
        monitorGmail();
    } else if (window.location.hostname.includes('outlook')) {
        monitorOutlook();
    }
}

function handleDetectedEmail(emailData) {
    if (processedEmails.has(emailData.id)) return;

    console.log('Email detected via injected script:', emailData);

    // Only process unread emails
    if (!emailData.isUnread) return;

    // Find matching template
    const template = findMatchingTemplate(emailData.subject, emailData.from);
    if (template) {
        processedEmails.add(emailData.id);

        // Send auto-reply via injected script
        showAutoResponseNotification(template.name);

        // Send the auto-reply
        window.postMessage({
            type: 'SEND_AUTO_REPLY',
            email: emailData,
            template: template
        }, '*');
    }
}

function handleEmailSent(result, originalEmail, template) {
    if (result.success) {
        console.log('Auto-reply sent successfully:', result);
        simulateEmailSent(originalEmail.from, template);
    } else {
        console.error('Failed to send auto-reply:', result.error);
        showErrorNotification('Failed to send auto-reply: ' + result.error);
    }
}

function handleEmailSendError(error, originalEmail, template) {
    console.error('Error sending auto-reply:', error);
    showErrorNotification('Error sending auto-reply: ' + error);
}

function stopEmailMonitoring() {
    console.log('Stopping email monitoring...');
    if (observer) {
        observer.disconnect();
    }
}

function monitorGmail() {
    // Monitor for new emails in Gmail
    observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Look for email conversation threads
                    const emailRows = node.querySelectorAll('[role="main"] tr[id]');
                    emailRows.forEach(processGmailEmail);
                }
            });
        });
    });

    // Start observing
    const mainContent = document.querySelector('[role="main"]');
    if (mainContent) {
        observer.observe(mainContent, {
            childList: true,
            subtree: true
        });
    }

    // Process existing emails
    setTimeout(() => {
        const existingEmails = document.querySelectorAll('[role="main"] tr[id]');
        existingEmails.forEach(processGmailEmail);
    }, 2000);
}

function processGmailEmail(emailRow) {
    if (!autoResponderEnabled || !emailRow.id) return;

    // Avoid processing the same email multiple times
    if (processedEmails.has(emailRow.id)) return;

    try {
        // Check if this is an unread email
        const unreadIndicator = emailRow.querySelector('[aria-label*="Unread"]');
        if (!unreadIndicator) return;

        // Extract email details
        const senderElement = emailRow.querySelector('[email]');
        const subjectElement = emailRow.querySelector('[role="link"] span[id]');

        if (!senderElement || !subjectElement) return;

        const sender = senderElement.getAttribute('email');
        const subject = subjectElement.textContent;

        console.log(`New email detected - From: ${sender}, Subject: ${subject}`);

        // Find matching template
        const template = findMatchingTemplate(subject, sender);
        if (template) {
            processedEmails.add(emailRow.id);
            scheduleAutoResponse(emailRow, template, sender, subject);
        }
    } catch (error) {
        console.error('Error processing Gmail email:', error);
    }
}

function monitorOutlook() {
    // Monitor for new emails in Outlook
    observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const emailItems = node.querySelectorAll('[role="listitem"]');
                    emailItems.forEach(processOutlookEmail);
                }
            });
        });
    });

    const mailList = document.querySelector('[role="tree"]') || document.querySelector('[role="list"]');
    if (mailList) {
        observer.observe(mailList, {
            childList: true,
            subtree: true
        });
    }
}

function processOutlookEmail(emailItem) {
    if (!autoResponderEnabled) return;

    // Basic Outlook email processing (would need refinement for production)
    try {
        const senderElement = emailItem.querySelector('[title*="@"]');
        const subjectElement = emailItem.querySelector('span[title]');

        if (!senderElement || !subjectElement) return;

        const sender = senderElement.title;
        const subject = subjectElement.title;

        console.log(`New email detected - From: ${sender}, Subject: ${subject}`);

        const template = findMatchingTemplate(subject, sender);
        if (template) {
            scheduleAutoResponse(emailItem, template, sender, subject);
        }
    } catch (error) {
        console.error('Error processing Outlook email:', error);
    }
}

function findMatchingTemplate(subject, sender) {
    // Find a template that matches the email
    for (const template of emailTemplates) {
        // If template has keywords, check if any match the subject
        if (template.keywords && template.keywords.length > 0) {
            const subjectLower = subject.toLowerCase();
            const hasMatchingKeyword = template.keywords.some(keyword =>
                subjectLower.includes(keyword.toLowerCase())
            );
            if (hasMatchingKeyword) {
                return template;
            }
        }
    }

    // If no keyword match, return the first template as default
    return emailTemplates.length > 0 ? emailTemplates[0] : null;
}

function scheduleAutoResponse(emailElement, template, sender, originalSubject) {
    // Add visual indicator
    showAutoResponseNotification(template.name);

    // Simulate auto-response (in a real implementation, this would integrate with email APIs)
    setTimeout(() => {
        console.log(`Auto-responding to ${sender} with template: ${template.name}`);
        console.log(`Response: ${template.body}`);

        // In a production version, you would:
        // 1. Use Gmail/Outlook APIs to send actual responses
        // 2. Handle authentication
        // 3. Parse email threads properly
        // 4. Avoid responding to your own emails
        // 5. Track conversation history

        simulateEmailSent(sender, template);
    }, 2000);
}

function showAutoResponseNotification(templateName) {
    // Create a notification overlay
    const notification = document.createElement('div');
    notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

    notification.textContent = `🤖 Auto-responding with template: ${templateName}`;
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.style.opacity = '1', 100);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
}

function simulateEmailSent(recipient, template) {
    // Show confirmation
    const confirmation = document.createElement('div');
    confirmation.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

    confirmation.textContent = `✅ Response sent to ${recipient}`;
    document.body.appendChild(confirmation);

    setTimeout(() => confirmation.style.opacity = '1', 100);

    setTimeout(() => {
        confirmation.style.opacity = '0';
        setTimeout(() => document.body.removeChild(confirmation), 300);
    }, 3000);
}

function showErrorNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #f44336;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
    max-width: 300px;
  `;

    notification.textContent = `❌ ${message}`;
    document.body.appendChild(notification);

    setTimeout(() => notification.style.opacity = '1', 100);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Reload templates when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.emailTemplates) {
        emailTemplates = changes.emailTemplates.newValue || [];
    }
    if (changes.autoResponderEnabled) {
        autoResponderEnabled = changes.autoResponderEnabled.newValue || false;
        if (autoResponderEnabled) {
            startEmailMonitoring();
        } else {
            stopEmailMonitoring();
        }
    }
});