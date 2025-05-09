import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [formData, setFormData] = useState({
    disease: "",
    symptoms: "",
    description: "",
  });
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoId, setVideoId] = useState("");
  const [script, setScript] = useState("");

  // Utility: Strip stage directions
  const cleanScript = (script) => {
    return script
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

 const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError("");
  setVideoUrl("");
  setVideoId("");
  setScript("");

  try {
    // Step 1: Generate script (300 chars max)
    console.log("🔵 Step 1: Generating script...");
    
    const openaiResp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          { 
            role: "system", 
            content: "You are a medical explainer. Create concise explanations (300 characters max)." 
          },
          {
            role: "user",
            content: `Explain "${formData.disease}" (symptoms: ${formData.symptoms}) in 300 CHARACTERS MAX: ${formData.description}`
          },
        ],
        max_tokens: 350 // Allows for 300 chars + buffer
      },
      {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        }
      }
    );

    const rawScript = openaiResp.data.choices[0].message.content;
    let cleanNarration = cleanScript(rawScript).slice(0, 300); // Enforce 300 char limit
    setScript(rawScript);
    console.log("✅ Script generated:", cleanNarration.length, "chars");

    // Step 2: Create video with extended timeout
    console.log("🔵 Step 2: Creating video...");
    const heygenResponse = await axios.post(
      "https://api.heygen.com/v2/video/generate",
      {
        video_inputs: [{
          character: {
            type: "avatar",
            avatar_id: "Daisy-inskirt-20220818",
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: cleanNarration,
            voice_id: "2d5b0e6cf36f460aa7fc47e3eee4ba54",
          },
          background: {
            type: "color",
            value: "#008000",
          },
        }],
        dimension: { width: 1280, height: 720 },
      },
      {
        headers: {
          "X-Api-Key": import.meta.env.VITE_HEYGEN_API_KEY,
          "Content-Type": "application/json",
        }
      }
    );

    const { video_id } = heygenResponse.data.data;
    setVideoId(video_id);
    console.log(`🔄 Polling status for video_id: ${video_id}`);

    // Step 3: Extended polling with progress updates
    let videoUrl = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 180; // 15 minutes at 5s intervals (180 attempts)
    const POLL_INTERVAL = 5000; // 5 seconds

    while (!videoUrl && attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        const statusResp = await axios.get(
          `https://api.heygen.com/v1/video_status.get?video_id=${video_id}`,
          {
            headers: {
              "X-Api-Key": import.meta.env.VITE_HEYGEN_API_KEY,
            }
          }
        );

        const status = statusResp.data.data.status;
        console.log(`⏳ Status check ${attempts}/${MAX_ATTEMPTS}: ${status}`);
        
       

        if (status === "completed") {
          videoUrl = statusResp.data.data.video_url;
          console.log("🎉 Video ready at:", videoUrl);
          setVideoUrl(videoUrl);
          setError("");
          break;
        } else if (status === "failed") {
          throw new Error("Video generation failed");
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      } catch (error) {
        if (error.response?.status === 404) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          continue;
        }
        throw error;
      }
    }

    if (!videoUrl) {
      throw new Error("Video generation took too long (15+ minutes)");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    setError(error.message || "Failed to generate video");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="app-container">
      <div className="form-wrapper">
        <h1 className="form-title">Disease Explainer Video Generator</h1>
        <form onSubmit={handleSubmit} className="form-fields">
          <input
            name="disease"
            placeholder="Disease"
            onChange={handleChange}
            className="input-field"
            required
          />
          <input
            name="symptoms"
            placeholder="Symptoms"
            onChange={handleChange}
            className="input-field"
            required
          />
          <textarea
            name="description"
            placeholder="Description"
            onChange={handleChange}
            className="textarea-field"
            required
          />
          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? "Generating..." : "Generate Video"}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}

        {loading && (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Generating video... This may take a minute</p>
          </div>
        )}

        {videoUrl && (
          <div className="video-container">
            <h2 className="video-title">Generated Video:</h2>
            <div className="video-wrapper">
              <video controls width="100%" className="video-player" key={videoUrl}>
                <source src={videoUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="video-links">
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="video-link">
                Open video in new tab
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;