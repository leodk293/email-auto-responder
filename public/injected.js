// Injected script that runs in the page context
// This allows access to page-level JavaScript and Gmail/Outlook internals

(function () {
    'use strict';

    // Prevent multiple injections
    if (window.emailAutoResponderInjected) {
        return;
    }
    window.emailAutoResponderInjected = true;

    // Gmail specific functions
    const GmailAPI = {
        // Check if we're in Gmail
        isGmail: () => window.location.hostname === 'mail.google.com',

        // Get Gmail's internal API if available
        getGmailAPI: () => {
            // Gmail loads its API in different ways, try to access it
            if (window.gapi && window.gapi.load) {
                return window.gapi;
            }
            // Try alternative Gmail internal APIs
            if (window.GM_API) {
                return window.GM_API;
            }
            return null;
        },

        // Hook into Gmail's email sending function
        hookSendEmail: () => {
            // This would intercept Gmail's send functions
            // In a real implementation, you'd need to reverse engineer Gmail's internals
            console.log('Gmail send hook initialized');
        },

        // Get current user's email
        getUserEmail: () => {
            try {
                // Try to find user email in page
                const userEmail = document.querySelector('[aria-label*="@"]')?.getAttribute('aria-label');
                if (userEmail && userEmail.includes('@')) {
                    return userEmail;
                }

                // Alternative methods to get user email
                const emailElements = document.querySelectorAll('[email]');
                for (let el of emailElements) {
                    const email = el.getAttribute('email');
                    if (email && email.includes('@')) {
                        return email;
                    }
                }

                return null;
            } catch (error) {
                console.error('Error getting user email:', error);
                return null;
            }
        },

        // Send a reply via Gmail's compose API
        sendReply: async (originalEmail, replyContent, subject) => {
            try {
                // In a real implementation, this would use Gmail's compose APIs
                console.log('Simulating Gmail reply send:', {
                    to: originalEmail.from,
                    subject: subject,
                    body: replyContent,
                    inReplyTo: originalEmail.id
                });

                // Simulate successful send
                return { success: true, messageId: 'sim_' + Date.now() };
            } catch (error) {
                console.error('Error sending Gmail reply:', error);
                return { success: false, error: error.message };
            }
        }
    };

    // Outlook specific functions
    const OutlookAPI = {
        // Check if we're in Outlook
        isOutlook: () => window.location.hostname.includes('outlook'),

        // Get Outlook's API
        getOutlookAPI: () => {
            // Try to access Outlook's internal APIs
            if (window.Office && window.Office.context) {
                return window.Office;
            }
            if (window.OWA) {
                return window.OWA;
            }
            return null;
        },

        // Hook into Outlook's send functions
        hookSendEmail: () => {
            console.log('Outlook send hook initialized');
        },

        // Send reply via Outlook
        sendReply: async (originalEmail, replyContent, subject) => {
            try {
                console.log('Simulating Outlook reply send:', {
                    to: originalEmail.from,
                    subject: subject,
                    body: replyContent
                });

                return { success: true, messageId: 'outlook_sim_' + Date.now() };
            } catch (error) {
                console.error('Error sending Outlook reply:', error);
                return { success: false, error: error.message };
            }
        }
    };

    // Enhanced email detection for Gmail
    const GmailEmailDetector = {
        // Detect when a new email is opened/viewed
        detectEmailView: () => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Look for email conversation view
                            const emailThread = node.querySelector('[data-thread-id]');
                            if (emailThread) {
                                this.processEmailThread(emailThread);
                            }

                            // Look for individual email messages
                            const emailMessages = node.querySelectorAll('[data-message-id]');
                            emailMessages.forEach(this.processEmailMessage);
                        }
                    });
                });
            });

            // Observe the main content area
            const mainArea = document.querySelector('[role="main"]');
            if (mainArea) {
                observer.observe(mainArea, { childList: true, subtree: true });
            }
        },

        processEmailThread: (threadElement) => {
            try {
                const threadId = threadElement.getAttribute('data-thread-id');
                console.log('Processing email thread:', threadId);

                // Extract thread information
                const messages = threadElement.querySelectorAll('[data-message-id]');
                messages.forEach(this.processEmailMessage);
            } catch (error) {
                console.error('Error processing email thread:', error);
            }
        },

        processEmailMessage: (messageElement) => {
            try {
                const messageId = messageElement.getAttribute('data-message-id');
                if (!messageId) return;

                // Extract email details
                const senderElement = messageElement.querySelector('[email]');
                const subjectElement = messageElement.querySelector('h2');
                const bodyElement = messageElement.querySelector('[data-message-id] div[dir="ltr"]');

                if (senderElement && subjectElement) {
                    const emailData = {
                        id: messageId,
                        from: senderElement.getAttribute('email'),
                        subject: subjectElement.textContent,
                        body: bodyElement ? bodyElement.textContent : '',
                        timestamp: Date.now(),
                        isUnread: messageElement.querySelector('[aria-label*="Unread"]') !== null
                    };

                    // Send email data to content script
                    window.postMessage({
                        type: 'EMAIL_DETECTED',
                        email: emailData
                    }, '*');
                }
            } catch (error) {
                console.error('Error processing email message:', error);
            }
        }
    };

    // Enhanced email detection for Outlook
    const OutlookEmailDetector = {
        detectEmailView: () => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Look for Outlook email items
                            const emailItems = node.querySelectorAll('[role="listitem"]');
                            emailItems.forEach(this.processOutlookEmail);
                        }
                    });
                });
            });

            const mailList = document.querySelector('[role="tree"]') || document.querySelector('[role="list"]');
            if (mailList) {
                observer.observe(mailList, { childList: true, subtree: true });
            }
        },

        processOutlookEmail: (emailElement) => {
            try {
                // Extract Outlook email details
                const senderElement = emailElement.querySelector('[title*="@"]');
                const subjectElement = emailElement.querySelector('[role="button"] span');

                if (senderElement && subjectElement) {
                    const emailData = {
                        id: 'outlook_' + Date.now(),
                        from: senderElement.title,
                        subject: subjectElement.textContent,
                        timestamp: Date.now(),
                        isUnread: emailElement.classList.contains('unread') ||
                            emailElement.querySelector('[aria-label*="unread"]') !== null
                    };

                    window.postMessage({
                        type: 'EMAIL_DETECTED',
                        email: emailData
                    }, '*');
                }
            } catch (error) {
                console.error('Error processing Outlook email:', error);
            }
        }
    };

    // Universal email sender
    const EmailSender = {
        sendAutoReply: async (emailData, template) => {
            try {
                let result;

                if (GmailAPI.isGmail()) {
                    result = await GmailAPI.sendReply(emailData, template.body, template.subject);
                } else if (OutlookAPI.isOutlook()) {
                    result = await OutlookAPI.sendReply(emailData, template.body, template.subject);
                } else {
                    throw new Error('Unsupported email platform');
                }

                // Notify content script of send result
                window.postMessage({
                    type: 'EMAIL_SENT',
                    result: result,
                    originalEmail: emailData,
                    template: template
                }, '*');

                return result;
            } catch (error) {
                console.error('Error sending auto reply:', error);
                window.postMessage({
                    type: 'EMAIL_SEND_ERROR',
                    error: error.message,
                    originalEmail: emailData,
                    template: template
                }, '*');
                return { success: false, error: error.message };
            }
        }
    };

    // Message handler for communication with content script
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        switch (event.data.type) {
            case 'SEND_AUTO_REPLY':
                EmailSender.sendAutoReply(event.data.email, event.data.template);
                break;

            case 'GET_USER_EMAIL':
                const userEmail = GmailAPI.isGmail() ? GmailAPI.getUserEmail() : null;
                window.postMessage({
                    type: 'USER_EMAIL_RESPONSE',
                    email: userEmail
                }, '*');
                break;

            case 'INIT_EMAIL_DETECTION':
                if (GmailAPI.isGmail()) {
                    GmailEmailDetector.detectEmailView();
                    GmailAPI.hookSendEmail();
                } else if (OutlookAPI.isOutlook()) {
                    OutlookEmailDetector.detectEmailView();
                    OutlookAPI.hookSendEmail();
                }
                break;
        }
    });

    // Initialize email detection based on current platform
    function initializePlatform() {
        setTimeout(() => {
            if (GmailAPI.isGmail()) {
                console.log('Initializing Gmail integration');
                GmailEmailDetector.detectEmailView();
                GmailAPI.hookSendEmail();
            } else if (OutlookAPI.isOutlook()) {
                console.log('Initializing Outlook integration');
                OutlookEmailDetector.detectEmailView();
                OutlookAPI.hookSendEmail();
            }
        }, 2000); // Wait for page to fully load
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePlatform);
    } else {
        initializePlatform();
    }

    console.log('Email Auto Responder injected script loaded');
})();