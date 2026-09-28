import React from "react"
import { AlertCircle } from "lucide-react"
import { StateMessage } from "./StateMessage"

// Anything that throws while rendering used to take the whole app down with it and leave a white
// screen only a relaunch could clear. React has no hook for this — a boundary has to be a class.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error("[ErrorBoundary]", error)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <StateMessage
        icon={AlertCircle}
        tone="error"
        title="Couldn't open this tab"
        message="Something went wrong loading it. Reloading the app usually clears this."
      >
        <button
          onClick={() => window.location.reload()}
          className="mt-5 px-4 py-2 rounded-lg border border-gray/30 text-sm font-medium text-gray"
        >
          Reload
        </button>
      </StateMessage>
    )
  }
}
