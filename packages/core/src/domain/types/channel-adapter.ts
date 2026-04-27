/**
 * IChannelAdapter — surface for outbound message delivery to a specific IM/UI channel.
 *
 * Phase 2 wires Telegram and Web UI adapters; declaring the interface now prevents
 * IOrchStore and INotifier from taking on channel-specific responsibilities (I-14).
 */

/**
 * Opaque address identifying where a message should be delivered within a channel.
 *
 * Phase 2 refines this per adapter (e.g. Telegram chat id, Web UI client id).
 */
export interface ChannelAddress {
  /** Adapter type this address belongs to — used for dispatch routing. */
  channelType: string;

  /** Channel-specific destination identifier (chat id, socket id, etc.). */
  targetId: string;
}

/**
 * Optional send modifiers.
 *
 * Phase 2 adds adapter-specific fields (parse_mode, reply_markup, etc.).
 */
export interface SendOptions {
  /** If true, the message is a silent reply (no notification sound). */
  silent?: boolean;

  /**
   * Unique key for client-side dedup; adapter silently discards duplicates
   * within a sliding window.
   */
  dedupKey?: string;
}

/**
 * IChannelAdapter — implemented once per supported channel (Telegram, Web UI, …).
 *
 * Adapters register themselves into a registry at startup; the notifier dispatches
 * through the registry without knowing which concrete adapter handles each address.
 */
export interface IChannelAdapter {
  /** Stable identifier matching the channelType field in ChannelAddress. */
  readonly type: string;

  /** Open connections, start polling/webhook, become ready to receive and send. */
  start(): Promise<void>;

  /** Flush in-flight deliveries, close connections, release resources. */
  stop(): Promise<void>;

  /** Deliver a text message to the given address. */
  sendMessage(
    target: ChannelAddress,
    text: string,
    opts?: SendOptions,
  ): Promise<void>;

  /**
   * Show or hide a typing indicator for the given address.
   *
   * Optional — adapters that do not support typing indicators omit this method.
   */
  setTyping?(target: ChannelAddress, on: boolean): Promise<void>;
}
