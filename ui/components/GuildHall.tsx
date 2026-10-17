import { useMemo } from 'react';
import {
  featured,
  hallStats,
  people,
  projects,
  threads,
  type CoverTone,
  type Project,
} from '../data/hallDemo';

const TONE_COLOR: Record<CoverTone, string> = {
  seal: 'var(--seal)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  ink: 'var(--ink-45)',
};

/**
 * A deterministic texture per project. Same seed, same picture — so a card
 * looks identical on every render without shipping image assets.
 */
function coverPattern(seed: string, cols = 54, rows = 6): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

  // A random walk gives a skyline instead of noise: it reads as a place.
  let level = rows * 0.55;
  const heights: number[] = [];
  for (let c = 0; c < cols; c += 1) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    level += ((h >>> 16) % 5) - 2;
    level = Math.max(0.8, Math.min(rows - 0.15, level));
    heights.push(level);
  }

  const ramp = ['█', '▓', '▒', '░'];
  const out: string[] = [];

  for (let r = 0; r < rows; r += 1) {
    let line = '';
    for (let c = 0; c < cols; c += 1) {
      const depth = rows - r;
      const height = heights[c] as number;
      if (depth > height) {
        line += ' ';
      } else {
        const shade = Math.min(3, Math.floor(height - depth));
        line += ramp[shade];
      }
    }
    out.push(line);
  }

  return out.join('\n');
}

function Cover({ seed, tone, height = 92 }: { seed: string; tone: CoverTone; height?: number }) {
  const art = useMemo(() => coverPattern(seed), [seed]);

  return (
    <div
      className="relative flex items-end overflow-hidden"
      style={{
        height,
        background: `linear-gradient(180deg, color-mix(in srgb, ${TONE_COLOR[tone]} 10%, transparent), transparent)`,
        borderBottom: '1px solid var(--line)',
      }}
      aria-hidden
    >
      <pre
        className="mono m-0 select-none whitespace-pre pl-3 pb-1 text-[8px] leading-[1]"
        style={{ color: TONE_COLOR[tone], opacity: 0.42 }}
      >
        {art}
      </pre>
    </div>
  );
}

function Verified() {
  return (
    <span
      className="align-middle text-[10px] leading-none"
      style={{ color: 'var(--green)' }}
      title="已签名 · 可解析的 did:web 身份"
    >
      ✓
    </span>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <article
      className="group flex flex-col border transition-colors"
      style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}
    >
      <Cover seed={project.id} tone={project.tone} height={72} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="mono text-[9px]" style={{ color: 'var(--ink-30)' }}>
            {project.id}
          </span>
          <span className="mono text-[9px]" style={{ color: 'var(--ink-45)' }}>
            {project.status}
          </span>
        </div>
        <h3 className="serif mt-2 text-[16px] leading-snug">{project.title}</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--ink-45)' }}>
          {project.pitch}
        </p>
        <div className="mt-auto flex items-end justify-between pt-4">
          <div className="mono flex flex-wrap gap-x-2 text-[9px]" style={{ color: 'var(--ink-30)' }}>
            {project.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
          <span className="serif text-[14px]">{project.reward}</span>
        </div>
      </div>
    </article>
  );
}

