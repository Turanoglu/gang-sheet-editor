import React, { useMemo } from 'react';
import { inchesToPx } from '../../types';

interface RulerProps {
  orientation: 'horizontal' | 'vertical';
  length: number; // in pixels (display size)
  boardSize: number; // in inches
  dpi: number;
  displayScale: number;
}

export const Ruler: React.FC<RulerProps> = ({
  orientation,
  length,
  boardSize,
  dpi,
  displayScale,
}) => {
  const marks = useMemo(() => {
    const result: { position: number; label: string; isMajor: boolean }[] = [];
    
    // Generate marks for each inch
    for (let inch = 0; inch <= boardSize; inch++) {
      const positionPx = inchesToPx(inch, dpi) * displayScale;
      
      if (positionPx <= length) {
        result.push({
          position: positionPx,
          label: inch.toString(),
          isMajor: true,
        });
      }
    }
    
    return result;
  }, [boardSize, dpi, displayScale, length]);

  if (orientation === 'horizontal') {
    return (
      <div 
        className="h-6 bg-gray-100 border-b border-gray-300 relative overflow-hidden"
        style={{ marginLeft: '24px' }}
      >
        <div 
          className="absolute top-0 left-0 h-full"
          style={{ width: length }}
        >
          {marks.map((mark, index) => (
            <div
              key={index}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: mark.position }}
            >
              <div 
                className={`w-px bg-gray-400 ${mark.isMajor ? 'h-3' : 'h-1.5'}`}
              />
              {mark.isMajor && (
                <span className="text-[9px] text-gray-500 mt-0.5 font-medium">
                  {mark.label}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="w-6 bg-gray-100 border-r border-gray-300 relative overflow-hidden"
    >
      <div 
        className="absolute top-0 left-0 w-full"
        style={{ height: length }}
      >
        {marks.map((mark, index) => (
          <div
            key={index}
            className="absolute left-0 flex items-center"
            style={{ top: mark.position }}
          >
            <div 
              className={`h-px bg-gray-400 ${mark.isMajor ? 'w-3' : 'w-1.5'}`}
            />
            {mark.isMajor && (
              <span className="text-[9px] text-gray-500 ml-0.5 font-medium">
                {mark.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Ruler;

