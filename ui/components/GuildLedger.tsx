import { useEffect, useMemo, useState } from 'react';
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
  MEMBER: 'M',
  AGENT: 'A',
  DEVICE: 'D',
};

const KIND_CHIP: Record<IdentityKind, string> = {
  MEMBER: 'chip',
  AGENT: 'chip chip-green',
  DEVICE: 'chip chip-amber',
};

const QUEST_CHIP: Record<string, string> = {
  招募中: 'chip chip-amber',
  进行中: 'chip chip-green',
  待验收: 'chip',
};

function readScheme(): 'light' | 'dark' {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark' || forced === 'light') return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setScheme(readScheme());
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return scheme;
}

/** A hairline that runs past the container, so the grid never feels sealed. */
function BleedRule() {
  return (
    <div
      className="pointer-events-none relative h-px w-screen"
      style={{ background: 'var(--line)', left: '50%', transform: 'translateX(-50%)' }}
    />
  );
}

function Seal({ label = '协', size = 40 }: { label?: string; size?: number }) {
  return (
    <span
      className="serif grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        background: 'var(--seal)',
        color: 'var(--seal-ink)',
        fontSize: size * 0.48,
        transform: 'rotate(-4deg)',
        borderRadius: 2,
      }}
    >
      {label}
    </span>
  );
}

