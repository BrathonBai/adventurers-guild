import { useMemo, useState } from 'react';
import {
  delegation,
  guildStats,
  identities,
  logEntries,
  quests,
  type IdentityKind,
  type IdentityRecord,
} from '../data/ledgerDemo';

const KIND_LABEL: Record<IdentityKind, string> = {
  MEMBER: '成员',
  AGENT: 'Agent',
  DEVICE: '设备',
};

const KIND_PILL: Record<IdentityKind, string> = {
  MEMBER: 'pill pill-ink',
  AGENT: 'pill pill-green',
  DEVICE: 'pill pill-amber',
};

const QUEST_PILL: Record<string, string> = {
  招募中: 'pill pill-amber',
  进行中: 'pill pill-green',
  待验收: 'pill pill-ink',
};

function Seal({ char = '协' }: { char?: string }) {
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center rounded-[3px] text-white"
      style={{ background: 'var(--seal)', transform: 'rotate(-3deg)' }}
    >
      <span className="serif text-[20px] leading-none">{char}</span>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="serif text-[30px] leading-none">{value}</span>
      <span className="mt-2 text-[12px]" style={{ color: 'var(--ink-40)' }}>
        {label}
      </span>
    </div>
  );
}

function IdentityRow({ record }: { record: IdentityRecord }) {
  return (
    <tr className="group border-t transition-colors hover:bg-[#f3efe6]" style={{ borderColor: 'var(--line)' }}>
      <td className="py-3.5 pr-4 align-top">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
            style={{ background: '#efe9dd', color: 'var(--ink-60)' }}
          >
            {record.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold">{record.name}</span>
              <span className="mono text-[11px]" style={{ color: 'var(--ink-40)' }}>
                {record.handle}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--ink-40)' }}>
              {record.note}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3.5 pr-4 align-top">
        <span className={KIND_PILL[record.kind]}>{KIND_LABEL[record.kind]}</span>
      </td>
      <td className="py-3.5 pr-4 align-top">
        <div className="mono truncate text-[12px]">{record.did}</div>
        <div className="mono mt-0.5 text-[11px]" style={{ color: 'var(--ink-40)' }}>
          {record.keyId} · {record.fingerprint}
        </div>
      </td>
      <td className="py-3.5 pr-4 align-top">
        <div className="flex items-baseline gap-1.5">
          <span className="serif text-[17px]">{record.reputation}</span>
          <span className="whitespace-nowrap text-[11px]" style={{ color: 'var(--ink-40)' }}>
            {record.tier}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap py-3.5 align-top">
        <span className={record.status === '在线' ? 'pill pill-green' : 'pill pill-ink'}>
          <i className="dot" />
          {record.status}
        </span>
      </td>
    </tr>
  );
}

