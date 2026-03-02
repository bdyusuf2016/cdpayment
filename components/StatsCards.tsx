
import React from 'react';

interface StatsProps {
  cards: {
    label: string;
    value: string | number;
    color: string;
    subtitle?: string;
  }[];
  onCardClick?: (index: number) => void;
  activeIndex?: number | null;
}

const StatsCards: React.FC<StatsProps> = ({ cards, onCardClick, activeIndex }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
      {cards.map((card, idx) => (
        <div 
          key={idx} 
          className={`relative group bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border-t-[6px] p-8 flex flex-col justify-center min-h-[140px] transition-all hover:-translate-y-2 hover:shadow-2xl overflow-hidden ${onCardClick ? "cursor-pointer" : ""} ${activeIndex === idx ? "ring-2 ring-blue-400 dark:ring-blue-500" : ""}`}
          style={{ borderTopColor: card.color }}
          onClick={() => onCardClick?.(idx)}
          role={onCardClick ? "button" : undefined}
          tabIndex={onCardClick ? 0 : undefined}
          onKeyDown={(e) => {
            if (!onCardClick) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onCardClick(idx);
            }
          }}
        >
          <div className="absolute -right-4 -bottom-4 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity">
             <i className="fas fa-chart-line text-8xl rotate-12" style={{ color: card.color }}></i>
          </div>
          <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] mb-2">
            {card.label}
          </p>
          <p className="text-3xl font-black tracking-tighter" style={{ color: card.color }}>
            {card.value}
          </p>
          {card.subtitle ? (
            <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {card.subtitle}
            </p>
          ) : null}
          <div className="mt-4 w-12 h-1.5 rounded-full opacity-30" style={{ backgroundColor: card.color }}></div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
