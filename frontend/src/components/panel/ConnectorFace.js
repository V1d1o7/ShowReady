import React from 'react';

const DSeriesFlange = ({ children }) => (
    // Scaled down to 34x41 for proper UI padding / negative space
    <svg viewBox="0 0 260 310" style={{ width: '34px', height: '41px' }} className="flex-shrink-0 drop-shadow-md mx-auto transition-transform group-hover:scale-105">
        <defs>
            <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f5f5f5" />
                <stop offset="100%" stopColor="#b3b3b3" />
            </linearGradient>
            <linearGradient id="darkMetal" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#444" />
                <stop offset="100%" stopColor="#111" />
            </linearGradient>
        </defs>
        <rect x="0" y="0" width="260" height="310" rx="20" fill="url(#metalGrad)" stroke="#888" strokeWidth="3"/>
        <circle cx="35" cy="35" r="16" fill="#111" stroke="#555" strokeWidth="2"/>
        <circle cx="35" cy="35" r="6" fill="#050505"/>
        <circle cx="225" cy="275" r="16" fill="#111" stroke="#555" strokeWidth="2"/>
        <circle cx="225" cy="275" r="6" fill="#050505"/>
        {children}
    </svg>
);

const ConnectorFace = ({ style }) => {
    
    // --- EXACT CAD REPRODUCTION OF EMPTY NEUTRIK D-HOLE ---
    if (style === 'empty') {
        return (
            <svg viewBox="0 0 260 310" style={{ width: '34px', height: '41px' }} className="flex-shrink-0 drop-shadow-sm mx-auto pointer-events-none">
                <defs>
                    <filter id="holeShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000" floodOpacity="0.8" />
                    </filter>
                </defs>
                {/* Main D-Hole Void w/ Flat Top Chord */}
                <path 
                    d="M 104 40 L 156 40 A 118 118 0 1 1 104 40 Z" 
                    fill="#050505" 
                    stroke="#222" 
                    strokeWidth="3"
                    style={{ filter: 'url(#holeShadow)' }}
                />
                {/* M3 Screw Hole Voids */}
                <circle cx="35" cy="35" r="16" fill="#050505" stroke="#222" strokeWidth="2" style={{ filter: 'url(#holeShadow)' }}/>
                <circle cx="225" cy="275" r="16" fill="#050505" stroke="#222" strokeWidth="2" style={{ filter: 'url(#holeShadow)' }}/>
            </svg>
        );
    }

    if (style?.startsWith('gblock')) {
        const is12Pr = style === 'gblock_12pr';
        return (
            <div className="relative w-[30px] h-[30px] bg-[#111] border-2 border-[#333] rounded-md shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center p-1 mx-auto flex-shrink-0">
                <div className="absolute top-1 left-1 w-1 h-1 bg-[#ccc] rounded-full"></div>
                <div className="absolute top-1 right-1 w-1 h-1 bg-[#ccc] rounded-full"></div>
                <div className="absolute bottom-1 left-1 w-1 h-1 bg-[#ccc] rounded-full"></div>
                <div className="absolute bottom-1 right-1 w-1 h-1 bg-[#ccc] rounded-full"></div>
                <div className={`grid gap-[2px] w-full h-full ${is12Pr ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {Array.from({ length: is12Pr ? 12 : 6 }).map((_, i) => (
                        <div key={i} className="w-full h-full bg-yellow-500 rounded-full shadow-inner"></div>
                    ))}
                </div>
            </div>
        );
    }

    const faces = {
        'ethercon': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <path d="M 100,50 L 160,50 L 150,90 L 110,90 Z" fill="#ccc" stroke="#666" strokeWidth="2"/>
                <rect x="110" y="60" width="40" height="6" fill="#888" rx="2"/>
                <rect x="85" y="120" width="90" height="75" rx="5" fill="#000" />
                <path d="M 115,195 L 145,195 L 145,215 L 115,215 Z" fill="#000" />
                {Array.from({ length: 8 }).map((_, i) => (
                    <rect key={i} x={96 + (i * 9)} y="125" width="4" height="20" fill="#ffd700"/>
                ))}
            </DSeriesFlange>
        ),
        'xlr_f': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <path d="M 100,50 L 160,50 L 150,90 L 110,90 Z" fill="#ccc" stroke="#666" strokeWidth="2"/>
                <circle cx="130" cy="70" r="10" fill="#888"/>
                <text x="130" y="45" fill="#555" fontSize="20" fontWeight="bold" textAnchor="middle">PUSH</text>
                <circle cx="95" cy="130" r="16" fill="#000"/>
                <circle cx="165" cy="130" r="16" fill="#000"/>
                <circle cx="130" cy="200" r="16" fill="#000"/>
            </DSeriesFlange>
        ),
        'xlr_m': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <circle cx="130" cy="155" r="70" fill="#050505" stroke="#222" strokeWidth="2"/>
                <rect x="115" y="60" width="30" height="30" fill="#050505"/>
                <circle cx="95" cy="130" r="12" fill="#e5e5e5"/>
                <circle cx="165" cy="130" r="12" fill="#e5e5e5"/>
                <circle cx="130" cy="200" r="12" fill="#e5e5e5"/>
            </DSeriesFlange>
        ),
        'bnc': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#222" strokeWidth="4"/>
                <circle cx="130" cy="155" r="65" fill="#e5e5e5" stroke="#aaa" strokeWidth="4"/>
                <rect x="45" y="145" width="170" height="20" fill="#e5e5e5" stroke="#aaa" strokeWidth="2" rx="5"/>
                <circle cx="130" cy="155" r="45" fill="#fff" stroke="#ddd" strokeWidth="2"/>
                <circle cx="130" cy="155" r="10" fill="#ffd700" stroke="#b8860b" strokeWidth="2"/>
            </DSeriesFlange>
        ),
        'opticalcon_duo': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <rect x="55" y="125" width="150" height="60" rx="10" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                <circle cx="100" cy="155" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                <circle cx="160" cy="155" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
            </DSeriesFlange>
        ),
        'opticalcon_quad': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <rect x="55" y="125" width="150" height="60" rx="10" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                <rect x="100" y="80" width="60" height="150" rx="10" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                <circle cx="100" cy="125" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                <circle cx="160" cy="125" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                <circle cx="100" cy="185" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
                <circle cx="160" cy="185" r="12" fill="#fff" stroke="#666" strokeWidth="2"/>
            </DSeriesFlange>
        ),
        'mtp12': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <rect x="65" y="135" width="130" height="40" rx="8" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                <rect x="85" y="150" width="90" height="10" rx="2" fill="#000"/>
                <text x="130" y="110" fill="#fff" fontSize="24" fontFamily="monospace" fontWeight="bold" textAnchor="middle">12</text>
            </DSeriesFlange>
        ),
        'mtp24': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <rect x="65" y="135" width="130" height="40" rx="8" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                <rect x="85" y="150" width="90" height="10" rx="2" fill="#000"/>
                <text x="130" y="110" fill="#fff" fontSize="24" fontFamily="monospace" fontWeight="bold" textAnchor="middle">24</text>
            </DSeriesFlange>
        ),
        'mtp48': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <rect x="65" y="135" width="130" height="40" rx="8" fill="#00c853" stroke="#007a33" strokeWidth="3"/>
                <rect x="85" y="150" width="90" height="10" rx="2" fill="#000"/>
                <text x="130" y="110" fill="#fff" fontSize="24" fontFamily="monospace" fontWeight="bold" textAnchor="middle">48</text>
            </DSeriesFlange>
        ),
        'true1': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <circle cx="130" cy="155" r="85" fill="#FFD700" stroke="#cca100" strokeWidth="4"/>
                <circle cx="130" cy="155" r="60" fill="#1a1a1a"/>
                <rect x="115" y="70" width="30" height="20" fill="#FFD700"/>
            </DSeriesFlange>
        ),
        'powercon_blue': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="#0055FF" stroke="#0033aa" strokeWidth="4"/>
                <circle cx="130" cy="155" r="60" fill="#1a1a1a" stroke="#000" strokeWidth="4"/>
                <rect x="120" y="45" width="20" height="20" fill="#1a1a1a"/>
            </DSeriesFlange>
        ),
        'powercon_white': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="#e5e5e5" stroke="#ccc" strokeWidth="4"/>
                <circle cx="130" cy="155" r="60" fill="#1a1a1a" stroke="#000" strokeWidth="4"/>
                <rect x="120" y="45" width="20" height="20" fill="#1a1a1a"/>
            </DSeriesFlange>
        ),
        'speakon': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <circle cx="130" cy="155" r="65" fill="#111" stroke="#444" strokeWidth="4"/>
                <rect x="120" y="80" width="20" height="20" fill="#444"/>
                <rect x="60" y="145" width="20" height="20" fill="#444"/>
                <rect x="180" y="145" width="20" height="20" fill="#444"/>
                <circle cx="130" cy="155" r="30" fill="#222"/>
                <circle cx="130" cy="155" r="15" fill="#111"/>
            </DSeriesFlange>
        ),
        'hdmi': (
            <DSeriesFlange>
                <circle cx="130" cy="155" r="110" fill="url(#darkMetal)" stroke="#333" strokeWidth="4"/>
                <path d="M 60,135 L 200,135 L 200,155 L 180,185 L 80,185 L 60,155 Z" fill="#000" stroke="#555" strokeWidth="3"/>
                <rect x="75" y="145" width="110" height="6" fill="#333"/>
                <rect x="85" y="165" width="90" height="4" fill="#333"/>
            </DSeriesFlange>
        ),
        'blank': (
            <DSeriesFlange />
        )
    };

    return faces[style] || faces['blank'];
};

export default ConnectorFace;