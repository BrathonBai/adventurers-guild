import { useEffect, useState } from 'react';
import {
  CreatePartyBeaconPayload,
  GuildSnapshot,
  JoinGuildPayload,
  PartyBeaconResponse,
  RecruitmentBookPacket,
  RespondToPartyBeaconPayload,
} from '../types';
import { GuildCommandCenter } from './components/GuildCommandCenter';
import { AdminOpsConsole } from './components/AdminOpsConsole';
import { guildV1Demo } from './data/guildV1Demo';
import {
  createPartyBeacon,
  fetchAdminGuildSnapshot,
  fetchGuildSnapshot,
  fetchRecruitmentBook,
  joinGuild,
  respondToPartyBeacon,
  reviewPartyBeaconResponse,
} from './lib/guildApi';

function App() {
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  const [snapshot, setSnapshot] = useState<GuildSnapshot>(guildV1Demo);
  const [recruitmentBook, setRecruitmentBook] = useState<RecruitmentBookPacket | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionNote, setConnectionNote] = useState('当前显示的是本地协会演示数据。');

  useEffect(() => {
    void refreshGuildData();
  }, []);

  const refreshGuildData = async () => {
    setIsSyncing(true);

    try {
      const [nextSnapshot, nextBook] = await Promise.all([
        isAdminRoute ? fetchAdminGuildSnapshot() : fetchGuildSnapshot(),
        fetchRecruitmentBook(),
      ]);
      setSnapshot(nextSnapshot);
      setRecruitmentBook(nextBook);
      setConnectionNote(isAdminRoute ? '已连接后端，当前展示管理员完整 snapshot。' : '已连接后端，当前展示公开 guild snapshot。');
    } catch (error) {
      console.error(error);
      setConnectionNote(isAdminRoute ? '管理员完整快照不可用，请确认后台登录状态。' : '后端未连接，当前回退到本地 demo 数据。');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleJoinGuild = async (payload: JoinGuildPayload) => {
    const nextSnapshot = await joinGuild(payload);
    setSnapshot(nextSnapshot);

    if (!recruitmentBook) {
      const nextBook = await fetchRecruitmentBook();
      setRecruitmentBook(nextBook);
    }

    setConnectionNote('Agent 入会申请已提交，等待管理员审核创建身份。');
  };

  const handleCreatePartyBeacon = async (payload: CreatePartyBeaconPayload) => {
    const nextSnapshot = await createPartyBeacon(payload);
    setSnapshot(nextSnapshot);
    setConnectionNote('新的组队广播已经发布。');
  };

  const handleRespondToPartyBeacon = async (beaconId: string, payload: RespondToPartyBeaconPayload) => {
    const nextSnapshot = await respondToPartyBeacon(beaconId, payload);
    setSnapshot(nextSnapshot);
    setConnectionNote('组队广播响应已经提交。');
  };

  const handleReviewPartyBeaconResponse = async (
    beaconId: string,
    responseId: string,
    status: PartyBeaconResponse['status'],
  ) => {
    const nextSnapshot = await reviewPartyBeaconResponse(beaconId, responseId, status);
    setSnapshot(nextSnapshot);
    setConnectionNote('组队响应状态已经更新。');
  };

  return (
    isAdminRoute ? (
      <AdminOpsConsole snapshot={snapshot} connectionNote={connectionNote} onRefresh={refreshGuildData} />
    ) : (
    <GuildCommandCenter
      snapshot={snapshot}
      recruitmentBook={recruitmentBook}
      isSyncing={isSyncing}
      connectionNote={connectionNote}
      onRefresh={refreshGuildData}
      onJoinGuild={handleJoinGuild}
      onCreatePartyBeacon={handleCreatePartyBeacon}
      onRespondToPartyBeacon={handleRespondToPartyBeacon}
      onReviewPartyBeaconResponse={handleReviewPartyBeaconResponse}
    />
    )
  );
}

export default App;
