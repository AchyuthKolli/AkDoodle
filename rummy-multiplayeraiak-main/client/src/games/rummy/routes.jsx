import React from "react";
import { Route } from "react-router-dom";

import RummyHome from "../../pages/RummyHome";
import CreateTable from "../../pages/CreateTable";
import Table from "../../pages/Table";

export function getRummyRoutes() {
  return (
    <>
      <Route path="/rummy/home" element={<RummyHome />} />
      <Route path="/rummy/create-table" element={<CreateTable />} />
      <Route path="/rummy/table" element={<Table />} />

      {/* Backward-compatible aliases */}
      <Route path="/CreateTable" element={<CreateTable />} />
      <Route path="/Table" element={<Table />} />
    </>
  );
}
