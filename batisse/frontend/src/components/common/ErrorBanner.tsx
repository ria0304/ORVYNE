export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="rounded-sm border border-danger/30 bg-danger-soft p-4 mb-6">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 flex-shrink-0 text-danger mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
        <div>
          <p className="text-danger text-sm font-medium">{message}</p>
        </div>
        <button
          onClick={onDismiss}
          className="ml-auto flex-shrink-0 rounded p-1.5 text-danger hover:bg-danger/10 focus-visible:outline-accent focus-visible:outline-2"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
