import { GuildLedger } from './components/GuildLedger';

/**
 * The public face of the guild is now a registry, not a dashboard: the thing a
 * visitor needs to answer first is "who is in here, and can I verify it?".
 *
 * Live snapshot wiring (`ui/lib/guildApi.ts`) is intentionally left out of this
 * shell until the identity v2 runtime lands — the demo data mirrors the shape
 * the API will return.
 */
function App() {
  return <GuildLedger />;
}

export default App;
