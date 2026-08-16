(function() {
    // 1. Extract context configuration from the script tag dynamically.
    // `data-retailer-key` matches the same attribute the body/try-on widgets
    // use (apps/widget) -- retailer integration instructions are now
    // consistent across all three services, instead of this widget's own
    // `data-retailer-id` convention.
    const currentScript = document.currentScript || Array.from(document.querySelectorAll('script')).find(s => s.src.includes('widget.js'));
    const RETAILER_KEY = currentScript ? currentScript.getAttribute('data-retailer-key') : null;
    const PRODUCT_ID = currentScript ? currentScript.getAttribute('data-product-id') : null;
    // This widget must NEVER call the Python recommendation-service directly
    // (same rule apps/widget documents) -- it only ever calls the Store,
    // which authenticates the request and proxies to the Python service.
    // Base URL: an explicit `data-store-url` override, else the origin this
    // script itself was loaded from (the Store serves its own widget assets),
    // else localhost for bare local testing.
    const STORE_API_URL = (currentScript && currentScript.getAttribute('data-store-url'))
        || (currentScript && currentScript.src ? new URL(currentScript.src).origin : null)
        || 'http://localhost:3000';

    let sessionId = localStorage.getItem('manikan_session_id');
    if (!sessionId) {
        sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('manikan_session_id', sessionId);
    }

    let conversationHistory = [];
    // The size chart is no longer sent from here -- the Store builds it
    // server-side from the product's own ingested measurements (same
    // "server resolves it, never trusts the client" rule as retailer_id
    // above). A client-supplied chart was the exact data the server used to
    // compute a recommendation for that same client, so nothing stopped a
    // fabricated one from steering its own result.
    let activeUserBetas = null;

    // Inject Modern Premium & Luxurious CSS Styling (Monochrome with subtle Gold Accents)
    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

        .ai-widget-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 10000;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        
        /* Floating Button with Elegant Pulse Effect */
        .ai-widget-button {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #111111;
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.1);
            cursor: pointer;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }
        .ai-widget-button:hover {
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 14px 35px rgba(0,0,0,0.28);
            background: #1a1a1a;
        }
        .ai-widget-button::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 1px solid #111111;
            opacity: 0.3;
            animation: widget-pulse 2.5s infinite;
        }
        @keyframes widget-pulse {
            0% { transform: scale(1); opacity: 0.3; }
            100% { transform: scale(1.4); opacity: 0; }
        }

        /* Luxurious Chatbox Container with Premium Layout */
        .ai-widget-box {
            display: none;
            width: 390px;
            height: 600px;
            background: #ffffff;
            border-radius: 20px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.15);
            position: absolute;
            bottom: 80px;
            right: 0;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #ebeeef;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        /* Premium Minimalist Header with Fine Gold Border Line */
        .ai-widget-header {
            background: #111111;
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #dfb76c; /* Elegant subtle gold accent */
        }
        .ai-widget-header-title {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .ai-widget-brand {
            font-weight: 700;
            font-size: 14px;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .ai-widget-status {
            font-size: 11px;
            color: #b0b0b0;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .ai-widget-status::before {
            content: '';
            width: 6px;
            height: 6px;
            background: #4ade80;
            border-radius: 50%;
            display: inline-block;
        }

        /* Action Menu - Integrated 3D Avatar Button */
        .ai-widget-actions {
            padding: 10px 20px;
            background: #fafafa;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            justify-content: center;
        }
        .ai-btn-avatar {
            width: 100%;
            background: #ffffff;
            color: #111111;
            border: 1px solid #111111;
            padding: 8px 16px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 1px;
            transition: all 0.2s ease-in-out;
            text-align: center;
        }
        .ai-btn-avatar:hover {
            background: #111111;
            color: #ffffff;
        }
        .ai-btn-avatar.active-linked {
            background: #e8f5e9;
            color: #2e7d32;
            border-color: #2e7d32;
        }

        /* Smooth Messages Area */
        .ai-widget-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #fdfdfd;
            display: flex;
            flex-direction: column;
            gap: 16px;
            scrollbar-width: thin;
        }
        .ai-widget-messages::-webkit-scrollbar { width: 4px; }
        .ai-widget-messages::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 4px; }

        /* Exquisite Message Bubble Design */
        .ai-message {
            padding: 12px 16px;
            border-radius: 14px;
            max-width: 80%;
            font-size: 13px;
            line-height: 1.6;
            word-wrap: break-word;
            animation: message-slide 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes message-slide {
            from { transform: translateY(10px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .ai-message.user {
            background: #111111;
            color: #ffffff;
            align-self: flex-end;
            margin-left: auto;
            border-bottom-right-radius: 2px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.06);
        }
        .ai-message.bot {
            background: #ffffff;
            color: #1a1a1a;
            align-self: flex-start;
            border-bottom-left-radius: 2px;
            border: 1px solid #f0f0f0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.02);
        }

        /* Calculated Premium Sizing Badges Layout */
        .ai-size-result-badge {
            margin-top: 10px;
            background: #f5f5f5;
            border-left: 3px solid #111111;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
        }
        .ai-size-title {
            font-weight: 700;
            color: #111111;
            display: block;
            margin-bottom: 2px;
        }

        /* Beautiful Typing Indicator */
        .typing-dots {
            display: flex;
            gap: 4px;
            align-items: center;
            height: 12px;
        }
        .typing-dots span {
            width: 6px;
            height: 6px;
            background: #111111;
            border-radius: 50%;
            animation: dot-bounce 1.4s infinite ease-in-out both;
        }
        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes dot-bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1.0); }
        }

        /* Dynamic Product Card Layout */
        .ai-product-cards-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 6px;
            width: 100%;
        }
        .ai-product-card {
            background: #ffffff;
            border: 1px solid #eef0f1;
            border-radius: 10px;
            padding: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            text-decoration: none;
            color: #111111;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 4px 12px rgba(0,0,0,0.02);
        }
        .ai-product-card:hover {
            border-color: #111111;
            transform: translateY(-2px);
            box-shadow: 0 6px 18px rgba(0,0,0,0.08);
        }
        .ai-product-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .ai-product-name {
            font-weight: 600;
            font-size: 13px;
            color: #111111;
            letter-spacing: 0.2px;
        }
        .ai-product-cat {
            font-size: 10px;
            color: #888888;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }
        .ai-product-btn {
            font-size: 11px;
            font-weight: 600;
            background: #111111;
            color: #ffffff;
            padding: 8px 14px;
            border-radius: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            transition: background 0.2s;
        }
        .ai-product-card:hover .ai-product-btn {
            background: #333333;
        }

        /* Refined Input Design Area */
        .ai-widget-input-area {
            display: flex;
            border-top: 1px solid #f0f0f0;
            padding: 16px;
            background: white;
            align-items: center;
            gap: 12px;
        }
        .ai-widget-input {
            flex: 1;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px 16px;
            outline: none;
            font-size: 13px;
            color: #1a1a1a;
            transition: all 0.2s;
            font-family: inherit;
        }
        .ai-widget-input:focus {
            border-color: #111111;
            box-shadow: 0 0 0 2px rgba(17, 17, 17, 0.04);
        }
        .ai-widget-send {
            background: #111111;
            color: white;
            border: none;
            border-radius: 10px;
            width: 42px;
            height: 42px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .ai-widget-send:hover { background: #2a2a2a; }
        .ai-widget-send svg { width: 16px; height: 16px; fill: currentColor; }
    `;
    document.head.appendChild(style);

    // Create Widget Markup
    const container = document.createElement('div');
    container.className = 'ai-widget-container';
    container.innerHTML = `
        <button class="ai-widget-button" id="widgetToggle">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <div class="ai-widget-box" id="widgetBox">
            <div class="ai-widget-header">
                <div class="ai-widget-header-title">
                    <span class="ai-widget-brand">MANIKAN AI</span>
                    <span class="ai-widget-status">Size & Fit Assistant</span>
                </div>
                <span style="cursor:pointer; font-size: 18px; opacity: 0.8;" id="widgetClose">✕</span>
            </div>
            <div class="ai-widget-actions">
                <button class="ai-btn-avatar" id="btnConnectAvatar">Connect 3D Avatar</button>
            </div>
            <div class="ai-widget-messages" id="widgetMessages">
                <div class="ai-message bot">Welcome to Nour Atelier. I am your premium AI fashion co-pilot. Share your measurements, ask for size recommendations, or link your 3D mannequin for immediate geometric precision fitting!</div>
            </div>
            <div class="ai-widget-input-area">
                <input type="text" class="ai-widget-input" id="widgetInput" placeholder="Ask about sizing or lookups...">
                <button class="ai-widget-send" id="widgetSend">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(container);

    const toggleBtn = document.getElementById('widgetToggle');
    const closeBtn = document.getElementById('widgetClose');
    const box = document.getElementById('widgetBox');
    const sendBtn = document.getElementById('widgetSend');
    const input = document.getElementById('widgetInput');
    const messagesContainer = document.getElementById('widgetMessages');
    const btnConnectAvatar = document.getElementById('btnConnectAvatar');

    toggleBtn.onclick = () => {
        box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
    };
    closeBtn.onclick = () => { box.style.display = 'none'; };

    // Decoupled Interactive Action Trigger for 3D Mesh
    btnConnectAvatar.onclick = () => {
        if (!activeUserBetas) {
            activeUserBetas = [0.12, -0.45, 0.88, 0.05, -0.1, 0.02, -0.05, 0.1, -0.2, 0.15]; 
            btnConnectAvatar.innerText = "Mannequin Linked ✓";
            btnConnectAvatar.classList.add('active-linked');
            appendMessage("3D Mannequin synchronized! Computing ideal fit metrics based on size chart...", 'bot');
            sendPayloadToBackend("", true);
        } else {
            activeUserBetas = null;
            btnConnectAvatar.innerText = "Connect 3D Avatar";
            btnConnectAvatar.classList.remove('active-linked');
            appendMessage("Avatar unlinked. Reverting back to standalone conversation style.", 'bot');
        }
    };

    window.ManikanWidget = {
        open: function() { box.style.display = 'flex'; }
    };

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        appendMessage(text, 'user');
        conversationHistory.push({ role: "user", content: text });
        input.value = '';

        const loadingDiv = appendLoadingIndicator();
        await sendPayloadToBackend(text, false, loadingDiv);
    }

    async function sendPayloadToBackend(userInputText, is3DTrigger = false, loadingDiv = null) {
        if (!loadingDiv) {
            loadingDiv = appendLoadingIndicator();
        }

        // retailer_id is intentionally omitted -- the Store resolves it
        // server-side from the authenticated X-Manikan-Key, the same way
        // /api/tryon resolves product data server-side rather than trusting
        // the client.
        const payload = {
            session_id: sessionId,
            messages: conversationHistory,
            product_id: PRODUCT_ID,
            betas: activeUserBetas
        };

        try {
            const response = await fetch(`${STORE_API_URL}/api/widget/recommend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Manikan-Key': RETAILER_KEY
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("HTTP error " + response.status);

            const data = await response.json();
            
            let cleanReply = data.reply.replace(/\[MANIKAN-.*?\]:\s*/gi, '');
            loadingDiv.innerHTML = cleanReply;
            conversationHistory.push({ role: "assistant", content: cleanReply });

            // If calculations are returned from Case 3, inject structural UI elements
            if (data.recommended_size) {
                const badge = document.createElement('div');
                badge.className = 'ai-size-result-badge';
                badge.innerHTML = `
                    <span class="ai-size-title">Recommended Fit: Size ${data.recommended_size}</span>
                    <span style="color:#666; font-size:11px;">Confidence Score: ${Math.round((data.confidence_score || 0.95) * 100)}% Match</span>
                `;
                loadingDiv.appendChild(badge);
            }

            if (data.recommended_products && data.recommended_products.length > 0) {
                renderProductRecommendations(data.recommended_products);
            }

        } catch (error) {
            loadingDiv.innerText = "Connection lost. Please try again in a moment.";
            console.error("Error connecting to backend:", error);
        }
    }

    function appendMessage(text, sender) {
        const msg = document.createElement('div');
        msg.className = `ai-message ${sender}`;
        msg.innerText = text;
        messagesContainer.appendChild(msg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return msg;
    }

    function appendLoadingIndicator() {
        const msg = document.createElement('div');
        msg.className = 'ai-message bot';
        msg.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        messagesContainer.appendChild(msg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return msg;
    }

    function renderProductRecommendations(products) {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'ai-product-cards-container';

        products.forEach(p => {
            const card = document.createElement('a');
            card.href = p.link;
            card.className = 'ai-product-card';
            card.innerHTML = `
                <div class="ai-product-info">
                    <span class="ai-product-name">${p.product_name}</span>
                    <span class="ai-product-cat">${p.category.toUpperCase()}</span>
                </div>
                <div class="ai-product-btn">View Item</div>
            `;
            cardContainer.appendChild(card);
        });

        messagesContainer.appendChild(cardContainer);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
})();