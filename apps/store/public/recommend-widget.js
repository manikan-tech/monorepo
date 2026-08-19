/* eslint-env browser */
(function() {
    if (typeof window === 'undefined') return;
    const currentScript = document.currentScript || Array.from(document.querySelectorAll('script')).find(s => s.src.includes('widget.js'));
    const RECOMMEND_API_BASE = (currentScript && currentScript.getAttribute('data-recommend-api')) || "http://127.0.0.1:8000";
    const WIDGET_API_KEY = (currentScript && currentScript.getAttribute('data-widget-key')) || "manikan_secure_widget_key_2026_prod";

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
    let isInitialized = false;
    let userMeasurements = null;

    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
        .ai-widget-container { position: fixed; bottom: 30px; right: 30px; z-index: 10000; font-family: 'Plus Jakarta Sans', sans-serif; }
        .ai-widget-button { width: 64px; height: 64px; border-radius: 20px; background: #111; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
        .ai-widget-box { display: none; width: 420px; height: 640px; background: #fff; border-radius: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); position: absolute; bottom: 85px; right: 0; flex-direction: column; overflow: hidden; border: 1px solid rgba(0,0,0,0.08); }
        .ai-widget-header { background: #111; color: white; padding: 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #dfb76c; font-weight: 700; letter-spacing: 1px; }
        .ai-widget-messages { flex: 1; padding: 25px; overflow-y: auto; background: #fdfdfd; display: flex; flex-direction: column; gap: 18px; }
        .ai-message { padding: 16px 20px; border-radius: 20px; max-width: 85%; font-size: 14px; line-height: 1.6; }
        .ai-message.bot { background: #f4f5f7; color: #333; align-self: flex-start; }
        .ai-message.thinking { font-style: italic; color: #888; animation: manikanPulse 1.4s ease-in-out infinite; }
        @keyframes manikanPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .ai-message.user { background: #111; color: #fff; align-self: flex-end; }
        .ai-widget-input-area { padding: 20px; background: #fff; border-top: 1px solid #eee; display: flex; flex-direction: column; gap: 10px; }
        .measurements-row { display: flex; gap: 8px; }
        .measurements-row.hidden { display: none; }
        .measurements-row input { flex: 1; min-width: 0; border: 1px solid #ddd; border-radius: 10px; padding: 8px; font-size: 12px; }
        .measurements-toggle { background: none; border: none; color: #888; font-size: 11px; text-align: left; padding: 0; cursor: pointer; text-decoration: underline; }
        .input-group { display: flex; gap: 8px; }
        .ai-widget-input { flex: 1; border: 1px solid #ddd; border-radius: 14px; padding: 12px; outline: none; }
        .ai-widget-send { background: #111; color: #fff; border: none; border-radius: 14px; padding: 0 20px; cursor: pointer; }
        .ai-widget-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .view-item-btn { margin-top: 10px; display: block; background: #dfb76c; color: #111; padding: 10px 15px; border-radius: 10px; text-decoration: none; font-weight: 600; text-align: center; }
        .ai-product-cards { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
        .ai-product-card { display: flex; gap: 12px; background: #fff; border: 1px solid #eee; border-radius: 14px; padding: 10px; text-decoration: none; color: #111; align-items: center; }
        .ai-product-card img { width: 56px; height: 56px; object-fit: cover; border-radius: 10px; background: #f4f5f7; flex-shrink: 0; }
        .ai-product-card-info { flex: 1; min-width: 0; }
        .ai-product-card-name { font-size: 13px; font-weight: 600; margin: 0 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ai-product-card-price { font-size: 12px; color: #666; margin: 0; }
        .ai-product-card-btn { background: #111; color: #fff; font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 8px; white-space: nowrap; }
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
                    <input type="number" id="mHeight" placeholder="Height cm">
                    <input type="number" id="mWeight" placeholder="Weight kg">
                    <input type="number" id="mChest" placeholder="Chest cm">
                    <input type="number" id="mWaist" placeholder="Waist cm">
                    <input type="number" id="mHip" placeholder="Hip cm">
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

    // The catalog can span many pages (seen: 119 products / 10 pages at
    // the API's default page size of 12) - fetching only page 1 meant
    // availableCategories only ever reflected whichever category happened
    // to fill the first page (e.g. all "pants"), so the AI never even
    // knew blouses/shirts existed. Paginate through everything instead,
    // capped at a sane number of requests as a safety net.
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
            console.warn('Could not load categories:', err);
        }
    }
    loadCategories();

    function initChat() {
        if (!isInitialized) {
            const welcomeMsg = "👋 **Hey there! Welcome to Manikan AI.**\n\nI’m your personal style & sizing assistant. I can help you find your exact size and discover items across our store!\n\nTell me what you're shopping for today, or drop your measurements below!";
            appendMessage(welcomeMsg, 'bot');
            isInitialized = true;
        }
    }

    document.getElementById('widgetToggle').onclick = () => {
        const box = document.getElementById('widgetBox');
        box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
        if (box.style.display === 'flex') initChat();
    };
    document.getElementById('widgetClose').onclick = () => { document.getElementById('widgetBox').style.display = 'none'; };
    document.getElementById('measurementsToggle').onclick = () => {
        const row = document.getElementById('measurementsRow');
        const toggle = document.getElementById('measurementsToggle');
        const isHidden = row.classList.toggle('hidden');
        toggle.textContent = isHidden ? '📏 Enter your measurements' : '📏 Hide measurements';
    };

    function appendMessage(text, sender, link = null) {
        const msg = document.createElement('div');
        msg.className = `ai-message ${sender}`;

        const formattedText = (text || "")
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n• /g, '<br>• ')
            .replace(/\n\n/g, '<br><br>');

        msg.innerHTML = formattedText;

        const messagesContainer = document.getElementById('widgetMessages');
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
            // ?open_sizing=true tells the product page's widget instance
            // to auto-open the chat with measurement fields ready, instead
            // of the user having to find and click "Find My Size" again.
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
        document.getElementById('widgetMessages').scrollTop = document.getElementById('widgetMessages').scrollHeight;
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

    async function sendMessage() {
        const input = document.getElementById('widgetInput');
        const sendBtn = document.getElementById('widgetSend');
        let text = input.value.trim();
        readMeasurementsIfProvided();
        if (!text && userMeasurements) {
            text = `My measurements: height ${userMeasurements.height_cm}cm, weight ${userMeasurements.weight_kg}kg, chest ${userMeasurements.chest_cm}cm, waist ${userMeasurements.waist_cm}cm, hip ${userMeasurements.hips_cm}cm`;
        }
        if (!text) return;

        appendMessage(text, 'user');
        conversationHistory.push({ role: "user", content: text });
        input.value = '';
        sendBtn.disabled = true;

        const { productId, sizeChart: productSizeChart } = getCurrentProductContext();
        let sizeChart = productSizeChart;

        let intent = productId ? "general" : "search";

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 40000);
        showThinking();

        try {
            // Direct connection to the Python recommendation-service - NOT
            // connected to the Next.js proxy in any way. X-Widget-Key is
            // a simple shared secret this service checks itself.
            const response = await fetch(`${RECOMMEND_API_BASE}/recommend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(WIDGET_API_KEY ? { 'X-Widget-Key': WIDGET_API_KEY } : {}),
                },
                signal: controller.signal,
                body: JSON.stringify({
                    session_id: sessionId,
                    messages: conversationHistory,
                    product_id: productId,
                    selected_category: null,
                    intent: intent,
                    betas: userMeasurements,
                    size_chart: sizeChart,
                    available_categories: availableCategories,
                    // For RAG: the full catalog we already gathered via
                    // loadCategories()'s pagination, trimmed to just the
                    // fields the backend's retrieval step needs.
                    catalog_products: Object.values(categoryProductsCache)
                        .flat()
                        .map((p) => ({
                            id: p.id,
                            name: p.name,
                            category: p.category,
                            description: p.description || "",
                        })),
                }),
            });
            clearTimeout(timeoutId);

            if (response.status === 429) {
                hideThinking();
                appendMessage("You're sending messages a bit fast - please wait a moment and try again.", 'bot');
                return;
            }

            if (!response.ok) {
                hideThinking();
                appendMessage("I'm having a little trouble connecting to our styling service right now. Please try again in a moment! ✨", 'bot');
                return;
            }

            const data = await response.json();
            hideThinking();

            const botMessage = data.message || data.reply || "I'm here to help you find your exact size!";

            // A failed backend response (all providers down) still carries
            // an action field for the widget to fall back to, but it must
            // never trigger an actual product fetch - that's what was
            // showing random/wrong products on a plain "hi" when every
            // LLM provider failed at once.
            if (data.success === false) {
                appendMessage(botMessage, 'bot');
                conversationHistory.push({ role: "assistant", content: botMessage });
                return;
            }

            if (data.action === "fetch_products") {
                appendMessage(botMessage, 'bot');
                conversationHistory.push({ role: "assistant", content: botMessage });
                try {
                    const queryParams = new URLSearchParams();
                    if (data.recommended_size) queryParams.set('size', data.recommended_size);
                    // Real category from the AI's structured response -
                    // matched against the actual available_categories list,
                    // instead of guessing from free-text keywords (broke
                    // for Arabic input and any category name that wasn't
                    // hardcoded, e.g. "بلوز" never matched 'blouse').
                    if (data.matched_category) queryParams.set('category', data.matched_category);

                    const res = await fetch(`${STORE_API_BASE}/api/products?${queryParams.toString()}`);
                    const productsData = await res.json();
                    const products = Array.isArray(productsData) ? productsData : (productsData.products || []);
                    const inStock = products.filter((p) => (p.stock ?? 1) > 0);

                    if (inStock.length > 0) {
                        renderProductCards(inStock);
                    } else {
                        appendMessage("I couldn't find matching products right now.", 'bot');
                    }
                } catch (fetchErr) {
                    appendMessage("I found a match but couldn't load the product details right now.", 'bot');
                }
            } else {
                // RAG-grounded style answers: the LLM's text stays a short
                // intro (see agent.py's brevity rule) - the actual products
                // are rendered as cards from our own cached catalog data,
                // looked up by the ids the backend's retrieval step found.
                if (data.retrieved_product_ids && data.retrieved_product_ids.length > 0) {
                    appendMessage(botMessage, 'bot');
                    conversationHistory.push({ role: "assistant", content: botMessage });
                    const allProducts = getAllCachedProducts();
                    const matched = data.retrieved_product_ids
                        .map((id) => allProducts.find((p) => p.id === id))
                        .filter(Boolean);
                    renderProductCards(matched);
                    sendBtn.disabled = false;
                    return;
                }
                appendMessage(botMessage, 'bot');
                conversationHistory.push({ role: "assistant", content: botMessage });

                if (data.action === "provide_recommendation" && data.recommended_size && productId) {
                    fetch(`${STORE_API_BASE}/api/measurement-sessions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            productId: productId,
                            shopperRef: sessionId,
                            heightCm: userMeasurements?.height_cm,
                            weightKg: userMeasurements?.weight_kg,
                            chestCm: userMeasurements?.chest_cm,
                            waistCm: userMeasurements?.waist_cm,
                            hipsCm: userMeasurements?.hips_cm,
                            recommendedSize: data.recommended_size,
                            confidenceScore: data.confidence_score,
                            explanation: data.explanation,
                        }),
                    }).catch((err) => console.warn('Could not log measurement session:', err));
                }
            }
        } catch (error) {
            clearTimeout(timeoutId);
            hideThinking();
            if (error.name === 'AbortError') {
                appendMessage("That's taking longer than expected. Please try again.", 'bot');
            } else {
                appendMessage("Connection error. Please try again in a moment.", 'bot');
            }
        } finally {
            sendBtn.disabled = false;
        }
    }

    document.getElementById('widgetSend').onclick = sendMessage;
    document.getElementById('widgetInput').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

    function ensureMeasurementsVisible() {
        const measurementsRow = document.getElementById('measurementsRow');
        measurementsRow.classList.remove('hidden');
        document.getElementById('measurementsToggle').textContent = '📏 Hide measurements';
    }

    // General chat can't compute an exact size anyway (see agent.py's
    // rule 7 - no real chart to compare against outside a specific
    // product page), so showing measurement fields there implies a
    // precision the chat can't deliver. Hidden entirely in that context;
    // shown automatically once there's a real product to compute against.
    function hideMeasurementsForGeneralChat() {
        const measurementsRow = document.getElementById('measurementsRow');
        const toggle = document.getElementById('measurementsToggle');
        measurementsRow.classList.add('hidden');
        toggle.classList.add('hidden');
    }

    window.ManikanWidget = {
        open: function() {
            document.getElementById('widgetBox').style.display = 'flex';
            initChat();
            const { productId } = getCurrentProductContext();
            if (productId) {
                ensureMeasurementsVisible();
            } else {
                hideMeasurementsForGeneralChat();
            }
        },
        openForSizing: function() {
            document.getElementById('widgetBox').style.display = 'flex';
            isInitialized = true;

            const { productName } = getCurrentProductContext();
            const label = productName ? `"${productName}"` : "this item";
            appendMessage(
                `Let's find your size for ${label}. Please enter your height, weight, chest, and waist measurements below.`,
                'bot'
            );

            ensureMeasurementsVisible();
        },
    };

    // Deep link from a product card in the general chat: ?open_sizing=true
    // auto-opens this page's chat straight into sizing mode, instead of
    // the user having to find the "Find My Size" button themselves after
    // navigating here. A short delay gives the product page's own script
    // time to set window.currentProductContext first.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open_sizing') === 'true') {
        setTimeout(() => {
            window.ManikanWidget.openForSizing();
            // Clean the URL so a refresh/back-navigation doesn't re-trigger it.
            urlParams.delete('open_sizing');
            const newSearch = urlParams.toString();
            const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
            window.history.replaceState({}, '', newUrl);
        }, 300);
    }
})();