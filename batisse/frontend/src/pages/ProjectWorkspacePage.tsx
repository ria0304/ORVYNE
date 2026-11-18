import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProjects } from '../hooks/useProjects'
import { useUploads } from '../hooks/useUploads'
import { useProcessing } from '../hooks/useProcessing'
import { useAppStore } from '../store/useAppStore'
import { useGeometryEditor } from '../store/useGeometryEditor'
import { useFurnitureStore } from '../store/useFurnitureStore'
import { validateFurniture } from '../utils/furnitureValidation'
import { Button } from '../components/common/Button'
import { Card, CardBody, CardHeader, CardTitle, CardFooter } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { Input } from '../components/common/Input'
import { ErrorBanner } from '../components/common/ErrorBanner'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { EmptyState } from '../components/common/EmptyState'
import type { FloorPlanGeometry, LengthUnit } from '../api/types'
import { DollhouseViewer } from '../three/DollhouseViewer'
import * as THREE from 'three'
import { PlanEditor } from '../components/geometry/PlanEditor'
import { ValidationPanel } from '../components/geometry/ValidationPanel'
import { FurnitureControlsPanel } from '../components/furniture/FurnitureControlsPanel'

type Tab = 'plan' | 'processing' | 'scale' | 'geometry' | 'validation' | 'furniture' | 'viewer'