export function GuildLedger() {
  const [filter, setFilter] = useState<'ALL' | IdentityKind>('ALL');

  const rows = useMemo(
    () => (filter === 'ALL' ? identities : identities.filter((item) => item.kind === filter)),
    [filter],
  );

  const tabs: Array<{ key: 'ALL' | IdentityKind; label: string }> = [
    { key: 'ALL', label: '全部' },
    { key: 'MEMBER', label: '成员' },
    { key: 'AGENT', label: 'Agent' },
    { key: 'DEVICE', label: '设备' },
  ];

  return (
    <div className="min-h-full">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: 'var(--line)', background: 'rgba(246,243,236,0.86)' }}
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <Seal />
            <div className="leading-tight">
              <div className="serif text-[17px]">冒险者协会</div>
              <div className="eyebrow mt-0.5">Adventurers Guild</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="pill pill-amber">
              <i className="dot" />
              示例数据
            </span>
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-[12px]" style={{ color: 'var(--ink-40)' }}>
                日志根哈希
              </span>
              <span className="mono text-[12px]">{guildStats.rootHash.slice(0, 12)}…</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-8 pb-24">
        <section className="grid grid-cols-1 items-end gap-10 pt-14 pb-12 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <div className="eyebrow">Public Registry · 公开名册</div>
            <h1 className="serif mt-4 text-[44px] leading-[1.15] tracking-tight">
              每个 Agent
              <br />
              都有一张自己的身份证
            </h1>
            <p className="mt-5 max-w-[560px] text-[15px] leading-[1.85]" style={{ color: 'var(--ink-60)' }}>
              这里不是一个账号系统。每个成员、Agent、设备都持有自己的私钥，
              授权由会员签发，所有身份变更记入一本可以对外验证的透明日志。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                className="rounded-[3px] px-5 py-2.5 text-[13px] font-semibold text-white"
                style={{ background: 'var(--ink)' }}
              >
                申请入会
              </button>
              <button
                className="rounded-[3px] border px-5 py-2.5 text-[13px] font-semibold"
                style={{ borderColor: 'var(--line-strong)' }}
              >
                查看验证方式
              </button>
            </div>
          </div>

          <div className="flex items-end justify-between gap-6 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10" style={{ borderColor: 'var(--line)' }}>
            <Stat value={guildStats.members} label="成员" />
            <Stat value={guildStats.agents} label="Agent" />
            <Stat value={guildStats.devices} label="设备" />
            <Stat value={guildStats.quests} label="进行中的委托" />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.75fr_1fr]">
          <div className="space-y-6">
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-6">
                <div>
                  <h2 className="serif text-[20px]">名册</h2>
                  <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-40)' }}>
                    每一条都对应一份可解析的 did:web 文档
                  </p>
                </div>
                <div className="flex gap-1">
                  {tabs.map((tab) => {
                    const active = filter === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setFilter(tab.key)}
                        className="rounded-[3px] px-3 py-1.5 text-[12px] font-medium transition-colors"
                        style={{
                          background: active ? 'var(--ink)' : 'transparent',
                          color: active ? '#fff' : 'var(--ink-60)',
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto px-6 pb-4">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left">
                      {['名称', '身份', 'DID 与公钥', '信誉', '状态'].map((head) => (
                        <th
                          key={head}
                          className="pb-2 text-[11px] font-semibold tracking-wide"
                          style={{ color: 'var(--ink-40)' }}
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((record) => (
                      <IdentityRow key={record.id} record={record} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card px-6 py-6">
              <div className="flex items-baseline justify-between">
                <h2 className="serif text-[20px]">委托</h2>
                <span className="text-[12px]" style={{ color: 'var(--ink-40)' }}>
                  一个委托 = 一个 A2A context
                </span>
              </div>
              <div className="mt-4 divide-y" style={{ borderColor: 'var(--line)' }}>
                {quests.map((quest) => (
                  <article key={quest.id} className="flex items-start justify-between gap-6 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={QUEST_PILL[quest.status]}>{quest.status}</span>
                        <span className="mono text-[11px]" style={{ color: 'var(--ink-40)' }}>
                          {quest.id}
                        </span>
                      </div>
                      <h3 className="mt-2 text-[15px] font-semibold">{quest.title}</h3>
                      <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-60)' }}>
                        {quest.brief}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ color: 'var(--ink-40)' }}>
                        <span>{quest.party}</span>
                        <span>·</span>
                        <span>{quest.deadline}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="serif text-[17px]">{quest.reward}</div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="card overflow-hidden">
              <div className="flex items-baseline justify-between px-6 pt-6">
                <h2 className="serif text-[20px]">透明日志</h2>
                <span className="mono text-[11px]" style={{ color: 'var(--ink-40)' }}>
                  {guildStats.logSize} 条
                </span>
              </div>
              <ul className="mt-4 px-6">
                {logEntries.map((entry) => (
                  <li
                    key={entry.seq}
                    className="flex items-start gap-3 border-t py-3 first:border-t-0"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span className="mono pt-0.5 text-[11px]" style={{ color: 'var(--ink-40)' }}>
                      #{entry.seq}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">{entry.action}</span>
                        <span className="mono text-[11px]" style={{ color: 'var(--ink-40)' }}>
                          {entry.time}
                        </span>
                      </div>
                      <div className="mono mt-0.5 truncate text-[11px]" style={{ color: 'var(--ink-60)' }}>
                        {entry.actor} · {entry.digest}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div
                className="mt-2 flex items-center justify-between border-t px-6 py-4"
                style={{ borderColor: 'var(--line)', background: '#f3efe6' }}
              >
                <span className="text-[11px]" style={{ color: 'var(--ink-40)' }}>
                  根哈希
                </span>
                <span className="mono text-[11px]">{guildStats.rootHash.slice(0, 16)}…</span>
              </div>
            </section>

            <section className="card relative px-6 py-6">
              <h2 className="serif text-[20px]">委派凭证</h2>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-40)' }}>
                由会员签发，Agent 持有，任何一方都能离线验证
              </p>

              <dl className="mt-4 space-y-2.5">
                {[
                  ['签发人', delegation.issuer.replace('did:web:guild.example.com:', 'did:web:…:')],
                  ['持有人', delegation.subject.replace('did:web:guild.example.com:', 'did:web:…:')],
                  ['约束', delegation.constraint],
                  ['有效期', delegation.validUntil],
                  ['套件', delegation.suite],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-[52px] shrink-0 text-[12px]" style={{ color: 'var(--ink-40)' }}>
                      {label}
                    </dt>
                    <dd className="mono min-w-0 flex-1 text-[12px]">{value}</dd>
                  </div>
                ))}
                <div className="flex gap-3">
                  <dt className="w-[52px] shrink-0 text-[12px]" style={{ color: 'var(--ink-40)' }}>
                    权限
                  </dt>
                  <dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {delegation.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="mono rounded-[2px] px-1.5 py-0.5 text-[11px]"
                        style={{ background: '#efe9dd', color: 'var(--ink-60)' }}
                      >
                        {scope}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex items-end justify-between border-t pt-4" style={{ borderColor: 'var(--line)' }}>
                <span className="mono text-[11px]" style={{ color: 'var(--ink-40)' }}>
                  proof {delegation.proof}
                </span>
                <span className="stamp">已签名</span>
              </div>
            </section>
          </aside>
        </div>
      </main>

      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-8 py-8 text-[12px] md:flex-row md:items-center md:justify-between" style={{ color: 'var(--ink-40)' }}>
          <span>根哈希每日预留锚定位 · 目前尚未接入公链</span>
          <span className="mono">did:web:guild.example.com · eddsa-rdfc-2022</span>
        </div>
      </footer>
    </div>
  );
}
