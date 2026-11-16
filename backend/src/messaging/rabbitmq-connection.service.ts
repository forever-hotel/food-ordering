import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { Channel, ChannelModel, ConfirmChannel } from 'amqplib';
import {
  RABBITMQ_INITIAL_RECONNECT_DELAY_MS,
  RABBITMQ_MAX_RECONNECT_DELAY_MS,
} from './messaging.constants.js';

@Injectable()
export class RabbitMqConnectionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqConnectionService.name);

  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private confirmChannel: ConfirmChannel | null = null;

  private isConnecting = false;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = RABBITMQ_INITIAL_RECONNECT_DELAY_MS;

  private topologySetupCallbacks: Array<() => Promise<void>> = [];

  constructor(private readonly configService: ConfigService) {}

  public async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log('RabbitMQ messaging is disabled via configuration.');
      return;
    }
    await this.connect();
  }

  public async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.close();
  }

  /**
   * Registers a callback to be executed once a connection and channels are established.
   */
  public onConnected(callback: () => Promise<void>): void {
    this.topologySetupCallbacks.push(callback);
    if (this.isConnected()) {
      void callback().catch((err: unknown) => {
        this.logger.error('Error executing topology setup callback:', err);
      });
    }
  }

  public isEnabled(): boolean {
    const rawVal = this.configService.get<string>('RABBITMQ_ENABLED');
    if (rawVal !== undefined) {
      const lower = String(rawVal).toLowerCase().trim();
      return lower === 'true' || lower === '1';
    }
    // If not explicitly defined, enabled if RABBITMQ_URL is present and non-empty
    const url = this.configService.get<string>('RABBITMQ_URL');
    return Boolean(url && url.trim().length > 0);
  }

  public isConnected(): boolean {
    return (
      this.connection !== null &&
      this.channel !== null &&
      this.confirmChannel !== null
    );
  }

  public getChannel(): Channel | null {
    return this.channel;
  }

  public getConfirmChannel(): ConfirmChannel | null {
    return this.confirmChannel;
  }

  public async connect(): Promise<boolean> {
    if (this.isShuttingDown || this.isConnecting || this.isConnected()) {
      return this.isConnected();
    }

    this.isConnecting = true;
    const url =
      this.configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672';

    try {
      this.logger.log(`Connecting to RabbitMQ broker at [${url}]...`);
      const conn = await amqp.connect(url);

      conn.on('error', (err: unknown) => {
        this.logger.error('RabbitMQ connection error occurred:', err);
      });

      conn.on('close', () => {
        this.logger.warn('RabbitMQ connection closed.');
        this.connection = null;
        this.channel = null;
        this.confirmChannel = null;
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      });

      const regularChannel = await conn.createChannel();
      regularChannel.on('error', (err: unknown) => {
        this.logger.error('RabbitMQ standard channel error:', err);
      });
      regularChannel.on('close', () => {
        this.channel = null;
      });

      const publisherConfirmChannel = await conn.createConfirmChannel();
      publisherConfirmChannel.on('error', (err: unknown) => {
        this.logger.error('RabbitMQ confirm channel error:', err);
      });
      publisherConfirmChannel.on('close', () => {
        this.confirmChannel = null;
      });

      this.connection = conn;
      this.channel = regularChannel;
      this.confirmChannel = publisherConfirmChannel;
      this.reconnectDelay = RABBITMQ_INITIAL_RECONNECT_DELAY_MS;
      this.logger.log(
        'RabbitMQ connection and channels established successfully.',
      );

      // Run registered topology setup callbacks
      for (const callback of this.topologySetupCallbacks) {
        try {
          await callback();
        } catch (setupErr) {
          this.logger.error(
            'Failed running topology callback after reconnect:',
            setupErr,
          );
        }
      }

      return true;
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to connect to RabbitMQ broker: ${(err as Error)?.message || err}. Will retry in ${this.reconnectDelay}ms.`,
      );
      this.connection = null;
      this.channel = null;
      this.confirmChannel = null;
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      RABBITMQ_MAX_RECONNECT_DELAY_MS,
    );
  }

  public async close(): Promise<void> {
    try {
      if (this.confirmChannel) {
        await this.confirmChannel.close().catch(() => {});
        this.confirmChannel = null;
      }
      if (this.channel) {
        await this.channel.close().catch(() => {});
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close().catch(() => {});
        this.connection = null;
      }
    } catch (err) {
      this.logger.error('Error during RabbitMQ connection close:', err);
    }
  }
}
