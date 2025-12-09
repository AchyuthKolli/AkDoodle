import React from "react";

class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Global Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white font-sans">
                    <div className="max-w-xl w-full bg-slate-900 p-8 rounded-xl border border-red-500/30 shadow-2xl">
                        <h1 className="text-3xl font-bold text-red-500 mb-4">Application Crashed</h1>
                        <p className="text-slate-300 mb-6">
                            A critical error occurred while initializing the application.
                        </p>

                        <div className="bg-black/50 p-4 rounded-lg overflow-auto max-h-64 mb-6 border border-slate-800">
                            <p className="text-red-400 font-mono font-bold text-sm mb-2">
                                {this.state.error && this.state.error.toString()}
                            </p>
                            {this.state.errorInfo && (
                                <pre className="text-slate-500 text-xs font-mono whitespace-pre-wrap">
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            )}
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => window.location.reload()}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={() => window.location.href = "/"}
                                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
                            >
                                Go Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
