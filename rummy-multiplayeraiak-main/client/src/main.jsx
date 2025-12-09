console.log("🚀 Client JS Starting...");
try {
  const root = document.getElementById("root");
  if (root) root.innerHTML = "<div style='color:yellow; text-align:center; margin-top:50px'>JS Loaded. Initializing React...</div>";
} catch (e) { console.error("DOM Pre-init Error", e); }

import "./index.css"; // if you have global CSS
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import App from "./App.jsx";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";

import { Toaster } from "sonner";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <Toaster richColors position="top-center" />
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>
);
