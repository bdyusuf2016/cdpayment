
import React from 'react';

interface StatsProps {
  cards: {
    label: string;
    value: string | number;
    color: string;
  }[];
}

const StatsCards: React.FC<StatsProps> = ({ cards }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
      {cards.map((card, idx) => (
        <div 
          key={idx} 
          className={`relative group bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border-t-[6px] p-8 flex flex-col justify-center min-h-[140px] transition-all hover:-translate-y-2 hover:shadow-2xl overflow-hidden`}
          style={{ borderTopColor: card.color }}
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
          <div className="mt-4 w-12 h-1.5 rounded-full opacity-30" style={{ backgroundColor: card.color }}></div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
