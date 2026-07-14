(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        .ai-widget-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            font-family: Arial, sans-serif;
        }
        .ai-widget-button {
            width: 60px;
            height: 60px;
            border-radius: 50px;
            background-color: #007bff;
            color: white;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .ai-widget-box {
            display: none;
            width: 350px;
            height: 450px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            position: absolute;
            bottom: 70px;
            right: 0;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #eee;
        }
        .ai-widget-header {
            background: #007bff;
            color: white;
            padding: 15px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
        }
        .ai-widget-messages {
            flex: 1;
            padding: 10px;
            overflow-y: auto;
            background: #f8f9fa;
        }
        .ai-message {
            margin-bottom: 10px;
            padding: 8px 12px;
            border-radius: 15px;
            max-width: 80%;
            font-size: 14px;
        }
        .ai-message.user {
            background: #007bff;
            color: white;
            align-self: flex-end;
            margin-left: auto;
        }
        .ai-message.bot {
            background: #e9ecef;
            color: #333;
        }
        .ai-widget-input-area {
            display: flex;
            border-top: 1px solid #eee;
            padding: 10px;
            background: white;
        }
        .ai-widget-input {
            flex: 1;
            border: 1px solid #ccc;
            border-radius: 20px;
            padding: 8px 15px;
            outline: none;
        }
        .ai-widget-send {
            background: #007bff;
            color: white;
            border: none;
            border-radius: 50%;
            width: 35px;
            height: 35px;
            margin-left: 5px;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.className = 'ai-widget-container';
    container.innerHTML = `
        <button class="ai-widget-button" id="widgetToggle">💬</button>
        <div class="ai-widget-box" id="widgetBox">
            <div class="ai-widget-header">
                <span>Manikan AI Assistant 🤖</span>
                <span style="cursor:pointer" id="widgetClose">✕</span>
            </div>
            <div class="ai-widget-messages" id="widgetMessages">
                <div class="ai-message bot">Hello! I am your AI assistant. How can I help you today?</div>
            </div>
            <div class="ai-widget-input-area">
                <input type="text" class="ai-widget-input" id="widgetInput" placeholder="Type your message...">
                <button class="ai-widget-send" id="widgetSend">➔</button>
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

    toggleBtn.onclick = () => {
        box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
    };
    closeBtn.onclick = () => { box.style.display = 'none'; };

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        appendMessage(text, 'user');
        input.value = '';

        const loadingDiv = appendMessage('Thinking...', 'bot');

        try {
            const response = await fetch('http://127.0.0.1:8000/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: text,
                    session_id: "test-session",
                    messages: [{"role": "user", "content": text}]
                })
            });
            const data = await response.json();
            loadingDiv.innerText = data.reply || "I couldn't process that. Please try again.";
        } catch (error) {
            loadingDiv.innerText = "Error connecting to backend.";
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

    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
})();