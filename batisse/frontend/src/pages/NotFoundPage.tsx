import { Button } from '../components/common/Button'
import { EmptyState } from '../components/common/EmptyState'

export default function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you're looking for doesn't exist."
      action={<Button variant="ghost" onClick={() => window.location.href = '/'}>Return to dashboard</Button>}
    />
  )
}
