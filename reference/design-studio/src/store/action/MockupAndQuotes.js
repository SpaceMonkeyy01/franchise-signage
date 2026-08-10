import { createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "sonner";
import API from "../../json/apiConfig.js";
import { localStorageTokenKey } from "../../utils/localStorageTokenKey";
import { UnauthorizedUser } from "../../utils/Unauthorized";

export const GetAllMockups = createAsyncThunk(
  "user/GetAllMockups",
  async (payload, thunkAPI) => {
    try {
      const formData = new FormData();
      formData.append("logo_file", payload.logo_file);
      formData.append("scene_file", payload.scene_file);
      formData.append("signTypes", JSON.stringify(payload.signTypes));

      const response = await fetch(
        `${API.BACKEND_API_URL}/generate-mockups/batch-stream`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem(
              localStorageTokenKey
            )}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Server responded with ${response.status}: ${errorText}`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by double-newline (end of SSE event)
        const events = buffer.split("\n\n");
        buffer = events.pop(); // Keep unfinished chunk

        for (const event of events) {
          const lines = event.split("\n");
          for (const line of lines) {
            console.log("line", line);
            if (!line.trim()) continue;
            const cleanLine = line
              .replace(/^(data:\s*)+/i, "") // remove ALL repeated "data: "
              .replace(/\r$/, "") // remove trailing \r
              .trim();

            console.log("cleanLine", cleanLine);
            if (!cleanLine) continue;
            try {
              const json = JSON.parse(cleanLine);
              console.log("✅ Streamed JSON:", json);

              thunkAPI.dispatch({
                type: "signForm/setAllMockupsAndQuotes",
                payload: { name: json.name, mockupImage: json.imageData },
              });
            } catch (err) {
              console.warn("❌ Failed to parse streamed JSON:", cleanLine, err);
            }
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error("Stream error:", error);

      if (error?.status === 401) {
        UnauthorizedUser(payload.navigate);
      }

      toast.error(error.message || "Error while generating mockups.");
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);
