import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application render error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 p-8 text-gray-800">
          <div className="mx-auto max-w-3xl rounded border border-red-300 bg-red-50 p-6 shadow">
            <h1 className="mb-3 text-2xl font-bold text-danger">The app could not load</h1>
            <p className="mb-4">
              The app hit a browser-side error while starting. Check the browser console for the full stack trace.
            </p>
            <pre className="overflow-auto rounded bg-white p-4 text-sm text-gray-700">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
