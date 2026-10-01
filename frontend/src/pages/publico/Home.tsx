import { LeagueCommunity } from '../../components/LeagueCommunity';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { IconFootball, IconTrophy, IconUsers } from '../../components/icons';
import { Marco } from './Marco';

export default function Home() {
  const [copyStatus, setCopyStatus] = useState('');
  const leagueUrl = new URL('/', window.location.origin).href;
  const invitation = `¿Armamos equipo? Conoce Master Flag League en Cancún, consulta partidos y resultados e inscribe tu equipo: ${leagueUrl}`;
  const registration = useQuery({
    queryKey: ['registration-options'],
    queryFn: () => api.get<{ category_id: string; category_name: string }[]>('/public/registration-options'),
  });
  const categories = [...new Set(registration.data?.map(option => option.category_name) ?? [])];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invitation);
      setCopyStatus('Invitación copiada. Compártela con tu equipo.');
    } catch {
      setCopyStatus('Puedes copiar el enlace que aparece abajo.');
    }
  };

  return (
    <Marco titulo="Master Flag League" campaign>
      <section className="campaign-hero">
        <img className="campaign-hero-art" src="/mfl-campaign-hero.webp" alt="Ilustración de jugadoras y jugadores de flag football disputando el balón bajo las luces de la cancha" fetchPriority="high" width="1536" height="1024" />
        <div className="campaign-hero-shade" aria-hidden="true" />
        <div className="campaign-hero-content">
          <p className="campaign-eyebrow"><span /> CANCÚN, MÉXICO · FLAG FOOTBALL</p>
          <h1>LA CANCHA<br />ES <em>TUYA.</em></h1>
          <p className="campaign-hero-description">Tu equipo. Tu gente. Tu siguiente jugada.<br />Forma parte de Master Flag League.</p>
          <div className="campaign-actions">
            <Link className="campaign-button campaign-button-yellow" to="/registro">Inscribe a tu equipo <span aria-hidden="true">↗</span></Link>
            <Link className="campaign-button campaign-button-outline" to="/jornada">Explora la liga <span aria-hidden="true">→</span></Link>
          </div>
          <div className="campaign-hero-signature"><img src="/logo-96.webp" alt="" width="44" height="44" /><span>MASTER FLAG LEAGUE<br /><small>El juego nos une.</small></span></div>
        </div>
        <span className="campaign-art-credit">ARTE PROMOCIONAL MFL</span>
      </section>

      <div className="campaign-strip" aria-label="Categorías con inscripción disponible">
        <span>UNA LIGA. TODA LA PASIÓN.</span>
        {categories.length ? categories.map(category => <span key={category}><i aria-hidden="true">✦</i> {category}</span>) : <span><i aria-hidden="true">✦</i> MASTER FLAG LEAGUE</span>}
      </div>

      <section className="campaign-section" aria-labelledby="vive-liga">
        <div className="campaign-section-heading"><div><p className="campaign-eyebrow">DENTRO Y FUERA DE LA CANCHA</p><h2 id="vive-liga">VIVE CADA <em>JUGADA.</em></h2></div><p>La emoción sigue después del silbatazo.<br />Todo lo que pasa en tu liga, aquí.</p></div>
        <div className="campaign-destinations">
          {[
            { to: '/jornada', number: '01', title: 'DÍA DE PARTIDO', description: 'Horarios, sedes y resultados. Encuentra tu próxima cita en la cancha.', icon: IconFootball, tone: 'cyan', label: 'Ver partidos' },
            { to: '/tabla', number: '02', title: 'CADA PUNTO CUENTA', description: 'Sigue a tu equipo y consulta las posiciones de cada categoría.', icon: IconTrophy, tone: 'pink', label: 'Ver posiciones' },
            { to: '/registro', number: '03', title: 'ARMA TU EQUIPO', description: 'Crea tu cuenta, inscribe a tu equipo y prepara tu plantilla.', icon: IconUsers, tone: 'yellow', label: 'Empezar registro' },
          ].map(({ to, number, title, description, icon: Icon, tone, label }) => (
            <Link key={to} to={to} className={`campaign-destination campaign-${tone}`}>
              <div className="campaign-destination-top"><Icon size={38} /><span>{number}</span></div>
              <h3>{title}</h3><p>{description}</p><span className="campaign-destination-link">{label}<span aria-hidden="true">↗</span></span>
            </Link>
          ))}
        </div>
      </section>

      <LeagueCommunity />
      <section className="campaign-invite" aria-labelledby="invitar">
        <div className="campaign-invite-mark" aria-hidden="true">MFL<span>↗</span></div>
        <div className="campaign-invite-copy">
          <p className="campaign-eyebrow">EL MEJOR PLAN SE ARMA EN EQUIPO</p>
          <h2 id="invitar">PASA LA VOZ.<br /><em>ARMA LA JUGADA.</em></h2>
          <p>Ese grupo de amigos tiene un lugar en la cancha. Invítalos a conocer MFL.</p>
          <div className="campaign-actions"><a className="campaign-button campaign-button-yellow" href={`https://wa.me/?text=${encodeURIComponent(invitation)}`} target="_blank" rel="noopener noreferrer">Invitar por WhatsApp ↗</a><button className="campaign-button campaign-button-outline" onClick={copy}>Copiar invitación</button></div>
          <label className="campaign-share-link">Enlace de la liga<input readOnly value={leagueUrl} onFocus={event => event.target.select()} /></label>
          <p role="status" aria-live="polite" className="campaign-copy-status">{copyStatus}</p>
        </div>
      </section>

      <section className="campaign-section campaign-faq" aria-labelledby="dudas">
        <div><p className="campaign-eyebrow">TU PRIMERA JUGADA</p><h2 id="dudas">ENTRA AL<br /><em>JUEGO.</em></h2><Link className="campaign-button campaign-button-yellow" to="/registro">Crear cuenta ↗</Link></div>
        <div className="campaign-questions">
          <details><summary>¿Cómo inscribo a mi equipo?</summary><p>Crea tu cuenta de encargado, elige una temporada y categoría con inscripciones abiertas y completa tu plantilla. La participación está sujeta a los requisitos y validación de la liga.</p></details>
          <details><summary>Mi equipo ya está registrado, ¿qué hago?</summary><p>Pide a administración vincular tu cuenta al equipo existente. Así conservas su plantilla y todo su historial.</p></details>
          <details><summary>¿Puedo seguir la liga sin una cuenta?</summary><p>Sí. Partidos, resultados y posiciones son públicos para que amigos y familiares sigan cada jornada.</p></details>
          <details><summary>¿Dónde consulto cuotas y próximas convocatorias?</summary><p>Contacta a la liga en <a href="https://www.instagram.com/mflcancun/" target="_blank" rel="noopener noreferrer">@mflcancun</a>. Las temporadas disponibles aparecen en el registro.</p></details>
        </div>
      </section>
    </Marco>
  );
}
