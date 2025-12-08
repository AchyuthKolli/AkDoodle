import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export const Dialog = ({ open, onOpenChange, children }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => onOpenChange && onOpenChange(false)}
            />
            {/* Dialog Content Container */}
            {children}
        </div>
    );
};

export const DialogContent = ({ children, className = "" }) => (
    <div className={`relative z-50 w-full max-w-lg p-6 bg-slate-900 border border-slate-700 rounded-lg shadow-xl ${className}`}>
        {children}
    </div>
);

export const DialogHeader = ({ children, className = "" }) => (
    <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className}`}>
        {children}
    </div>
);

export const DialogTitle = ({ children, className = "" }) => (
    <h2 className={`text-lg font-semibold leading-none tracking-tight text-white ${className}`}>
        {children}
    </h2>
);
