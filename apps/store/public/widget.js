/* eslint-env browser */
(function() {
    if (typeof window === 'undefined') return;

    const currentScript = document.currentScript || Array.from(document.querySelectorAll('script')).find(s => s.src.includes('widget.js'));
    const RETAILER_ID = currentScript ? currentScript.getAttribute('data-retailer-id') : "manikan";
    const PRODUCT_ID = currentScript ? currentScript.getAttribute('data-product-id') : null;

    const activeSizeChartCSV = currentScript ? currentScript.getAttribute('data-size-chart') : "";

    let sessionId = localStorage.getItem('manikan_session_id');
    if (!sessionId) {
        sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('manikan_session_id', sessionId);
    }

    let conversationHistory = [];
    let activeUserBetas = null; 

    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

        .ai-widget-container {
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 10000;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        
        .ai-widget-button {
            width: 64px;
            height: 64px;
            border-radius: 20px;
            background: linear-gradient(135deg, #111111 0%, #2a2a2a 100%);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.15);
            cursor: pointer;
            box-shadow: 0 12px 35px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }
        .ai-widget-button:hover {
            transform: translateY(-4px) scale(1.03);
            box-shadow: 0 16px 40px rgba(0,0,0,0.3);
            background: linear-gradient(135deg, #1a1a1a 0%, #3a3a3a 100%);
        }

        .ai-widget-box {
            display: none;
            width: 400px;
            height: 620px;
            background: #ffffff;
            border-radius: 24px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.12);
            position: absolute;
            bottom: 85px;
            right: 0;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid rgba(0,0,0,0.06);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .ai-widget-header {
            background: #111111;
            color: white;
            padding: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #dfb76c;
        }
        .ai-widget-header-title {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .ai-widget-brand {
            font-weight: 700;
            font-size: 15px;
            letter-spacing: 2.5px;
            text-transform: uppercase;
            background: linear-gradient(90deg, #ffffff, #dfb76c);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .ai-widget-status {
            font-size: 11px;
            color: #b0b0b0;
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 2px;
        }
        .ai-widget-status::before {
            content: '';
            width: 7px;
            height: 7px;
            background: #10b981;
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 10px #10b981;
        }

        .ai-widget-actions {
            padding: 14px 24px;
            background: #fcfcfc;
            border-bottom: 1px solid #f3f4f6;
            display: flex;
            justify-content: center;
        }
        .ai-btn-avatar {
            width: 100%;
            background: #111111;
            color: #ffffff;
            border: 1px solid #111111;
            padding: 10px 18px;
            font-size: 12px;
            font-weight: 600;
            border-radius: 12px;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            text-align: center;
        }
        .ai-btn-avatar:hover {
            background: #dfb76c;
            border-color: #dfb76c;
            color: #111111;
        }
        .ai-btn-avatar.active-linked {
            background: #e6f4ea;
            color: #1e7e34;
            border-color: #1e7e34;
            box-shadow: none;
        }

        .ai-widget-messages {
            flex: 1;
            padding: 24px;
            overflow-y: auto;
            background: #fdfdfd;
            display: flex;
            flex-direction: column;
            gap: 16px;
            scrollbar-width: thin;
        }
        .ai-widget-messages::-webkit-scrollbar { width: 4px; }
        .ai-widget-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

        .ai-message {
            padding: 14px 18px;
            border-radius: 18px;
            max-width: 82%;
            font-size: 13.5px;
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
            border-bottom-right-radius: 4px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.04);
        }
        .ai-message.bot {
            background: #f4f5f7;
            color: #1f2937;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            border: 1px solid #e5e7eb;
        }

        .ai-size-result-badge {
            margin-top: 12px;
            background: #ffffff;
            border-left: 4px solid #dfb76c;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 12.5px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.04);
        }
        .ai-size-title {
            font-weight: 700;
            color: #111111;
            display: block;
            margin-bottom: 2px;
        }

        .typing-dots {
            display: flex;
            gap: 5px;
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
            border-radius: 12px;
            padding: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            text-decoration: none;
            color: #111111;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 4px 12px rgba(0,0,0,0.02);
        }
        .ai-product-card:hover {
            border-color: #dfb76c;
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.08);
        }
        .ai-product-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .ai-product-name {
            font-weight: 600;
            font-size: 13.5px;
            color: #111111;
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
            padding: 10px 16px;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            transition: all 0.2s;
        }
        .ai-product-card:hover .ai-product-btn {
            background: #dfb76c;
            color: #111111;
        }

        .ai-widget-input-area {
            display: flex;
            border-top: 1px solid #f3f4f6;
            padding: 18px 24px;
            background: white;
            align-items: center;
            gap: 12px;
        }
        .ai-widget-input {
            flex: 1;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            padding: 14px 18px;
            outline: none;
            font-size: 13.5px;
            color: #1a1a1a;
            transition: all 0.2s;
            font-family: inherit;
        }
        .ai-widget-input:focus {
            border-color: #dfb76c;
            box-shadow: 0 0 0 3px rgba(223, 183, 108, 0.15);
        }
        .ai-widget-send {
            background: #111111;
            color: white;
            border: none;
            border-radius: 14px;
            width: 48px;
            height: 48px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .ai-widget-send:hover { 
            background: #dfb76c; 
            color: #111111;
        }
        .ai-widget-send svg { width: 18px; height: 18px; fill: currentColor; }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.className = 'ai-widget-container';
    container.innerHTML = `
        <button class="ai-widget-button" id="widgetToggle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
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
                <div class="ai-message bot">Welcome to Manikan Store. I am your premium AI fashion co-pilot. Share your measurements, ask for size recommendations, or link your 3D mannequin for immediate geometric precision fitting!</div>
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

        const payload = {
            session_id: sessionId,
            messages: conversationHistory,
            product_id: PRODUCT_ID,
            retailer_id: RETAILER_ID,
            betas: activeUserBetas,
            size_chart: activeSizeChartCSV
        };

        try {
            const response = await fetch('http://127.0.0.1:8000/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("HTTP error " + response.status);

            const data = await response.json();
            
            let cleanReply = data.reply.replace(/\[MANIKAN-.*?\]:\s*/gi, '');
            loadingDiv.innerHTML = cleanReply;
            conversationHistory.push({ role: "assistant", content: cleanReply });

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
            loadingDiv.innerText = "Connection lost. Please ensure your local FastAPI server is running.";
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