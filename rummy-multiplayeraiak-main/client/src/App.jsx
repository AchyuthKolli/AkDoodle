import React, { useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

import Home from "./pages/Home";
import Profile from "./pages/Profile";
import { getRummyRoutes } from "./games/rummy/routes";


export default function App() {
  const navigate = useNavigate();

  // 🔥 SPA Navigation Bridge for Akadoodle Home
  useEffect(() => {
    window.__AKADOODLE_NAVIGATE = (to) => navigate(to);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/profile" element={<Profile />} />
      {getRummyRoutes()}
    </Routes>
  );
}
