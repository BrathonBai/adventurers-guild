import { GuildSnapshot } from '../../types';

export function AdminOpsConsole({ snapshot, connectionNote, onRefresh }: {
  snapshot: GuildSnapshot;
  connectionNote: string;
  onRefresh: () => Promise<void>;
}) {
  const openBeacons = snapshot.partyBeacons.filter((beacon) => beacon.status === 'OPEN').length;
  const pendingResponses = snapshot.partyBeacons.reduce(
    (total, beacon) => total + beacon.responses.filter((response) => response.status === 'PENDING').length,
    0,
  );
  const activeDelegations = snapshot.delegations.filter((delegation) => delegation.status === 'ACTIVE').length;
  const offlineAgents = snapshot.agents.filter((agent) => agent.availability === 'OFFLINE').length;

  return (
    <main className="min-h-screen bg-[#f4f1ea] text-[#161616]">
      <div className="border-b border-black/10 bg-[#101010] text-[#f4f1ea]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.34em] text-amber-300">Guild Operations</div>
            <h1 className="mt-2 text-4xl font-black tracking-tight">管理者控制台</h1>
            <p className="mt-2 max-w-2xl text-sm text-stone-300">
              这里不是协会前台，而是用于观察身份、授权、组队广播、A2A 活动和运行状态的后台工作台。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-none border border-amber-300/30 px-3 py-2 font-mono text-xs text-amber-200">{connectionNote}</span>
            <button onClick={() => void onRefresh()} className="bg-amber-300 px-4 py-2 font-mono text-xs font-bold uppercase text-black hover:bg-amber-200">
              Refresh Snapshot
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3 border border-black/10 bg-white p-4 shadow-[6px_6px_0_#111]">
          <AdminMetric label="Members" value={snapshot.members.length} />
          <AdminMetric label="Agents" value={snapshot.agents.length} />
          <AdminMetric label="Open Beacons" value={openBeacons} />
          <AdminMetric label="Pending Responses" value={pendingResponses} warning={pendingResponses > 0} />
          <AdminMetric label="Active Delegations" value={activeDelegations} />
          <AdminMetric label="Offline Agents" value={offlineAgents} warning={offlineAgents > 0} />
        </aside>

        <section className="space-y-6">
          <AdminSection title="Identity Registry" eyebrow="DID / Connection URI">
            <div className="grid gap-3 lg:grid-cols-2">
              {[...snapshot.members.map((member) => ({
                kind: 'MEMBER',
                name: member.displayName,
                did: member.did,
                connectionUri: member.connectionUri,
                meta: member.role,
              })), ...snapshot.agents.map((agent) => ({
                kind: 'AGENT',
                name: agent.displayName,
                did: agent.did,
                connectionUri: agent.connectionUri,
                meta: `${agent.classification} / ${agent.availability}`,
              }))].map((identity) => (
                <div key={identity.did} className="border border-black/10 bg-[#fbfaf7] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-500">{identity.kind}</div>
                    <div className="font-mono text-xs text-stone-500">{identity.meta}</div>
                  </div>
                  <div className="mt-2 text-xl font-bold">{identity.name}</div>
                  <div className="mt-3 break-all bg-black px-3 py-2 font-mono text-xs text-amber-200">{identity.did}</div>
                  <div className="mt-2 break-all border border-black/10 px-3 py-2 font-mono text-xs">{identity.connectionUri}</div>
                </div>
              ))}
            </div>
          </AdminSection>

          <AdminSection title="Party Beacon Queue" eyebrow="Antenna-like discovery">
            <div className="space-y-3">
              {snapshot.partyBeacons.length === 0 && <EmptyAdminState text="No party beacons yet." />}
              {snapshot.partyBeacons.map((beacon) => (
                <div key={beacon.id} className="border border-black/10 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-mono text-xs uppercase tracking-[0.24em] text-stone-500">{beacon.status} / {beacon.visibility}</div>
                      <div className="mt-1 text-2xl font-black">{beacon.title}</div>
                      <p className="mt-2 text-sm text-stone-700">{beacon.intent}</p>
                      <div className="mt-2 break-all font-mono text-xs text-stone-500">{beacon.publisherDid}</div>
                    </div>
                    <div className="min-w-44 border border-black/10 bg-[#f4f1ea] p-3 font-mono text-xs">
                      <div>Quest: {beacon.questId || 'none'}</div>
                      <div>Party: {beacon.partyId || 'not formed'}</div>
                      <div>Responses: {beacon.responses.length}</div>
                    </div>
                  </div>
                  {beacon.responses.length > 0 && (
                    <div className="mt-4 grid gap-2">
                      {beacon.responses.map((response) => (
                        <div key={response.id} className="border-l-4 border-black bg-[#f8f6f1] px-3 py-2">
                          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <span className="break-all font-mono text-xs">{response.responderDid}</span>
                            <span className="font-mono text-xs font-bold">{response.status}</span>
                          </div>
                          <p className="mt-1 text-sm text-stone-700">{response.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </AdminSection>

          <AdminSection title="Delegation Ledger" eyebrow="Authorization boundary">
            <div className="grid gap-3 lg:grid-cols-2">
              {snapshot.delegations.map((delegation) => (
                <div key={delegation.id} className="border border-black/10 bg-white p-4">
                  <div className="font-mono text-xs uppercase tracking-[0.24em] text-stone-500">{delegation.status}</div>
                  <div className="mt-2 break-all font-mono text-xs">{delegation.memberId} {'->'} {delegation.agentId}</div>
                  <p className="mt-2 text-sm text-stone-700">{delegation.operatingNote}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {delegation.scopes.map((scope) => (
                      <span key={scope} className="border border-black px-2 py-1 font-mono text-[10px] uppercase">{scope}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AdminSection>
        </section>
      </div>
    </main>
  );
}

function AdminMetric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={`border p-3 ${warning ? 'border-amber-500 bg-amber-50' : 'border-black/10 bg-[#fbfaf7]'}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-500">{label}</div>
      <div className="mt-1 text-3xl font-black">{value}</div>
    </div>
  );
}

function AdminSection({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="border border-black/10 bg-[#fffcf5] p-5 shadow-[6px_6px_0_#111]">
      <div className="mb-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-stone-500">{eyebrow}</div>
        <h2 className="mt-1 text-2xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyAdminState({ text }: { text: string }) {
  return <div className="border border-dashed border-black/20 bg-white p-6 text-sm text-stone-500">{text}</div>;
}
