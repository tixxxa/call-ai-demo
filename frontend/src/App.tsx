import { Route, Routes } from "react-router";
import CallsPage from "./pages/CallsPage";
import CallDetailPage from "./pages/CallDetailPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CallsPage />} />
      <Route path="/calls/:id" element={<CallDetailPage />} />
    </Routes>
  );
}
