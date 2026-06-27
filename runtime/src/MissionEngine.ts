import WebSocket = require('ws');
import { randomUUID } from 'crypto';
import { AgentMission, AgentMissionPayload, GuildPublicSnapshotRecord, MissionTriggerEvent } from './types';

export class MissionEngine {
  private readonly missions = new Map<string, AgentMission>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly agentConnections = new Map<string, Set<WebSocket>>();
  private snapshotProvider?: () => GuildPublicSnapshotRecord;

  setSnapshotProvider(provider: () => GuildPublicSnapshotRecord): void {
    this.snapshotProvider = provider;
  }

  registerMission(agentId: string, payload: AgentMissionPayload): AgentMission {
    const now = Date.now();
    const mission: AgentMission = {
      id: `mission-${randomUUID().slice(0, 8)}`,
      agentId,
      title: payload.title,
      description: payload.description,
      checkIntervalMinutes: payload.checkIntervalMinutes,
      triggerCondition: payload.triggerCondition,
      actionType: payload.actionType,
      actionTemplate: payload.actionTemplate,
      active: payload.active ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.missions.set(mission.id, mission);
    if (mission.active) {
      this.startTimer(mission);
    }

    return mission;
  }

  updateMission(agentId: string, missionId: string, updates: Partial<AgentMissionPayload>): AgentMission | undefined {
    const mission = this.missions.get(missionId);
    if (!mission || mission.agentId !== agentId) {
      return undefined;
    }

    const previousInterval = mission.checkIntervalMinutes;
    const wasActive = mission.active;

    if (updates.title !== undefined) mission.title = updates.title;
    if (updates.description !== undefined) mission.description = updates.description;
    if (updates.checkIntervalMinutes !== undefined) mission.checkIntervalMinutes = updates.checkIntervalMinutes;
    if (updates.triggerCondition !== undefined) mission.triggerCondition = updates.triggerCondition;
    if (updates.actionType !== undefined) mission.actionType = updates.actionType;
    if (updates.actionTemplate !== undefined) mission.actionTemplate = updates.actionTemplate;
    if (updates.active !== undefined) mission.active = updates.active;
    mission.updatedAt = Date.now();

    if (!wasActive && mission.active) {
      this.startTimer(mission);
    } else if (wasActive && !mission.active) {
      this.stopTimer(mission.id);
    } else if (mission.active && mission.checkIntervalMinutes !== previousInterval) {
      this.stopTimer(mission.id);
      this.startTimer(mission);
    }

    return mission;
  }

  deleteMission(agentId: string, missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.agentId !== agentId) {
      return false;
    }

    this.stopTimer(missionId);
    return this.missions.delete(missionId);
  }

  getMission(missionId: string): AgentMission | undefined {
    return this.missions.get(missionId);
  }

  getMissionsByAgent(agentId: string): AgentMission[] {
    return Array.from(this.missions.values()).filter((mission) => mission.agentId === agentId);
  }

  getAllActiveMissions(): AgentMission[] {
    return Array.from(this.missions.values()).filter((mission) => mission.active);
  }

  triggerNow(agentId: string, missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.agentId !== agentId || !mission.active) {
      return false;
    }

    return this.pushTriggerToAgent(mission);
  }

  registerAgentConnection(agentId: string, ws: WebSocket): void {
    const connections = this.agentConnections.get(agentId) || new Set<WebSocket>();
    connections.add(ws);
    this.agentConnections.set(agentId, connections);
  }

  unregisterAgentConnection(agentId: string, ws: WebSocket): void {
    const connections = this.agentConnections.get(agentId);
    if (!connections) {
      return;
    }

    connections.delete(ws);
    if (connections.size === 0) {
      this.agentConnections.delete(agentId);
    }
  }

  shutdown(): void {
    for (const missionId of this.timers.keys()) {
      this.stopTimer(missionId);
    }
  }

  private startTimer(mission: AgentMission): void {
    if (this.timers.has(mission.id)) {
      return;
    }

    const safeIntervalMs = Math.max(mission.checkIntervalMinutes * 60 * 1000, 60_000);
    const timer = setInterval(() => {
      this.fireMission(mission.id);
    }, safeIntervalMs);
    this.timers.set(mission.id, timer);
  }

  private stopTimer(missionId: string): void {
    const timer = this.timers.get(missionId);
    if (!timer) {
      return;
    }

    clearInterval(timer);
    this.timers.delete(missionId);
  }

  private fireMission(missionId: string): void {
    const mission = this.missions.get(missionId);
    if (!mission || !mission.active) {
      return;
    }

    this.pushTriggerToAgent(mission);
  }

  private pushTriggerToAgent(mission: AgentMission): boolean {
    if (!this.snapshotProvider) {
      return false;
    }

    const connections = this.agentConnections.get(mission.agentId);
    if (!connections || connections.size === 0) {
      return false;
    }

    const triggeredAt = Date.now();
    const event: MissionTriggerEvent = {
      type: 'mission_trigger',
      missionId: mission.id,
      missionTitle: mission.title,
      triggerCondition: mission.triggerCondition,
      actionType: mission.actionType,
      actionTemplate: mission.actionTemplate,
      snapshot: this.snapshotProvider(),
      triggeredAt,
    };

    const payload = JSON.stringify(event);
    let delivered = false;
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        delivered = true;
      }
    }

    if (delivered) {
      mission.lastTriggeredAt = triggeredAt;
      mission.updatedAt = triggeredAt;
    }

    return delivered;
  }
}
