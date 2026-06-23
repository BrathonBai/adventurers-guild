// Adventurer's Guild - Glass Card Component (2026 Design)
// 玻璃拟态 2.0 + 极致微交互

import React, { useState, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Quest, ExecutorType } from '../../types';

interface GlassCardProps {
  quest: Quest;
  onClick: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({ quest, onClick }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);
  
  // 鼠标位置追踪
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // 平滑动画
  const smoothMouseX = useSpring(mouseX, { stiffness: 300, damping: 30 });
  const smoothMouseY = useSpring(mouseY, { stiffness: 300, damping: 30 });
  
  // 光晕位置
  const glowX = useTransform(smoothMouseX, (x) => `${x}px`);
  const glowY = useTransform(smoothMouseY, (y) => `${y}px`);

  // 鼠标移动处理
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    mouseX.set(x);
    mouseY.set(y);
  };

  // 点赞粒子爆炸
  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLiked(!isLiked);
    
    if (!isLiked) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const newParticles = Array.from({ length: 12 }, (_, i) => ({
        id: Date.now() + i,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }));
      setParticles(newParticles);
      setTimeout(() => setParticles([]), 1000);
    }
  };

  // 难度颜色
  const difficultyColors: Record<string, string> = {
    'S': 'from-red-500 to-orange-500',
    'A': 'from-purple-500 to-pink-500',
    'B': 'from-blue-500 to-cyan-500',
    'C': 'from-green-500 to-emerald-500',
    'D': 'from-slate-500 to-slate-600',
    'E': 'from-slate-600 to-slate-700',
  };

  // 执行者类型图标
  const executorIcons: Record<ExecutorType, string> = {
    [ExecutorType.HUMAN]: '👤',
    [ExecutorType.AGENT]: '🤖',
    [ExecutorType.HYBRID]: '👥',
  };

  return (
    <>
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onClick={onClick}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        className="relative h-32 cursor-pointer group overflow-hidden rounded-2xl"
      >
        {/* 玻璃拟态背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl" />
        
        {/* 流光边框 */}
        <motion.div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(600px circle at ${glowX} ${glowY}, rgba(168, 85, 247, 0.4), transparent 40%)`,
          }}
        />
        <div className="absolute inset-0 rounded-2xl border border-white/10 group-hover:border-purple-400/30 transition-colors duration-300" />

        {/* 内部光晕（跟随鼠标） */}
        <motion.div
          className="absolute w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 blur-2xl pointer-events-none"
          style={{
            left: glowX,
            top: glowY,
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.3), transparent 70%)',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* 内容区域 - 横向布局 */}
        <div className="relative h-full p-6 flex items-center gap-6">
          {/* 左侧：难度徽章 */}
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            className={`flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-r ${difficultyColors[quest.difficulty || 'E']} text-white text-2xl font-bold shadow-lg flex items-center justify-center`}
          >
            {quest.difficulty || 'E'}
          </motion.div>

          {/* 中间：标题 + 描述 + 技能 */}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-white mb-1 truncate group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-pink-400 transition-all duration-300">
              {quest.title}
            </h3>
            <p className="text-slate-400 text-sm line-clamp-1 mb-2">
              {quest.description}
            </p>
            
            {/* 技能标签 - 横向滚动 */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {quest.required_skills.slice(0, 4).map((skill) => (
                <span
                  key={skill}
                  className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10 whitespace-nowrap"
                >
                  {skill}
                </span>
              ))}
              {quest.required_skills.length > 4 && (
                <span className="text-xs px-2 py-0.5 text-slate-500 whitespace-nowrap">
                  +{quest.required_skills.length - 4}
                </span>
              )}
            </div>
          </div>

          {/* 右侧：赏金 + 操作 */}
          <div className="flex-shrink-0 flex items-center gap-4">
            {/* 赏金 */}
            <div className="text-right">
              <div className="text-xs text-slate-500 mb-1">赏金</div>
              <div className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-yellow-400 bg-clip-text text-transparent">
                {quest.reward}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-col gap-2">
              <span className="text-xl">{executorIcons[quest.executor_type]}</span>
              <motion.button
                onClick={handleLike}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                className="text-xl"
              >
                {isLiked ? '❤️' : '🤍'}
              </motion.button>
            </div>
          </div>
        </div>

        {/* 悬停扫描线动画 */}
        <motion.div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-0 group-hover:opacity-100"
          animate={{
            top: ['0%', '100%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      </motion.div>

      {/* 粒子爆炸效果 */}
      {particles.map((particle, i) => (
        <motion.div
          key={particle.id}
          initial={{ 
            x: particle.x, 
            y: particle.y, 
            scale: 1, 
            opacity: 1 
          }}
          animate={{
            x: particle.x + (Math.cos(i * 30) * 100),
            y: particle.y + (Math.sin(i * 30) * 100),
            scale: 0,
            opacity: 0,
          }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="fixed w-2 h-2 bg-pink-500 rounded-full pointer-events-none z-50"
        />
      ))}
    </>
  );
};
