import * as React from "react"
// Simple ScrollArea component to replace missing shadcn component
// This supports the same props structure as commonly used

const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (
    <div
        ref={ref}
        className={`relative overflow-auto ${className || ""}`}
        {...props}
    >
        {children}
    </div>
))
ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
