import React from 'react';

export function Input({ className = '', ...props }) {
  const base = `border border-slate-600 rounded-md py-2 px-3 bg-slate-900 text-white placeholder:text-slate-500 ${className}`;
  return (
    <input className={base} {...props} />
  );
}
