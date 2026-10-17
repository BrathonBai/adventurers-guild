import { useEffect, useState } from 'react';
import { GuildHall } from './components/GuildHall';
import { GuildLedger } from './components/GuildLedger';

/**
 * The hall is the front door: commissions, arguments, people.
 *
 * Identity is deliberately quiet. It shows up as a tick next to a name and as
 * an opt-in page at `#/registry` — infrastructure you can inspect, not the
 * thing the product is about.
 */
function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return hash.startsWith('#/registry') ? <GuildLedger /> : <GuildHall />;
}

export default App;
