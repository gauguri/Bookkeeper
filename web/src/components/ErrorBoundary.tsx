import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Rendering failed", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="app-card border-rose-200 bg-rose-50 p-6 text-rose-800">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">Something went wrong</p>
          <h2 className="mt-2 text-xl font-semibold">We hit an unexpected error.</h2>
          <p className="mt-2 text-sm text-rose-700">{this.state.error.message}</p>
          <button className="app-button-primary mt-4" onClick={this.handleReload} type="button">
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
