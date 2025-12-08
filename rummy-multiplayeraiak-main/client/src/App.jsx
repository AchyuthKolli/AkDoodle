import React, { useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

import Home from "./pages/Home";
import CreateTable from "./pages/CreateTable";
import Table from "./pages/Table";
import Profile from "./pages/Profile";

export default function App() {
  const navigate = useNavigate();

  // 🔥 SPA Navigation Bridge for Akadoodle Home
  useEffect(() => {
    window.__AKADOODLE_NAVIGATE = (to) => navigate(to);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/CreateTable" element={<CreateTable />} />
      <Route path="/Table" element={<Table />} />
      <Route path="/profile" element={<Profile />} />
    </Routes>
  );
}
