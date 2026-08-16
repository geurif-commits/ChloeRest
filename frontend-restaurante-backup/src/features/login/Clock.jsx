import { useState, useEffect } from 'react';

export default function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const ampm = time.getHours() >= 12 ? 'PM' : 'AM';
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dayName = days[time.getDay()];
  const dayNum = time.getDate();
  const monthName = months[time.getMonth()];

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '3.5rem', fontWeight: 700, letterSpacing: '-2px', lineHeight: 1, color: 'var(--white)' }}>
        {hours}
        <span style={{ color: 'var(--gold)', animation: 'blink 2s infinite' }}>:</span>
        {minutes}
        <span style={{ fontSize: '1.2rem', fontWeight: 500, color: 'var(--muted)', marginLeft: '4px' }}>{ampm}</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '8px', fontWeight: 500 }}>
        {dayName}, {dayNum} {monthName}
      </div>
    </div>
  );
}
