// ==UserScript==
// @name         EasyXL
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  EasyXL - Unified IXL Solver with vision support
// @author       You
// @match        *://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
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
            defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
            defaultBaseUrl: 'https://api.groq.com/openai/v1/chat/completions',
            models: ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gpt-4o', 'gpt-4o-mini'],
            apiKeyPlaceholder: 'Enter Groq or OpenAI API Key',
            baseUrlPlaceholder: 'https://api.groq.com/openai/v1/chat/completions',
            notesPlaceholder: 'Extra instructions e.g. show steps...'
        },
        anthropic: {
            label: 'Anthropic',
            kind: 'anthropic',
            defaultModel: 'claude-3-7-sonnet-latest',
            defaultBaseUrl: 'https://api.anthropic.com/v1/messages',
            models: ['claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
            apiKeyPlaceholder: 'Enter Anthropic API Key',
            baseUrlPlaceholder: 'https://api.anthropic.com/v1/messages',
            notesPlaceholder: 'Extra instructions e.g. show steps...'
        },
        google: {
            label: 'Google',
            kind: 'google',
            defaultModel: 'gemini-2.0-flash',
            defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
            models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
            apiKeyPlaceholder: 'Enter Google AI API Key',
            baseUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta/models',
            notesPlaceholder: 'Extra instructions e.g. show steps...'
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
            notesPlaceholder: 'Extra instructions e.g. show steps...'
        },
        kouri: {
            label: 'Kouri',
            kind: 'openai',
            defaultModel: 'gpt-4o',
            defaultBaseUrl: 'https://api.kourichat.com/v1/chat/completions',
            models: ['gpt-4o', 'deepseek-chat', 'claude-3-5-sonnet-latest', 'deepseek-v3', 'deepseek-v3.1', 'deepseek-v3.2', 'gpt-5', 'gpt-5-chat'],
            apiKeyPlaceholder: 'Enter Kouri API Key',
            baseUrlPlaceholder: 'https://api.kourichat.com/v1/chat/completions',
            notesPlaceholder: 'Extra instructions e.g. show steps...'
        }
    };

    if (document.getElementById(UI_ID)) {
        console.log('EasyXL UI is already open.');
        return;
    }

    function deepClone(value) { return JSON.parse(JSON.stringify(value)); }

    function createDefaultProviderSettings(providerId) {
        const provider = PROVIDERS[providerId];
        return { apiKey: '', model: provider.defaultModel, baseUrl: provider.defaultBaseUrl, notes: '' };
    }

    function createDefaultSettings() {
        const providers = {};
        Object.keys(PROVIDERS).forEach((providerId) => { providers[providerId] = createDefaultProviderSettings(providerId); });
        return { selectedProvider: 'openai', providers };
    }

    function pickInitialProvider(providers) {
        const providerIds = ['openai', 'anthropic', 'google', 'deepseek', 'kouri'];
        for (const providerId of providerIds) {
            if (providers[providerId] && providers[providerId].apiKey) return providerId;
        }
        return 'openai';
    }

    function buildLegacySettings() {
        const settings = createDefaultSettings();
        settings.providers.openai = { apiKey: localStorage.getItem('easyxl_openai_api_key') || '', model: localStorage.getItem('easyxl_openai_model') || PROVIDERS.openai.defaultModel, baseUrl: PROVIDERS.openai.defaultBaseUrl, notes: '' };
        settings.providers.google = { apiKey: localStorage.getItem('easyxl_gemini_api_key') || '', model: localStorage.getItem('easyxl_gemini_model') || PROVIDERS.google.defaultModel, baseUrl: PROVIDERS.google.defaultBaseUrl, notes: '' };
        settings.providers.deepseek = { apiKey: localStorage.getItem('easyxl_deepseek_api_key') || '', model: localStorage.getItem('easyxl_deepseek_model') || PROVIDERS.deepseek.defaultModel, baseUrl: PROVIDERS.deepseek.defaultBaseUrl, notes: '' };
        settings.providers.kouri = { apiKey: localStorage.getItem('easyxl_kouri_api_key') || '', model: localStorage.getItem('easyxl_kouri_model') || PROVIDERS.kouri.defaultModel, baseUrl: PROVIDERS.kouri.defaultBaseUrl, notes: '' };
        settings.selectedProvider = pickInitialProvider(settings.providers);
        return settings;
    }

    function mergeSettings(rawSettings) {
        const merged = createDefaultSettings();
        if (!rawSettings || typeof rawSettings !== 'object') return merged;
        const selectedProvider = rawSettings.selectedProvider;
        if (selectedProvider && PROVIDERS[selectedProvider]) merged.selectedProvider = selectedProvider;
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
    function saveSettings() { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)); }
    function getProviderConfig(providerId = settings.selectedProvider) { return settings.providers[providerId]; }
    function getCurrentProvider() { return PROVIDERS[settings.selectedProvider]; }

    function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalizeUrl(url) { return String(url || '').trim().replace(/\/+$/, ''); }

    function extractApiErrorMessage(responseText) {
        try {
            const parsed = JSON.parse(responseText);
            return parsed.error?.message || parsed.message || parsed.error?.type || responseText;
        } catch (error) { return responseText; }
    }

    async function captureSection(section) {
        const canvas = await html2canvas(section, {
            useCORS: true,
            allowTaint: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: document.documentElement.scrollWidth,
            windowHeight: section.scrollHeight,
            height: section.scrollHeight,
            width: section.scrollWidth,
            scale: 1
        });
        return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    }

    function formatResult(rawText) {
        if (!rawText) return '';
        const answerMatch = rawText.match(/<answer>([\s\S]*?)<\/answer>/i);
        const answer = answerMatch ? answerMatch[1].trim() : null;
        let explanation = rawText.replace(/<answer>[\s\S]*?<\/answer>/gi, '').trim();
        explanation = explanation.replace(/\n{3,}/g, '\n\n').trim();

        let html = '';

        if (answer) {
            html += `
                <div style="
                    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
                    border: 2px solid #16a34a;
                    border-radius: 12px;
                    padding: 14px 16px;
                    margin-bottom: 10px;
                    text-align: center;
                ">
                    <div style="font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">✓ Answer</div>
                    <div style="font-size: 26px; font-weight: 800; color: #14532d; letter-spacing: 0.5px;">${escapeHtml(answer)}</div>
                </div>
            `;
        }

        if (explanation) {
            html += `
                <div style="
                    background: rgba(241,245,249,0.7);
                    border: 1px solid rgba(148,163,184,0.25);
                    border-radius: 10px;
                    padding: 10px 12px;
                ">
                    <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Why</div>
                    <div style="font-size: 13px; line-height: 1.65; color: #334155;">${renderMarkdownWithMath(explanation)}</div>
                </div>
            `;
        }

        if (!answer && !explanation) {
            html = `<div style="background:rgba(241,245,249,0.9);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.7;color:#1e293b;">${renderMarkdownWithMath(rawText)}</div>`;
        }

        return html;
    }

    function renderMarkdownWithMath(text) {
        if (!text) return '';
        const mathBlocks = [];
        let processedText = text;
        processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, (match, value) => { mathBlocks.push({ type: 'block', text: value }); return `%%%MATH_BLOCK_${mathBlocks.length - 1}%%%`; });
        processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, value) => { mathBlocks.push({ type: 'block', text: value }); return `%%%MATH_BLOCK_${mathBlocks.length - 1}%%%`; });
        processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, (match, value) => { mathBlocks.push({ type: 'inline', text: value }); return `%%%MATH_INLINE_${mathBlocks.length - 1}%%%`; });
        processedText = processedText.replace(/(^|[^\\])\$([^\$]+?)\$/g, (match, prefix, value) => { mathBlocks.push({ type: 'inline', text: value }); return `${prefix}%%%MATH_INLINE_${mathBlocks.length - 1}%%%`; });
        let html = typeof marked !== 'undefined' ? marked.parse(processedText) : processedText.replace(/\n/g, '<br>');
        if (typeof katex !== 'undefined') {
            html = html.replace(/%%%MATH_BLOCK_(\d+)%%%/g, (match, index) => { try { return katex.renderToString(mathBlocks[index].text, { displayMode: true, throwOnError: false }); } catch (e) { return `\\[${mathBlocks[index].text}\\]`; } });
            html = html.replace(/%%%MATH_INLINE_(\d+)%%%/g, (match, index) => { try { return katex.renderToString(mathBlocks[index].text, { displayMode: false, throwOnError: false }); } catch (e) { return `\\(${mathBlocks[index].text}\\)`; } });
        }
        return html;
    }

    function setResult(content, isError = false, isStatus = false) {
        if (isError) {
            resultArea.innerHTML = `<div style="background:rgba(254,226,226,0.9);border:1px solid rgba(248,113,113,0.4);border-radius:10px;padding:10px 12px;color:#991b1b;font-size:13px;line-height:1.5;">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`;
            return;
        }
        if (isStatus) {
            resultArea.innerHTML = `<div style="color:#64748b;font-size:13px;text-align:center;padding:20px 0;">${content}</div>`;
            return;
        }
        resultArea.innerHTML = formatResult(content);
    }

    function setButtonIdle() {
        parseBtn.innerText = 'Solve Question';
        parseBtn.disabled = false;
        parseBtn.style.background = 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)';
        parseBtn.style.boxShadow = '0 10px 24px rgba(37, 99, 235, 0.22)';
    }

    function setButtonBusy(msg = 'Solving...') {
        parseBtn.innerText = msg;
        parseBtn.disabled = true;
        parseBtn.style.background = 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
        parseBtn.style.boxShadow = 'none';
        parseBtn.style.transform = 'none';
        parseBtn.style.filter = 'none';
    }

    function findQuestionSection() {
        for (const selector of QUESTION_SELECTORS) {
            const section = document.querySelector(selector);
            if (section) return section;
        }
        return null;
    }

    function buildImagePrompt(notes) {
        const systemPrompt = `You are an expert IXL math and science solver. You will be given a screenshot of an IXL question.

RULES:
- Always put your final answer in <answer>...</answer> tags
- After the answer tag, write 1-2 short sentences explaining why
- Keep it simple and easy to understand
- Just the value in the answer tag, no full sentences

Example:
<answer>-8</answer>
The dashed line is the asymptote at y = -8, so the limit approaches -8.`;

        let userPrompt = 'Solve the question in this screenshot.';
        if (notes && notes.trim()) userPrompt += `\n\nExtra instructions: ${notes.trim()}`;
        return { systemPrompt, userPrompt };
    }

    function validateConfig(providerId) {
        const provider = PROVIDERS[providerId];
        const config = getProviderConfig(providerId);
        if (!config.apiKey.trim()) return `${provider.label} API Key cannot be empty.`;
        if (!config.model.trim()) return `${provider.label} Model cannot be empty.`;
        if (!config.baseUrl.trim()) return `${provider.label} Base URL cannot be empty.`;
        try { new URL(config.baseUrl.trim()); } catch (e) { return `${provider.label} Base URL format is invalid.`; }
        return '';
    }

    function sendRequest(url, headers, payload) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({ method: 'POST', url, headers, data: JSON.stringify(payload), onload: resolve, onerror: () => reject(new Error('network_error')) });
        });
    }

    async function requestOpenAICompatibleWithImage(providerId, config, systemPrompt, userPrompt, base64Image) {
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` };
        const payload = {
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: [{ type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }] }
            ],
            temperature: 0.0
        };
        let response = await sendRequest(config.baseUrl, headers, payload);
        if (response.status < 200 || response.status >= 300) throw new Error(extractApiErrorMessage(response.responseText));
        const data = JSON.parse(response.responseText);
        return data.choices?.[0]?.message?.content?.trim?.() || response.responseText;
    }

    async function requestGoogleWithImage(config, systemPrompt, userPrompt, base64Image) {
        const baseUrl = normalizeUrl(config.baseUrl);
        const url = `${baseUrl}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
        const payload = {
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }],
            generationConfig: { temperature: 0.0 }
        };
        const response = await sendRequest(url, { 'Content-Type': 'application/json' }, payload);
        if (response.status < 200 || response.status >= 300) throw new Error(extractApiErrorMessage(response.responseText));
        const data = JSON.parse(response.responseText);
        return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim() || response.responseText;
    }

    async function requestAnthropicWithImage(config, systemPrompt, userPrompt, base64Image) {
        const payload = {
            model: config.model, max_tokens: 1024, temperature: 0.0, system: systemPrompt,
            messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } }, { type: 'text', text: userPrompt }] }]
        };
        const response = await sendRequest(config.baseUrl, { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, payload);
        if (response.status < 200 || response.status >= 300) throw new Error(extractApiErrorMessage(response.responseText));
        const data = JSON.parse(response.responseText);
        return Array.isArray(data.content) ? data.content.filter(i => i.type === 'text').map(i => i.text || '').join('\n').trim() : response.responseText;
    }

    async function requestByProviderWithImage(providerId, config, systemPrompt, userPrompt, base64Image) {
        if (providerId === 'google') return requestGoogleWithImage(config, systemPrompt, userPrompt, base64Image);
        if (providerId === 'anthropic') return requestAnthropicWithImage(config, systemPrompt, userPrompt, base64Image);
        return requestOpenAICompatibleWithImage(providerId, config, systemPrompt, userPrompt, base64Image);
    }

    async function solveQuestion() {
        if (typeof GM_xmlhttpRequest === 'undefined') {
            setResult('GM_xmlhttpRequest is not available. Please run the script in Tampermonkey.', true);
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
        setButtonBusy('📸 Taking screenshot...');
        setResult('📸 Taking screenshot...', false, true);
        let base64Image;
        try {
            base64Image = await captureSection(section);
        } catch (err) {
            setResult('Screenshot failed: ' + err.message, true);
            setButtonIdle();
            return;
        }
        setButtonBusy('🤖 Solving...');
        setResult('🤖 Asking AI...', false, true);
        try {
            const { systemPrompt, userPrompt } = buildImagePrompt(config.notes || '');
            const text = await requestByProviderWithImage(providerId, config, systemPrompt, userPrompt, base64Image);
            setResult(text);
        } catch (error) {
            const message = `${provider.label} request failed: ${error.message || 'Unknown error'}. Please check API Key, model, and base URL.`;
            setResult(message, true);
            openSettings(message);
        } finally {
            setButtonIdle();
        }
    }

    const ui = document.createElement('div');
    ui.id = UI_ID;
    ui.style.cssText = `position:fixed;bottom:20px;right:20px;width:360px;background:linear-gradient(180deg,rgba(255,255,255,0.72) 0%,rgba(255,255,255,0.58) 100%);border:1px solid rgba(255,255,255,0.45);border-radius:16px;box-shadow:0 18px 55px rgba(2,6,23,0.18),inset 0 1px 0 rgba(255,255,255,0.40);backdrop-filter:blur(18px) saturate(180%);-webkit-backdrop-filter:blur(18px) saturate(180%);z-index:999999;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;box-sizing:border-box;padding:14px;display:flex;flex-direction:column;gap:10px;color:#0f172a;overflow:hidden;`;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid rgba(148,163,184,0.25);cursor:grab;';

    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display:flex;align-items:center;gap:10px;';

    const title = document.createElement('div');
    title.innerText = 'EasyXL';
    title.style.cssText = 'font-size:14px;font-weight:700;letter-spacing:0.2px;';

    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(37,99,235,0.10);color:#1d4ed8;border:1px solid rgba(37,99,235,0.18);';

    const actionWrap = document.createElement('div');
    actionWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.innerText = '⚙';
    settingsButton.title = 'Settings';
    settingsButton.style.cssText = 'width:34px;height:34px;border-radius:999px;border:1px solid rgba(148,163,184,0.30);background:rgba(255,255,255,0.55);cursor:pointer;font-size:16px;font-weight:700;color:#0f172a;';

    titleWrap.appendChild(title);
    titleWrap.appendChild(badge);
    actionWrap.appendChild(settingsButton);
    header.appendChild(titleWrap);
    header.appendChild(actionWrap);
    ui.appendChild(header);

    function applyFieldStyle(el) {
        el.style.cssText += 'width:100%;padding:10px;border:1px solid rgba(148,163,184,0.45);border-radius:12px;background:rgba(255,255,255,0.55);color:#0f172a;outline:none;box-sizing:border-box;font-size:13px;';
    }

    function addFocusRing(el) {
        el.addEventListener('focus', () => { el.style.borderColor = 'rgba(37,99,235,0.65)'; el.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.16)'; });
        el.addEventListener('blur', () => { el.style.borderColor = 'rgba(148,163,184,0.45)'; el.style.boxShadow = 'none'; });
    }

    function createLabel(text) {
        const label = document.createElement('label');
        label.innerText = text;
        label.style.cssText = 'display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:5px;';
        return label;
    }

    const notesLabel = createLabel('Extra Instructions (optional)');
    ui.appendChild(notesLabel);

    const notesInput = document.createElement('textarea');
    notesInput.placeholder = 'e.g. show steps, round to 2 decimals...';
    notesInput.style.height = '52px';
    notesInput.style.resize = 'vertical';
    applyFieldStyle(notesInput);
    addFocusRing(notesInput);
    notesInput.addEventListener('input', () => { getProviderConfig().notes = notesInput.value; saveSettings(); });
    ui.appendChild(notesInput);

    const parseBtn = document.createElement('button');
    parseBtn.type = 'button';
    parseBtn.innerText = 'Solve Question';
    parseBtn.style.cssText = 'padding:11px 12px;border:1px solid rgba(30,64,175,0.20);border-radius:12px;cursor:pointer;font-weight:700;font-size:14px;color:#fff;background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);box-shadow:0 10px 24px rgba(37,99,235,0.22);transition:transform 0.12s ease,filter 0.12s ease;width:100%;';
    parseBtn.onmouseover = () => { if (parseBtn.disabled) return; parseBtn.style.filter = 'brightness(1.05)'; parseBtn.style.transform = 'translateY(-1px)'; };
    parseBtn.onmouseout = () => { parseBtn.style.filter = 'none'; parseBtn.style.transform = 'none'; };
    ui.appendChild(parseBtn);

    const resultArea = document.createElement('div');
    resultArea.style.cssText = 'min-height:120px;max-height:280px;overflow-y:auto;word-wrap:break-word;font-size:13px;line-height:1.6;user-select:text;';
    resultArea.innerHTML = '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0;">Press Solve to get the answer</div>';
    ui.appendChild(resultArea);

    const settingsOverlay = document.createElement('div');
    settingsOverlay.style.cssText = 'position:absolute;inset:0;background:rgba(15,23,42,0.16);display:none;align-items:stretch;justify-content:flex-end;z-index:2;';

    const settingsPanel = document.createElement('div');
    settingsPanel.style.cssText = 'width:100%;height:100%;background:linear-gradient(180deg,rgba(248,250,252,0.96) 0%,rgba(241,245,249,0.92) 100%);backdrop-filter:blur(18px);padding:14px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;overflow-y:auto;';

    const settingsHeader = document.createElement('div');
    settingsHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

    const settingsTitle = document.createElement('div');
    settingsTitle.innerText = 'Settings';
    settingsTitle.style.cssText = 'font-size:15px;font-weight:700;color:#0f172a;';

    const settingsCloseBtn = document.createElement('button');
    settingsCloseBtn.type = 'button';
    settingsCloseBtn.innerText = '×';
    settingsCloseBtn.style.cssText = 'width:34px;height:34px;border-radius:999px;border:1px solid rgba(148,163,184,0.30);background:rgba(255,255,255,0.72);cursor:pointer;font-size:20px;line-height:1;color:#0f172a;';

    settingsHeader.appendChild(settingsTitle);
    settingsHeader.appendChild(settingsCloseBtn);
    settingsPanel.appendChild(settingsHeader);

    const settingsMessage = document.createElement('div');
    settingsMessage.style.cssText = 'display:none;padding:10px 12px;border-radius:12px;font-size:12px;line-height:1.45;';
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
    settingsHint.style.cssText = 'font-size:12px;line-height:1.5;color:#475569;';
    settingsPanel.appendChild(settingsHint);

    settingsOverlay.appendChild(settingsPanel);
    ui.appendChild(settingsOverlay);
    document.body.appendChild(ui);

    function showSettingsMessage(message, isError = true) {
        settingsMessage.style.display = 'block';
        settingsMessage.style.background = isError ? 'rgba(254,226,226,0.92)' : 'rgba(219,234,254,0.92)';
        settingsMessage.style.border = isError ? '1px solid rgba(248,113,113,0.35)' : '1px solid rgba(96,165,250,0.35)';
        settingsMessage.style.color = isError ? '#991b1b' : '#1d4ed8';
        settingsMessage.innerText = message;
    }

    function clearSettingsMessage() { settingsMessage.style.display = 'none'; settingsMessage.innerText = ''; }

    function updateBadgeAndNotes() {
        const provider = getCurrentProvider();
        const config = getProviderConfig();
        badge.innerText = provider.label;
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
        settingsHint.innerText = 'Your API key saves automatically. Make sure your model supports vision.';
    }

    function openSettings(message) {
        renderSettingsPanel();
        if (message) showSettingsMessage(message, true);
        settingsOverlay.style.display = 'flex';
    }

    function closeSettings() { settingsOverlay.style.display = 'none'; }

    providerSelect.addEventListener('change', () => { settings.selectedProvider = providerSelect.value; saveSettings(); clearSettingsMessage(); updateBadgeAndNotes(); renderSettingsPanel(); });
    apiKeyInput.addEventListener('input', () => { getProviderConfig(providerSelect.value).apiKey = apiKeyInput.value; saveSettings(); });
    baseUrlInput.addEventListener('input', () => { getProviderConfig(providerSelect.value).baseUrl = baseUrlInput.value; saveSettings(); });
    modelSelect.addEventListener('change', () => {
        const config = getProviderConfig(providerSelect.value);
        if (modelSelect.value === CUSTOM_MODEL_VALUE) { customModelInput.style.display = 'block'; config.model = customModelInput.value.trim() || config.model || PROVIDERS[providerSelect.value].defaultModel; }
        else { customModelInput.style.display = 'none'; config.model = modelSelect.value; }
        saveSettings(); renderSettingsPanel();
    });
    customModelInput.addEventListener('input', () => { if (modelSelect.value !== CUSTOM_MODEL_VALUE) return; getProviderConfig(providerSelect.value).model = customModelInput.value.trim(); saveSettings(); });
    settingsButton.addEventListener('click', () => { clearSettingsMessage(); openSettings(); });
    settingsCloseBtn.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsOverlay.style.display !== 'none') closeSettings(); });
    parseBtn.addEventListener('click', solveQuestion);

    let isDragging = false, currentX = 0, currentY = 0, initialX = 0, initialY = 0, xOffset = 0, yOffset = 0;
    header.addEventListener('mousedown', (e) => {
        initialX = e.clientX - xOffset; initialY = e.clientY - yOffset;
        if (e.target === header || e.target === title || e.target === badge || e.target === titleWrap) { isDragging = true; header.style.cursor = 'grabbing'; }
    });
    document.addEventListener('mouseup', () => { initialX = currentX; initialY = currentY; isDragging = false; header.style.cursor = 'grab'; });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return; e.preventDefault();
        currentX = e.clientX - initialX; currentY = e.clientY - initialY;
        xOffset = currentX; yOffset = currentY;
        ui.style.transform = `translate(${currentX}px, ${currentY}px)`;
    });

    let ctrlDown = false, ctrlUsedAsModifier = false;
    document.addEventListener('keydown', (e) => { if (e.code === 'ControlLeft' || e.code === 'ControlRight') { if (!e.repeat) { ctrlDown = true; ctrlUsedAsModifier = false; } return; } if (ctrlDown) ctrlUsedAsModifier = true; });
    document.addEventListener('keyup', (e) => { if (e.code !== 'ControlLeft' && e.code !== 'ControlRight') return; if (ctrlDown && !ctrlUsedAsModifier) ui.style.display = ui.style.display === 'none' ? 'flex' : 'none'; ctrlDown = false; ctrlUsedAsModifier = false; });

    updateBadgeAndNotes();
    renderSettingsPanel();
    console.log('EasyXL unified userscript loaded successfully.');
})();
