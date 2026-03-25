import {
  Client,
  ClientStatus,
  generateIdentity,
  identityFromString,
  sendTextMessage,
} from "@honeybbq/teamspeak-client";
import type { TextMessage, Identity, VoiceData } from "@honeybbq/teamspeak-client";
import type { ResolvedTeamspeakAccount, PluginLogger } from "./types.js";
import { adaptLogger } from "./types.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const IDENTITY_FILENAME = "identity.txt";

const VOICE_ERROR_WINDOW_MS = 30_000;
const VOICE_ERROR_RECONNECT_THRESHOLD = 5;

export class TeamspeakClientManager {
  #client: Client | null = null;
  #account: ResolvedTeamspeakAccount;
  #logger: PluginLogger;
  #stateDir: string;
  #identity: Identity | null = null;
  #running = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #onMessage: ((msg: TextMessage) => void) | null = null;
  #onVoiceData: ((data: VoiceData) => void) | null = null;
  #voiceErrorCount = 0;
  #voiceErrorWindowStart = 0;
  #voiceRecoveryInFlight = false;

  constructor(account: ResolvedTeamspeakAccount, logger: PluginLogger, stateDir: string) {
    this.#account = account;
    this.#logger = logger;
    this.#stateDir = stateDir;
  }

  onMessage(handler: (msg: TextMessage) => void): void {
    this.#onMessage = handler;
  }

  onVoiceData(handler: (data: VoiceData) => void): void {
    this.#onVoiceData = handler;
  }

  get client(): Client | null {
    return this.#client;
  }

  get connected(): boolean {
    return this.#client?.status === ClientStatus.Connected;
  }

  get channelID(): bigint {
    return this.#client?.channelID() ?? 0n;
  }

  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#identity = this.#resolveIdentity();
    await this.#connect();
  }

  async stop(): Promise<void> {
    this.#running = false;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#client) {
      await this.#client.disconnect();
      this.#client = null;
    }
  }

  async sendText(targetMode: number, targetID: bigint, text: string): Promise<void> {
    if (!this.#client || this.#client.status !== ClientStatus.Connected) {
      throw new Error("teamspeak: not connected");
    }
    await sendTextMessage(this.#client, targetMode, targetID, text);
  }

  #resolveIdentity(): Identity {
    if (this.#account.identity) {
      try {
        return identityFromString(this.#account.identity);
      } catch (err) {
        this.#logger.warn(
          `failed to parse configured identity, generating new one: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const persisted = this.#loadPersistedIdentity();
    if (persisted) return persisted;

    this.#logger.info(`generating identity (level ${this.#account.identityLevel})`);
    const identity = generateIdentity(this.#account.identityLevel);
    this.#persistIdentity(identity);
    return identity;
  }

  #loadPersistedIdentity(): Identity | null {
    try {
      const data = readFileSync(join(this.#stateDir, IDENTITY_FILENAME), "utf8").trim();
      if (!data) return null;
      const identity = identityFromString(data);
      this.#logger.info(`loaded persisted identity (level ${identity.securityLevel()})`);
      return identity;
    } catch {
      return null;
    }
  }

  #persistIdentity(identity: Identity): void {
    try {
      mkdirSync(this.#stateDir, { recursive: true });
      writeFileSync(join(this.#stateDir, IDENTITY_FILENAME), identity.toString(), "utf8");
      this.#logger.info("persisted identity to state directory");
    } catch (err) {
      this.#logger.warn(
        `failed to persist identity: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async #connect(): Promise<void> {
    if (!this.#running || !this.#identity) return;

    const client = new Client(this.#identity, this.#account.server, this.#account.nickname, {
      logger: adaptLogger(this.#logger),
    });

    client.on("textMessage", (msg) => {
      if (msg.invokerID === client.clientID()) return;
      this.#onMessage?.(msg);
    });

    client.on("disconnected", (err) => {
      if (err) {
        this.#logger.warn(`disconnected from TeamSpeak server: ${err.message}`);
      }
      this.#scheduleReconnect();
    });

    client.on("poked", (evt) => {
      this.#logger.info(`poked by "${evt.invokerName}" (${evt.invokerUID}): ${evt.message}`);
      if (!evt.message) return;
      this.#onMessage?.({
        invokerID: evt.invokerID,
        invokerName: evt.invokerName,
        invokerUID: evt.invokerUID,
        invokerGroups: [],
        message: evt.message,
        targetMode: 1,
        targetID: BigInt(client.clientID()),
      });
    });

    client.on("kicked", (reason) => {
      this.#logger.warn(`kicked from server: ${reason}`);
    });

    if (this.#onVoiceData) {
      const handler = this.#onVoiceData;
      client.on("voiceData", (data) => handler(data));
    }

    this.#client = client;
    this.#logger.info(`connecting to ${this.#account.server}`);

    try {
      await client.connect();
      await client.waitConnected(AbortSignal.timeout(30_000));
      this.#reconnectAttempt = 0;
      this.#logger.info(`connected to TeamSpeak server (clid=${client.clientID()})`);
    } catch (err) {
      this.#logger.error(`connection failed: ${err instanceof Error ? err.message : String(err)}`);
      this.#scheduleReconnect();
    }
  }

  /**
   * Track voice/transport errors and trigger reconnect if they
   * exceed the threshold within the sliding window.
   */
  recordVoiceError(): void {
    const now = Date.now();
    if (now - this.#voiceErrorWindowStart > VOICE_ERROR_WINDOW_MS) {
      this.#voiceErrorCount = 0;
      this.#voiceErrorWindowStart = now;
    }
    this.#voiceErrorCount++;

    if (this.#voiceErrorCount < VOICE_ERROR_RECONNECT_THRESHOLD || this.#voiceRecoveryInFlight) {
      return;
    }

    this.#voiceRecoveryInFlight = true;
    this.#voiceErrorCount = 0;
    this.#logger.warn(
      `${VOICE_ERROR_RECONNECT_THRESHOLD} voice errors in ${VOICE_ERROR_WINDOW_MS}ms, reconnecting`,
    );

    this.stop()
      .then(() => this.start())
      .catch((err) => {
        this.#logger.error(
          `voice error recovery failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => {
        this.#voiceRecoveryInFlight = false;
      });
  }

  #scheduleReconnect(): void {
    if (!this.#running) return;
    this.#reconnectAttempt++;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.#reconnectAttempt - 1), RECONNECT_MAX_MS);
    this.#logger.info(`reconnecting in ${delay}ms (attempt ${this.#reconnectAttempt})`);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect().catch((err) => {
        this.#logger.error(`reconnect error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, delay);
  }
}
