import { useState } from 'react'
import './App.css'
import axios from 'axios';

function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("mistralai/mistral-7b-instruct"); 

  
  const OPENROUTER_API_KEY = import.meta.env.VITE_API_KEY;

 
  async function generateAnswer() {
    setLoading(true);
    setAnswer("");

    try {
      const response = await axios({
        url: "https://openrouter.ai/api/v1/chat/completions",
        method: "post",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        data: {
          model: model, 
          messages: [{ role: "user", content: question }],
        },
      });

      const result = response.data?.choices?.[0]?.message?.content || "";
      setAnswer(result);
    } catch (error) {
      console.error("Error:", error?.response || error.message);
      setAnswer(" Error: " + (error.response?.data?.error?.message || error.message));
    } finally {
      setLoading(false);
    }
  }

  return (
     <div className="app-container">
      <div className="chat-card">
      <h1>CHAT AI (OpenRouter)</h1>
      <label>
        Choose Model:{" "}
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="deepseek/deepseek-chat-v3-0324:free">DeepSeek Chat (Free)</option>
  <option value="deepseek/deepseek-r1:free">DeepSeek R1 (Free)</option>
          <option value="mistralai/mistral-7b-instruct">Mistral 7B</option>
          <option value="meta-llama/llama-3-70b-instruct">Llama 3 (70B)</option>
        </select>
      </label>

      <br /><br />

    
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        cols={30}
        rows={10}
        placeholder="Type your question here..."
      />
      <br />
      <hr />

     
      <button onClick={generateAnswer} disabled={loading}>
        {loading ? "Generating..." : "Generate"}
      </button>

      <hr />

  
      {loading && <p> Loading...</p>}
      {answer && (
        <div style={{ whiteSpace: "pre-wrap" }}>
          <b>Response:</b> {answer}
        </div>
      )}
    </div>
    </div>
  );
}

export default App
