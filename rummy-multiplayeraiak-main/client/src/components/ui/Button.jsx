import React from 'react';

export function Button({ children, className = '', onClick, variant = 'default', size = 'md', ...props }) {
  const base = `inline-flex items-center justify-center rounded-md font-semibold focus:ring active:opacity-90 transition ${className}`;
  return (
    <button onClick={onClick} className={base} {...props}>
      {children}
    </button>
  );
}