export default function ProjectWorkspacePage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const id = Number(projectId)
  const { currentProject, uploads, geometry } = useAppStore()
  const { setSelection, getRoom, getWall, getOpening } = useGeometryEditor()
  const furniture = useFurnitureStore()
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate')
  const [snap, setSnap] = useState(false)

  const furnitureIssues = geometry
    ? validateFurniture({ instances: furniture.instances, assets: furniture.assets, geometry })
    : []
  const { selectProject, deleteProject, setScaleReference, acceptScale } = useProjects()
  const { uploadPlan, deleteUpload, previewUrl } = useUploads()
  const { processUpload } = useProcessing()

  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('plan')
  const [processing, setProcessing] = useState(false)
  const [report, setReport] = useState<any>(null)

  useEffect(() => {
    selectProject(id).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load project.')
      navigate('/')
    })
    useFurnitureStore.getState().loadForProject(id)
    useFurnitureStore.getState().loadScenes(id)
  }, [id, selectProject, navigate])

  const handleDeleteProject = async () => {
    if (!window.confirm('Delete this project? All uploads and geometry will be lost.')) return
    try {
      await deleteProject(id)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.')
    }
  }

  const handleUpload = async (file: File) => {
    setError(null)
    try {
      await uploadPlan(id, file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  const handleFurnitureTransformEnd = (id: number, obj: THREE.Object3D) => {
    const patch = {
      pos_x: obj.position.x,
      pos_y: obj.position.y,
      pos_z: obj.position.z,
      rot_x: obj.rotation.x,
      rot_y: obj.rotation.y,
      rot_z: obj.rotation.z,
      scale_x: obj.scale.x,
      scale_y: obj.scale.y,
      scale_z: obj.scale.z,
    }
    furniture.updateInstanceLocal(id, patch)
    furniture.persistInstance(id, patch)
  }

  const handleSelectIssue = (issue: { ref?: string | null }) => {
    const ref = issue.ref
    if (!ref) return
    if (getRoom(ref)) setSelection({ type: 'room', id: ref })
    else if (getWall(ref)) setSelection({ type: 'wall', id: ref })
    else if (getOpening(ref)) setSelection({ type: 'opening', id: ref })
  }

  const handleProcess = async () => {
    const upload = uploads[0]
    if (!upload) return
    setError(null)
    setProcessing(true)
    try {
      const res = await processUpload(id, upload.id, 0, false)
      setReport(res.report)
      setActiveTab('processing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed.')
    } finally {
      setProcessing(false)
    }
  }

  if (!currentProject) return <div className="p-8"><LoadingSpinner /></div>

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between gap-3 px-0 mb-1 border-b border-line bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            ← Back to dashboard
          </Button>
          <div>
            <h1 className="font-display font-semibold brand-gradient text-ink">{currentProject.name}</h1>
            <p className="text-xs text-muted">
              {currentProject.upload_count} uploads &middot; {currentProject.room_count} rooms &middot;
              {currentProject.units ? currentProject.units.toUpperCase() : 'px'} units
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={currentProject.ready_for_3d ? 'success' : 'default'}>
            {currentProject.ready_for_3d ? 'Ready for 3D' : currentProject.has_geometry ? 'Has geometry' : 'Draft'}
          </Badge>
          <Button variant="danger" size="sm" onClick={handleDeleteProject}>Delete project</Button>
        </div>
      </header>

        <nav className="flex items-center gap-1 px-3 py-2 border-b border-line bg-card/60 overflow-x-auto">
          {[
            { key: 'plan', label: 'Plan', icon: '📐' },
            { key: 'processing', label: 'Processing', icon: '⚙️' },
            { key: 'scale', label: 'Scale', icon: '📏' },
            { key: 'geometry', label: 'Geometry', icon: '🏛️' },
            { key: 'validation', label: 'Validation', icon: '✅' },
            { key: 'furniture', label: 'Furniture', icon: '🛋️' },
            { key: 'viewer', label: '3D', icon: '🏠' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key as Tab)}
              className={`flex items-center gap-1.5 rounded-sm border ${
                activeTab === item.key
                  ? 'border-accent bg-accent text-white'
                  : 'border-line text-ink hover:bg-accent-soft/60'
              } px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap`}
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div className="flex-1 overflow-hidden flex">
          <aside className="flex-shrink-0 w-72 border-r border-line bg-card p-4 overflow-y-auto">
            {activeTab === 'plan' && <UploadPanel uploadPlan={handleUpload} uploads={uploads} deleteUpload={deleteUpload} />}
            {activeTab === 'processing' && <ProcessingPanel report={report} process={handleProcess} processing={processing} uploads={uploads} />}
            {activeTab === 'scale' && <ScalePanel geometry={geometry} id={id} setScaleReference={setScaleReference} acceptScale={acceptScale} />}
            {activeTab === 'geometry' && <div className="text-xs text-muted italic">Use the main canvas to edit.</div>}
            {activeTab === 'validation' && <ValidationPanel geometry={geometry} furnitureIssues={furnitureIssues} onSelectIssue={handleSelectIssue} onSelectFurniture={furniture.selectInstance} />}
            {activeTab === 'furniture' && <FurnitureControlsPanel projectId={id} geometry={geometry} transformMode={transformMode} setTransformMode={setTransformMode} snap={snap} setSnap={setSnap} />}
            {activeTab === 'viewer' && <div className="text-xs text-muted italic">3D view below.</div>}
          </aside>

          <main className="flex-1 bg-paper p-4 overflow-y-auto">
            {activeTab === 'plan' && <PlanView uploads={uploads} previewUrl={previewUrl} />}
            {activeTab === 'processing' && <ReportView report={report} />}
            {activeTab === 'scale' && <ScaleView geometry={geometry} />}
            {activeTab === 'geometry' && <PlanEditor projectId={id} />}
            {activeTab === 'validation' && <ValidationView geometry={geometry} />}
            {activeTab === 'furniture' && <DollhouseView geometry={geometry} transformMode={transformMode} onTransformEnd={handleFurnitureTransformEnd} />}
            {activeTab === 'viewer' && <DollhouseView geometry={geometry} transformMode={transformMode} onTransformEnd={handleFurnitureTransformEnd} />}
          </main>
        </div>
    </div>
  )
}

function UploadPanel({ uploadPlan, uploads, deleteUpload }: { uploadPlan: (f: File) => void; uploads: any[]; deleteUpload: (id: number) => void }) {
  const [file, setFile] = useState<File | null>(null)
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Upload floor plan</CardTitle>
        </CardHeader>
        <CardBody className="p-4">
          <label className="block cursor-pointer border border-dashed border-line rounded-sm bg-card/50 p-8 text-center hover:border-accent transition-colors">
            <input type="file" accept=".png,.jpg,.jpeg,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-sm text-ink">Choose a file</span>
              <span className="text-xs text-muted">PNG, JPG or PDF</span>
            </div>
            {file && <div className="mt-3 text-xs text-accent">{file.name} &middot; {(file.size / 1024).toFixed(1)} KB</div>}
          </label>
        </CardBody>
        <CardFooter>
          <Button disabled={!file} onClick={() => uploadPlan(file!)}>Upload plan</Button>
        </CardFooter>
      </Card>

      <div>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Uploads</h3>
        {uploads.length === 0 ? (
          <div className="text-xs text-muted italic">No uploads yet.</div>
        ) : (
          <div className="space-y-2">
            {uploads.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-sm border border-line bg-card/50 text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="truncate max-w-[140px]">{u.original_name}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteUpload(u.id)}>Remove</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProcessingPanel({ report, process, processing, uploads }: { report: any; process: () => void; processing: boolean; uploads: any[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Run detection</CardTitle>
        </CardHeader>
        <CardBody className="p-4">
          <p className="text-sm text-muted mb-4">Run the floor-plan detection pipeline on the first page of your upload.</p>
          {uploads.length === 0 ? (
            <p className="text-xs text-muted italic">Upload a plan first.</p>
          ) : (
            <Button disabled={processing} onClick={process} className="w-full">
              {processing ? 'Processing…' : 'Run detection'}
            </Button>
          )}
        </CardBody>
      </Card>

      {report && (
        <div>
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Last run</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Rooms found</div>
              <div className="font-medium text-ink">{report.rooms_found}</div>
            </div>
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Openings found</div>
              <div className="font-medium text-ink">{report.openings_found}</div>
            </div>
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Wall thickness (px)</div>
              <div className="font-medium text-ink">{report.wall_thickness_px}</div>
            </div>
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Overall confidence</div>
              <div className="font-medium text-ink">{report.overall_confidence != null ? (report.overall_confidence * 100).toFixed(0) + '%' : '—'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReportView({ report }: { report: any }) {
  if (!report) return <EmptyState title="No processing run yet" description="Run detection on the Plan tab to generate a report." />
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Processing report</CardTitle>
        </CardHeader>
        <CardBody className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Detector</div>
              <div className="font-medium text-ink">{report.detector}</div>
            </div>
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Input kind</div>
              <div className="font-medium text-ink">{report.input_kind}</div>
            </div>
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Detection mode</div>
              <div className="font-medium text-ink">{report.detection_mode}</div>
            </div>
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Rooms found</div>
              <div className="font-medium text-ink">{report.rooms_found}</div>
            </div>
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Openings found</div>
              <div className="font-medium text-ink">{report.openings_found}</div>
            </div>
            <div className="rounded-sm border border-line bg-card p-3">
              <div className="text-xs text-muted">Wall coverage</div>
              <div className="font-medium text-ink">{report.wall_coverage != null ? (report.wall_coverage * 100).toFixed(1) + '%' : '—'}</div>
            </div>
          </div>
          {report.text_matches && report.text_matches.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted mb-2">Text matches</h4>
              <div className="overflow-x-auto border border-line rounded-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left pb-2 text-xs font-medium text-muted">Text</th>
                      <th className="text-left pb-2 text-xs font-medium text-muted">Kind</th>
                      <th className="text-left pb-2 text-xs font-medium text-muted">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.text_matches.map((m: any, i: number) => (
                      <tr key={i}>
                        <td className="py-2 text-ink">{m.text}</td>
                        <td className="py-2 text-ink">{m.kind}</td>
                        <td className="py-2 text-ink num">{m.confidence != null ? (m.confidence * 100).toFixed(0) + '%' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {report.warnings && report.warnings.length > 0 && (
            <div className="mt-4 rounded-sm border border-warn/30 bg-warn-soft p-3">
              <h4 className="text-xs font-medium text-warn mb-1">Warnings</h4>
              <ul className="text-xs text-warn list-disc list-inside space-y-1">
                {report.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function ScalePanel({ geometry, id, setScaleReference, acceptScale }: { geometry: FloorPlanGeometry | null; id: number; setScaleReference: any; acceptScale: any }) {
  const [mode, setMode] = useState<'reference' | 'accept'>('reference')
  const [p1, setP1] = useState<[number, number]>([0, 0])
  const [p2, setP2] = useState<[number, number]>([0, 0])
  const [length, setLength] = useState('')
  const [unit, setUnit] = useState<LengthUnit>('m')
  const [mpp, setMpp] = useState('')
  const [source, setSource] = useState<'user_reference' | 'ocr_dimension' | 'vector' | 'manual'>('user_reference')
  const [confidence, setConfidence] = useState(0.9)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Set scale</CardTitle>
        </CardHeader>
        <CardBody className="p-4">
          <p className="text-sm text-muted mb-4">Define the real-world scale so dimensions and 3D output are correct.</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant={mode === 'reference' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('reference')}>
                Reference points
              </Button>
              <Button variant={mode === 'accept' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('accept')}>
                Accept value
              </Button>
            </div>
            {mode === 'reference' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input label="Point 1 (x, y)" value={p1.join(',')} onChange={(e) => setP1(parsePair(e.target.value))} />
                <Input label="Point 2 (x, y)" value={p2.join(',')} onChange={(e) => setP2(parsePair(e.target.value))} />
                <Input label="Length" value={length} onChange={(e) => setLength(e.target.value)} />
                <select value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)} className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-sm">
                  <option value="m">m</option>
                  <option value="cm">cm</option>
                  <option value="mm">mm</option>
                  <option value="ft">ft</option>
                  <option value="in">in</option>
                </select>
                <Button
                  onClick={async () => {
                    if (!geometry) return
                    await setScaleReference(id, p1, p2, parseFloat(length), unit)
                  }}
                  disabled={!length || isNaN(parseFloat(length))}
                  className="w-full"
                >
                  Apply reference
                </Button>
              </div>
            )}
            {mode === 'accept' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input label="meters per pixel" value={mpp} onChange={(e) => setMpp(e.target.value)} />
                <select value={source} onChange={(e) => setSource(e.target.value as any)} className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-sm">
                  <option value="user_reference">user_reference</option>
                  <option value="ocr_dimension">ocr_dimension</option>
                  <option value="vector">vector</option>
                  <option value="manual">manual</option>
                </select>
                <Input label="Confidence" value={confidence.toString()} onChange={(e) => setConfidence(parseFloat(e.target.value) || 0)} />
                <Button
                  onClick={async () => {
                    if (!geometry) return
                    await acceptScale(id, parseFloat(mpp), source, confidence)
                  }}
                  disabled={!mpp || isNaN(parseFloat(mpp))}
                  className="w-full"
                >
                  Accept scale
                </Button>
              </div>
            )}
          </div>
          {geometry && (
            <div className="mt-4 rounded-sm border border-line bg-card p-3">
              <h4 className="text-xs font-medium text-muted mb-2">Current scale</h4>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink">Units</span>
                <span className="font-mono num">{geometry.units}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-ink">meters per pixel</span>
                <span className="font-mono num">{geometry.scale.meters_per_pixel?.toFixed(6) ?? 'unknown'}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-ink">Source</span>
                <span className="text-xs text-muted">{geometry.scale.source}</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function ScaleView({ geometry }: { geometry: FloorPlanGeometry | null }) {
  if (!geometry) return <EmptyState title="No geometry" description="Process a plan first." />
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Scale</CardTitle>
        </CardHeader>
        <CardBody className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">Units</span>
              <span className="font-mono num text-sm">{geometry.units}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">meters per pixel</span>
              <span className="font-mono num text-sm">{geometry.scale.meters_per_pixel?.toFixed(6) ?? 'unknown'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">Source</span>
              <span className="text-xs text-muted">{geometry.scale.source}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">Confidence</span>
              <span className="text-xs text-muted num">{geometry.scale.confidence != null ? (geometry.scale.confidence * 100).toFixed(0) + '%' : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">Ready for 3D</span>
              <Badge variant={geometry.units === 'm' ? 'success' : 'default'}>
                {geometry.units === 'm' ? 'Yes' : 'No — set a scale first'}
              </Badge>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function PlanView({ uploads, previewUrl }: { uploads: any[]; previewUrl: (id: number, page: number) => string }) {
  const upload = uploads[0]
  if (!upload) return <EmptyState title="No plan uploaded" description="Upload a floor plan to view it." />
  return (
    <div className="grid-paper rounded-sm border border-line p-4">
      <img
        src={previewUrl(upload.id, 0)}
        alt="Plan preview"
        className="max-w-full max-h-[600px] object-contain"
        loading="lazy"
      />
    </div>
  )
}

function DollhouseView({
  geometry,
  transformMode,
  onTransformEnd,
}: {
  geometry: FloorPlanGeometry | null
  transformMode: 'translate' | 'rotate' | 'scale'
  onTransformEnd: (id: number, obj: THREE.Object3D) => void
}) {
  if (!geometry) return <EmptyState title="No geometry" description="Process a plan first." />
  if (geometry.units !== 'm') {
    return (
      <div className="grid-paper rounded-sm border border-line p-12 text-center">
        <p className="text-muted">Set a scale (meters per pixel) before generating the 3D model.</p>
      </div>
    )
  }
  return (
    <div className="rounded-sm border border-line bg-card p-4 h-[600px]">
      <DollhouseViewer
        geometry={geometry}
        furnitureTransformMode={transformMode}
        onFurnitureTransformEnd={onTransformEnd}
      />
    </div>
  )
}

function parsePair(s: string): [number, number] {
  const parts = s.split(',').map(Number)
  return [Number.isFinite(parts[0]) ? parts[0] : 0, Number.isFinite(parts[1]) ? parts[1] : 0]
}

function ValidationView({ geometry }: { geometry: FloorPlanGeometry | null }) {
  return (
    <div className="max-w-2xl mx-auto">
      <ValidationPanel geometry={geometry} />
    </div>
  )
}
