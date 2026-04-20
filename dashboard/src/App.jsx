import React from "react";
import { Routes, Route } from "react-router-dom";
import { SettingsProvider } from "./context/SettingsContext";
import { WsProvider } from "./context/WsContext";
import Sidebar from "./components/Sidebar";
import HomePage from "./pages/HomePage";
import RunsPage from "./pages/RunsPage";
import RunDetailPage from "./pages/RunDetailPage";
import SettingsPage from "./pages/SettingsPage";
import { ProjectsListPage, ProjectDetailPage } from "./pages/ProjectsPage";
import TrendsPage from "./pages/TrendsPage";
import ComparePage from "./pages/ComparePage";

function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-terminal-bg">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/"                    element={<HomePage />} />
          <Route path="/runs"                element={<RunsPage />} />
          <Route path="/runs/:id"            element={<RunDetailPage />} />
          <Route path="/projects"            element={<ProjectsListPage />} />
          <Route path="/projects/:name"      element={<ProjectDetailPage />} />
          <Route path="/trends"              element={<TrendsPage />} />
          <Route path="/compare"             element={<ComparePage />} />
          <Route path="/settings"            element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <WsProvider>
        <Layout />
      </WsProvider>
    </SettingsProvider>
  );
}
