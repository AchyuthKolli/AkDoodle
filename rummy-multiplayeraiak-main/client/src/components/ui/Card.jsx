import React from 'react';

export function Card({ children, className = '', ...props }) {
  const base = `bg-white bg-opacity-10 border border-slate-700 rounded-lg p-4 ${className}`;
  return (
    <div className={base} {...props}>
      {children}
    </div>
  );
}
