import React from 'react';

interface Props {
  children?: React.ReactNode;
  tableColor?: 'green' | 'red-brown';
}

export const CasinoTable3D: React.FC<Props> = ({ children, tableColor = 'green' }) => {
  console.log('🎨 CasinoTable3D rendering with color:', tableColor);
  
  // Calculate colors directly - no useMemo to ensure instant updates
  const mainColor = tableColor === 'green' ? '#15803d' : '#6b2f2f';
  const gradientColor = tableColor === 'green' 
    ? 'linear-gradient(135deg, #15803d 0%, #16a34a 50%, #15803d 100%)'
    : 'linear-gradient(135deg, #4a1f1f 0%, #6b2f2f 50%, #4a1f1f 100%)';
  
  // Edge/border color (darker than main)
  const edgeColor = tableColor === 'green'
    ? 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #14532d 100%)'
    : 'linear-gradient(135deg, #4a1f1f 0%, #6b2f2f 50%, #4a1f1f 100%)';

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-8" data-table-color={tableColor}>
      {/* Ambient lighting effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-amber-900/10 via-transparent to-transparent pointer-events-none" />
      
      {/* 3D Table Container */}
      <div className="relative w-full h-full flex items-center justify-center px-8" style={{
        perspective: '1200px',
        perspectiveOrigin: '50% 50%'
      }}>
        {/* Main Casino Table - GREEN/RED-BROWN FELT */}
        <div 
          className="relative w-full max-w-3xl aspect-square max-h-[500px] rounded-[40px] shadow-2xl"
          style={{
            transform: 'rotateX(20deg) rotateZ(0deg)',
            transformStyle: 'preserve-3d',
            backgroundColor: mainColor,
            backgroundImage: gradientColor,
            boxShadow: `
              0 40px 80px rgba(0, 0, 0, 0.6),
              inset 0 2px 4px rgba(255, 255, 255, 0.1),
              inset 0 -2px 4px rgba(0, 0, 0, 0.3)
            `
          }}
        >
          {/* Felt Texture Overlay */}
          <div 
            className="absolute inset-0 rounded-[40px] opacity-30 mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `
                repeating-linear-gradient(
                  45deg,
                  transparent,
                  transparent 2px,
                  rgba(0, 0, 0, 0.03) 2px,
                  rgba(0, 0, 0, 0.03) 4px
                ),
                repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 2px,
                  rgba(0, 0, 0, 0.03) 2px,
                  rgba(0, 0, 0, 0.03) 4px
                )
              `,
            }}
          />
          
          {/* Table Edge (Padded Leather) */}
          <div 
            className="absolute -inset-4 rounded-[44px] -z-10"
            style={{
              background: edgeColor,
              boxShadow: `
                0 8px 16px rgba(0, 0, 0, 0.4),
                inset 0 2px 4px rgba(255, 255, 255, 0.1)
              `
            }}
          />
          
          {/* Game Area Markings with Gold Lines - REMOVE EMPTY BOXES */}
          <div className="absolute inset-0 rounded-[40px] overflow-hidden">
            {/* Center playing field */}
            <div className="absolute inset-[10%] border-2 border-amber-500/40 rounded-3xl" style={{
              boxShadow: '0 0 20px rgba(251, 191, 36, 0.2)'
            }}>
              {/* Center Meld/Declaration Area */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[40%] border-2 border-dashed border-amber-400/40 rounded-2xl" style={{
                boxShadow: '0 0 10px rgba(251, 191, 36, 0.15)'
              }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-amber-300/40 tracking-widest"
                  style={{ textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)' }}
                >
                  PLAY AREA
                </div>
              </div>
            </div>
            
            {/* Corner decorative lines */}
            <div className="absolute top-8 left-8 w-16 h-16 border-l-2 border-t-2 border-amber-500/30 rounded-tl-2xl" />
            <div className="absolute top-8 right-8 w-16 h-16 border-r-2 border-t-2 border-amber-500/30 rounded-tr-2xl" />
            <div className="absolute bottom-8 left-8 w-16 h-16 border-l-2 border-b-2 border-amber-500/30 rounded-bl-2xl" />
            <div className="absolute bottom-8 right-8 w-16 h-16 border-r-2 border-b-2 border-amber-500/30 rounded-br-2xl" />
          </div>
          
          {/* Content Layer - Game UI */}
          <div className="relative w-full h-full" style={{
            transform: 'translateZ(20px)',
            transformStyle: 'preserve-3d'
          }}>
            {children}
          </div>
          
          {/* Table Lighting - Spotlight effect */}
          <div 
            className="absolute inset-0 rounded-[40px] pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.08) 0%, transparent 70%)',
              mixBlendMode: 'overlay'
            }}
          />
        </div>
      </div>
    </div>
  );
};
