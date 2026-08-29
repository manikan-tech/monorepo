/* eslint-env browser */
(function() {
    if (typeof window === 'undefined') return;
    const currentScript = document.currentScript || Array.from(document.querySelectorAll('script')).find(s => s.src.includes('widget.js'));
    const RECOMMEND_API_BASE = (currentScript && currentScript.getAttribute('data-recommend-api')) || "http://127.0.0.1:8000";
    const WIDGET_API_KEY = (currentScript && currentScript.getAttribute('data-widget-key')) || null;
    if (!WIDGET_API_KEY) {
        console.error('Manikan Widget: missing data-widget-key attribute on the <script> tag - widget disabled.');
        return;
    }

    const STORE_API_BASE = (currentScript && currentScript.getAttribute('data-store-url'))
        || (currentScript && currentScript.src ? new URL(currentScript.src).origin : null)
        || window.location.origin;

    function getCurrentProductContext() {
        const isProductPage = window.location.pathname.includes('/store/') && window.location.pathname.split('/').length > 2;
        if (!isProductPage) {
            return {
                productId: null,
                productName: null,
                sizeChart: "",
            };
        }
        const ctx = (typeof window !== 'undefined' && window.currentProductContext) || {};
        return {
            productId: ctx.id || null,
            productName: ctx.name || null,
            sizeChart: ctx.size_chart_json || "",
        };
    }

    let sessionId = localStorage.getItem('manikan_session_id');
    if (!sessionId) {
        sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('manikan_session_id', sessionId);
    }

    let conversationHistory = [];
    let shownRetrievedIds = new Set();
    let isInitialized = false;
    let userMeasurements = null;
    let pendingState = null;
    let activeSearch = null;

    let customerFirstName = null;
    async function checkIsLoggedIn() {
        try {
            const res = await fetch(`${STORE_API_BASE}/api/auth/me`, { cache: 'no-store', credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                customerFirstName = data.user?.firstName || null;
                return true;
            }
            return false;
        } catch (err) {
            return false;
        }
    }

    let savedMeasurements = null;
    async function fetchSavedMeasurements() {
        try {
            const res = await fetch(`${STORE_API_BASE}/api/measurement-sessions/latest`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (data.found) {
                savedMeasurements = {
                    height_cm: data.heightCm,
                    weight_kg: data.weightKg,
                    chest_cm: data.chestCm,
                    waist_cm: data.waistCm,
                    hips_cm: data.hipsCm,
                    recommendedSize: data.recommendedSize,
                };
            }
        } catch {
        }
    }

    const GUEST_MESSAGE_LIMIT = 5;
    const guestCountKey = `manikan_guest_msg_count_${sessionId}`;
    function getGuestMessageCount() {
        return parseInt(localStorage.getItem(guestCountKey) || '0', 10);
    }

    function incrementGuestMessageCount() {
        localStorage.setItem(guestCountKey, String(getGuestMessageCount() + 1));
    }

    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        .ai-widget-container { position: fixed; bottom: 30px; right: 30px; z-index: 10000; font-family: 'Outfit', 'Plus Jakarta Sans', sans-serif; }
        .ai-widget-button { width: 64px; height: 64px; border-radius: 20px; background: #111; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: transform 0.15s ease; }
        .ai-widget-button:hover { transform: scale(1.05); }
        .ai-widget-box { display: none; width: 420px; height: 640px; background: #fff; border-radius: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); position: absolute; bottom: 85px; right: 0; flex-direction: column; overflow: hidden; border: 1px solid rgba(0,0,0,0.08); }
        .ai-widget-header { background: #111; color: white; padding: 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #dfb76c; font-weight: 700; letter-spacing: 1.5px; font-family: 'Outfit', sans-serif; font-size: 15px; }
        .ai-widget-messages { flex: 1; padding: 25px; overflow-y: auto; background: #fbfbfa; display: flex; flex-direction: column; gap: 16px; font-family: 'Plus Jakarta Sans', sans-serif; }
        .ai-message { padding: 14px 18px; border-radius: 18px; max-width: 85%; font-size: 14.5px; line-height: 1.65; font-family: 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.005em; font-weight: 400; animation: manikanFadeIn 0.25s ease-out; }
        @keyframes manikanFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .ai-message.bot { background: #ffffff; color: #1a1a1a; align-self: flex-start; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f0f0ee; }
        .ai-message.bot strong { font-weight: 700; color: #111; }
        .ai-message.thinking { font-style: italic; color: #999; animation: manikanPulse 1.4s ease-in-out infinite; box-shadow: none; border: none; }
        @keyframes manikanPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .ai-message.user { background: #111; color: #fff; align-self: flex-end; font-weight: 450; }
        .ai-widget-input-area { padding: 20px; background: #fff; border-top: 1px solid #eee; display: flex; flex-direction: column; gap: 10px; font-family: 'Plus Jakarta Sans', sans-serif; }
        .measurements-row { display: flex; gap: 8px; }
        .measurements-row.hidden { display: none; }
        .measurements-row input { flex: 1; min-width: 0; border: 1px solid #ddd; border-radius: 10px; padding: 8px; font-size: 12px; font-family: 'Plus Jakarta Sans', sans-serif; }
        .measurement-field { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
        .measurement-field label { font-size: 10px; color: #888; font-weight: 600; padding-left: 2px; }
        .measurements-toggle { background: none; border: none; color: #888; font-size: 11px; text-align: left; padding: 0; cursor: pointer; text-decoration: underline; font-family: 'Plus Jakarta Sans', sans-serif; }
        .input-group { display: flex; gap: 8px; }
        .ai-widget-input { flex: 1; border: 1px solid #ddd; border-radius: 14px; padding: 12px; outline: none; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; }
        .ai-widget-send { background: #111; color: #fff; border: none; border-radius: 14px; padding: 0 20px; cursor: pointer; font-family: 'Outfit', sans-serif; font-weight: 600; letter-spacing: 0.3px; }
        .ai-widget-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .view-item-btn { margin-top: 10px; display: block; background: #111; color: #dfb76c; padding: 12px 18px; border-radius: 12px; text-decoration: none; font-weight: 700; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: 'Outfit', sans-serif; letter-spacing: 0.5px; transition: background 0.15s ease; }
        .view-item-btn:hover { background: #222; }
        .view-item-chip { display: inline-block; background: #fbf3e3; color: #8a6a1f; border: 1px solid #dfb76c; border-radius: 8px; padding: 2px 9px; font-weight: 700; font-size: 12.5px; font-family: 'Outfit', sans-serif; letter-spacing: 0.2px; }
        .ai-product-cards { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
        .ai-product-card { display: flex; gap: 12px; background: #fff; border: 1px solid #eee; border-radius: 14px; padding: 10px; text-decoration: none; color: #111; align-items: center; transition: box-shadow 0.15s ease, transform 0.15s ease; }
        .ai-product-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.08); transform: translateY(-1px); }
        .ai-product-card img { width: 56px; height: 56px; object-fit: cover; border-radius: 10px; background: #f4f5f7; flex-shrink: 0; }
        .ai-product-card-info { flex: 1; min-width: 0; }
        .ai-product-card-name { font-size: 13px; font-weight: 600; margin: 0 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'Plus Jakarta Sans', sans-serif; }
        .ai-product-card-price { font-size: 12px; color: #666; margin: 0; }
        .ai-product-card-btn { background: #111; color: #fff; font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 8px; white-space: nowrap; font-family: 'Outfit', sans-serif; }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.className = 'ai-widget-container';
    container.innerHTML = `
        <button class="ai-widget-button" id="widgetToggle">AI</button>
        <div class="ai-widget-box" id="widgetBox">
            <div class="ai-widget-header">
                <span>MANIKAN AI</span>
                <span id="widgetClose" style="cursor:pointer">✕</span>
            </div>
            <div class="ai-widget-messages" id="widgetMessages"></div>
            <div class="ai-widget-input-area">
                <button class="measurements-toggle" id="measurementsToggle" type="button">📏 Hide measurements</button>
                <div class="measurements-row" id="measurementsRow">
                    <div class="measurement-field"><label for="mHeight">Height (cm)</label><input type="number" id="mHeight"></div>
                    <div class="measurement-field"><label for="mWeight">Weight (kg)</label><input type="number" id="mWeight"></div>
                    <div class="measurement-field"><label for="mChest">Chest (cm)</label><input type="number" id="mChest"></div>
                    <div class="measurement-field"><label for="mWaist">Waist (cm)</label><input type="number" id="mWaist"></div>
                    <div class="measurement-field"><label for="mHip">Hip (cm)</label><input type="number" id="mHip"></div>
                </div>
                <div class="input-group">
                    <input type="text" class="ai-widget-input" id="widgetInput" placeholder="Ask about sizing...">
                    <button class="ai-widget-send" id="widgetSend">Send</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(container);

    let availableCategories = [];
    const categoryProductsCache = {};
    const shownProductIdsByCategory = {};

    async function loadCategories() {
        const MAX_PAGES = 15;
        try {
            let page = 1;
            let totalPages = 1;
            do {
                const res = await fetch(`${STORE_API_BASE}/api/products?page=${page}`);
                const data = await res.json();
                const products = Array.isArray(data) ? data : (data.products || []);
                products.forEach((p) => {
                    if (!p.category) return;
                    if (!categoryProductsCache[p.category]) categoryProductsCache[p.category] = [];
                    categoryProductsCache[p.category].push(p);
                });
                totalPages = data.pagination?.totalPages || 1;
                page += 1;
            } while (page <= totalPages && page <= MAX_PAGES);
            availableCategories = Object.keys(categoryProductsCache);
        } catch (err) {
        }
    }

    loadCategories();

    function initChat() {
        if (!isInitialized) {
            let welcomeMsg = "👋 **Hey there! Welcome to Manikan AI.**\n\nI’m your personal style & sizing assistant. I can help you find your exact size and discover items across our store!\n\n[Sign in](/login) anytime for a saved profile and unlimited help - or just tell me what you're shopping for today!";
            if (customerFirstName) {
                const nameGreeting = savedMeasurements
                    ? `Welcome back, ${customerFirstName}!`
                    : `Welcome, ${customerFirstName}!`;
                welcomeMsg = `👋 **${nameGreeting}**\n\nTell me what you're shopping for today, or pick an item to check your size!`;
            }
            appendMessage(welcomeMsg, 'bot');
            isInitialized = true;
        }
    }

    document.getElementById('widgetToggle').onclick = () => {
        const box = document.getElementById('widgetBox');
        if (box.style.display === 'flex') {
            box.style.display = 'none';
        } else {
            window.ManikanWidget.open();
        }
    };

    document.getElementById('widgetClose').onclick = () => {
        document.getElementById('widgetBox').style.display = 'none';
    };

    document.getElementById('measurementsToggle').onclick = () => {
        const row = document.getElementById('measurementsRow');
        const toggle = document.getElementById('measurementsToggle');
        const isHidden = row.classList.toggle('hidden');
        toggle.textContent = isHidden ? '📏 Enter your measurements' : '📏 Hide measurements';
    };

    function appendMessage(text, sender, link = null) {
        const messagesContainer = document.getElementById('widgetMessages');

        if (sender === 'bot') {
            const lastChild = messagesContainer.lastElementChild;
            if (lastChild && lastChild.classList.contains('bot') && lastChild.innerText.trim() === text.trim()) {
                return;
            }
        }

        const msg = document.createElement('div');
        msg.className = `ai-message ${sender}`;

        const formattedText = (text || "")
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\bView Item\b/g, '<span class="view-item-chip">View Item</span>')
            .replace(/\n• /g, '<br>• ')
            .replace(/\n\n/g, '<br><br>');

        msg.innerHTML = formattedText;

        messagesContainer.appendChild(msg);

        if (link) {
            const linkEl = document.createElement('a');
            linkEl.className = 'view-item-btn';
            linkEl.innerText = "View Item (3D Fit)";
            linkEl.href = link;
            linkEl.target = "_blank";
            messagesContainer.appendChild(linkEl);
        }

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function getAllCachedProducts() {
        return Object.values(categoryProductsCache).flat();
    }

    function renderProductCards(products) {
        if (!products || products.length === 0) return;

        const wrap = document.createElement('div');
        wrap.className = 'ai-product-cards';

        products.slice(0, 4).forEach((product) => {
            const card = document.createElement('a');
            card.className = 'ai-product-card';
            card.href = `/store/${product.slug || product.id}?open_sizing=true`;
            card.target = '_blank';

            const price = product.priceEgp ?? product.price ?? '';

            card.innerHTML = `
                <img src="${product.imageUrl || ''}" alt="${product.name || ''}" onerror="this.style.visibility='hidden'">
                <div class="ai-product-card-info">
                    <p class="ai-product-card-name">${product.name || 'Item'}</p>
                    <p class="ai-product-card-price">${price ? 'EGP ' + price : ''}</p>
                </div>
                <span class="ai-product-card-btn">View Item</span>
            `;

            wrap.appendChild(card);
        });

        document.getElementById('widgetMessages').appendChild(wrap);
        document.getElementById('widgetMessages').scrollTop =
            document.getElementById('widgetMessages').scrollHeight;
    }

    function showThinking() {
        const msg = document.createElement('div');
        msg.className = 'ai-message bot thinking';
        msg.id = 'thinkingIndicator';
        msg.innerText = 'Manikan AI is thinking...';

        const messagesContainer = document.getElementById('widgetMessages');
        messagesContainer.appendChild(msg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function hideThinking() {
        const el = document.getElementById('thinkingIndicator');
        if (el) el.remove();
    }

    function readMeasurementsIfProvided() {
        const height = document.getElementById('mHeight').value;
        const weight = document.getElementById('mWeight').value;
        const chest = document.getElementById('mChest').value;
        const waist = document.getElementById('mWaist').value;
        const hip = document.getElementById('mHip').value;

        if (height && weight && chest && waist && hip) {
            userMeasurements = {
                height_cm: parseFloat(height),
                weight_kg: parseFloat(weight),
                chest_cm: parseFloat(chest),
                waist_cm: parseFloat(waist),
                hips_cm: parseFloat(hip),
            };
        }
    }

    async function waitForProductContext(maxWaitMs = 3000) {
        const isProductPage =
            window.location.pathname.includes('/store/') &&
            window.location.pathname.split('/').length > 2;

        if (!isProductPage) return;

        const start = Date.now();

        while (
            (!window.currentProductContext || !window.currentProductContext.name) &&
            Date.now() - start < maxWaitMs
        ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    async function sendMessage() {
        const input = document.getElementById('widgetInput');
        const sendBtn = document.getElementById('widgetSend');

        let text = input.value.trim();

        await waitForProductContext();

        const { productId: gateProductId } = getCurrentProductContext();

        // Measurements are CONTEXT the user filled in earlier, not an
        // automatic command on every subsequent message. Only pull fresh
        // values from the form (and only send them as "betas" this turn)
        // when the user is genuinely submitting the measurement form -
        // either no separate text typed, or they're confirming pre-filled
        // saved measurements ("same"/"yes"/etc.). Otherwise stale,
        // still-filled fields would silently get resent as "betas" on
        // every unrelated follow-up ("what's the material?"), hijacking
        // the reply with a stale size calculation that has nothing to do
        // with the actual question.
        const CONFIRM_WORDS = ["same", "yes", "yeah", "yep", "correct", "confirmed", "keep", "use these", "use them"];
        const isConfirmingSaved = CONFIRM_WORDS.some((w) => text.toLowerCase().trim() === w || text.toLowerCase().includes(w));
        const isMeasurementFormSubmit = !text || isConfirmingSaved;
        if (isMeasurementFormSubmit) {
            readMeasurementsIfProvided();
        }

        if (!text && userMeasurements && gateProductId) {
            text =
                `My measurements: height ${userMeasurements.height_cm}cm, ` +
                `weight ${userMeasurements.weight_kg}kg, ` +
                `chest ${userMeasurements.chest_cm}cm, ` +
                `waist ${userMeasurements.waist_cm}cm, ` +
                `hip ${userMeasurements.hips_cm}cm`;
        }

        if (!text) return;

        const isLoggedIn = await checkIsLoggedIn();

        if (isLoggedIn && !savedMeasurements) {
            await fetchSavedMeasurements();
        }

        if (gateProductId) {
            if (!isLoggedIn) {
                appendMessage(text, 'user');
                input.value = '';

                appendMessage(
                    'Please [sign in](/login) to check your size for this item - it only takes a moment!',
                    'bot'
                );

                return;
            }
        } else {
            if (!isLoggedIn) {
                if (getGuestMessageCount() >= GUEST_MESSAGE_LIMIT) {
                    appendMessage(text, 'user');
                    input.value = '';

                    appendMessage(
                        'Please [sign in](/login) so I can keep helping you - it only takes a moment!',
                        'bot'
                    );

                    return;
                }

                incrementGuestMessageCount();
            }
        }

        appendMessage(text, 'user');
        conversationHistory.push({
            role: "user",
            content: text
        });

        input.value = '';
        sendBtn.disabled = true;

        const {
            productId,
            sizeChart: productSizeChart
        } = getCurrentProductContext();

        let sizeChart = productSizeChart;
        let intent = productId ? "general" : "search";

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 40000);

        showThinking();

        try {
            const response = await fetch(
                `${STORE_API_BASE}/api/widget/recommend`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(WIDGET_API_KEY
                            ? { 'X-Manikan-Key': WIDGET_API_KEY }
                            : {}),
                    },
                    signal: controller.signal,
                    body: JSON.stringify({
                        session_id: sessionId,
                        messages: conversationHistory,
                    shown_product_ids: Array.from(shownRetrievedIds),
                        product_id: productId,
                        product_name: getCurrentProductContext().productName,
                        selected_category: null,
                        intent: intent,
                        customer_name: customerFirstName,
                        saved_measurements: savedMeasurements,
                        // Only ever sent on a genuine measurement-form
                        // submission - never resent on unrelated follow-up
                        // questions just because it's still in memory.
                        betas: isMeasurementFormSubmit ? userMeasurements : null,
                        size_chart: sizeChart,
                        available_categories: availableCategories,
                        catalog_products: Object.values(categoryProductsCache)
                            .flat()
                            .map((p) => ({
                                id: p.id,
                                name: p.name,
                                category: p.category,
                                description: p.description || "",
                                brand: p.brand || "",
                                gender: p.gender || "",
                                price: p.priceEgp ?? p.price ?? null,
                                // Needed for material-based browsing ("I want
                                // something silk") - see agent.py's
                                // _extract_requested_material / catalog filter.
                                fabric: p.fabric || p.material || "",
                            })),
                        pending_state: pendingState,
                        active_search: activeSearch,
                    }),
                }
            );

            clearTimeout(timeoutId);

            if (response.status === 429) {
                hideThinking();

                appendMessage(
                    "You're sending messages a bit fast - please wait a moment and try again.",
                    'bot'
                );

                return;
            }

            if (!response.ok) {
                hideThinking();

                appendMessage(
                    "I'm having a little trouble connecting to our styling service right now. Please try again in a moment! ✨",
                    'bot'
                );

                return;
            }

            const data = await response.json();

            hideThinking();

            pendingState = data.pending_state || null;
            activeSearch = data.active_search || null;

            const botMessage =
                data.message ||
                data.reply ||
                "I'm here to help you find your exact size!";

            if (data.success === false) {
                appendMessage(botMessage, 'bot');

                conversationHistory.push({
                    role: "assistant",
                    content: botMessage
                });

                return;
            }

            if (data.action === "fetch_products") {
                appendMessage(botMessage, 'bot');

                conversationHistory.push({
                    role: "assistant",
                    content: botMessage
                });

                try {
                    if (data.retrieved_product_ids && data.retrieved_product_ids.length > 0) {
                        const allProducts = getAllCachedProducts();
                        const matched = data.retrieved_product_ids
                            .map((id) => allProducts.find((p) => p.id === id))
                            .filter(Boolean);
                        
                        matched.forEach((p) => shownRetrievedIds.add(p.id));

                        if (matched.length > 0) {
                            renderProductCards(matched);
                        } else {
                            appendMessage("I couldn't find matching products right now.", 'bot');
                        }
                    } else {
                        // Fallback to legacy matched_category flow if no retrieved_product_ids
                        let candidates;

                        if (data.matched_category && categoryProductsCache[data.matched_category]) {
                            candidates = categoryProductsCache[data.matched_category];
                            const inStock = candidates.filter((p) => (p.stock ?? 1) > 0);
                            const catKey = data.matched_category;
                            
                            if (!shownProductIdsByCategory[catKey]) {
                                shownProductIdsByCategory[catKey] = new Set();
                            }
                            const shown = shownProductIdsByCategory[catKey];
                            let unseen = inStock.filter((p) => !shown.has(p.id));
                            
                            if (unseen.length === 0) {
                                shown.clear();
                                unseen = inStock;
                            }
                            
                            const toShow = unseen.slice(0, 4);
                            toShow.forEach((p) => shown.add(p.id));

                            if (toShow.length > 0) {
                                renderProductCards(toShow);
                            } else {
                                appendMessage("I couldn't find matching products right now.", 'bot');
                            }
                        } else {
                            // Never fall back to arbitrary generic products
                            appendMessage("I couldn't find matching products right now.", 'bot');
                        }
                    }
                } catch (fetchErr) {
                    appendMessage("I found a match but couldn't load the product details right now.", 'bot');
                }
            } else {

                appendMessage(botMessage, 'bot');

                conversationHistory.push({
                    role: "assistant",
                    content: botMessage
                });

                if (
                    data.action === "provide_recommendation" &&
                    data.recommended_size &&
                    productId
                ) {
                    fetch(
                        `${STORE_API_BASE}/api/measurement-sessions`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                productId: productId,
                                shopperRef: sessionId,
                                heightCm:
                                    userMeasurements?.height_cm,
                                weightKg:
                                    userMeasurements?.weight_kg,
                                chestCm:
                                    userMeasurements?.chest_cm,
                                waistCm:
                                    userMeasurements?.waist_cm,
                                hipsCm:
                                    userMeasurements?.hips_cm,
                                recommendedSize:
                                    data.recommended_size,
                                confidenceScore:
                                    data.confidence_score,
                                explanation:
                                    data.explanation,
                            }),
                        }
                    ).catch(
                        (err) =>
                            console.warn(
                                'Could not log measurement session:',
                                err
                            )
                    );
                }

                if (
                    data.provider === "STATIC-CALC" ||
                    data.provider === "STATIC-LABEL-TRUSTED" ||
                    data.provider === "STATIC-LABEL-UNTRUSTED"
                ) {
                    userMeasurements = null;
                }
            }

        } catch (error) {
            clearTimeout(timeoutId);

            hideThinking();

            if (error.name === 'AbortError') {
                appendMessage(
                    "That's taking longer than expected. Please try again.",
                    'bot'
                );
            } else {
                appendMessage(
                    "Connection error. Please try again in a moment.",
                    'bot'
                );
            }

        } finally {
            sendBtn.disabled = false;
        }
    }

    document.getElementById('widgetSend').onclick =
        sendMessage;

    document.getElementById('widgetInput').onkeypress =
        (e) => {
            if (e.key === 'Enter') sendMessage();
        };

    function ensureMeasurementsVisible() {
        const measurementsRow =
            document.getElementById('measurementsRow');

        measurementsRow.classList.remove('hidden');

        document.getElementById(
            'measurementsToggle'
        ).textContent = '📏 Hide measurements';
    }

    function hideMeasurementsForGeneralChat() {
        const measurementsRow =
            document.getElementById('measurementsRow');

        const toggle =
            document.getElementById('measurementsToggle');

        measurementsRow.classList.add('hidden');
        toggle.classList.add('hidden');
    }

    async function showProductWelcome(loggedIn) {
        await waitForProductContext();

        const { productName } =
            getCurrentProductContext();

        const label =
            productName
                ? `"${productName}"`
                : "this item";

        if (!loggedIn) {
            appendMessage(
                `Let's find your size for ${label}. Please [sign in](/login) to continue - it only takes a moment!`,
                'bot'
            );

            hideMeasurementsForGeneralChat();

            return;
        }

        if (savedMeasurements) {
            document.getElementById('mHeight').value =
                savedMeasurements.height_cm;

            document.getElementById('mWeight').value =
                savedMeasurements.weight_kg;

            document.getElementById('mChest').value =
                savedMeasurements.chest_cm;

            document.getElementById('mWaist').value =
                savedMeasurements.waist_cm;

            document.getElementById('mHip').value =
                savedMeasurements.hips_cm;

            appendMessage(
                `Let's find your size for ${label}. Your measurements were height ${savedMeasurements.height_cm}cm, weight ${savedMeasurements.weight_kg}kg, chest ${savedMeasurements.chest_cm}cm, waist ${savedMeasurements.waist_cm}cm, hip ${savedMeasurements.hips_cm}cm - are these still the same, or would you like to enter new ones? I've filled them in below either way.`,
                'bot'
            );

            pendingState = {
                type: "confirm_measurements",
                product_id: getCurrentProductContext().productId,
                product_name: getCurrentProductContext().productName
            };

        } else {
            appendMessage(
                `Let's find your size for ${label}. Please enter your height, weight, chest, and waist measurements below.`,
                'bot'
            );
        }

        ensureMeasurementsVisible();
    }

    window.ManikanWidget = {
        open: async function() {
            document.getElementById(
                'widgetBox'
            ).style.display = 'flex';

            const loggedIn =
                await checkIsLoggedIn();

            if (
                loggedIn &&
                !savedMeasurements
            ) {
                await fetchSavedMeasurements();
            }

            const { productId } =
                getCurrentProductContext();

            if (productId) {
                isInitialized = true;

                await showProductWelcome(
                    loggedIn
                );

            } else {
                initChat();
                hideMeasurementsForGeneralChat();
            }
        },

        openForSizing: async function() {
            document.getElementById(
                'widgetBox'
            ).style.display = 'flex';

            isInitialized = true;

            const loggedIn =
                await checkIsLoggedIn();

            if (
                loggedIn &&
                !savedMeasurements
            ) {
                await fetchSavedMeasurements();
            }

            await showProductWelcome(
                loggedIn
            );

            // Sync the context-key watcher so the setInterval does not see
            // a spurious 'general' → productId transition and fire a second
            // open() call. This race happens when currentProductContext is
            // not yet set at the first interval tick (T=500ms) but becomes
            // set by the time openForSizing finishes (T=700ms+).
            const { productId: _syncedId } = getCurrentProductContext();
            lastContextKey = _syncedId || 'general';
        },
    };

    const urlParams =
        new URLSearchParams(
            window.location.search
        );

    if (
        urlParams.get(
            'open_sizing'
        ) === 'true'
    ) {
        setTimeout(() => {
            window.ManikanWidget.openForSizing();

            urlParams.delete(
                'open_sizing'
            );

            const newSearch =
                urlParams.toString();

            const newUrl =
                window.location.pathname +
                (
                    newSearch
                        ? `?${newSearch}`
                        : ''
                ) +
                window.location.hash;

            window.history.replaceState(
                {},
                '',
                newUrl
            );

        }, 300);
    }

    let lastContextKey = null;
    let lastPathname =
        window.location.pathname;

    setInterval(() => {
        const { productId } =
            getCurrentProductContext();

        const currentKey =
            productId || 'general';

        if (lastContextKey === null) {
            lastContextKey =
                currentKey;

        } else if (
            currentKey !==
            lastContextKey
        ) {
            lastContextKey = currentKey;

            conversationHistory = [];
            isInitialized = false;
            userMeasurements = null;

            document.getElementById(
                'widgetMessages'
            ).innerHTML = '';

            if (
                productId &&
                document.getElementById(
                    'widgetBox'
                ).style.display === 'flex'
            ) {
                window.ManikanWidget.open();
            }
        }

        if (
            window.location.pathname !==
            lastPathname
        ) {
            lastPathname =
                window.location.pathname;
        }

    }, 500);

})();