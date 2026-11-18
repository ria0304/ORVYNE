import { useMemo } from 'react'
import type { FloorPlanGeometry, Issue } from '../../api/types'
import { validateGeometry, issueCounts } from '../../utils/validation'
import { Card, CardHeader, CardTitle, CardBody } from '../common/Card'
import { Badge } from '../common/Badge'

interface ValidationPanelProps {
  geometry: FloorPlanGeometry | null
  furnitureIssues?: Issue[]
  onSelectIssue?: (issue: Issue) => void
  onSelectFurniture?: (id: number) => void
  selectedIssueCode?: string | null
}

export function ValidationPanel({ geometry, furnitureIssues, onSelectIssue, onSelectFurniture, selectedIssueCode }: ValidationPanelProps) {
  const issues = useMemo(() => {
    const base = geometry ? validateGeometry(geometry) : []
    return furnitureIssues ? [...base, ...furnitureIssues] : base
  }, [geometry, furnitureIssues])
  const counts = useMemo(() => issueCounts(issues), [issues])

  if (!geometry) {
    return (
      <Card>
        <CardHeader><CardTitle>Validation</CardTitle></CardHeader>
        <CardBody className="p-4">
          <p className="text-sm text-muted">No geometry to validate. Process a floor plan first.</p>
        </CardBody>
      </Card>
    )
  }

  const status = counts.error > 0 ? 'error' : counts.warning > 0 ? 'warning' : 'ok'
  const statusLabel = counts.error > 0 ? 'Errors found' : counts.warning > 0 ? 'Warnings' : 'Valid'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Validation</CardTitle>
          <Badge variant={status === 'error' ? 'danger' : status === 'warning' ? 'warning' : 'success'}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardBody className="p-4 space-y-3">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-danger font-medium">{counts.error} errors</span>
          <span className="text-warn font-medium">{counts.warning} warnings</span>
          <span className="text-muted">{counts.info} info</span>
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-ok">No issues found. Geometry is valid.</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {issues.map((issue, i) => (
              <li
                key={i}
                onClick={() => {
                  if (issue.ref && /^\d+$/.test(issue.ref)) {
                    onSelectFurniture?.(Number(issue.ref))
                  } else {
                    onSelectIssue?.(issue)
                  }
                }}
                className={`rounded-sm border p-2 text-xs cursor-pointer transition-colors ${
                  selectedIssueCode === issue.code && issue.ref
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-card/50 hover:bg-accent-soft/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={issue.severity === 'error' ? 'danger' : issue.severity === 'warning' ? 'warning' : 'info'}>
                    {issue.severity}
                  </Badge>
                  <span className="font-mono text-muted">{issue.code}</span>
                </div>
                <p className="text-ink">{issue.message}</p>
                {issue.ref && <p className="text-muted mt-1">Ref: {issue.ref}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}