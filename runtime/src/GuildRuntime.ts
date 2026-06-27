import WebSocket = require('ws');
import { v4 as uuidv4 } from 'uuid';
import {
  AgentConnection,
  AgentMissionPayload,
  CreatePartyBeaconPayload,
  GuildA2AMessage,
  GuildJoinResult,
  GuildQuest,
  GuildTask,
  IncomingMessage,
  JoinGuildPayload,
  Party,
  PartyMember,
  PartyBeaconResponse,
  RequiredMember,
  RespondToPartyBeaconPayload,
} from './types';
import { Application, GuildState, ORCHESTRATOR_AGENT_SKILL, QuestAcceptanceError } from './GuildState';
import { MissionEngine } from './MissionEngine';
import {
  normalizeRequiredMembers,
  readMessageData,
  readNumber,
  readOptionalString,
  readString,
  readStringArray,
} from './messageUtils';
import { buildRecruitmentBookPacket } from './recruitmentBook';
import { buildGuildNodeProtocolPacket } from './nodeProtocol';
import { principalFromApiKey, verifyDidSignature } from './auth';
import { AuthPrincipal } from './auth';

type MessageHandler = (ws: WebSocket, message: IncomingMessage) => void;

type RelayPayload = {
  toAgentId?: string;
  type?: string;
  context?: GuildA2AMessage['context'];
  payload?: unknown;
};

/**
 * Adventurers Guild runtime:
 * - member registry
 * - quest publishing and team formation
 * - party coordination
 * - task progress tracking
 *
 * The current implementation keeps everything in memory so we can stabilize the
 * product model before introducing persistence.
 */
export class GuildRuntime {
  private readonly wss: WebSocket.Server;
  private readonly state: GuildState;
  private readonly messageHandlers: Record<string, MessageHandler>;
  private readonly wsBuckets = new Map<WebSocket, { count: number; resetAt: number }>();
  public readonly missionEngine = new MissionEngine();
  private readonly port: number;
  private readonly bindHost: string;
  private readonly publicHost: string;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(port: number = 3000, bindHost: string = '0.0.0.0', publicHost: string = 'localhost') {
    this.port = port;
    this.bindHost = bindHost;
    this.publicHost = publicHost;
    this.wss = new WebSocket.Server({ port, host: bindHost, maxPayload: 64 * 1024 });
    this.state = new GuildState();
    this.missionEngine.setSnapshotProvider(() => this.state.createPublicSnapshot());
    this.messageHandlers = this.createMessageHandlers();
    this.setupServer();
  }

