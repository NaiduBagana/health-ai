import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  Send,
  Edit2,
  Trash2,
  RefreshCw,
  Upload,
  AlertCircle,
} from "lucide-react";

interface Message {
  text: string;
  sender: "user" | "assistant";
  isProcessing?: boolean;
}

interface Appointment {
  id: string;
  date_time: string;
  purpose: string;
  status: string;
}

const API_URL = "https://ai-health-assistant-0art.onrender.com";
const USER_ID = "sdn"; // In a real app, this would come from authentication

function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "appointments">("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      text: "Hello! I'm your health assistant. How can I help you today?",
      sender: "assistant",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState("0:00");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editAppointment, setEditAppointment] = useState<{
    id: string;
    date_time: string;
    purpose: string;
  } | null>(null);

  // New appointment form state
  const [newAppointment, setNewAppointment] = useState({
    date_time: new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16),
    purpose: "",
  });

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout>();
  const recordingStartTimeRef = useRef<number>(0);

  useEffect(() => {
    if (activeTab === "appointments") {
      fetchAppointments();
    }
  }, [activeTab]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
        audioChunksRef.current.push(event.data);
      });

      mediaRecorderRef.current.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        processAudioRecording(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      });

      audioChunksRef.current = [];
      mediaRecorderRef.current.start();
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now();
      startRecordingTimer();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setApiError(
        "Unable to access microphone. Please ensure you have granted microphone permissions."
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopRecordingTimer();
    }
  };

  const startRecordingTimer = () => {
    recordingTimerRef.current = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - recordingStartTimeRef.current) / 1000
      );
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      setRecordingTime(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    }, 1000);
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
  };

  const processAudioRecording = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("audio_file", audioBlob, "recording.webm");

    setMessages((prev) => [
      ...prev,
      {
        text: "Processing your voice message...",
        sender: "assistant",
        isProcessing: true,
      },
    ]);

    try {
      const response = await fetch(
        `${API_URL}/voice-to-text?user_id=${USER_ID}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Remove the processing message
      setMessages((prev) => prev.filter((msg) => !msg.isProcessing));

      if (data.transcribed_text) {
        setMessages((prev) => [
          ...prev,
          { text: data.transcribed_text, sender: "user" },
          { text: data.response, sender: "assistant" },
        ]);
      } else {
        throw new Error("No transcription received");
      }
    } catch (error) {
      console.error("Error processing voice recording:", error);
      setMessages((prev) => prev.filter((msg) => !msg.isProcessing));
      setMessages((prev) => [
        ...prev,
        {
          text: "Sorry, there was an error processing your voice message. Please try again or type your message instead.",
          sender: "assistant",
        },
      ]);
    }
  };

  const fetchAppointments = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const response = await fetch(`${API_URL}/appointments/${USER_ID}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAppointments(data);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      setApiError(
        "Unable to connect to the server. Please ensure the API server is running."
      );
      setAppointments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const newMessage = { text: inputMessage, sender: "user" as const };
    setMessages((prev) => [...prev, newMessage]);
    setInputMessage("");

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: USER_ID, message: inputMessage }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { text: data.response, sender: "assistant" },
      ]);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          text: "Sorry, there was an error processing your request. Please ensure the API server is running.",
          sender: "assistant",
        },
      ]);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setUploadStatus("Please select an image file.");
      return;
    }

    setUploadStatus("Uploading...");
    const formData = new FormData();
    formData.append("image_file", selectedFile);
    formData.append("prompt", "What do you see in this medical image?");

    try {
      const response = await fetch(
        `${API_URL}/analyze-image?user_id=${USER_ID}`,
        {
          method: "POST",
          body: formData,
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      if (data.analysis) {
        setUploadStatus("Image uploaded and analyzed successfully!");
        setMessages((prev) => [
          ...prev,
          { text: "Uploaded an image for analysis.", sender: "user" },
          { text: data.analysis, sender: "assistant" },
        ]);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus(
        "Error uploading image. Please ensure the API server is running."
      );
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setUploadStatus("");
    }
  };

  const handleCreateAppointment = async () => {
    if (!newAppointment.purpose.trim()) {
      alert("Please enter a purpose for the appointment");
      return;
    }

    setIsLoading(true);
    setApiError(null);
    try {
      const response = await fetch(`${API_URL}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          date_time: new Date(newAppointment.date_time).toISOString(),
          purpose: newAppointment.purpose,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await fetchAppointments();
      setNewAppointment({
        date_time: new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16),
        purpose: "",
      });
      alert("Appointment created successfully");
    } catch (error) {
      console.error("Error creating appointment:", error);
      setApiError(
        "Failed to create appointment. Please ensure the API server is running."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="bg-white rounded-t-2xl shadow-lg p-6 border-b border-blue-100">
          <h1 className="text-3xl font-bold text-blue-900">Health Assistant</h1>
          <p className="text-blue-600 mt-1">
            Your personal AI healthcare companion
          </p>
        </header>

        <div className="bg-white rounded-b-2xl shadow-lg">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 px-6 py-4 text-lg font-medium transition-colors ${
                activeTab === "chat"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-blue-600"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab("appointments")}
              className={`flex-1 px-6 py-4 text-lg font-medium transition-colors ${
                activeTab === "appointments"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-blue-600"
              }`}
            >
              Appointments
            </button>
          </div>

          <div className="p-6">
            {apiError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-700">{apiError}</p>
              </div>
            )}

            {activeTab === "chat" ? (
              <div className="space-y-6">
                <div
                  ref={chatContainerRef}
                  className="h-[400px] overflow-y-auto space-y-4 p-4 bg-gray-50 rounded-xl"
                >
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        message.sender === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] p-4 rounded-xl ${
                          message.sender === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-800 shadow-md"
                        }`}
                      >
                        <p className="text-sm">{message.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() =>
                      isRecording ? stopRecording() : startRecording()
                    }
                    className={`p-2 rounded-xl transition-colors ${
                      isRecording
                        ? "bg-red-500 hover:bg-red-600 animate-pulse"
                        : "bg-blue-600 hover:bg-blue-700"
                    } text-white`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleSendMessage}
                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>

                {isRecording && (
                  <div className="flex items-center gap-2 text-red-500">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm">
                      Recording... {recordingTime}
                    </span>
                  </div>
                )}

                <div className="mt-6 p-6 bg-gray-50 rounded-xl">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Upload Image
                  </h2>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    accept="image/*"
                    className="w-full mb-4"
                  />
                  <button
                    onClick={handleFileUpload}
                    disabled={!selectedFile}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      selectedFile
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-200 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    <Upload className="w-5 h-5" />
                    Upload
                  </button>
                  {uploadStatus && (
                    <p
                      className={`mt-2 text-sm ${
                        uploadStatus.includes("Error")
                          ? "text-red-600"
                          : uploadStatus.includes("success")
                          ? "text-green-600"
                          : "text-gray-600"
                      }`}
                    >
                      {uploadStatus}
                    </p>
                  )}
                  {previewUrl && (
                    <div className="mt-4">
                      <h3 className="text-lg font-semibold mb-2">Preview:</h3>
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-w-xs rounded-lg shadow-md"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-xl">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Schedule an Appointment
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={newAppointment.date_time}
                        onChange={(e) =>
                          setNewAppointment({
                            ...newAppointment,
                            date_time: e.target.value,
                          })
                        }
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Purpose
                      </label>
                      <input
                        type="text"
                        value={newAppointment.purpose}
                        onChange={(e) =>
                          setNewAppointment({
                            ...newAppointment,
                            purpose: e.target.value,
                          })
                        }
                        placeholder="e.g., Annual check-up"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleCreateAppointment}
                    disabled={isLoading}
                    className={`mt-4 px-6 py-2 rounded-lg transition-colors ${
                      isLoading
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    } text-white`}
                  >
                    {isLoading ? "Scheduling..." : "Schedule Appointment"}
                  </button>
                </div>

                <div className="bg-gray-50 p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Your Appointments
                    </h2>
                    <button
                      onClick={fetchAppointments}
                      disabled={isLoading}
                      className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                        isLoading
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                      />
                      {isLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  <div className="space-y-4">
                    {isLoading ? (
                      <p className="text-center text-gray-500">
                        Loading appointments...
                      </p>
                    ) : appointments.length === 0 ? (
                      <p className="text-center text-gray-500">
                        No appointments found
                      </p>
                    ) : (
                      appointments.map((appointment) => (
                        <div
                          key={appointment.id}
                          className="bg-white p-4 rounded-lg shadow-sm border border-gray-200"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">
                                {new Date(
                                  appointment.date_time
                                ).toLocaleDateString()}{" "}
                                at{" "}
                                {new Date(
                                  appointment.date_time
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                              <p className="text-gray-600">
                                {appointment.purpose}
                              </p>
                              <p className="text-sm text-gray-500">
                                Status: {appointment.status}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setEditAppointment({
                                    id: appointment.id,
                                    date_time: appointment.date_time.slice(
                                      0,
                                      16
                                    ),
                                    purpose: appointment.purpose,
                                  });
                                  setIsModalOpen(true);
                                }}
                                className="p-2 text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Are you sure you want to delete this appointment?"
                                    )
                                  ) {
                                    // Handle delete
                                  }
                                }}
                                className="p-2 text-red-600 hover:text-red-800 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
