import { Outlet, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'

export default function Layout() {
  const navigate = useNavigate()
  const { currentProject, setCurrentProject } = useAppStore()

  const handleHome = () => {
    setCurrentProject(null)
    navigate('/')
  }

  return (
    <div className="flex h-screen">
      <aside className="flex-shrink-0 border-r border-line bg-card p-4 w-64 hidden md:block">
        <div className="flex items-center gap-2 mb-6">
          <span className="font-display font-semibold tracking-tight brand-gradient text-sm">BÂTISSE</span>
          <span className="text-accent text-[10px] uppercase tracking-wider font-sans">architectural reconstruction</span>
        </div>
        <nav className="space-y-1">
          <a
            href="/"
            onClick={handleHome}
            className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm ${currentProject ? 'text-muted' : 'text-accent font-medium bg-accent-soft'}`}
          >
            Dashboard
          </a>
          <a
            href="/furniture"
            className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm text-muted hover:text-ink"
          >
            Furniture Library
          </a>
          {currentProject && (
            <a
              href={`/projects/${currentProject.id}`}
              onClick={() => navigate(`/projects/${currentProject.id}`)}
              className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm text-ink font-medium"
            >
              {currentProject.name}
            </a>
          )}
        </nav>
        {currentProject && (
          <div className="mt-6 pt-4 border-t border-line text-xs text-muted">
            <div className="mb-2">Project</div>
            <div className="font-medium text-ink truncate">{currentProject.name}</div>
            <div className="text-muted mt-1">
              {currentProject.upload_count} uploads &middot; {currentProject.room_count} rooms
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
