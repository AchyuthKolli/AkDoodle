import React, { useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

import Home from "./pages/Home";
import CreateTable from "./pages/CreateTable";
import Table from "./pages/Table";
import Profile from "./pages/Profile";
import RummyHome from "./pages/RummyHome";


class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-800 p-8 rounded-xl border border-red-500/30 shadow-2xl">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h1>
            <div className="bg-slate-950 p-4 rounded text-xs text-red-400 font-mono mb-6 overflow-auto max-h-48">
              {this.state.error?.toString()}
            </div>
            <button
              onClick={() => window.location.href = "/"}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
            >
              Return Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const navigate = useNavigate();

  // 🔥 SPA Navigation Bridge for Akadoodle Home
  useEffect(() => {
    window.__AKADOODLE_NAVIGATE = (to) => navigate(to);
  }, [navigate]);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/CreateTable" element={<CreateTable />} />
        <Route path="/Table" element={<Table />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/rummy/home" element={<RummyHome />} />
      </Routes>
    </ErrorBoundary>
  );
}
