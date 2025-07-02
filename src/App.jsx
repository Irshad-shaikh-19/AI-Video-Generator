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
  const [visualElements, setVisualElements] = useState([]);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const generateVisualElements = async (disease, symptoms) => {
    try {
      const visualResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "mistralai/mistral-7b-instruct",
          messages: [
            { 
              role: "system", 
              content: `You are a medical visualization assistant. Suggest exactly 3 simple text elements to explain ${disease}. Return ONLY a JSON array like ["element1", "element2", "element3"]` 
            },
            {
              role: "user",
              content: `Disease: ${disease}, Symptoms: ${symptoms}. Return ONLY a JSON array with 3 text elements. Example: ["heart diagram", "blood clot", "EKG waves"]`
            },
          ],
          max_tokens: 100
        },
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          }
        }
      );

      const responseText = visualResponse.data.choices[0].message.content;
      
      // Extract the JSON array from the response
      const arrayMatch = responseText.match(/\[.*\]/);
      if (arrayMatch) {
        const parsedArray = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsedArray)) {
          return parsedArray.slice(0, 3).map(v => v.toString());
        }
      }
      
      // Fallback if parsing fails
      return [
        `${disease} diagram`,
        `Symptom: ${symptoms.split(",")[0] || "symptom"}`,
        "Treatment options"
      ];
    } catch (error) {
      console.error("Error generating visuals:", error);
      return [
        `${disease} diagram`,
        `Symptom: ${symptoms.split(",")[0] || "symptom"}`,
        "Treatment options"
      ];
    }
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError("");
  setVideoUrl("");
  setVideoId("");
  setScript("");
  setVisualElements([]);

  try {
    // Step 1: Generate visual elements
    const visuals = await generateVisualElements(formData.disease, formData.symptoms);
    setVisualElements(visuals);

    // Step 2: Generate script
    const openaiResp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          { 
            role: "system", 
            content: `Create a 300-character medical explanation that references these visuals: ${visuals.join(", ")}.` 
          },
          {
            role: "user",
            content: `Explain "${formData.disease}" (symptoms: ${formData.symptoms}) in 300 CHARACTERS MAX: ${formData.description}`
          },
        ],
        max_tokens: 350
      },
      {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        }
      }
    );

    const rawScript = openaiResp.data.choices[0].message.content;
    const cleanScript = rawScript.replace(/\[.*?\]/g, "").trim().slice(0, 300);
    setScript(rawScript);

    // Step 3: Create video with visuals
    const videoInputs = [
      // Main avatar scene
      {
        character: {
          type: "avatar",
          avatar_id: "Daisy-inskirt-20220818",
          avatar_style: "normal",
        },
        voice: {
          type: "text",
          input_text: cleanScript,
          voice_id: "2d5b0e6cf36f460aa7fc47e3eee4ba54",
        },
        background: {
          type: "color",
          value: "#008000",
        },
        scenes: visuals.map((visual, index) => ({
          type: "text",
          content: visual,
          style: {
            font_size: 36,
            font_color: "#FFFFFF",
            background_color: "transparent",
            animation: "fade_in",
          },
          position: {
            x: 0.7,
            y: 0.3 + (index * 0.15)
          },
          start_time: index * 3,
          duration: 3
        }))
      }
    ];

    console.log("HeyGen API Payload:", {
      video_inputs: videoInputs,
      dimension: { width: 1280, height: 720 },
      test: false,
    });

    const heygenResponse = await axios.post(
      "https://api.heygen.com/v2/video/generate",
      {
        video_inputs: videoInputs,
        dimension: { width: 1280, height: 720 },
        test: false,
      },
      {
        headers: {
          "X-Api-Key": import.meta.env.VITE_HEYGEN_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000
      }
    );

    const { video_id } = heygenResponse.data.data;
    setVideoId(video_id);

    // Poll for video completion
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 5000;

    while (attempts < maxAttempts) {
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
        if (status === "completed") {
          setVideoUrl(statusResp.data.data.video_url);
          break;
        } else if (status === "failed") {
          throw new Error("Video generation failed");
        }
      } catch (error) {
        if (error.response?.status === 404) {
          // Video not ready yet
        } else {
          throw error;
        }
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // if (!videoUrl) {
    //   throw new Error("Video generation timed out");
    // }

  } catch (error) {
    console.error("Error:", error);
    setError(error.response?.data?.error?.message || error.message || "Failed to generate video");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="app-container">
      <div className="form-wrapper">
        <h1>Medical Explainer Video Generator</h1>
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Disease Name</label>
            <input
              name="disease"
              value={formData.disease}
              onChange={handleChange}
              required
              placeholder="e.g., Heart Attack"
            />
          </div>
          
          <div className="input-group">
            <label>Symptoms</label>
            <input
              name="symptoms"
              value={formData.symptoms}
              onChange={handleChange}
              required
              placeholder="e.g., Chest pain, Shortness of breath"
            />
          </div>
          
          <div className="input-group">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              placeholder="Brief description of the condition..."
            />
          </div>
          
          <button type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner"></span> Generating...
              </>
            ) : (
              "Create Video"
            )}
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Creating your video </p>
          </div>
        )}

        {videoUrl && (
          <div className="video-result">
            <h2>Your Medical Explainer Video</h2>
            <div className="video-container">
              <video controls src={videoUrl} key={videoUrl}></video>
            </div>
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="video-link">
              Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;