function SectionHead({
  index,
  title,
  caption,
  action,
}: {
  index: string;
  title: string;
  caption?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="flex items-baseline gap-3">
        <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
          {index}
        </span>
        <h2 className="serif text-[17px]">{title}</h2>
        {caption ? (
          <span className="mono hidden text-[10px] md:inline" style={{ color: 'var(--ink-45)' }}>
            {caption}
          </span>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function IdentityRow({ record, index }: { record: IdentityRecord; index: number }) {
  return (
    <li className="hair group relative flex items-start gap-4 py-4">
      <span className="mono w-5 shrink-0 pt-1 text-[10px]" style={{ color: 'var(--ink-30)' }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="serif text-[19px] leading-none">{record.name}</span>
          <span className="mono text-[10px]" style={{ color: 'var(--ink-45)' }}>
            {record.handle}
          </span>
          <span className={KIND_CHIP[record.kind]}>{KIND_LABEL[record.kind]}</span>
        </div>
        <div className="mono mt-1.5 truncate text-[10.5px]" style={{ color: 'var(--ink-45)' }}>
          {record.did}
          <span style={{ color: 'var(--ink-30)' }}>
            {' '}
            · {record.keyId} {record.fingerprint}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="serif text-[15px] leading-none">{record.reputation}</div>
        <div className="mono mt-1 text-[9px]" style={{ color: 'var(--ink-45)' }}>
          {record.status === '在线' ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>

      <span
        className="absolute -left-4 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: 'var(--seal)' }}
      >
        ▸
      </span>
    </li>
  );
}

export function GuildLedger() {
  const [filter, setFilter] = useState<'ALL' | IdentityKind>('ALL');
  const scheme = useColorScheme();

  const rows = useMemo(
    () => (filter === 'ALL' ? identities : identities.filter((item) => item.kind === filter)),
    [filter],
  );

  const filters: Array<{ key: 'ALL' | IdentityKind; label: string }> = [
    { key: 'ALL', label: 'ALL' },
    { key: 'MEMBER', label: 'MEMBER' },
    { key: 'AGENT', label: 'AGENT' },
    { key: 'DEVICE', label: 'DEVICE' },
  ];

  return (
    <div className="min-h-full">
      <aside
        className="fixed left-0 top-0 z-20 hidden h-full w-10 flex-col items-center justify-between border-r py-6 lg:flex"
        style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
      >
        <span className="vtext eyebrow">ADV · GUILD · 2026</span>
        <Seal size={22} />
      </aside>

      <div className="lg:pl-10">
        <div
          className="flex items-center gap-4 border-b px-6 py-2.5 md:px-10"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="mono text-[10px]" style={{ color: 'var(--ink-45)' }}>
            AG/REGISTRY
          </span>
          <span className="ascii-rule hidden flex-1 text-[10px] md:block">
            ────────────────────────────────────────────────────────────────
          </span>
          <span className="mono hidden text-[10px] sm:inline" style={{ color: 'var(--ink-45)' }}>
            ENTRIES {guildStats.logSize}
          </span>
          <span className="mono hidden text-[10px] sm:inline" style={{ color: 'var(--ink-45)' }}>
            ROOT {guildStats.rootHash.slice(0, 8)}
          </span>
          <span className="mono text-[10px]" style={{ color: 'var(--green)' }}>
            <span className="blink">●</span> SYS/{scheme.toUpperCase()}
          </span>
        </div>

        <main className="mx-auto max-w-[1180px] px-6 pb-24 md:px-10">
          <header className="pt-14 md:pt-20">
            <div className="flex items-baseline gap-4">
              <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
                01
              </span>
              <span className="eyebrow">PUBLIC REGISTRY</span>
              <span className="ascii-rule flex-1 text-[10px]">
                ────────────────────────────────────────────
              </span>
            </div>

            <div className="mt-9 grid min-w-0 grid-cols-1 items-end gap-10 lg:grid-cols-[1.4fr_auto]">
              <h1 className="serif text-[clamp(42px,7vw,84px)] leading-[0.98]">
                每个 Agent
                <br />
                都有身份证
              </h1>

              <div
                className="flex gap-9 lg:flex-col lg:gap-4 lg:border-l lg:pl-8"
                style={{ borderColor: 'var(--line)' }}
              >
                {[
                  [guildStats.members, 'MEMBERS'],
                  [guildStats.agents, 'AGENTS'],
                  [guildStats.devices, 'DEVICES'],
                ].map(([value, label]) => (
                  <div key={String(label)} className="flex items-baseline gap-2 lg:justify-between">
                    <span className="serif text-[26px] leading-none">{value}</span>
                    <span className="mono text-[9px]" style={{ color: 'var(--ink-45)' }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p
              className="mt-8 max-w-[50ch] text-[14.5px] leading-[1.95]"
              style={{ color: 'var(--ink-70)' }}
            >
              这里不是账号系统。成员、Agent、设备各持自己的私钥，授权由会员签发，
              身份变更记进一本可以对外验证的日志。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                className="mono px-4 py-2 text-[11px] font-semibold"
                style={{ background: 'var(--ink)', color: 'var(--paper)' }}
              >
                申请入会 →
              </button>
              <button
                className="mono px-4 py-2 text-[11px]"
                style={{ border: '1px solid var(--line)', color: 'var(--ink-70)' }}
              >
                验证方式
              </button>
              <span
                className="mono ml-auto hidden text-[10px] md:inline"
                style={{ color: 'var(--ink-30)' }}
              >
                ↑ 示例数据，未连接运行时
              </span>
            </div>
          </header>

          <div className="mt-6">
            <BleedRule />
          </div>

          <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-14 lg:grid-cols-12">
            <section className="min-w-0 lg:col-span-7">
              <SectionHead
                index="02"
                title="名册"
                caption="each row resolves to a did:web document"
                action={
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {filters.map((item) => {
                      const active = filter === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => setFilter(item.key)}
                          className="mono text-[10px] transition-colors"
                          style={{
                            color: active ? 'var(--seal)' : 'var(--ink-30)',
                            textDecoration: active ? 'underline' : 'none',
                            textUnderlineOffset: 4,
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                }
              />

              <ul className="mt-4">
                {rows.map((record, index) => (
                  <IdentityRow key={record.id} record={record} index={index} />
                ))}
              </ul>

              <section className="mt-14">
                <SectionHead index="03" title="委托" caption="one quest = one a2a context" />
                <ul className="mt-4">
                  {quests.map((quest) => (
                    <li key={quest.id} className="hair flex items-start gap-5 py-4">
                      <span
                        className="mono w-14 shrink-0 pt-1 text-[10px]"
                        style={{ color: 'var(--ink-30)' }}
                      >
                        {quest.id}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={QUEST_CHIP[quest.status]}>{quest.status}</span>
                          <span className="text-[14px] font-semibold">{quest.title}</span>
                        </div>
                        <p
                          className="mt-1 text-[12.5px] leading-relaxed"
                          style={{ color: 'var(--ink-45)' }}
                        >
                          {quest.brief}
                        </p>
                        <div
                          className="mono mt-1.5 flex flex-wrap gap-x-3 text-[10px]"
                          style={{ color: 'var(--ink-30)' }}
                        >
                          <span>{quest.party}</span>
                          <span>·</span>
                          <span>{quest.deadline}</span>
                        </div>
                      </div>
                      <span className="serif shrink-0 text-[15px]">{quest.reward}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </section>

            <aside className="min-w-0 lg:col-span-5">
              <section>
                <SectionHead index="04" title="透明日志" caption={`${guildStats.logSize} entries`} />
                <ol className="mt-4">
                  {logEntries.map((entry, index) => {
                    const last = index === logEntries.length - 1;
                    return (
                      <li key={entry.seq} className="flex items-baseline gap-2 py-1.5">
                        <span
                          className="mono w-9 shrink-0 text-[9px]"
                          style={{ color: 'var(--ink-30)' }}
                        >
                          {entry.seq}
                        </span>
                        <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
                          {last ? '└─' : '├─'}
                        </span>
                        <span className="text-[12.5px]">{entry.action}</span>
                        <span className="ascii-rule min-w-0 flex-1 text-[9px]">············</span>
                        <span
                          className="mono shrink-0 text-[9px]"
                          style={{ color: 'var(--ink-45)' }}
                        >
                          {entry.actor}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <div
                  className="mono mt-3 flex items-baseline justify-between border-t pt-3 text-[9px]"
                  style={{ borderColor: 'var(--line)', color: 'var(--ink-30)' }}
                >
                  <span>ROOT</span>
                  <span className="truncate">{guildStats.rootHash}</span>
                </div>
              </section>

              <section className="relative mt-14">
                <SectionHead index="05" title="委派凭证" caption="signed by the member" />
                <div className="ticket relative mt-5 px-5 py-5">
                  <dl className="space-y-2">
                    {[
                      ['ISSUER', delegation.issuer.replace('did:web:guild.example.com:', '…:')],
                      ['SUBJECT', delegation.subject.replace('did:web:guild.example.com:', '…:')],
                      ['CONSTRAINT', delegation.constraint],
                      ['VALID', delegation.validUntil],
                      ['SUITE', delegation.suite],
                    ].map(([label, value]) => (
                      <div key={label} className="flex gap-3">
                        <dt
                          className="mono w-[74px] shrink-0 text-[9px]"
                          style={{ color: 'var(--ink-30)' }}
                        >
                          {label}
                        </dt>
                        <dd className="mono min-w-0 flex-1 text-[10.5px]">{value}</dd>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <dt
                        className="mono w-[74px] shrink-0 text-[9px]"
                        style={{ color: 'var(--ink-30)' }}
                      >
                        SCOPES
                      </dt>
                      <dd className="flex min-w-0 flex-1 flex-wrap gap-1">
                        {delegation.scopes.map((scope) => (
                          <span key={scope} className="chip">
                            {scope}
                          </span>
                        ))}
                      </dd>
                    </div>
                  </dl>

                  <div
                    className="mono mt-4 border-t pt-3 text-[9px]"
                    style={{ borderColor: 'var(--line)', color: 'var(--ink-30)' }}
                  >
                    proof {delegation.proof}
                  </div>

                  <span
                    className="seal-mark absolute -bottom-4 -right-3 px-3 py-1.5 text-[10px]"
                    style={{ background: 'var(--paper)' }}
                  >
                    已签名
                  </span>
                </div>
              </section>
            </aside>
          </div>
        </main>

        <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
          <div
            className="mono mx-auto flex max-w-[1180px] flex-col gap-1 px-6 py-7 text-[10px] md:flex-row md:items-center md:justify-between md:px-10"
            style={{ color: 'var(--ink-30)' }}
          >
            <span>EOF · 根哈希每日预留锚定位，尚未接入公链</span>
            <span>did:web:guild.example.com · eddsa-rdfc-2022</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
