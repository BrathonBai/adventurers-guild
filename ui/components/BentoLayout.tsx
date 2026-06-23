// Adventurer's Guild - Bento Grid Layout (2026 Design)
// 动态便当网格布局 - 响应式 + 智能尺寸分配

import React from 'react';
import { motion } from 'framer-motion';
import { Quest } from '../../types';
import { GlassCard } from './GlassCard';

interface BentoLayoutProps {
  quests: Quest[];
  onQuestClick: (quest: Quest) => void;
}

export const BentoLayout: React.FC<BentoLayoutProps> = ({ quests, onQuestClick }) => {
  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
      {/* 背景噪点纹理 */}
      <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJub2lzZSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOSIgbnVtT2N0YXZlcz0iNCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNub2lzZSkiLz48L3N2Zz4=')] pointer-events-none" />
      
      {/* 渐变背景光晕 */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto mb-12"
        >
          <h1 className="text-6xl font-bold mb-3 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
            冒险者协会
          </h1>
          <p className="text-slate-400 text-lg font-light tracking-wide">
            人与 Agent 合作共存
          </p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="max-w-7xl mx-auto space-y-4"
        >
          {quests.map((quest, index) => (
            <motion.div
              key={quest.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ 
                delay: index * 0.05, 
                type: 'spring',
                stiffness: 260,
                damping: 20
              }}
            >
              <GlassCard quest={quest} onClick={() => onQuestClick(quest)} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};
