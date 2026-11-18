import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { CardBody, CardHeader, CardTitle } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { Input } from '../components/common/Input'
import { ErrorBanner } from '../components/common/ErrorBanner'
import { Badge } from '../components/common/Badge'
import { useProjects } from '../hooks/useProjects'
import { useAppStore } from '../store/useAppStore'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { projects } = useAppStore()
  const { createProject, deleteProject } = useProjects()
  const formRef = useRef<HTMLFormElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const project = await createProject(name.trim(), description.trim())
      setName('')
      setDescription('')
      navigate(`/projects/${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.')
    } finally {
      setCreating(false)
    }
  }

  const handleNewProject = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    nameInputRef.current?.focus()
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this project? This cannot be undone.')) return
    try {
      await deleteProject(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl brand-gradient tracking-tight">Projects</h1>
          <p className="text-muted mt-1">Reconstruct floor plans into 3D models.</p>
        </div>
        <Button onClick={handleNewProject} size="lg" className="brand-gradient-bg text-white">
          New Project
        </Button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form ref={formRef} onSubmit={handleCreate} className="rounded-sm border border-line bg-card p-5">
        <CardHeader className="mb-0">
          <CardTitle className="text-lg brand-gradient">Create a new project</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Input
            label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Haussmann apartment"
            disabled={creating}
            ref={nameInputRef}
          />
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes, address, client…"
            disabled={creating}
          />
        </div>
        <div className="mt-5 flex items-center gap-3">
        <Button type="submit" disabled={creating || !name.trim()} className="brand-gradient-bg text-white">
          {creating ? 'Creating…' : 'Create project'}
        </Button>
        </div>
      </form>

      <div className="rounded-sm border border-line bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Your projects</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Create a project to upload a floor plan and begin reconstruction."
              action={<Button variant="ghost" onClick={handleNewProject}>Create project</Button>}
            />
          ) : (
            <div className="divide-y divide-line">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between px-5 py-4 rounded-sm hover:bg-accent-soft/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div>
                    <div className="font-medium text-ink">{project.name}</div>
                    <div className="text-xs text-muted">
                      {project.upload_count} uploads &middot; {project.room_count} rooms &middot;
                      {project.ready_for_3d ? 'Ready for 3D' : 'Not yet ready for 3D'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={project.ready_for_3d ? 'success' : 'default'}>
                      {project.ready_for_3d ? 'Ready for 3D' : 'Draft'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(project.id)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </div>
    </div>
  )
}