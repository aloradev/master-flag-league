import type { calendarTheme } from '../lib/calendarTheme';

// Each illustration fits the same tile, including the cut-paper border.
const motifs = {
  navidad: <g>
    <path d="M0 4q40 10 80 0t80 0M40 9v6m80-14v12" stroke="var(--ribbon-gold)" fill="none"/>
    <g transform="translate(40 22)">
      {Array.from({length:7}, (_,i) => <g key={i} transform={`rotate(${i * 360 / 7})`}>
        <path d="m-4-5 4-12 4 12Z" fill={i % 2 ? 'var(--ribbon-ink)' : 'var(--ribbon-gold)'}/>
        <path d="M0-17v12l4 1Z" fill="var(--ribbon-leaf)" opacity=".6"/>
      </g>)}
      <circle r="6" fill="var(--ribbon-gold)"/>
    </g>
    <path d="m114 15 6-5 6 5 2 11-8 8-8-8Z" fill="var(--ribbon-gold)"/>
    <path d="m117 15-1 11 4 6 4-6-1-11M113 26h14" stroke="var(--ribbon-ink)" fill="none"/>
  </g>,
  nuevo: <g fill="none" stroke="currentColor" strokeWidth="2">
    {[0, 45, 90, 135, 180, 225, 270, 315].map(a => <g key={a}><path transform={`rotate(${a} 58 22)`} d="M58 5v10"/><path transform={`rotate(${a + 20} 104 17)`} stroke="var(--ribbon-gold)" d="M104 5v6"/></g>)}
  </g>,
  reyes: <g fill="var(--ribbon-gold)" stroke="currentColor" strokeWidth="1.5">
    {[30, 66, 102].map(x => <path key={x} transform={`translate(${x} 0)`} d="m0 14 8 7 5-13 6 13 8-7-4 16H4Zm5 19h18"/>)}
  </g>,
  amistad: <g fill="currentColor">
    {[38, 72, 106].map((x,i) => <path key={x} transform={`translate(${x} ${i === 1 ? 6 : 14})`} d="M10 5C3-5-6 4 2 12l8 8 8-8c8-8-1-17-8-7Z"/>)}
  </g>,
  patrias: <g>
    <path d="M4 5q76 18 152 0" stroke="currentColor" fill="none"/>
    {[32, 67, 102].map((x,i) => <g key={x} transform={`translate(${x} ${i === 1 ? 13 : 10})`}><path fill={['var(--ribbon-leaf)','var(--ribbon-gold)','var(--ribbon-ink)'][i]} d="M0 0h26v16l-4 4-4-3-5 5-5-5-4 3-4-4Z"/><path fill="var(--ribbon-paper)" d="m13 3 4 5-4 5-4-5Z"/></g>)}
  </g>,
  muertos: <g>
    {[42, 80, 118].map((x,i) => <g key={x} transform={`translate(${x} ${i === 1 ? 17 : 27})`}>{[0,45,90,135].map(a => <ellipse key={a} rx="5" ry="13" transform={`rotate(${a})`} fill="var(--ribbon-gold)" stroke="var(--ribbon-paper)" strokeWidth=".7"/>)}<circle r="4" fill="currentColor"/></g>)}
  </g>,
};

const names = { navidad: 'Navidad', nuevo: 'Año Nuevo', reyes: 'Día de Reyes', amistad: 'Día del Amor y la Amistad', patrias: 'Fiestas Patrias', muertos: 'Día de Muertos' };

export function HolidayFrieze({ season }: { season: ReturnType<typeof calendarTheme> }) {
  if (!(season in motifs)) return null;
  const holiday = season as keyof typeof motifs;
  return <div className="holiday-frieze">
    <svg aria-hidden="true" width="100%" height="44">
      <defs><pattern id="mfl-holiday-tile" width="160" height="44" patternUnits="userSpaceOnUse">{motifs[holiday]}</pattern></defs>
      <rect width="100%" height="100%" fill="url(#mfl-holiday-tile)"/>
    </svg>
    <span>{names[holiday]}</span>
  </div>;
}
