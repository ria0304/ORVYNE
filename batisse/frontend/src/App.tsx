import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import ProjectWorkspacePage from './pages/ProjectWorkspacePage'
import FurnitureLibraryPage from './pages/FurnitureLibraryPage'
import FurnitureAssetDetailPage from './pages/FurnitureAssetDetailPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/projects/:projectId" element={<ProjectWorkspacePage />} />
      <Route path="/furniture" element={<FurnitureLibraryPage />} />
      <Route path="/furniture/:id" element={<FurnitureAssetDetailPage />} />
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