  private setupServer(): void {
    console.log(`🏰 Adventurers Guild runtime started on port ${this.port}`);
    console.log(`📡 Bound on: ws://${this.bindHost}:${this.port}`);
    console.log(`📡 Local: ws://localhost:${this.port}`);
    console.log(`📡 Network: ws://${this.publicHost}:${this.port}`);

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('📡 New connection established');

      ws.on('message', (data: Buffer) => {
        if (!this.checkWsRateLimit(ws)) {
          this.sendError(ws, 'RATE_LIMITED', 'Too many WebSocket messages');
          ws.close(1008, 'rate limited');
          return;
        }
        this.handleMessage(ws, data.toString());
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    this.heartbeatTimer = setInterval(() => {
      this.heartbeat();
    }, 30000);
  }

  private createMessageHandlers(): Record<string, MessageHandler> {
    return {
      register: (ws, message) => this.handleRegister(ws, message),
      agent_message: (ws, message) => this.handleAgentMessage(ws, message),
      agent_broadcast: (ws, message) => this.handleAgentBroadcast(ws, message),
      publish_quest: (ws, message) => this.handlePublishQuest(ws, message),
      list_quests: (ws, message) => this.handleListQuests(ws, message),
      accept_quest: (ws, message) => this.handleAcceptQuest(ws, message),
      invite_to_quest: (ws, message) => this.handleInviteToQuest(ws, message),
      get_quest_team: (ws, message) => this.handleGetQuestTeam(ws, message),
      send_to_quest_team: (ws, message) => this.handleSendToQuestTeam(ws, message),
      post_quest: (ws, message) => this.handlePostQuest(ws, message),
      find_agents: (ws, message) => this.handleFindAgents(ws, message),
      create_party: (ws, message) => this.handleCreateParty(ws, message),
      recruit_members: (ws, message) => this.handleRecruitMembers(ws, message),
      review_application: (ws, message) => this.handleReviewApplication(ws, message),
      add_member: (ws, message) => this.handleAddMember(ws, message),
      remove_member: (ws, message) => this.handleRemoveMember(ws, message),
      get_party_status: (ws, message) => this.handleGetPartyStatus(ws, message),
      disband_party: (ws, message) => this.handleDisbandParty(ws, message),
      list_my_parties: (ws, message) => this.handleListMyParties(ws, message),
      assign_task: (ws, message) => this.handleAssignTask(ws, message),
      update_task_status: (ws, message) => this.handleUpdateTaskStatus(ws, message),
      get_task_progress: (ws, message) => this.handleGetTaskProgress(ws, message),
      integrate_results: (ws, message) => this.handleIntegrateResults(ws, message),
      team_message: (ws, message) => this.handleTeamMessage(ws, message),
      request_help: (ws, message) => this.handleRequestHelp(ws, message),
      get_guild_snapshot: (ws, message) => this.handleGetGuildSnapshot(ws, message),
      get_recruitment_book: (ws, message) => this.handleGetRecruitmentBook(ws, message),
      join_guild: (ws, message) => this.handleJoinGuild(ws, message),
      a2a_message: (ws, message) => this.handleA2AMessage(ws, message),
      register_missions: (ws, message) => this.handleRegisterMissions(ws, message),
      update_mission: (ws, message) => this.handleUpdateMission(ws, message),
      delete_mission: (ws, message) => this.handleDeleteMission(ws, message),
      list_my_missions: (ws, message) => this.handleListMyMissions(ws, message),
      trigger_mission_now: (ws, message) => this.handleTriggerMissionNow(ws, message),
      pong: (_ws, _message) => undefined,
    };
  }

  private handleMessage(ws: WebSocket, payload: string): void {
    try {
      const message = JSON.parse(payload) as IncomingMessage;
      const handler = this.messageHandlers[message.type];

      if (!handler) {
        console.warn('Unknown message type:', message.type);
        this.sendError(ws, 'UNKNOWN_MESSAGE', `Unknown message type: ${message.type}`);
        return;
      }

      if (!this.authorizeMessage(ws, message.type)) {
        return;
      }

      handler(ws, message);
    } catch (error) {
      console.error('Failed to handle message:', error);
      this.sendError(ws, 'INVALID_MESSAGE', 'Failed to parse message');
    }
  }

  private authorizeMessage(ws: WebSocket, type: string): boolean {
    const writeTypes = new Set([
      'agent_message',
      'agent_broadcast',
      'publish_quest',
      'accept_quest',
      'invite_to_quest',
      'send_to_quest_team',
      'post_quest',
      'create_party',
      'recruit_members',
      'review_application',
      'add_member',
      'remove_member',
      'disband_party',
      'assign_task',
      'update_task_status',
      'integrate_results',
      'team_message',
      'request_help',
      'a2a_message',
      'register_missions',
      'update_mission',
      'delete_mission',
      'trigger_mission_now',
    ]);
    const highRiskTypes = new Set([
      'publish_quest',
      'create_party',
      'review_application',
      'add_member',
      'remove_member',
      'disband_party',
      'assign_task',
      'integrate_results',
    ]);

    if (!writeTypes.has(type)) {
      return true;
    }

    const agent = this.requireAgent(ws);
    if (!agent) {
      return false;
    }

    if (highRiskTypes.has(type) && ['agent-guild-steward', 'agent-daily-broadcast'].includes(agent.id)) {
      this.sendError(ws, 'SUGGEST_ONLY', 'This service agent can suggest high-risk operations but cannot execute them');
      this.state.audit({ actorDid: agent.did, actorRole: agent.role, action: 'DENY_HIGH_RISK_OPERATION', targetType: 'websocket_message', targetId: type });
      return false;
    }

    return true;
  }

  private handleRegister(ws: WebSocket, message: IncomingMessage): void {
    const principal = this.authenticateWs(message);
    if (!principal || principal.role !== 'AGENT' || !principal.did) {
      this.sendError(ws, 'AUTH_REQUIRED', 'Agent API key is required to register');
      return;
    }

    const unit = this.state.getUnitByDid(principal.did);
    if (!unit || unit.unitType !== 'AGENT') {
      this.sendError(ws, 'AGENT_DID_REQUIRED', 'API key must be bound to an agent DID');
      return;
    }

    const agentId = unit.id;
    const agent: AgentConnection = {
      id: agentId,
      did: principal.did,
      role: principal.role,
      apiKey: principal.token,
      ws,
      name: readString(message.name) || 'Anonymous',
      capabilities: readStringArray(message.capabilities),
      registeredAt: Date.now(),
    };

    this.state.liveAgents.set(agentId, agent);
    this.missionEngine.registerAgentConnection(agentId, ws);
    this.state.upsertAgentProfile(agentId, message, agent);

    console.log(`✅ Agent registered: ${agent.name} (${agentId})`);
    console.log(`   Capabilities: ${agent.capabilities.join(', ') || 'none'}`);

    this.sendToWs(ws, {
      type: 'registered',
      agentId,
      message: 'Successfully registered to Adventurers Guild',
      capabilities: agent.capabilities,
    });

    if (this.isPubliclyDiscoverableAgentId(agentId)) {
      this.broadcast(
        {
          type: 'new_member',
          data: {
            agentId,
            name: agent.name,
            capabilities: agent.capabilities,
          },
        },
        agentId,
      );
    }
  }

  private handlePublishQuest(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const questData = readMessageData(message);
    const questId = this.state.nextQuestId();
    const requiredMembers = normalizeRequiredMembers(questData.requiredMembers);
    const agentProfile = this.state.agentProfiles.get(agent.id);
    const quest: GuildQuest = {
      id: questId,
      title: readString(questData.title) || 'Untitled quest',
      description: readString(questData.description) || '',
      publisherId: agent.id,
      publisherMemberId: agentProfile?.ownerMemberId,
      publisherAgentId: agent.id,
      deadline: readOptionalString(questData.deadline),
      reward: readOptionalString(questData.reward),
      tags: readStringArray(questData.tags),
      trustRequirements: readStringArray(questData.trustRequirements),
      requiredMembers,
      subtasks: Array.isArray(questData.subtasks) ? questData.subtasks : [],
      status: requiredMembers.length > 0 ? 'FORMING_PARTY' : 'OPEN',
      teamMembers: [agent.id],
      createdAt: Date.now(),
    };

    this.state.quests.set(questId, quest);
    const party = this.state.ensurePartyForQuest(quest);
    this.state.save();
    this.state.audit({
      actorDid: agent.did,
      actorRole: agent.role,
      action: 'CREATE_QUEST',
      targetType: 'quest',
      targetId: questId,
      metadata: { partyId: party.id },
    });

    console.log(`📝 Quest published: ${quest.title} (${questId})`);

    this.sendToWs(ws, {
      type: 'quest_published',
      questId,
      quest,
    });

    this.broadcast(
      {
        type: 'new_quest',
        data: {
          questId,
          title: quest.title,
          requiredMembers: quest.requiredMembers,
          publisherName: agent.name,
        },
      },
      agent.id,
    );
  }

  private handleListQuests(ws: WebSocket, message: IncomingMessage): void {
    if (!this.requireAgent(ws)) {
      return;
    }

    const filter = readOptionalString(message.data?.status);
    const quests = Array.from(this.state.quests.values())
      .filter((quest) => !filter || quest.status === filter)
      .map((quest) => ({
        id: quest.id,
        title: quest.title,
        description: quest.description,
        requiredMembers: quest.requiredMembers,
        status: quest.status,
        deadline: quest.deadline,
        reward: quest.reward,
      }));

    this.sendToWs(ws, {
      type: 'quest_list',
      quests,
    });
  }

  private handleAcceptQuest(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const questId = readString(message.data?.questId);
    const role = readString(message.data?.role);
    if (!agent.did) {
      this.sendError(ws, 'DID_REQUIRED', 'Agent DID is required to accept a quest');
      return;
    }

    try {
      const result = questId ? this.state.acceptQuest(questId, agent.did, role, agent.role) : undefined;
      if (!result) {
        this.sendError(ws, 'QUEST_NOT_FOUND', 'Quest not found');
        return;
      }

      console.log(`✅ ${agent.name} accepted quest ${result.quest.id} as ${result.role}`);
      if (result.party) {
        const installedLeaderSkill = this.state.ensureOrchestratorSkillForPartyLeader(result.party);
        if (installedLeaderSkill) {
          this.state.save();
        }
        this.notifyPartyLeaderSkillInstallation(result.party, installedLeaderSkill);
      }

      this.sendToWs(ws, {
        type: 'quest_accepted',
        questId: result.quest.id,
        role: result.role,
        teamMembers: result.quest.teamMembers,
      });

      result.quest.teamMembers.forEach((memberId) => {
        if (memberId !== agent.id) {
          this.sendToAgent(memberId, {
            type: 'team_member_joined',
            questId: result.quest.id,
            data: {
              agentId: agent.id,
              name: agent.name,
              role: result.role,
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof QuestAcceptanceError) {
        this.sendError(ws, error.code, error.message);
        return;
      }

      throw error;
    }
  }

  private handleInviteToQuest(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const questId = readString(message.data?.questId);
    const targetAgentId = readString(message.data?.targetAgentId);
    const role = readString(message.data?.role);
    const quest = questId ? this.state.quests.get(questId) : undefined;

    if (!quest) {
      this.sendError(ws, 'QUEST_NOT_FOUND', 'Quest not found');
      return;
    }

    if (!quest.teamMembers.includes(agent.id)) {
      this.sendError(ws, 'NOT_IN_TEAM', 'You are not in this quest team');
      return;
    }

    const targetAgent = targetAgentId ? this.state.liveAgents.get(targetAgentId) : undefined;
    if (!targetAgent) {
      this.sendError(ws, 'AGENT_NOT_FOUND', 'Target agent not found');
      return;
    }

    console.log(`📨 ${agent.name} invited ${targetAgent.name} to ${quest.id} as ${role}`);

    this.sendToAgent(targetAgent.id, {
      type: 'quest_invitation',
      data: {
        questId: quest.id,
        questTitle: quest.title,
        role,
        inviterName: agent.name,
        inviterId: agent.id,
      },
    });

    this.sendToWs(ws, {
      type: 'invitation_sent',
      targetAgentId: targetAgent.id,
      targetAgentName: targetAgent.name,
    });
  }

  private handleGetQuestTeam(ws: WebSocket, message: IncomingMessage): void {
    if (!this.requireAgent(ws)) {
      return;
    }

    const questId = readString(message.data?.questId);
    const quest = questId ? this.state.quests.get(questId) : undefined;

    if (!quest) {
      this.sendError(ws, 'QUEST_NOT_FOUND', 'Quest not found');
      return;
    }

    const teamMembers = quest.teamMembers
      .map((memberId) => {
        const liveAgent = this.state.liveAgents.get(memberId);
        if (liveAgent) {
          return {
            id: liveAgent.id,
            name: liveAgent.name,
            capabilities: liveAgent.capabilities,
          };
        }

        const agentProfile = this.state.agentProfiles.get(memberId);
        if (agentProfile) {
          return {
            id: agentProfile.id,
            name: agentProfile.displayName,
            capabilities: agentProfile.capabilities,
          };
        }

        const memberProfile = this.state.members.get(memberId);
        if (memberProfile) {
          return {
            id: memberProfile.id,
            name: memberProfile.displayName,
            capabilities: memberProfile.specialties,
          };
        }

        return null;
      })
      .filter(
        (
          member,
        ): member is {
          id: string;
          name: string;
          capabilities: string[];
        } => Boolean(member),
      )
      ;

    this.sendToWs(ws, {
      type: 'quest_team',
      questId: quest.id,
      teamMembers,
      requiredMembers: quest.requiredMembers,
    });
  }

  private handleSendToQuestTeam(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const questId = readString(message.data?.questId);
    const content = readString(message.data?.content);
    const quest = questId ? this.state.quests.get(questId) : undefined;

    if (!quest) {
      this.sendError(ws, 'QUEST_NOT_FOUND', 'Quest not found');
      return;
    }

    if (!quest.teamMembers.includes(agent.id)) {
      this.sendError(ws, 'NOT_IN_TEAM', 'You are not in this quest team');
      return;
    }

    console.log(`💬 [${quest.id}] ${agent.name}: ${content}`);

    quest.teamMembers.forEach((memberId) => {
      this.sendToAgent(memberId, {
        type: 'quest_team_message',
        questId: quest.id,
        data: {
          sender: agent.name,
          senderId: agent.id,
          content,
          timestamp: Date.now(),
        },
      });
    });
  }

  private handlePostQuest(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const title = readString(message.data?.title) || 'Untitled quest';
    const questId = uuidv4();

    console.log(`📝 Legacy quest posted: ${title} (${questId})`);

    this.sendToWs(ws, {
      type: 'quest_posted',
      questId,
      status: 'PENDING_REVIEW',
      publisherId: agent.id,
    });
  }

  private handleFindAgents(ws: WebSocket, message: IncomingMessage): void {
    const skill = readOptionalString(message.data?.skill)?.toLowerCase();
    const agents = Array.from(this.state.agentProfiles.values())
      .filter((agent) => this.state.isPubliclyDiscoverableAgent(agent))
      .filter((agent) => {
        if (!skill) {
          return true;
        }

        return agent.capabilities.some((capability) => capability.toLowerCase().includes(skill));
      })
      .map((agent) => ({
        id: agent.id,
        name: agent.displayName,
        capabilities: agent.capabilities,
        reputation: agent.reputation.tier,
        classification: agent.classification,
        availability: agent.availability,
      }));

    this.sendToWs(ws, {
      type: 'agents_found',
      agents,
    });
  }

  private handleGetGuildSnapshot(ws: WebSocket, message: IncomingMessage): void {
    const principal = this.authenticateWs(message);
    this.sendToWs(ws, {
      type: 'guild_snapshot',
      snapshot: principal?.role === 'ADMIN' ? this.state.createSnapshot() : this.state.createPublicSnapshot(),
    });
  }

  private handleRegisterMissions(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const missions = message.data?.missions;
    if (!Array.isArray(missions)) {
      this.sendError(ws, 'INVALID_MISSIONS', 'missions must be an array');
      return;
    }

    const created: ReturnType<MissionEngine['registerMission']>[] = [];
    for (const mission of missions) {
      const payload = this.readMissionPayload(mission);
      if (!payload) {
        this.sendError(ws, 'INVALID_MISSION', 'Each mission requires title, description, interval, trigger, action type, and action template');
        return;
      }
      created.push(this.missionEngine.registerMission(agent.id, payload));
    }

    this.sendToWs(ws, {
      type: 'missions_registered',
      data: { missions: created },
    });
  }

  private handleUpdateMission(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const missionId = readString(message.data?.missionId);
    const updates = this.readMissionUpdates(message.data?.updates);
    const updated = missionId ? this.missionEngine.updateMission(agent.id, missionId, updates) : undefined;
    if (!updated) {
      this.sendError(ws, 'MISSION_NOT_FOUND', 'Mission not found or not owned by you');
      return;
    }

    this.sendToWs(ws, {
      type: 'mission_updated',
      data: { mission: updated },
    });
  }

  private handleDeleteMission(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const missionId = readString(message.data?.missionId);
    if (!missionId || !this.missionEngine.deleteMission(agent.id, missionId)) {
      this.sendError(ws, 'MISSION_NOT_FOUND', 'Mission not found or not owned by you');
      return;
    }

    this.sendToWs(ws, {
      type: 'mission_deleted',
      data: { missionId },
    });
  }

  private handleListMyMissions(ws: WebSocket, _message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    this.sendToWs(ws, {
      type: 'my_missions',
      data: { missions: this.missionEngine.getMissionsByAgent(agent.id) },
    });
  }

  private handleTriggerMissionNow(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const missionId = readString(message.data?.missionId);
    if (!missionId || !this.missionEngine.triggerNow(agent.id, missionId)) {
      this.sendError(ws, 'MISSION_NOT_TRIGGERED', 'Mission not found, inactive, or agent is offline');
      return;
    }

    this.sendToWs(ws, {
      type: 'mission_triggered',
      data: { missionId },
    });
  }

  private handleGetRecruitmentBook(ws: WebSocket, _message: IncomingMessage): void {
    this.sendToWs(ws, {
      type: 'recruitment_book',
      packet: this.getRecruitmentBookPacket(),
    });
  }

  private handleJoinGuild(ws: WebSocket, message: IncomingMessage): void {
    const principal = this.authenticateWs(message);
    if (!principal || principal.role !== 'ADMIN') {
      this.sendError(ws, 'ADMIN_REQUIRED', 'Only admins can create guild identities over WebSocket');
      return;
    }

    const payload = this.extractJoinPayload(message);
    if (!payload) {
      this.sendError(ws, 'INVALID_JOIN_PAYLOAD', 'join_guild requires an agent profile with displayName and capabilities');
      return;
    }

    const liveAgentId = uuidv4();
    const liveAgent: AgentConnection = {
      id: liveAgentId,
      ws,
      name: payload.agent.displayName,
      capabilities: payload.agent.capabilities,
      registeredAt: Date.now(),
    };

    this.state.liveAgents.set(liveAgentId, liveAgent);
    const result = this.state.joinGuild(
      {
        ...payload,
        agent: {
          ...payload.agent,
          id: liveAgentId,
        },
      },
      { liveAgent, allowDelegation: true, issueCredentials: true },
    );
    liveAgent.did = result.agent.did;
    liveAgent.role = 'AGENT';
    liveAgent.apiKey = result.credentials?.apiKey;
    this.missionEngine.registerAgentConnection(result.agent.id, ws);

    this.sendToWs(ws, {
      type: 'guild_joined',
      agentId: result.agent.id,
      memberId: result.member?.id,
      delegationId: result.delegation?.id,
      result,
    });

    if (this.isPubliclyDiscoverableAgentId(result.agent.id)) {
      this.broadcast(
        {
          type: 'new_member',
          data: {
            agentId: result.agent.id,
            name: result.agent.displayName,
            capabilities: result.agent.capabilities,
            ownerMemberId: result.member?.id,
          },
        },
        result.agent.id,
      );
    }
  }

  private handleCreateParty(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const partyData = readMessageData(message);
    const partyId = uuidv4();
    const party: Party = {
      id: partyId,
      name: readString(partyData.name) || 'Untitled party',
      description: readOptionalString(partyData.description),
      leaderId: agent.id,
      leaderType: 'AGENT',
      members: [],
      maxSize: readNumber(partyData.maxSize) ?? 5,
      status: 'RECRUITING',
      lookingFor: readStringArray(partyData.lookingFor),
      requiredSkills: readStringArray(partyData.requiredSkills),
      createdAt: Date.now(),
    };

    this.state.parties.set(partyId, party);
    const installedLeaderSkill = this.state.ensureOrchestratorSkillForPartyLeader(party);
    this.state.save();
    this.state.audit({ actorDid: agent.did, actorRole: agent.role, action: 'CREATE_PARTY', targetType: 'party', targetId: partyId });
    this.notifyPartyLeaderSkillInstallation(party, installedLeaderSkill);

    console.log(`🎉 Party created: ${party.name} (${partyId})`);

    this.sendToWs(ws, {
      type: 'party_created',
      party: {
        id: party.id,
        name: party.name,
        leaderId: party.leaderId,
        status: party.status,
      },
    });
  }

  private handleRecruitMembers(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const party = partyId ? this.state.parties.get(partyId) : undefined;

    if (!party) {
      this.sendError(ws, 'PARTY_NOT_FOUND', 'Party not found');
      return;
    }

    const mockApplications: Application[] = [
      {
        applicantId: `agent-${Math.random().toString(36).slice(2, 11)}`,
        name: 'CodeWizard',
        skills: ['react', 'typescript'],
        reputation: 'ELITE',
      },
      {
        applicantId: `agent-${Math.random().toString(36).slice(2, 11)}`,
        name: 'BackendMaster',
        skills: ['nodejs', 'postgresql'],
        reputation: 'REGULAR',
      },
    ];

    this.state.applications.set(party.id, mockApplications);
    console.log(`📢 Recruiting for party ${party.name}`);

    this.sendToWs(ws, {
      type: 'recruitment_started',
      partyId: party.id,
      applications: mockApplications,
    });
  }

  private handleReviewApplication(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const applicationId =
      readString(message.applicationId) || readString(message.data?.applicationId);
    const approved =
      typeof message.approved === 'boolean'
        ? message.approved
        : typeof message.data?.approved === 'boolean'
          ? message.data.approved
          : false;

    const applications = partyId ? this.state.applications.get(partyId) : undefined;
    if (!applications) {
      this.sendError(ws, 'APPLICATIONS_NOT_FOUND', 'Applications not found');
      return;
    }

    const application = applications.find((entry) => entry.applicantId === applicationId);
    if (!application) {
      this.sendError(ws, 'APPLICATION_NOT_FOUND', 'Application not found');
      return;
    }

    console.log(`${approved ? '✅' : '❌'} Application reviewed: ${application.name}`);

    this.sendToWs(ws, {
      type: 'application_reviewed',
      partyId,
      applicationId,
      approved,
      applicantName: application.name,
    });
  }

  private handleAddMember(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const party = partyId ? this.state.parties.get(partyId) : undefined;

    if (!party) {
      this.sendError(ws, 'PARTY_NOT_FOUND', 'Party not found');
      return;
    }

    const userId = readString(message.userId) || readString(message.data?.userId);
    if (!userId) {
      this.sendError(ws, 'USER_ID_REQUIRED', 'User id is required');
      return;
    }

    const member: PartyMember = {
      userId,
      role: readString(message.role) || readString(message.data?.role) || 'member',
      skills: readStringArray(message.skills ?? message.data?.skills),
      status: 'ACTIVE',
      joinedAt: Date.now(),
    };

    party.members.push(member);
    this.state.save();
    this.state.audit({ actorDid: this.getAgentByWs(ws)?.did, actorRole: this.getAgentByWs(ws)?.role, action: 'ADD_PARTY_MEMBER', targetType: 'party', targetId: party.id, metadata: { userId } });

    console.log(`➕ ${userId} joined ${party.name}`);

    this.sendToWs(ws, {
      type: 'member_added',
      partyId: party.id,
      member,
    });
  }

  private handleRemoveMember(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const userId = readString(message.userId) || readString(message.data?.userId);
    const party = partyId ? this.state.parties.get(partyId) : undefined;

    if (!party) {
      this.sendError(ws, 'PARTY_NOT_FOUND', 'Party not found');
      return;
    }

    party.members = party.members.filter((member) => member.userId !== userId);
    this.state.save();
    this.state.audit({ actorDid: this.getAgentByWs(ws)?.did, actorRole: this.getAgentByWs(ws)?.role, action: 'REMOVE_PARTY_MEMBER', targetType: 'party', targetId: party.id, metadata: { userId } });

    console.log(`➖ ${userId} removed from ${party.name}`);

    this.sendToWs(ws, {
      type: 'member_removed',
      partyId: party.id,
      userId,
    });
  }

  private handleGetPartyStatus(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const party = partyId ? this.state.parties.get(partyId) : undefined;

    if (!party) {
      this.sendError(ws, 'PARTY_NOT_FOUND', 'Party not found');
      return;
    }

    const leaderAgent = this.state.agentProfiles.get(party.leaderId);
    const leaderMember = this.state.members.get(party.leaderId);
    const members = party.members.map((member) => ({
      ...member,
      user: {
        id: member.userId,
        name:
          this.state.agentProfiles.get(member.userId)?.displayName ||
          this.state.members.get(member.userId)?.displayName ||
          'Unknown',
      },
    }));

    this.sendToWs(ws, {
      type: 'party_status',
      party: {
        ...party,
        leader: {
          id: party.leaderId,
          name: leaderAgent?.displayName || leaderMember?.displayName || 'Unknown',
        },
        members,
      },
    });
  }

  private handleDisbandParty(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const party = partyId ? this.state.parties.get(partyId) : undefined;

    if (!party) {
      this.sendError(ws, 'PARTY_NOT_FOUND', 'Party not found');
      return;
    }

    party.status = 'DISBANDED';
    this.state.save();
    this.state.audit({ actorDid: this.getAgentByWs(ws)?.did, actorRole: this.getAgentByWs(ws)?.role, action: 'DISBAND_PARTY', targetType: 'party', targetId: party.id });
    console.log(`💔 Party disbanded: ${party.name}`);

    this.sendToWs(ws, {
      type: 'party_disbanded',
      partyId: party.id,
    });
  }

  private handleListMyParties(ws: WebSocket, _message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const parties = Array.from(this.state.parties.values())
      .filter(
        (party) =>
          party.leaderId === agent.id || party.members.some((member) => member.userId === agent.id),
      )
      .map((party) => ({
        id: party.id,
        name: party.name,
        status: party.status,
        members: party.members.length,
        maxSize: party.maxSize,
        lookingFor: party.lookingFor,
      }));

    this.sendToWs(ws, {
      type: 'my_parties',
      parties,
    });
  }

  private handleAssignTask(ws: WebSocket, message: IncomingMessage): void {
    const taskData = message.task ?? message.data?.task ?? {};
    const assigneeId =
      readString(message.assigneeId) || readString(message.data?.assigneeId) || '';
    const taskId = uuidv4();
    const task: GuildTask = {
      id: taskId,
      questId: readString(message.questId) || readString(message.data?.questId) || '',
      partyId: readString(message.partyId) || readString(message.data?.partyId) || '',
      title: readString(taskData.title) || 'Untitled task',
      description: readString(taskData.description) || '',
      assigneeId,
      status: 'assigned',
      progress: 0,
    };

    this.state.tasks.set(taskId, task);
    this.state.save();
    this.state.audit({ actorDid: this.getAgentByWs(ws)?.did, actorRole: this.getAgentByWs(ws)?.role, action: 'ASSIGN_TASK', targetType: 'task', targetId: taskId, metadata: { partyId: task.partyId, questId: task.questId, assigneeId } });

    console.log(`📋 Task assigned: ${task.title} -> ${assigneeId}`);

    this.sendToWs(ws, {
      type: 'task_assigned',
      taskId,
      assigneeId,
      status: task.status,
    });
  }

  private handleUpdateTaskStatus(ws: WebSocket, message: IncomingMessage): void {
    const taskId = readString(message.taskId) || readString(message.data?.taskId);
    const task = taskId ? this.state.tasks.get(taskId) : undefined;

    if (!task) {
      this.sendError(ws, 'TASK_NOT_FOUND', 'Task not found');
      return;
    }

    task.status = (readString(message.status) ||
      readString(message.data?.status) ||
      task.status) as GuildTask['status'];
    task.progress = readNumber(message.progress) ?? readNumber(message.data?.progress) ?? 0;
    task.notes = readOptionalString(message.notes) ?? readOptionalString(message.data?.notes);
    this.state.save();
    this.state.audit({ actorDid: this.getAgentByWs(ws)?.did, actorRole: this.getAgentByWs(ws)?.role, action: 'UPDATE_TASK', targetType: 'task', targetId: task.id, metadata: { status: task.status, progress: task.progress } });

    console.log(`📝 Task updated: ${task.title} -> ${task.status} (${task.progress}%)`);

    this.sendToWs(ws, {
      type: 'task_updated',
      taskId: task.id,
      status: task.status,
      progress: task.progress,
    });
  }

  private handleGetTaskProgress(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const tasks = Array.from(this.state.tasks.values())
      .filter((task) => task.partyId === partyId)
      .map((task) => ({
        ...task,
        assignee: {
          id: task.assigneeId,
          name:
            this.state.agentProfiles.get(task.assigneeId)?.displayName ||
            this.state.members.get(task.assigneeId)?.displayName ||
            'Unknown',
        },
      }));

    this.sendToWs(ws, {
      type: 'task_progress',
      partyId,
      tasks,
    });
  }

  private handleIntegrateResults(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const deliverables = Array.from(this.state.tasks.values())
      .filter((task) => task.partyId === partyId && task.status === 'completed')
      .map((task) => ({
        name: task.title,
        path: `/deliverables/${task.id}`,
        contributor: task.assigneeId,
      }));

    console.log(`🔗 Results integrated for party ${partyId}`);

    this.sendToWs(ws, {
      type: 'results_integrated',
      partyId,
      deliverables,
    });
  }

  private handleTeamMessage(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const party = partyId ? this.state.parties.get(partyId) : undefined;

    if (!party) {
      this.sendError(ws, 'PARTY_NOT_FOUND', 'Party not found');
      return;
    }

    const agent = this.getAgentByWs(ws);
    const content = readString(message.message) || readString(message.data?.message);
    console.log(`💬 Team message in ${party.name}: ${content}`);

    party.members.forEach((member) => {
      this.sendToAgent(member.userId, {
        type: 'team_message',
        from: agent?.id,
        partyId: party.id,
        message: content,
      });
    });
  }

  private handleRequestHelp(ws: WebSocket, message: IncomingMessage): void {
    const partyId = readString(message.partyId) || readString(message.data?.partyId);
    const taskId = readString(message.taskId) || readString(message.data?.taskId);
    const issue = readString(message.issue) || readString(message.data?.issue);

    console.log(`🆘 Help requested: ${issue}`);

    setTimeout(() => {
      this.sendToWs(ws, {
        type: 'help_offered',
        partyId,
        taskId,
        helper: {
          id: 'helper-123',
          name: 'HelpfulAgent',
        },
        solution: 'Try breaking the work into smaller tasks and reassigning the blocked slice.',
      });
    }, 1000);
  }

  private handleAgentMessage(ws: WebSocket, message: IncomingMessage): void {
    const fromAgent = this.requireAgent(ws);
    if (!fromAgent) {
      return;
    }

    const targetAgentId = readString(message.to);
    const targetAgent = targetAgentId ? this.state.liveAgents.get(targetAgentId) : undefined;
    if (!targetAgent) {
      this.sendError(ws, 'AGENT_NOT_FOUND', 'Target agent not found');
      return;
    }

    console.log(`📨 Message: ${fromAgent.name} → ${targetAgent.name}`);

    this.sendToAgent(targetAgent.id, {
      type: 'agent_message',
      from: fromAgent.id,
      content: message.content,
    });
  }

  private handleAgentBroadcast(ws: WebSocket, message: IncomingMessage): void {
    const fromAgent = this.requireAgent(ws);
    if (!fromAgent) {
      return;
    }

    console.log(`📢 Broadcast from ${fromAgent.name}`);

    this.broadcast(
      {
        type: 'agent_broadcast',
        from: fromAgent.id,
        data: message.data,
      },
      fromAgent.id,
    );
  }

  private handleA2AMessage(ws: WebSocket, message: IncomingMessage): void {
    const agent = this.requireAgent(ws);
    if (!agent) {
      return;
    }

    const envelope = this.normalizeA2AEnvelope(message);
    if (!envelope) {
      this.sendError(ws, 'INVALID_A2A_MESSAGE', 'a2a_message requires fromDid and payload');
      return;
    }

    if (!this.state.isRegisteredDid(envelope.fromDid)) {
      this.sendError(ws, 'A2A_DID_NOT_FOUND', 'fromDid is not a registered guild DID');
      return;
    }

    if (agent.did !== envelope.fromDid) {
      this.sendError(ws, 'A2A_DID_MISMATCH', 'fromDid must match the authenticated connection DID');
      return;
    }

    if (!agent.apiKey || !verifyDidSignature(agent.apiKey, this.a2aSigningPayload(envelope), envelope.signature)) {
      this.sendError(ws, 'A2A_SIGNATURE_INVALID', 'A2A signature could not be verified for fromDid');
      return;
    }

    if (envelope.toDid) {
      const target = this.findLiveAgentByDid(envelope.toDid);
      if (!target) {
        this.sendError(ws, 'A2A_TARGET_OFFLINE', 'Target DID is not connected');
        return;
      }

      this.sendToAgent(target.id, {
        type: 'a2a_message',
        message: envelope,
      });
    } else {
      this.broadcast({ type: 'a2a_message', message: envelope }, this.getAgentByWs(ws)?.id);
    }

    this.state.activityFeed.unshift({
      id: `activity-${Date.now()}`,
      kind: 'A2A_MESSAGE_RELAYED',
      title: `${envelope.fromDid} sent ${envelope.type}`,
      detail: envelope.context?.partyId || envelope.context?.questId || envelope.context?.beaconId || 'guild-wide A2A message',
      timestampLabel: 'just now',
    });

    this.sendToWs(ws, {
      type: 'a2a_message_relayed',
      messageId: envelope.id,
    });
  }

  private normalizeA2AEnvelope(message: IncomingMessage): GuildA2AMessage | undefined {
    const input = (message.message ?? message.data ?? message) as Partial<GuildA2AMessage>;
    if (!input.fromDid || typeof input.payload === 'undefined') {
      return undefined;
    }

    return {
      protocol: 'guild-a2a',
      version: 'v1',
      id: input.id || uuidv4(),
      type: input.type && input.type !== 'a2a_message' ? input.type : 'guild.message',
      fromDid: input.fromDid,
      toDid: input.toDid,
      context: input.context,
      payload: input.payload,
      createdAt: input.createdAt || Date.now(),
      signature: input.signature,
    };
  }

  private a2aSigningPayload(envelope: GuildA2AMessage): Omit<GuildA2AMessage, 'signature'> {
    const { signature: _signature, ...payload } = envelope;
    return payload;
  }

  private authenticateWs(message: IncomingMessage): AuthPrincipal | undefined {
    const token = readString(message.apiKey) || readString(message.data?.apiKey) || readString(message.authorization)?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return undefined;
    }
    const record = this.state.getDatabase().verifyApiKey(token);
    return record ? principalFromApiKey(record, token) : undefined;
  }

  private notifyPartyLeaderSkillInstallation(party: Party, installed: boolean): void {
    if (!installed || party.leaderType !== 'AGENT') {
      return;
    }

    this.sendToAgent(party.leaderId, {
      type: 'skill_installation_required',
      scope: 'party_leader',
      partyId: party.id,
      questId: party.questId,
      skill: ORCHESTRATOR_AGENT_SKILL,
      reason:
        'Party leaders must keep multi-agent collaboration moving until explicit completion criteria are met.',
    });
  }

  private findLiveAgentByDid(did: string): AgentConnection | undefined {
    const profile = Array.from(this.state.agentProfiles.values()).find((agent) => agent.did === did);
    return profile ? this.state.liveAgents.get(profile.id) : undefined;
  }

  private requireAgent(ws: WebSocket): AgentConnection | undefined {
    const agent = this.getAgentByWs(ws);
    if (!agent) {
      this.sendError(ws, 'NOT_REGISTERED', 'Please register first');
    }
    return agent;
  }

  private extractJoinPayload(message: IncomingMessage): JoinGuildPayload | undefined {
    const payload = (message.data ?? message) as Partial<JoinGuildPayload>;
    if (!payload.agent?.displayName || !Array.isArray(payload.agent.capabilities)) {
      return undefined;
    }

    return {
      member: payload.member,
      agent: {
        ...payload.agent,
        id: undefined,
      },
      delegation: payload.delegation,
    };
  }

  private readMissionPayload(value: unknown): AgentMissionPayload | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const payload = value as Record<string, unknown>;
    const title = readString(payload.title);
    const description = readString(payload.description);
    const checkIntervalMinutes = readNumber(payload.checkIntervalMinutes);
    const triggerCondition = readString(payload.triggerCondition);
    const actionType = this.readMissionActionType(payload.actionType);
    const actionTemplate = readString(payload.actionTemplate);

    if (!title || !description || !checkIntervalMinutes || !triggerCondition || !actionType || !actionTemplate) {
      return undefined;
    }

    return {
      title,
      description,
      checkIntervalMinutes,
      triggerCondition,
      actionType,
      actionTemplate,
      active: typeof payload.active === 'boolean' ? payload.active : undefined,
    };
  }

  private readMissionUpdates(value: unknown): Partial<AgentMissionPayload> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const payload = value as Record<string, unknown>;
    const updates: Partial<AgentMissionPayload> = {};
    const title = readString(payload.title);
    const description = readString(payload.description);
    const checkIntervalMinutes = readNumber(payload.checkIntervalMinutes);
    const triggerCondition = readString(payload.triggerCondition);
    const actionType = this.readMissionActionType(payload.actionType);
    const actionTemplate = readString(payload.actionTemplate);

    if (title) updates.title = title;
    if (description) updates.description = description;
    if (checkIntervalMinutes) updates.checkIntervalMinutes = checkIntervalMinutes;
    if (triggerCondition) updates.triggerCondition = triggerCondition;
    if (actionType) updates.actionType = actionType;
    if (actionTemplate) updates.actionTemplate = actionTemplate;
    if (typeof payload.active === 'boolean') updates.active = payload.active;

    return updates;
  }

  private readMissionActionType(value: unknown): AgentMissionPayload['actionType'] | undefined {
    if (
      value === 'PUBLISH_QUEST' ||
      value === 'BROADCAST_BEACON' ||
      value === 'A2A_MESSAGE' ||
      value === 'SELF_ASSIGN'
    ) {
      return value;
    }

    return undefined;
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    this.sendToWs(ws, {
      type: 'error',
      code,
      message,
    });
  }

  private sendToWs(ws: WebSocket, message: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendToAgent(agentId: string, message: Record<string, unknown>): void {
    const agent = this.state.liveAgents.get(agentId);
    if (agent && agent.ws.readyState === WebSocket.OPEN) {
      agent.ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: Record<string, unknown>, excludeAgentId?: string): void {
    this.state.liveAgents.forEach((agent, agentId) => {
      if (agentId !== excludeAgentId && agent.ws.readyState === WebSocket.OPEN) {
        agent.ws.send(JSON.stringify(message));
      }
    });
  }

  private getAgentByWs(ws: WebSocket): AgentConnection | undefined {
    for (const agent of this.state.liveAgents.values()) {
      if (agent.ws === ws) {
        return agent;
      }
    }

    return undefined;
  }

  private handleDisconnect(ws: WebSocket): void {
    const agent = this.getAgentByWs(ws);
    if (!agent) {
      return;
    }

    console.log(`👋 Agent disconnected: ${agent.name} (${agent.id})`);
    this.missionEngine.unregisterAgentConnection(agent.id, ws);
    this.state.liveAgents.delete(agent.id);
    this.state.markAgentOffline(agent.id);
    this.wsBuckets.delete(ws);

    if (this.isPubliclyDiscoverableAgentId(agent.id)) {
      this.broadcast({
        type: 'agent_left',
        data: {
          agentId: agent.id,
          name: agent.name,
        },
      });
    }
  }

  private heartbeat(): void {
    this.state.liveAgents.forEach((agent) => {
      if (agent.ws.readyState === WebSocket.OPEN) {
        agent.ws.send(JSON.stringify({ type: 'ping' }));
      }
    });
  }

  private checkWsRateLimit(ws: WebSocket): boolean {
    const now = Date.now();
    const bucket = this.wsBuckets.get(ws);
    if (!bucket || bucket.resetAt <= now) {
      this.wsBuckets.set(ws, { count: 1, resetAt: now + 10_000 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= 50;
  }

  public close(): void {
    this.missionEngine.shutdown();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    this.wss.clients.forEach((client) => client.close());
    this.wss.close();
    console.log('🏰 Guild runtime closed');
  }

  public getGuildSnapshot() {
    return this.state.createSnapshot();
  }

  public getPublicGuildSnapshot() {
    return this.state.createPublicSnapshot();
  }

  public getDatabase() {
    return this.state.getDatabase();
  }

  public getRecruitmentBookPacket() {
    return buildRecruitmentBookPacket();
  }

  public getGuildNodeProtocolPacket() {
    return buildGuildNodeProtocolPacket();
  }

  public listPartyBeacons() {
    return this.state.listPartyBeacons();
  }

  public listPublicPartyBeacons() {
    return this.state.listPublicPartyBeacons();
  }

  private isPubliclyDiscoverableAgentId(agentId: string): boolean {
    const profile = this.state.agentProfiles.get(agentId);
    return profile ? this.state.isPubliclyDiscoverableAgent(profile) : true;
  }

  public relayA2AMessage(fromDid: string, input: RelayPayload) {
    const from = this.state.getUnitByDid(fromDid);
    if (!from) {
      return { status: 'REJECTED', code: 'SENDER_NOT_FOUND', message: 'Authenticated guild identity was not found' };
    }

    const targetAgentId = readString(input.toAgentId);
    if (!targetAgentId) {
      return { status: 'REJECTED', code: 'TARGET_REQUIRED', message: 'toAgentId is required' };
    }

    const targetProfile = this.state.agentProfiles.get(targetAgentId);
    if (!targetProfile) {
      return { status: 'REJECTED', code: 'TARGET_NOT_FOUND', message: 'Target agent was not found in the guild registry' };
    }

    const envelope: GuildA2AMessage = {
      protocol: 'guild-a2a',
      version: 'v1',
      id: uuidv4(),
      type: readString(input.type) || 'guild.relay.message',
      fromDid,
      toDid: targetProfile.did,
      context: input.context,
      payload: typeof input.payload === 'undefined' ? {} : input.payload,
      createdAt: Date.now(),
    };

    const target = this.state.liveAgents.get(targetAgentId);
    if (!target || target.ws.readyState !== WebSocket.OPEN) {
      this.state.activityFeed.unshift({
        id: `activity-${Date.now()}`,
        kind: 'A2A_MESSAGE_RELAYED',
        title: `${from.displayName} 请求协会中继消息`,
        detail: `${targetProfile.displayName} 当前未在线，协会保留通信上下文。`,
        timestampLabel: 'just now',
      });
      return {
        status: 'QUEUED',
        relayId: envelope.id,
        targetAgentId,
        targetLabel: targetProfile.displayName,
        message: 'Target agent is not connected; no endpoint information was disclosed.',
      };
    }

    this.sendToAgent(target.id, {
      type: 'a2a_message',
      message: envelope,
      relay: {
        broker: 'adventurers-guild',
        directEndpointDisclosed: false,
      },
    });

    this.state.activityFeed.unshift({
      id: `activity-${Date.now()}`,
      kind: 'A2A_MESSAGE_RELAYED',
      title: `${from.displayName} 通过协会中继联系 ${targetProfile.displayName}`,
      detail: envelope.context?.partyId || envelope.context?.questId || envelope.context?.beaconId || 'guild relay message',
      timestampLabel: 'just now',
    });

    return {
      status: 'DELIVERED',
      relayId: envelope.id,
      targetAgentId,
      targetLabel: targetProfile.displayName,
      message: 'Message relayed through the guild broker; no endpoint information was disclosed.',
    };
  }

  public createPartyBeacon(payload: CreatePartyBeaconPayload) {
    return this.state.createPartyBeacon(payload);
  }

  public respondToPartyBeacon(beaconId: string, payload: RespondToPartyBeaconPayload) {
    return this.state.respondToPartyBeacon(beaconId, payload);
  }

  public reviewPartyBeaconResponse(
    beaconId: string,
    responseId: string,
    status: PartyBeaconResponse['status'],
    reviewerDid: string,
  ) {
    return this.state.reviewPartyBeaconResponse(beaconId, responseId, status, reviewerDid);
  }

  public acceptQuest(questId: string, actorDid: string, role: string, actorRole?: string) {
    return this.state.acceptQuest(questId, actorDid, role, actorRole);
  }

  public publishAgentInitiatedQuest(params: {
    title: string;
    description: string;
    tags: string[];
    publisherDid: string;
    requiredMembers: RequiredMember[];
    triggeredBy: 'MISSION' | 'BEACON_RESPONSE' | 'A2A_REQUEST';
    sourceMissionId?: string;
  }) {
    return this.state.publishAgentInitiatedQuest(params);
  }

  public checkAgentActionRateLimit(agentId: string, maxActionsPerHour?: number) {
    return this.state.checkAgentActionRateLimit(agentId, maxActionsPerHour);
  }

  public revokeAgentInitiatedQuest(questId: string, actorDid?: string, actorRole?: string) {
    return this.state.revokeAgentInitiatedQuest(questId, actorDid, actorRole);
  }

  public resolveDidDocument(did: string, publicBaseUrl: string) {
    return this.state.resolveDidDocument(did, publicBaseUrl);
  }

  public resolveConnectionUri(connectionUri: string, publicBaseUrl: string) {
    return this.state.resolveConnectionUri(connectionUri, publicBaseUrl);
  }

  public joinGuildFromApi(payload: JoinGuildPayload): GuildJoinResult {
    return this.state.joinGuild(payload, { allowDelegation: true, issueCredentials: true });
  }
}