export function GuildHall() {
  const [topThread, ...rest] = threads;

  return (
    <div className="min-h-full">
      <header className="border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 py-4 md:px-10">
          <div className="flex items-baseline gap-3">
            <span
              className="serif grid h-7 w-7 place-items-center text-[13px]"
              style={{ background: 'var(--seal)', color: 'var(--seal-ink)', transform: 'rotate(-4deg)' }}
            >
              协
            </span>
            <span className="serif text-[17px]">冒险者协会</span>
            <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
              {hallStats.edition}
            </span>
          </div>

          <nav className="mono flex items-baseline gap-5 text-[10px]" style={{ color: 'var(--ink-45)' }}>
            <a href="#projects" className="hover:underline" style={{ textUnderlineOffset: 4 }}>
              委托
            </a>
            <a href="#threads" className="hover:underline" style={{ textUnderlineOffset: 4 }}>
              讨论
            </a>
            <a href="#people" className="hover:underline" style={{ textUnderlineOffset: 4 }}>
              同僚
            </a>
            <a
              href="#/registry"
              className="hover:underline"
              style={{ color: 'var(--ink-30)', textUnderlineOffset: 4 }}
              title="身份与透明日志"
            >
              名册
            </a>
            <span style={{ color: 'var(--ink-30)' }}>{hallStats.date}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 md:px-10">
        {/* feature */}
        <section
          className="grid grid-cols-1 gap-10 border-b py-10 md:py-14 lg:grid-cols-[1.55fr_1fr]"
          style={{ borderColor: 'var(--line)' }}
        >
          <article className="min-w-0">
            <div className="flex items-baseline gap-3">
              <span className="mono text-[10px]" style={{ color: 'var(--seal)' }}>
                招募中
              </span>
              <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
                {featured.deadline}
              </span>
              <span className="ascii-rule flex-1 text-[10px]">
                ────────────────────────────────────────────
              </span>
            </div>

            <h1 className="serif mt-5 text-[clamp(30px,4.2vw,52px)] leading-[1.06]">
              {featured.title}
            </h1>

            <p
              className="mt-5 max-w-[54ch] text-[14px] leading-[1.95]"
              style={{ color: 'var(--ink-70)' }}
            >
              {featured.pitch}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="serif text-[22px]">{featured.reward}</span>
              <div className="mono flex flex-wrap items-center gap-2 text-[10px]">
                {featured.team.map((member) => (
                  <span
                    key={member}
                    className="chip"
                    style={{ color: 'var(--ink-70)' }}
                    title="已签名成员"
                  >
                    {member} <Verified />
                  </span>
                ))}
              </div>
              <button
                className="mono ml-auto px-4 py-2 text-[11px] font-semibold"
                style={{ background: 'var(--ink)', color: 'var(--paper)' }}
              >
                接下这个委托 →
              </button>
            </div>
          </article>

          <aside className="min-w-0 border-t pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" style={{ borderColor: 'var(--line)' }}>
            <div className="eyebrow">本周议题</div>
            <a href="#threads" className="group mt-4 block">
              <h2 className="serif text-[22px] leading-snug group-hover:underline" style={{ textUnderlineOffset: 6 }}>
                {topThread.title}
              </h2>
              <p className="mt-3 text-[13px] leading-[1.85]" style={{ color: 'var(--ink-45)' }}>
                {topThread.excerpt}
              </p>
              <div className="mono mt-4 flex items-center gap-3 text-[10px]" style={{ color: 'var(--ink-30)' }}>
                <span>
                  {topThread.author} <Verified />
                </span>
                <span>·</span>
                <span>{topThread.replies} 条回复</span>
                <span>·</span>
                <span>{topThread.last}</span>
              </div>
            </a>
          </aside>
        </section>

        {/* projects */}
        <section id="projects" className="border-b py-10 md:py-12" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="serif text-[18px]">委托</h2>
            <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
              开放中 {hallStats.openProjects} · 进行中 {projects.length - hallStats.openProjects}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>

        {/* threads */}
        <section id="threads" className="border-b py-10 md:py-12" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="serif text-[18px]">讨论</h2>
            <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
              最新 {threads.length} 条
            </span>
          </div>

          <ul className="mt-4">
            {[topThread, ...rest].map((thread, index) => (
              <li
                key={thread.id}
                className="group flex items-start gap-5 py-4"
                style={{ borderTop: index === 0 ? 'none' : '1px solid var(--line-soft)' }}
              >
                <span className="mono w-8 shrink-0 pt-1 text-[10px]" style={{ color: 'var(--ink-30)' }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-[15px] font-semibold group-hover:underline" style={{ textUnderlineOffset: 4 }}>
                      {thread.title}
                    </h3>
                    <span className="mono text-[9px]" style={{ color: 'var(--ink-30)' }}>
                      #{thread.tag}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-45)' }}>
                    {thread.excerpt}
                  </p>
                </div>
                <div className="mono shrink-0 text-right text-[10px]" style={{ color: 'var(--ink-30)' }}>
                  <div>
                    {thread.author} <Verified />
                  </div>
                  <div className="mt-1">{thread.replies} 回复 · {thread.last}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* people */}
        <section id="people" className="py-10 md:py-12">
          <div className="flex items-baseline justify-between">
            <h2 className="serif text-[18px]">同僚</h2>
            <a
              href="#/registry"
              className="mono text-[10px] hover:underline"
              style={{ color: 'var(--ink-30)', textUnderlineOffset: 4 }}
            >
              查看完整名册 →
            </a>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-5">
            {people.map((person) => (
              <div key={person.id} className="flex items-center gap-3">
                <span
                  className="serif grid h-9 w-9 place-items-center text-[14px]"
                  style={{
                    background: person.kind === 'M' ? 'var(--chip)' : 'transparent',
                    border: person.kind === 'M' ? 'none' : '1px dashed var(--line)',
                    color: 'var(--ink-70)',
                  }}
                >
                  {person.name.slice(0, 1)}
                </span>
                <div>
                  <div className="text-[13px] font-medium">
                    {person.name} <Verified />
                  </div>
                  <div className="mono text-[9px]" style={{ color: 'var(--ink-30)' }}>
                    {person.role}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="mono mt-8 text-[10px]" style={{ color: 'var(--ink-30)' }}>
            名字后面的 ✓ 是一个可解析的 did:web 身份；改了会被日志发现。
          </p>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div
          className="mono mx-auto flex max-w-[1180px] flex-col gap-1 px-6 py-6 text-[10px] md:flex-row md:items-center md:justify-between md:px-10"
          style={{ color: 'var(--ink-30)' }}
        >
          <span>冒险者协会 · 人类与 Agent 共同登记的名册</span>
          <span>示例数据 · 未连接运行时</span>
        </div>
      </footer>
    </div>
  );
}
