/* eslint-env browser */
(function() {
    if (typeof window === 'undefined') return;

    const currentScript = document.currentScript || Array.from(document.querySelectorAll('script')).find(s => s.src.includes('widget.js'));
    // Static, retailer-wide config - set once when the script is embedded
    const RETAILER_ID = currentScript ? currentScript.getAttribute('data-retailer-id') : "manikan";
    const RECOMMEND_API_BASE = currentScript ? currentScript.getAttribute('data-recommend-api') : "http://127.0.0.1:8000";
    const WIDGET_API_KEY = currentScript ? currentScript.getAttribute('data-widget-key') : "";
    // Default to same-origin if not explicitly configured, so the
    // fetch_products branch still works instead of silently skipping
    // whenever NEXT_PUBLIC_SITE_URL isn't set on the Script tag.
    const STORE_API_BASE = (currentScript && currentScript.getAttribute('data-store-api')) || window.location.origin;

    // Product context is dynamic (changes as the shopper browses different
    // product pages) so it is read fresh from window at send-time instead of
    // from a static script attribute, which only gets set once at page load
    // and never updates during client-side navigation.
    function getCurrentProductContext() {
        const ctx = (typeof window !== 'undefined' && window.currentProductContext) || {};
        return {
            productId: ctx.id || null,
            productName: ctx.name || null,
            // Expected shape: JSON string of [{size, chest_cm, waist_cm, ...}]
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
    // Local state for the measurements the user provides, sent as "betas"
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
        .category-select { width: 100%; padding: 12px; border-radius: 14px; border: 1px solid #ddd; background: #fff; }
        .measurements-row { display: flex; gap: 8px; }
        .measurements-row.hidden { display: none; }
        .measurements-row input { flex: 1; min-width: 0; border: 1px solid #ddd; border-radius: 10px; padding: 8px; font-size: 12px; }
        .measurements-toggle { background: none; border: none; color: #888; font-size: 11px; text-align: left; padding: 0; cursor: pointer; text-decoration: underline; }
        .input-group { display: flex; gap: 8px; }
        .ai-widget-input { flex: 1; border: 1px solid #ddd; border-radius: 14px; padding: 12px; outline: none; }
        .ai-widget-send { background: #111; color: #fff; border: none; border-radius: 14px; padding: 0 20px; cursor: pointer; }
        .ai-widget-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .view-item-btn { margin-top: 10px; display: block; background: #dfb76c; color: #111; padding: 10px 15px; border-radius: 10px; text-decoration: none; font-weight: 600; text-align: center; }
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
                <select id="categorySelect" class="category-select">
                    <option value="general">General browsing</option>
                    <option value="search">Looking for something specific</option>
                </select>
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

    // Populate the category dropdown from the retailer's real product data
    // (Product.category, the plain text field /api/products filters on)
    // instead of the separate Category taxonomy table, which may use
    // different slugs that don't match what /api/products expects.
    // Also caches products per category client-side, so repeated
    // "show me more shirts" style requests don't re-hit the network.
    let availableCategories = [];
    const categoryProductsCache = {};
    // Cache of {chart, productId} per category, built from one
    // representative product's variants - so a category only needs to be
    // fetched in detail once per session, no matter how many times the
    // user asks about sizing in that category. productId is kept so
    // category-level recommendations can still be logged to
    // MeasurementSession (which requires a real productId).
    const categorySizeChartCache = {};

    async function getCategorySizeChart(category) {
        if (categorySizeChartCache[category]) return categorySizeChartCache[category];

        const products = categoryProductsCache[category];
        if (!products || products.length === 0) return null;

        const representative = products[0];
        try {
            const slugOrId = representative.slug || representative.id;
            const res = await fetch(`${STORE_API_BASE}/api/products/${slugOrId}`);
            const data = await res.json();
            const product = data.product || data;

            const chart = JSON.stringify(
                (product.variants || []).map((v) => ({
                    size: v.sizeLabel,
                    chest_cm: v.chestCm,
                    waist_cm: v.waistCm,
                    hip_cm: v.hipCm,
                }))
            );
            const entry = { chart, productId: product.id || representative.id };
            categorySizeChartCache[category] = entry;
            return entry;
        } catch (err) {
            console.warn(`Could not load size chart for category ${category}:`, err);
            return null;
        }
    }

    (async function loadCategories() {
        try {
            const res = await fetch(`${STORE_API_BASE}/api/products`);
            const data = await res.json();
            const products = Array.isArray(data) ? data : (data.products || []);

            products.forEach((p) => {
                if (!p.category) return;
                if (!categoryProductsCache[p.category]) categoryProductsCache[p.category] = [];
                categoryProductsCache[p.category].push(p);
            });
            availableCategories = Object.keys(categoryProductsCache);

            const select = document.getElementById('categorySelect');
            availableCategories.forEach((value) => {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = value.charAt(0).toUpperCase() + value.slice(1);
                select.appendChild(opt);
            });
        } catch (err) {
            console.warn('Could not load categories, falling back to General/Search only:', err);
        }
    })();

    function initChat() {
        if (!isInitialized) {
            const welcomeMsg = "Hey there! 👋 I'm your Manikan style buddy. Tell me what you're shopping for today, or drop your measurements below and I'll find your perfect fit!";
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
        msg.innerText = text;
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

    function _last_user_text_lower() {
        for (let i = conversationHistory.length - 1; i >= 0; i--) {
            if (conversationHistory[i].role === 'user') return (conversationHistory[i].content || '').toLowerCase();
        }
        return '';
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
        const catSelect = document.getElementById('categorySelect');
        let text = input.value.trim();

        // Read measurements first, since filling these fields alone
        // (without typing anything) should still be enough to send.
        readMeasurementsIfProvided();

        if (!text && userMeasurements) {
            text = `My measurements: height ${userMeasurements.height_cm}cm, weight ${userMeasurements.weight_kg}kg, chest ${userMeasurements.chest_cm}cm, waist ${userMeasurements.waist_cm}cm, hip ${userMeasurements.hips_cm}cm`;
        }

        if (!text) return;

        appendMessage(text, 'user');
        conversationHistory.push({ role: "user", content: text });
        input.value = '';
        sendBtn.disabled = true;

        // Read fresh on every send - reflects whichever product page the
        // shopper is currently on, not whatever was true when the script first loaded
        const { productId, sizeChart: productSizeChart } = getCurrentProductContext();
        let sizeChart = productSizeChart;

        // No specific product in context, but a real category is picked -
        // use (or fetch + cache) that category's representative size
        // chart, purely to compute/answer sizing questions. productId
        // stays null here on purpose: logging a MeasurementSession
        // against a "representative" product would be misleading data,
        // and would make isPurchased meaningless (it's meant to track
        // whether a *real* product recommendation converted). Actual
        // logging happens once the shopper engages a specific product.
        const isRealCategory = catSelect.value !== 'general' && catSelect.value !== 'search';
        if (!sizeChart && isRealCategory) {
            const categoryData = await getCategorySizeChart(catSelect.value);
            if (categoryData) {
                sizeChart = categoryData.chart;
            }
        }

        // Intent reflects what the user actually asked for, not a fixed value
        let intent = "general";
        if (catSelect.value === "search") {
            intent = "search";
        } else if (productId && !userMeasurements) {
            intent = "general"; // agent will respond with ask_measurements
        }

        // Abort if the backend takes too long, instead of leaving the
        // request hanging (e.g. while an LLM provider quota error is
        // being retried upstream).
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 40000);

        showThinking();

        try {
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
                    retailer_id: RETAILER_ID,
                    selected_category: catSelect.value,
                    intent: intent,
                    betas: userMeasurements,
                    size_chart: sizeChart,
                    available_categories: availableCategories,
                }),
            });
            clearTimeout(timeoutId);

            if (response.status === 429) {
                hideThinking();
                appendMessage("You're sending messages a bit fast - please wait a moment and try again.", 'bot');
                return;
            }

            const data = await response.json();
            console.log("Backend Response:", data);
            hideThinking();

            if (data.action === "fetch_products") {
                appendMessage(data.reply, 'bot');
                conversationHistory.push({ role: "assistant", content: data.reply });

                try {
                    const isRealCategory = catSelect.value !== 'general' && catSelect.value !== 'search';

                    // Product classification (menswear/womenswear), not a
                    // personal attribute - only applied if the user
                    // explicitly mentioned it while shopping.
                    const lastUserText = _last_user_text_lower();
                    let genderFilter = null;
                    if (/\bmen'?s?\b/.test(lastUserText) && !/\bwomen'?s?\b/.test(lastUserText)) genderFilter = 'men';
                    else if (/\bwomen'?s?\b/.test(lastUserText)) genderFilter = 'women';

                    // Use the client-side cache when possible (category-only,
                    // no size filter) instead of hitting the network again.
                    let products;
                    if (isRealCategory && !data.recommended_size && categoryProductsCache[catSelect.value]) {
                        products = categoryProductsCache[catSelect.value];
                        if (genderFilter) products = products.filter((p) => p.gender === genderFilter);
                        console.log("Using cached products for category:", catSelect.value);
                    } else {
                        const queryParams = new URLSearchParams();
                        if (isRealCategory) queryParams.set('category', catSelect.value);
                        if (data.recommended_size) queryParams.set('size', data.recommended_size);
                        if (genderFilter) queryParams.set('gender', genderFilter);
                        const res = await fetch(`${STORE_API_BASE}/api/products?${queryParams.toString()}`);
                        const productsData = await res.json();
                        // The endpoint may return a bare array or an object like { products: [...] }
                        products = Array.isArray(productsData) ? productsData : (productsData.products || []);
                    }

                    console.log("Products fetched:", products);

                    const inStock = products.filter((p) => (p.stock ?? 1) > 0);
                    if (inStock.length > 0) {
                        inStock.slice(0, 5).forEach((product) => {
                            appendMessage(
                                `${product.name} - EGP ${product.priceEgp ?? product.price ?? ''}`,
                                'bot',
                                `/store/${product.slug || product.id}`
                            );
                        });
                    } else if (products.length > 0) {
                        appendMessage("Those are currently out of stock, but check back soon!", 'bot');
                    } else {
                        appendMessage("I couldn't find matching products right now.", 'bot');
                    }
                } catch (fetchErr) {
                    console.error("Failed to fetch products:", fetchErr);
                    appendMessage("I found a match but couldn't load the product details right now.", 'bot');
                }
            } else {
                appendMessage(data.reply, 'bot');
                conversationHistory.push({ role: "assistant", content: data.reply });

                // Log successful, confident recommendations for analytics
                // (retailer dashboard: which sizes get recommended, later
                // cross-referenced with purchases). Fire-and-forget - a
                // missing or failing endpoint here must never disrupt the
                // chat experience itself.
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

    window.ManikanWidget = {
        open: function() {
            document.getElementById('widgetBox').style.display = 'flex';
            initChat();
            ensureMeasurementsVisible();
        },
        // Called by "Find My Size" buttons on a product page. Opens the
        // chat and immediately shows the measurement inputs for the
        // product currently in context, instead of waiting for the user
        // to type something first.
        openForSizing: function() {
            document.getElementById('widgetBox').style.display = 'flex';
            isInitialized = true; // skip the generic welcome message

            const { productId, productName } = getCurrentProductContext();
            const label = productName ? `"${productName}"` : "this item";
            appendMessage(
                `Let's find your size for ${label}. Please enter your height, weight, chest, and waist measurements below.`,
                'bot'
            );

            ensureMeasurementsVisible();
        },
    };
})();