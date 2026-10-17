import { useEffect, useMemo, useRef, useState } from 'react';
import {
  hallStats,
  interests,
  people,
  projects,
  threads,
  type CoverTone,
  type Project,
  type Thread,
} from '../data/hallDemo';

const TONE_COLOR: Record<CoverTone, string> = {
  seal: 'var(--seal)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  ink: 'var(--ink-45)',
};

const FEATURED_INTERVAL = 6500;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A rail that advances on its own, yields to the wheel, and resumes after a
 * pause. Content is rendered twice so the loop point is invisible: past half
 * the scroll width we subtract half instead of jumping to zero.
 */
function useAutoScroll(axis: 'x' | 'y', speed = 0.55) {
  const ref = useRef<HTMLDivElement | null>(null);
  const hovered = useRef(false);
  const resumeAt = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (prefersReducedMotion()) return undefined;

    const half = () => (axis === 'x' ? el.scrollWidth / 2 : el.scrollHeight / 2);
    const position = () => (axis === 'x' ? el.scrollLeft : el.scrollTop);

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(48, now - last);
      last = now;

      if (!hovered.current && now > resumeAt.current) {
        const next = position() + (speed * delta) / 16;
        if (next >= half()) {
          if (axis === 'x') el.scrollLeft = next - half();
          else el.scrollTop = next - half();
        } else if (axis === 'x') {
          el.scrollLeft = next;
        } else {
          el.scrollTop = next;
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    const onEnter = () => {
      hovered.current = true;
    };
    const onLeave = () => {
      hovered.current = false;
      resumeAt.current = performance.now() + 700;
    };
    // Vertical wheel on a horizontal rail: translate it so the wheel works
    // without shift, and hold the auto-advance while the reader is steering.
    const onWheel = (event: WheelEvent) => {
      resumeAt.current = performance.now() + 1600;
      if (axis !== 'x') return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      el.scrollLeft += event.deltaY;
      event.preventDefault();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [axis, speed]);

  return ref;
}

/**
 * A deterministic skyline per project. Same seed, same picture — so a card
 * looks identical on every render without shipping image assets.
 */
function coverPattern(seed: string, cols = 54, rows = 6): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

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
        line += ramp[Math.min(3, Math.floor(height - depth))];
      }
    }
    out.push(line);
  }

  return out.join('\n');
}

