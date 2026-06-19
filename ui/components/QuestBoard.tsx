// Adventurer's Guild - Quest Board Component (2026 Design)
// 任务大厅 UI - Glassmorphism 2.0 + Bento Grid

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quest, ReputationLevel } from '../../types';
import { BentoLayout } from './BentoLayout';

// ============= Types =============

interface QuestBoardProps {
  quests: Quest[];
  userReputation: {
    level: ReputationLevel;
    score: number;
    badges: string[];
  };
  onQuestClick: (quest: Quest) => void;
}

// ============= Main Component =============

export const QuestBoard: React.FC<QuestBoardProps> = ({
  quests,
  userReputation,
  onQuestClick,
}) => {
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);

  return (
    <div className="relative">
      {/* User Badge - 固定在右上角 */}
      <UserBadge reputation={userReputation} />

      {/* Bento Grid Layout */}
      <BentoLayout 
        quests={quests} 
        onQuestClick={(quest) => {
          setSelectedQuest(quest);
          onQuestClick(quest);
        }} 
      />

      {/* Quest Detail Modal */}
      <AnimatePresence>
        {selectedQuest && (
          <QuestDetailModal
            quest={selectedQuest}
            onClose={() => setSelectedQuest(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ============= User Badge Component (Glassmorphism 2.0) =============

const UserBadge: React.FC<{ reputation: QuestBoardProps['userReputation'] }> = ({
  reputation,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const levelColors = {
    [ReputationLevel.LEGENDARY]: 'from-yellow-400 to-amber-500',
    [ReputationLevel.ELITE]: 'from-purple-400 to-pink-400',
    [ReputationLevel.REGULAR]: 'from-cyan-400 to-blue-400',
    [ReputationLevel.APPRENTICE]: 'from-slate-400 to-slate-500',
  };

  const levelNames = {
    [ReputationLevel.LEGENDARY]: '传奇',
    [ReputationLevel.ELITE]: '精英',
    [ReputationLevel.REGULAR]: '正式',
    [ReputationLevel.APPRENTICE]: '见习',
  };

  const levelIcons = {
    [ReputationLevel.LEGENDARY]: '👑',
    [ReputationLevel.ELITE]: '⭐',
    [ReputationLevel.REGULAR]: '🛡️',
    [ReputationLevel.APPRENTICE]: '🔰',
  };

  const progress = (reputation.score % 100) / 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ 
        opacity: 1, 
        x: 0,
        width: isHovered ? 240 : 64,
      }}
      transition={{ duration: 0.3 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="fixed top-8 right-8 bg-white/[0.05] backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-white/10 z-50 overflow-hidden cursor-pointer"
    >
      {/* 内部光晕 */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent rounded-2xl pointer-events-none" />
      
      <div className="relative">
        {/* 缩小状态：只显示图标 */}
        {!isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`text-4xl bg-gradient-to-br ${levelColors[reputation.level]} rounded-xl w-10 h-10 flex items-center justify-center shadow-lg`}
          >
            {levelIcons[reputation.level]}
          </motion.div>
        )}

        {/* 展开状态：显示完整信息 */}
        {isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-4 mb-4">
              <motion.div 
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className={`text-4xl bg-gradient-to-br ${levelColors[reputation.level]} rounded-full w-14 h-14 flex items-center justify-center shadow-lg`}
              >
                {levelIcons[reputation.level]}
              </motion.div>
              <div>
                <div className="text-slate-400 text-xs uppercase tracking-wider">等级</div>
                <div className={`text-lg font-bold bg-gradient-to-r ${levelColors[reputation.level]} bg-clip-text text-transparent`}>
                  {levelNames[reputation.level]}
                </div>
                <div className="text-slate-500 text-xs font-mono">{reputation.score} 经验</div>
              </div>
            </div>

            {/* Progress Bar - Glassmorphism */}
            <div className="relative bg-white/5 rounded-full h-2 overflow-hidden border border-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className={`h-full bg-gradient-to-r ${levelColors[reputation.level]} relative`}
              >
                {/* 流光效果 */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            </div>

            {/* Badges */}
            {reputation.badges.length > 0 && (
              <div className="mt-3 flex gap-1.5 flex-wrap">
                {reputation.badges.map((badge, i) => (
                  <motion.span
                    key={badge}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="text-xs bg-white/5 text-purple-300 px-2.5 py-1 rounded-full border border-white/10 font-medium"
                  >
                    {badge}
                  </motion.span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

// ============= Quest Detail Modal (Glassmorphism 2.0) =============

const QuestDetailModal: React.FC<{
  quest: Quest;
  onClose: () => void;
}> = ({ quest, onClose }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-8"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white/[0.05] backdrop-blur-xl rounded-3xl p-8 max-w-3xl w-full border border-white/10 shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        {/* Close Button */}
        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl border border-white/10"
        >
          ✕
        </motion.button>

        {/* Title */}
        <h2 className="text-4xl font-bold text-white mb-4 pr-12 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          {quest.title}
        </h2>

        {/* Meta Info */}
        <div className="flex flex-wrap gap-3 mb-6">
          <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-sm border border-purple-500/30">
            {quest.difficulty || 'E'} 级任务
          </span>
          <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-sm border border-cyan-500/30">
            {quest.executor_type}
          </span>
          {quest.deadline && (
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-sm border border-amber-500/30">
              ⏰ {new Date(quest.deadline).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Description */}
        <div className="mb-6">
          <h3 className="text-lg font-bold text-white mb-2">任务描述</h3>
          <p className="text-slate-300 leading-relaxed">{quest.description}</p>
        </div>

        {/* Skills */}
        <div className="mb-6">
          <h3 className="text-lg font-bold text-white mb-3">所需技能</h3>
          <div className="flex flex-wrap gap-2">
            {quest.required_skills.map((skill) => (
              <span
                key={skill}
                className="px-3 py-1.5 rounded-full bg-white/5 text-slate-300 text-sm border border-white/10"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Legal Check (if exists) */}
        {quest.legalCheckResult && (
          <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🛡️</span>
              <h3 className="text-lg font-bold text-white">合规审查</h3>
            </div>
            <div className="text-slate-300 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className={quest.legalCheckResult.is_approved ? 'text-green-400' : 'text-red-400'}>
                  {quest.legalCheckResult.is_approved ? '✓ 已通过' : '✗ 未通过'}
                </span>
                <span className="text-slate-500">|</span>
                <span>风险: {quest.legalCheckResult.risk_level}</span>
              </div>
              <p className="text-slate-400">{quest.legalCheckResult.reasoning}</p>
            </div>
          </div>
        )}

        {/* Reward */}
        <div className="flex items-center justify-between p-6 rounded-2xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20">
          <div className="flex items-center gap-3">
            <span className="text-5xl">💎</span>
            <div>
              <div className="text-slate-400 text-sm">任务赏金</div>
              <div className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-yellow-400 bg-clip-text text-transparent">
                {quest.reward}
              </div>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold shadow-lg hover:shadow-purple-500/50 transition-shadow"
          >
            接受任务
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default QuestBoard;
