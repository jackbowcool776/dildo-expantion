// ==UserScript==
// @name         EasyXL
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  EasyXL - Unified IXL Solver with configurable AI providers
// @author       You
// @match        *://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
// @resource     KATEX_CSS https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      generativelanguage.googleapis.com
// @connect      api.deepseek.com
// @connect      api.kourichat.com
// @connect      api.groq.com
// ==/UserScript==

(function() {
    'use strict';

    if (typeof GM_addStyle !== 'undefined' && typeof GM_getResourceText !== 'undefined') {
        const css = GM_getResourceText('KATEX_CSS');
        if (css) GM_addStyle(css);
    } else {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
        document.head.appendChild(link);
    }

    const UI_ID = 'easyxl-ui';
    const STORAGE_KEY_SETTINGS = 'easyxl_unified_settings';
    const QUESTION_SELECTORS = [
        'section.ixl-practice-crate',
        'section.question-and-submission-view',
        'section.question-view'
    ];
    const CUSTOM_MODEL_VALUE = '__custom__';
    const PROVIDERS = {
        openai: {
            label: 'OpenAI',
            kind: 'openai',
            defaultModel: 'llama-3.3-70b-versatile',
            defaultBaseUrl: 'https://api.groq.com/openai/v1/chat/completions',
            models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gpt-4o', 'gpt-4o-mini'],
            apiKeyPlaceholder: 'Enter Groq or OpenAI API Key',
            baseUrlPlaceholder: 'https://api.groq.com/openai/v1/chat/completions',
            notesPlaceholder: 'Add Custom Instructions. e.g. Only output the final answer...'
        },
        anthropic: {
            label: 'Anthropic',
            kind: 'anthropic',
            defaultModel: 'claude-3-7-sonnet-latest',
            defaultBaseUrl: 'https://api.anthropic.com/v1/messages',
            models: ['claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
            apiKeyPlaceholder: 'Enter Anthropic API Key',
            baseUrlPlaceholder: 'https://api.anthropic.com/v1/messages',
            notesPlaceholder: 'Add Custom Instructions. e.g. Only output the final answer...'
        },
        google: {
            label: 'Google',
            kind: 'google',
            defaultModel: 'gemini-2.0-flash',
            defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
            models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
            apiKeyPlaceholder: 'Enter Google AI API Key',
            baseUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta/models',
            notesPlaceholder: 'Add Custom Instructions. e.g. Only output the final answer...'
        },
        deepseek: {
            label: 'DeepSeek',
            kind: 'openai',
            defaultModel: 'deepseek-chat',
            defaultBaseUrl: 'https://api.deepseek.com/chat/completions',
            fallbackBaseUrl: 'https://api.deepseek.com/v1/chat/completions',
            models: ['deepseek-chat', 'deepseek-reasoner'],
            apiKeyPlaceholder: 'Enter DeepSeek API Key',
            baseUrlPlaceholder: 'https://api.deepseek.com/chat/completions',
            notesPlaceholder: 'Add Custom Instructions. e.g. Only output the final answer...'
        },
        kouri: {
            label: 'Kouri',
            kind: 'openai',
            defaultModel: 'gpt-4o',
            defaultBaseUrl: 'https://api.kourichat.com/v1/chat/completions',
            models: ['gpt-4o', 'deepseek-chat', 'claude-3-5-sonnet-latest', 'deepseek-v3', 'deepseek-v3.1', 'deepseek-v3.2', 'gpt-5', 'gpt-5-chat'],
            apiKeyPlaceholder: 'Enter Kouri API Key',
            baseUrlPlaceholder: 'https://api.kourichat.com/v1/chat/completions',
            notesPlaceholder: 'Add Custom Instructions. e.g. Only output the final answer...'
        }
    };

    if (document.getElementById(UI_ID)) {
        console.log('EasyXL UI is already open.');
        return;
    }

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createDefaultProviderSettings(providerId) {
        const provider = PROVIDERS[providerId];
        return {
            apiKey: '',
            model: provider.defaultModel,
            baseUrl: provider.defaultBaseUrl,
            notes: ''
        };
    }

    function createDefaultSettings() {
        const providers = {};
        Object.keys(PROVIDERS).forEach((providerId) => {
            providers[providerId] = createDefaultProviderSettings(providerId);
        });
        return {
            selectedProvider: 'openai',
            providers
        };
    }

    function pickInitialProvider(providers) {
        const providerIds = ['openai', 'anthropic', 'google', 'deepseek', 'kouri'];
        for (const providerId of providerIds) {
            if (providers[providerId] && providers[providerId].apiKey) {
                return providerId;
            }
        }
        return 'openai';
    }

    function buildLegacySettings() {
        const settings = createDefaultSettings();
        settings.providers.openai = {
            apiKey: localStorage.getItem('easyxl_openai_api_key') || '',
            model: localStorage.getItem('easyxl_openai_model') || PROVIDERS.openai.defaultModel,
            baseUrl: PROVIDERS.openai.defaultBaseUrl,
            notes: localStorage.getItem('easyxl_openai_notes') || ''
        };
        settings.providers.google = {
            apiKey: localStorage.getItem('easyxl_gemini_api_key') || '',
            model: localStorage.getItem('easyxl_gemini_model') || PROVIDERS.google.defaultModel,
            baseUrl: PROVIDERS.google.defaultBaseUrl,
            notes: localStorage.getItem('easyxl_gemini_notes') || ''
        };
        settings.providers.deepseek = {
            apiKey: localStorage.getItem('easyxl_deepseek_api_key') || '',
            model: localStorage.getItem('easyxl_deepseek_model') || PROVIDERS.deepseek.defaultModel,
            baseUrl: PROVIDERS.deepseek.defaultBaseUrl,
            notes: localStorage.getItem('easyxl_deepseek_notes') || ''
        };
        settings.providers.kouri = {
            apiKey: localStorage.getItem('easyxl_kouri_api_key') || '',
            model: localStorage.getItem('easyxl_kouri_model') || PROVIDERS.kouri.defaultModel,
            baseUrl: PROVIDERS.kouri.defaultBaseUrl,
            notes: localStorage.getItem('easyxl_kouri_notes') || ''
        };
        settings.selectedProvider = pickInitialProvider(settings.providers);
        return settings;
    }

    function mergeSettings(rawSettings) {
        const merged = createDefaultSettings();
        if (!rawSettings || typeof rawSettings !== 'object') {
            return merged;
        }
        const selectedProvider = rawSettings.selectedProvider;
        if (selectedProvider && PROVIDERS[selectedProvider]) {
            merged.selectedProvider = selectedProvider;
        }
        const incomingProviders = rawSettings.providers || {};
        Object.keys(PROVIDERS).forEach((providerId) => {
            const incoming = incomingProviders[providerId] || {};
            merged.providers[providerId] = {
                apiKey: typeof incoming.apiKey === 'string' ? incoming.apiKey : '',
                model: typeof incoming.model === 'string' && incoming.model.trim() ? incoming.model.trim() : PROVIDERS[providerId].defaultModel,
                baseUrl: typeof incoming.baseUrl === 'string' && incoming.baseUrl.trim() ? incoming.baseUrl.trim() : PROVIDERS[providerId].defaultBaseUrl,
                notes: typeof incoming.notes === 'string' ? incoming.notes : ''
            };
        });
        return merged;
    }

    function loadSettings() {
        const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (!saved) {
            const legacySettings = buildLegacySettings();
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(legacySettings));
            return legacySettings;
        }
        try {
            const parsed = JSON.parse(saved);
            const merged = mergeSettings(parsed);
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(merged));
            return merged;
        } catch (error) {
            const legacySettings = buildLegacySettings();
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(legacySettings));
            return legacySettings;
        }
    }

    let settings = loadSettings();

    function saveSettings() {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    }

    function getProviderConfig(providerId = settings.selectedProvider) {
        return settings.providers[providerId];
    }

    function getCurrentProvider() {
        return PROVIDERS[settings.selectedProvider];
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeUrl(url) {
        return String(url || '').trim().replace(/\/+$/, '');
    }

    function extractApiErrorMessage(responseText) {
        try {
            const parsed = JSON.parse(responseText);
            return parsed.error?.message || parsed.message || parsed.error?.type || responseText;
        } catch (error) {
            return responseText;
        }
    }

    // ── NEW: strip HTML down to clean question text ──────────────────────────
    function extractQuestionText(section) {
        // Clone so we don't modify the real page
        const clone = section.cloneNode(true);

        // Remove elements that are never part of the question
        const removeSelectors = [
            'script', 'style', 'noscript', 'svg', 'iframe',
            'button', 'input', 'select', 'textarea',
            '[aria-hidden="true"]',
            '.sr-only', '.visually-hidden',
            'nav', 'header', 'footer'
        ];
        removeSelectors.forEach(sel => {
            clone.querySelectorAll(sel).forEach(el => el.remove());
        });

        // Get plain text, collapse whitespace
        const raw = clone.innerText || clone.textContent || '';
        return raw.replace(/\s+/g, ' ').trim();
    }
    // ────────────────────────────────────────────────────────────────────────

    const ui = document.createElement('div');
    ui.id = UI_ID;
    ui.style.position = 'fixed';
    ui.style.bottom = '20px';
    ui.style.right = '20px';
    ui.style.width = '380px';
    ui.style.background = 'linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0.58) 100%)';
    ui.style.border = '1px solid rgba(255, 255, 255, 0.45)';
    ui.style.borderRadius = '16px';
    ui.style.boxShadow = '0 18px 55px rgba(2, 6, 23, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.40)';
    ui.style.backdropFilter = 'blur(18px) saturate(180%)';
    ui.style.webkitBackdropFilter = 'blur(18px) saturate(180%)';
    ui.style.zIndex = '999999';
    ui.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, 'Noto Sans', 'Helvetica Neue', sans-serif";
    ui.style.boxSizing = 'border-box';
    ui.style.padding = '14px';
    ui.style.display = 'flex';
    ui.style.flexDirection = 'column';
    ui.style.gap = '10px';
    ui.style.color = '#0f172a';
    ui.style.overflow = 'hidden';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.paddingBottom = '10px';
    header.style.borderBottom = '1px solid rgba(148, 163, 184, 0.25)';

    const titleWrap = document.createElement('div');
    titleWrap.style.display = 'flex';
    titleWrap.style.alignItems = 'center';
    titleWrap.style.gap = '10px';

    const title = document.createElement('div');
    title.innerText = 'EasyXL';
    title.style.margin = '0';
    title.style.fontSize = '14px';
    title.style.fontWeight = '700';
    title.style.letterSpacing = '0.2px';

    const badge = document.createElement('span');
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '700';
    badge.style.padding = '3px 8px';
    badge.style.borderRadius = '999px';
    badge.style.background = 'rgba(37, 99, 235, 0.10)';
    badge.style.color = '#1d4ed8';
    badge.style.border = '1px solid rgba(37, 99, 235, 0.18)';

    const actionWrap = document.createElement('div');
    actionWrap.style.display = 'flex';
    actionWrap.style.alignItems = 'center';
    actionWrap.style.gap = '8px';

    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.innerText = '⚙';
    settingsButton.title = 'Settings';
    settingsButton.style.width = '34px';
    settingsButton.style.height = '34px';
    settingsButton.style.borderRadius = '999px';
    settingsButton.style.border = '1px solid rgba(148, 163, 184, 0.30)';
    settingsButton.style.background = 'rgba(255, 255, 255, 0.55)';
    settingsButton.style.cursor = 'pointer';
    settingsButton.style.fontSize = '16px';
    settingsButton.style.fontWeight = '700';
    settingsButton.style.color = '#0f172a';
    settingsButton.style.boxShadow = '0 8px 18px rgba(15, 23, 42, 0.08)';

    titleWrap.appendChild(title);
    titleWrap.appendChild(badge);
    actionWrap.appendChild(settingsButton);
    header.appendChild(titleWrap);
    header.appendChild(actionWrap);
    ui.appendChild(header);

    function applyFieldStyle(el) {
        el.style.width = '100%';
        el.style.padding = '10px 10px';
        el.style.border = '1px solid rgba(255, 255, 255, 0.55)';
        el.style.borderRadius = '12px';
        el.style.background = 'rgba(255, 255, 255, 0.55)';
        el.style.color = '#0f172a';
        el.style.outline = 'none';
        el.style.boxSizing = 'border-box';
        el.style.fontSize = '13px';
    }

    function addFocusRing(el) {
        el.addEventListener('focus', () => {
            el.style.borderColor = 'rgba(37, 99, 235, 0.65)';
            el.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.16)';
        });
        el.addEventListener('blur', () => {
            el.style.borderColor = 'rgba(148, 163, 184, 0.45)';
            el.style.boxShadow = 'none';
        });
    }

    function createLabel(text) {
        const label = document.createElement('label');
        label.innerText = text;
        label.style.display = 'block';
        label.style.fontSize = '12px';
        label.style.fontWeight = '600';
        label.style.color = '#334155';
        label.style.marginBottom = '5px';
        return label;
    }

    const notesLabel = createLabel('User Notes');
    ui.appendChild(notesLabel);

    const notesInput = document.createElement('textarea');
    notesInput.style.height = '66px';
    notesInput.style.resize = 'vertical';
    applyFieldStyle(notesInput);
    addFocusRing(notesInput);
    notesInput.addEventListener('input', () => {
        getProviderConfig().notes = notesInput.value;
        saveSettings();
    });
    ui.appendChild(notesInput);

    const parseBtn = document.createElement('button');
    parseBtn.type = 'button';
    parseBtn.innerText = 'Parse and Solve';
    parseBtn.style.padding = '10px 12px';
    parseBtn.style.border = '1px solid rgba(30, 64, 175, 0.20)';
    parseBtn.style.borderRadius = '12px';
    parseBtn.style.cursor = 'pointer';
    parseBtn.style.fontWeight = '700';
    parseBtn.style.letterSpacing = '0.2px';
    parseBtn.style.color = '#ffffff';
    parseBtn.style.background = 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)';
    parseBtn.style.boxShadow = '0 10px 24px rgba(37, 99, 235, 0.22)';
    parseBtn.style.transition = 'transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease';
    parseBtn.onmouseover = () => {
        if (parseBtn.disabled) return;
        parseBtn.style.filter = 'brightness(1.03)';
        parseBtn.style.transform = 'translateY(-1px)';
        parseBtn.style.boxShadow = '0 14px 30px rgba(37, 99, 235, 0.24)';
    };
    parseBtn.onmouseout = () => {
        parseBtn.style.filter = 'none';
        parseBtn.style.transform = 'none';
        parseBtn.style.boxShadow = '0 10px 24px rgba(37, 99, 235, 0.22)';
    };
    ui.appendChild(parseBtn);

    const resultArea = document.createElement('div');
    resultArea.style.height = '180px';
    resultArea.style.overflowY = 'auto';
    resultArea.style.wordWrap = 'break-word';
    resultArea.innerHTML = '<span style="color: #64748b;">Results will be displayed here...</span>';
    resultArea.style.fontSize = '14px';
    resultArea.style.lineHeight = '1.5';
    resultArea.style.userSelect = 'text';
    applyFieldStyle(resultArea);
    ui.appendChild(resultArea);

    const settingsOverlay = document.createElement('div');
    settingsOverlay.style.position = 'absolute';
    settingsOverlay.style.inset = '0';
    settingsOverlay.style.background = 'rgba(15, 23, 42, 0.16)';
    settingsOverlay.style.display = 'none';
    settingsOverlay.style.alignItems = 'stretch';
    settingsOverlay.style.justifyContent = 'flex-end';
    settingsOverlay.style.zIndex = '2';

    const settingsPanel = document.createElement('div');
    settingsPanel.style.width = '100%';
    settingsPanel.style.height = '100%';
    settingsPanel.style.background = 'linear-gradient(180deg, rgba(248, 250, 252, 0.92) 0%, rgba(241, 245, 249, 0.88) 100%)';
    settingsPanel.style.backdropFilter = 'blur(18px) saturate(180%)';
    settingsPanel.style.webkitBackdropFilter = 'blur(18px) saturate(180%)';
    settingsPanel.style.padding = '14px';
    settingsPanel.style.boxSizing = 'border-box';
    settingsPanel.style.display = 'flex';
    settingsPanel.style.flexDirection = 'column';
    settingsPanel.style.gap = '10px';
    settingsPanel.style.overflowY = 'auto';

    const settingsHeader = document.createElement('div');
    settingsHeader.style.display = 'flex';
    settingsHeader.style.justifyContent = 'space-between';
    settingsHeader.style.alignItems = 'center';

    const settingsTitle = document.createElement('div');
    settingsTitle.innerText = 'Settings';
    settingsTitle.style.fontSize = '15px';
    settingsTitle.style.fontWeight = '700';
    settingsTitle.style.color = '#0f172a';

    const settingsCloseBtn = document.createElement('button');
    settingsCloseBtn.type = 'button';
    settingsCloseBtn.innerText = '×';
    settingsCloseBtn.title = 'Close Settings';
    settingsCloseBtn.style.width = '34px';
    settingsCloseBtn.style.height = '34px';
    settingsCloseBtn.style.borderRadius = '999px';
    settingsCloseBtn.style.border = '1px solid rgba(148, 163, 184, 0.30)';
    settingsCloseBtn.style.background = 'rgba(255, 255, 255, 0.72)';
    settingsCloseBtn.style.cursor = 'pointer';
    settingsCloseBtn.style.fontSize = '20px';
    settingsCloseBtn.style.lineHeight = '1';
    settingsCloseBtn.style.color = '#0f172a';

    settingsHeader.appendChild(settingsTitle);
    settingsHeader.appendChild(settingsCloseBtn);
    settingsPanel.appendChild(settingsHeader);

    const settingsMessage = document.createElement('div');
    settingsMessage.style.display = 'none';
    settingsMessage.style.padding = '10px 12px';
    settingsMessage.style.borderRadius = '12px';
    settingsMessage.style.fontSize = '12px';
    settingsMessage.style.lineHeight = '1.45';
    settingsPanel.appendChild(settingsMessage);

    const providerLabel = createLabel('Provider');
    const providerSelect = document.createElement('select');
    applyFieldStyle(providerSelect);
    addFocusRing(providerSelect);
    Object.keys(PROVIDERS).forEach((providerId) => {
        const option = document.createElement('option');
        option.value = providerId;
        option.textContent = PROVIDERS[providerId].label;
        providerSelect.appendChild(option);
    });
    settingsPanel.appendChild(providerLabel);
    settingsPanel.appendChild(providerSelect);

    const apiKeyLabel = createLabel('API Key');
    const apiKeyInput = document.createElement('input');
    apiKeyInput.type = 'text';
    applyFieldStyle(apiKeyInput);
    addFocusRing(apiKeyInput);
    settingsPanel.appendChild(apiKeyLabel);
    settingsPanel.appendChild(apiKeyInput);

    const baseUrlLabel = createLabel('Base URL');
    const baseUrlInput = document.createElement('input');
    baseUrlInput.type = 'text';
    applyFieldStyle(baseUrlInput);
    addFocusRing(baseUrlInput);
    settingsPanel.appendChild(baseUrlLabel);
    settingsPanel.appendChild(baseUrlInput);

    const modelLabel = createLabel('Model');
    const modelSelect = document.createElement('select');
    applyFieldStyle(modelSelect);
    addFocusRing(modelSelect);

    const customModelInput = document.createElement('input');
    customModelInput.type = 'text';
    applyFieldStyle(customModelInput);
    addFocusRing(customModelInput);
    customModelInput.style.display = 'none';

    settingsPanel.appendChild(modelLabel);
    settingsPanel.appendChild(modelSelect);
    settingsPanel.appendChild(customModelInput);

    const settingsHint = document.createElement('div');
    settingsHint.style.fontSize = '12px';
    settingsHint.style.lineHeight = '1.5';
    settingsHint.style.color = '#475569';
    settingsPanel.appendChild(settingsHint);

    settingsOverlay.appendChild(settingsPanel);
    ui.appendChild(settingsOverlay);
    document.body.appendChild(ui);

    function showSettingsMessage(message, isError = true) {
        settingsMessage.style.display = 'block';
        settingsMessage.style.background = isError ? 'rgba(254, 226, 226, 0.92)' : 'rgba(219, 234, 254, 0.92)';
        settingsMessage.style.border = isError ? '1px solid rgba(248, 113, 113, 0.35)' : '1px solid rgba(96, 165, 250, 0.35)';
        settingsMessage.style.color = isError ? '#991b1b' : '#1d4ed8';
        settingsMessage.innerText = message;
    }

    function clearSettingsMessage() {
        settingsMessage.style.display = 'none';
        settingsMessage.innerText = '';
    }

    function updateBadgeAndNotes() {
        const provider = getCurrentProvider();
        const config = getProviderConfig();
        badge.innerText = provider.label;
        notesLabel.innerText = `User Notes (${provider.label})`;
        notesInput.placeholder = provider.notesPlaceholder;
        notesInput.value = config.notes || '';
    }

    function renderModelSelect(providerId, modelValue) {
        const provider = PROVIDERS[providerId];
        modelSelect.innerHTML = '';
        provider.models.forEach((model) => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });
        const customOption = document.createElement('option');
        customOption.value = CUSTOM_MODEL_VALUE;
        customOption.textContent = 'Custom Model';
        modelSelect.appendChild(customOption);
        if (provider.models.includes(modelValue)) {
            modelSelect.value = modelValue;
            customModelInput.style.display = 'none';
            customModelInput.value = '';
        } else {
            modelSelect.value = CUSTOM_MODEL_VALUE;
            customModelInput.style.display = 'block';
            customModelInput.value = modelValue;
        }
    }

    function renderSettingsPanel() {
        const providerId = settings.selectedProvider;
        const provider = PROVIDERS[providerId];
        const config = getProviderConfig(providerId);
        providerSelect.value = providerId;
        apiKeyInput.placeholder = provider.apiKeyPlaceholder;
        apiKeyInput.value = config.apiKey || '';
        baseUrlInput.placeholder = provider.baseUrlPlaceholder;
        baseUrlInput.value = config.baseUrl || provider.defaultBaseUrl;
        customModelInput.placeholder = `Input Custom Model (${provider.label})`;
        renderModelSelect(providerId, config.model || provider.defaultModel);
        settingsHint.innerText = `Current Provider: ${provider.label}. If requests fail, check API Key, model, and base URL.`;
    }

    function openSettings(message) {
        renderSettingsPanel();
        if (message) {
            showSettingsMessage(message, true);
        }
        settingsOverlay.style.display = 'flex';
    }

    function closeSettings() {
        settingsOverlay.style.display = 'none';
    }

    function validateConfig(providerId) {
        const provider = PROVIDERS[providerId];
        const config = getProviderConfig(providerId);
        if (!config.apiKey.trim()) {
            return `${provider.label} API Key cannot be empty.`;
        }
        if (!config.model.trim()) {
            return `${provider.label} Model cannot be empty.`;
        }
        if (!config.baseUrl.trim()) {
            return `${provider.label} Base URL cannot be empty.`;
        }
        try {
            new URL(config.baseUrl.trim());
        } catch (error) {
            return `${provider.label} Base URL format is invalid.`;
        }
        return '';
    }

    function renderMarkdownWithMath(text) {
        if (!text) return '';
        const mathBlocks = [];
        let processedText = text;

        processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, (match, value) => {
            mathBlocks.push({ type: 'block', text: value });
            return `%%%MATH_BLOCK_${mathBlocks.length - 1}%%%`;
        });
        processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, value) => {
            mathBlocks.push({ type: 'block', text: value });
            return `%%%MATH_BLOCK_${mathBlocks.length - 1}%%%`;
        });
        processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, (match, value) => {
            mathBlocks.push({ type: 'inline', text: value });
            return `%%%MATH_INLINE_${mathBlocks.length - 1}%%%`;
        });
        processedText = processedText.replace(/(^|[^\\])\$([^\$]+?)\$/g, (match, prefix, value) => {
            mathBlocks.push({ type: 'inline', text: value });
            return `${prefix}%%%MATH_INLINE_${mathBlocks.length - 1}%%%`;
        });

        let html = '';
        if (typeof marked !== 'undefined') {
            html = marked.parse(processedText);
        } else {
            html = processedText.replace(/\n/g, '<br>');
        }

        if (typeof katex !== 'undefined') {
            html = html.replace(/%%%MATH_BLOCK_(\d+)%%%/g, (match, index) => {
                const block = mathBlocks[index];
                try {
                    return katex.renderToString(block.text, { displayMode: true, throwOnError: false });
                } catch (error) {
                    return `\\[${block.text}\\]`;
                }
            });
            html = html.replace(/%%%MATH_INLINE_(\d+)%%%/g, (match, index) => {
                const block = mathBlocks[index];
                try {
                    return katex.renderToString(block.text, { displayMode: false, throwOnError: false });
                } catch (error) {
                    return `\\(${block.text}\\)`;
                }
            });
        } else {
            html = html.replace(/%%%MATH_BLOCK_(\d+)%%%/g, (match, index) => `\\[${mathBlocks[index].text}\\]`);
            html = html.replace(/%%%MATH_INLINE_(\d+)%%%/g, (match, index) => `\\(${mathBlocks[index].text}\\)`);
        }

        return html;
    }

    function setResult(content, isError = false) {
        if (isError) {
            resultArea.innerHTML = `<span style="color: #ef4444; font-weight: 500;">${escapeHtml(content).replace(/\n/g, '<br>')}</span>`;
            return;
        }
        resultArea.innerHTML = renderMarkdownWithMath(content);
    }

    function setButtonIdle() {
        parseBtn.innerText = 'Parse and Solve';
        parseBtn.disabled = false;
        parseBtn.style.background = 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)';
        parseBtn.style.boxShadow = '0 10px 24px rgba(37, 99, 235, 0.22)';
    }

    function setButtonBusy() {
        parseBtn.innerText = 'Solving Math...';
        parseBtn.disabled = true;
        parseBtn.style.background = 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
        parseBtn.style.boxShadow = 'none';
        parseBtn.style.transform = 'none';
        parseBtn.style.filter = 'none';
    }

    function findQuestionSection() {
        for (const selector of QUESTION_SELECTORS) {
            const section = document.querySelector(selector);
            if (section) {
                return section;
            }
        }
        return null;
    }

    function buildPrompts(questionText, notes) {
        const systemPrompt = 'You are an expert math solver. Your task is to: 1. Read the question text carefully and determine the exact math problem. 2. Solve the problem step-by-step. Follow standard order of operations. Write down your solving steps. 3. Format your final output: You MUST enclose your final, concise answer within <answer>...</answer> tags. For example: <answer>42</answer> or <answer>x = 5</answer>.';
        let userPrompt = `--- QUESTION ---\n${questionText}\n--- END QUESTION ---`;
        if (notes.trim()) {
            userPrompt += `\n\n--- USER ADDITIONAL NOTES ---\n${notes.trim()}\n--- END USER ADDITIONAL NOTES ---`;
        }
        return { systemPrompt, userPrompt };
    }

    function extractAnswer(text) {
        const match = String(text || '').match(/<answer>([\s\S]*?)<\/answer>/i);
        return match ? match[1].trim() : String(text || '').trim();
    }

    function sendRequest(url, headers, payload) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url,
                headers,
                data: JSON.stringify(payload),
                onload: resolve,
                onerror: () => reject(new Error('network_error'))
            });
        });
    }

    async function requestOpenAICompatible(providerId, config, systemPrompt, userPrompt) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        };
        const payload = {
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.0
        };
        let response = await sendRequest(config.baseUrl, headers, payload);
        if (providerId === 'deepseek' && response.status === 404 && normalizeUrl(config.baseUrl) === normalizeUrl(PROVIDERS.deepseek.defaultBaseUrl)) {
            response = await sendRequest(PROVIDERS.deepseek.fallbackBaseUrl, headers, payload);
        }
        if (response.status < 200 || response.status >= 300) {
            throw new Error(extractApiErrorMessage(response.responseText));
        }
        const data = JSON.parse(response.responseText);
        return data.choices?.[0]?.message?.content?.trim?.() || response.responseText;
    }

    async function requestGoogle(config, systemPrompt, userPrompt) {
        const baseUrl = normalizeUrl(config.baseUrl);
        const url = `${baseUrl}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
        const payload = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
                }
            ],
            generationConfig: {
                temperature: 0.0
            }
        };
        const response = await sendRequest(url, { 'Content-Type': 'application/json' }, payload);
        if (response.status < 200 || response.status >= 300) {
            throw new Error(extractApiErrorMessage(response.responseText));
        }
        const data = JSON.parse(response.responseText);
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim();
        return text || response.responseText;
    }

    async function requestAnthropic(config, systemPrompt, userPrompt) {
        const payload = {
            model: config.model,
            max_tokens: 1024,
            temperature: 0.0,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: userPrompt
                }
            ]
        };
        const response = await sendRequest(config.baseUrl, {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        }, payload);
        if (response.status < 200 || response.status >= 300) {
            throw new Error(extractApiErrorMessage(response.responseText));
        }
        const data = JSON.parse(response.responseText);
        const text = Array.isArray(data.content)
            ? data.content.filter((item) => item.type === 'text').map((item) => item.text || '').join('\n').trim()
            : '';
        return text || response.responseText;
    }

    async function requestByProvider(providerId, config, systemPrompt, userPrompt) {
        if (providerId === 'google') {
            return requestGoogle(config, systemPrompt, userPrompt);
        }
        if (providerId === 'anthropic') {
            return requestAnthropic(config, systemPrompt, userPrompt);
        }
        return requestOpenAICompatible(providerId, config, systemPrompt, userPrompt);
    }

    async function solveQuestion() {
        if (typeof GM_xmlhttpRequest === 'undefined') {
            const message = 'GM_xmlhttpRequest is not available. Please run the script in Tampermonkey.';
            setResult(message, true);
            openSettings(message);
            return;
        }

        const providerId = settings.selectedProvider;
        const provider = PROVIDERS[providerId];
        const config = deepClone(getProviderConfig(providerId));
        const validationMessage = validateConfig(providerId);
        if (validationMessage) {
            setResult(validationMessage, true);
            openSettings(`${validationMessage} Please correct the settings and try again.`);
            return;
        }

        const section = findQuestionSection();
        if (!section) {
            setResult('No question found. Please make sure you are on an IXL practice problem.', true);
            return;
        }

        clearSettingsMessage();
        setButtonBusy();
        setResult('Sending request to the AI...');

        try {
            // Use clean text instead of raw HTML
            const questionText = extractQuestionText(section);
            const { systemPrompt, userPrompt } = buildPrompts(questionText, config.notes || '');
            const text = await requestByProvider(providerId, config, systemPrompt, userPrompt);
            const answer = extractAnswer(text);
            setResult(answer || text);
        } catch (error) {
            const message = `${provider.label} request failed: ${error.message || 'Unknown error'}. Please check API Key, model, and base URL.`;
            setResult(message, true);
            openSettings(message);
        } finally {
            setButtonIdle();
        }
    }

    providerSelect.addEventListener('change', () => {
        settings.selectedProvider = providerSelect.value;
        saveSettings();
        clearSettingsMessage();
        updateBadgeAndNotes();
        renderSettingsPanel();
    });

    apiKeyInput.addEventListener('input', () => {
        getProviderConfig(providerSelect.value).apiKey = apiKeyInput.value;
        saveSettings();
    });

    baseUrlInput.addEventListener('input', () => {
        getProviderConfig(providerSelect.value).baseUrl = baseUrlInput.value;
        saveSettings();
    });

    modelSelect.addEventListener('change', () => {
        const config = getProviderConfig(providerSelect.value);
        if (modelSelect.value === CUSTOM_MODEL_VALUE) {
            customModelInput.style.display = 'block';
            config.model = customModelInput.value.trim() || config.model || PROVIDERS[providerSelect.value].defaultModel;
        } else {
            customModelInput.style.display = 'none';
            config.model = modelSelect.value;
        }
        saveSettings();
        renderSettingsPanel();
    });

    customModelInput.addEventListener('input', () => {
        if (modelSelect.value !== CUSTOM_MODEL_VALUE) return;
        getProviderConfig(providerSelect.value).model = customModelInput.value.trim();
        saveSettings();
    });

    settingsButton.addEventListener('click', () => {
        clearSettingsMessage();
        openSettings();
    });

    settingsCloseBtn.addEventListener('click', closeSettings);

    settingsOverlay.addEventListener('click', (event) => {
        if (event.target === settingsOverlay) {
            closeSettings();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && settingsOverlay.style.display !== 'none') {
            closeSettings();
        }
    });

    parseBtn.addEventListener('click', solveQuestion);

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    header.style.cursor = 'grab';
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', drag);

    function dragStart(event) {
        initialX = event.clientX - xOffset;
        initialY = event.clientY - yOffset;
        if (event.target === header || event.target === title || event.target === badge || event.target === titleWrap) {
            isDragging = true;
            header.style.cursor = 'grabbing';
        }
    }

    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        header.style.cursor = 'grab';
    }

    function drag(event) {
        if (!isDragging) return;
        event.preventDefault();
        currentX = event.clientX - initialX;
        currentY = event.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        ui.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }

    let ctrlDown = false;
    let ctrlUsedAsModifier = false;

    document.addEventListener('keydown', (event) => {
        if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
            if (!event.repeat) {
                ctrlDown = true;
                ctrlUsedAsModifier = false;
            }
            return;
        }
        if (ctrlDown) {
            ctrlUsedAsModifier = true;
        }
    });

    document.addEventListener('keyup', (event) => {
        if (event.code !== 'ControlLeft' && event.code !== 'ControlRight') return;
        if (ctrlDown && !ctrlUsedAsModifier) {
            ui.style.display = ui.style.display === 'none' ? 'flex' : 'none';
        }
        ctrlDown = false;
        ctrlUsedAsModifier = false;
    });

    updateBadgeAndNotes();
    renderSettingsPanel();

    console.log('EasyXL unified userscript loaded successfully.');
})();