function Cover({ seed, tone, height = 72 }: { seed: string; tone: CoverTone; height?: number }) {
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

/**
 * Deliberately simple: tag overlap with what this visitor follows, then
 * whether the commission is still open, then the reward. Small enough to
 * read in a code review, meaningful enough that the order changes.
 */
function scoreProject(project: Project): number {
  const overlap = project.tags.filter((tag) => interests.includes(tag)).length;
  const open = project.status === '招募中' ? 6 : 0;
  const reward = Number(project.reward.replace(/[^\d]/g, '')) / 1000;
  return overlap * 10 + open + reward;
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <article
      className="flex w-[300px] shrink-0 flex-col border"
      style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}
    >
      <Cover seed={project.id} tone={project.tone} />
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
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed" style={{ color: 'var(--ink-45)' }}>
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

function ThreadRow({ thread, index }: { thread: Thread; index: number }) {
  return (
    <li
      className="group flex h-[76px] items-start gap-5 py-4"
      style={{ borderTop: index === 0 ? 'none' : '1px solid var(--line-soft)' }}
    >
      <span className="mono w-8 shrink-0 pt-1 text-[10px]" style={{ color: 'var(--ink-30)' }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3
            className="truncate text-[15px] font-semibold group-hover:underline"
            style={{ textUnderlineOffset: 4 }}
          >
            {thread.title}
          </h3>
          <span className="mono text-[9px]" style={{ color: 'var(--ink-30)' }}>
            #{thread.tag}
          </span>
        </div>
        <p className="mt-1 truncate text-[12.5px]" style={{ color: 'var(--ink-45)' }}>
          {thread.excerpt}
        </p>
      </div>
      <div className="mono shrink-0 text-right text-[10px]" style={{ color: 'var(--ink-30)' }}>
        <div>
          {thread.author} <Verified />
        </div>
        <div className="mt-1">
          {thread.replies} 回复 · {thread.last}
        </div>
      </div>
    </li>
  );
}

export function GuildHall() {
  const ranked = useMemo(
    () =>
      projects
        .map((project) => ({ project, score: scoreProject(project) }))
        .sort((a, b) => b.score - a.score),
    [],
  );

  const featuredPool = ranked.slice(0, 3);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const timer = window.setInterval(
      () => setCursor((value) => (value + 1) % featuredPool.length),
      FEATURED_INTERVAL,
    );
    return () => window.clearInterval(timer);
  }, [featuredPool.length]);

  const projectRail = useAutoScroll('x', 0.5);
  const threadRail = useAutoScroll('y', 0.42);

  const active = featuredPool[cursor] ?? featuredPool[0];
  const featured = active.project;
  const matched = featured.tags.filter((tag) => interests.includes(tag));

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

      <div
        className="relative overflow-hidden border-b"
        style={{ borderColor: 'var(--line)', height: 54 }}
        aria-hidden
      >
        <pre
          className="mono m-0 select-none whitespace-pre px-6 text-[7px] leading-[1.05] md:px-10"
          style={{ color: 'var(--ink-45)', opacity: 0.28 }}
        >
          {coverPattern('guild-horizon', 240, 5)}
        </pre>
      </div>

      <main className="mx-auto max-w-[1180px] px-6 md:px-10">
        <section
          className="grid grid-cols-1 gap-10 border-b py-10 md:py-14 lg:grid-cols-[1.7fr_1fr]"
          style={{ borderColor: 'var(--line)' }}
        >
          <article key={featured.id} className="fade-up min-w-0">
            <div className="flex items-baseline gap-3">
              <span className="mono text-[10px]" style={{ color: 'var(--seal)' }}>
                为你推荐
              </span>
              <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
                {matched.length > 0 ? `匹配 ${matched.join(' / ')}` : '按赏金与开放状态排序'}
              </span>
              <span className="ascii-rule flex-1 text-[10px]">
                ────────────────────────────────────────────
              </span>
              <span className="mono text-[10px]" style={{ color: 'var(--ink-30)' }}>
                {featured.deadline}
              </span>
            </div>

            <h1 className="serif mt-5 text-[clamp(30px,4vw,46px)] leading-[1.08]">{featured.title}</h1>

            <p className="mt-5 max-w-[54ch] text-[14px] leading-[1.95]" style={{ color: 'var(--ink-70)' }}>
              {featured.pitch}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="serif text-[22px]">{featured.reward}</span>
              <div className="mono flex flex-wrap items-center gap-2 text-[10px]">
                {featured.team.map((member) => (
                  <span key={member} className="chip" style={{ color: 'var(--ink-70)' }} title="已签名成员">
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

            <div className="mt-6 flex items-center gap-3">
              <div className="flex gap-1.5">
                {featuredPool.map((item, index) => (
                  <button
                    key={item.project.id}
                    onClick={() => setCursor(index)}
                    aria-label={`查看推荐 ${index + 1}`}
                    className="h-[3px] w-6 transition-colors"
                    style={{ background: index === cursor ? 'var(--seal)' : 'var(--line)' }}
                  />
                ))}
              </div>
              <span className="mono text-[9px]" style={{ color: 'var(--ink-30)' }}>
                {cursor + 1}/{featuredPool.length} · 每 6 秒换一个
              </span>
            </div>
          </article>

          <aside
            className="min-w-0 border-t pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
            style={{ borderColor: 'var(--line)' }}
          >
            <div className="eyebrow">本周议题</div>
            <a href="#threads" className="group mt-4 block">
              <h2 className="serif text-[22px] leading-snug group-hover:underline" style={{ textUnderlineOffset: 6 }}>
                {threads[0]?.title}
              </h2>
              <p className="mt-3 text-[13px] leading-[1.85]" style={{ color: 'var(--ink-45)' }}>
                {threads[0]?.excerpt}
              </p>
              <div className="mono mt-4 flex items-center gap-3 text-[10px]" style={{ color: 'var(--ink-30)' }}>
                <span>
                  {threads[0]?.author} <Verified />
                </span>
                <span>·</span>
                <span>{threads[0]?.replies} 条回复</span>
                <span>·</span>
                <span>{threads[0]?.last}</span>
              </div>
            </a>

            <dl className="mt-8 grid grid-cols-3 gap-4 border-t pt-5" style={{ borderColor: 'var(--line)' }}>
              {[
                ['开放中', String(hallStats.openProjects)],
                ['本周新委托', '2'],
                ['待验收', '2'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dd className="serif text-[22px] leading-none">{value}</dd>
                  <dt className="mono mt-1.5 text-[9px]" style={{ color: 'var(--ink-30)' }}>
                    {label}
                  </dt>
                </div>
              ))}
            </dl>
          </aside>
        </section>

        <section id="projects" className="border-b py-10 md:py-12" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="serif text-[18px]">委托</h2>
            <div className="mono flex items-center gap-3 text-[10px]" style={{ color: 'var(--ink-30)' }}>
              <span>共 {projects.length} 个 · 滚轮横向浏览</span>
              <span style={{ color: 'var(--seal)' }}>
                <span className="blink">●</span> LIVE
              </span>
            </div>
          </div>

          <div className="relative mt-5">
            <div ref={projectRail} className="no-scrollbar overflow-x-auto overscroll-x-contain">
              <div className="flex w-max gap-5">
                {[0, 1].map((copy) => (
                  <div key={copy} className="flex gap-5" aria-hidden={copy === 1}>
                    {ranked.map(({ project }) => (
                      <ProjectCard key={`${copy}-${project.id}`} project={project} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-14"
              style={{ background: 'linear-gradient(90deg, var(--paper), transparent)' }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-14"
              style={{ background: 'linear-gradient(270deg, var(--paper), transparent)' }}
            />
          </div>
        </section>

        <section id="threads" className="border-b py-10 md:py-12" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="serif text-[18px]">讨论</h2>
            <div className="mono flex items-center gap-3 text-[10px]" style={{ color: 'var(--ink-30)' }}>
              <span>最新 {threads.length} 条 · 滚轮浏览</span>
              <span style={{ color: 'var(--green)' }}>
                <span className="blink">●</span> 实时
              </span>
            </div>
          </div>

          <div className="relative mt-4">
            <div
              ref={threadRail}
              className="no-scrollbar overflow-y-auto overscroll-y-contain"
              style={{ height: 76 * 4 }}
            >
              {[0, 1].map((copy) => (
                <ul key={copy} aria-hidden={copy === 1}>
                  {threads.map((thread, index) => (
                    <ThreadRow key={`${copy}-${thread.id}`} thread={thread} index={index} />
                  ))}
                </ul>
              ))}
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
              style={{ background: 'linear-gradient(180deg, transparent, var(--paper))' }}
            />
          </div>
        </section>

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
