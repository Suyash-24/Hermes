/**
 * Components V2 façade.
 *
 * Port of the Rust `src/components/v2.rs`, which hand-rolled the raw JSON.
 * Seyfert ships real V2 builders, so this file is a thin fluent wrapper that
 * keeps the Rust call-site shape — `FadeResponse.new().container(accent, b => …)`
 * — while delegating serialisation to Seyfert.
 *
 * One behavioural fix: the Rust `ContainerBuilder::new` threw its `accent`
 * argument away (`v2.rs:151-153`), so `accent_color` was never emitted and every
 * card rendered without its stripe. Here the accent is actually applied.
 */
import { randomUUID } from 'node:crypto';
import {
  ActionRow,
  Button,
  ButtonStyle,
  Container,
  MediaGallery,
  MediaGalleryItem,
  MessageFlags,
  Section,
  Separator,
  Spacing,
  TextDisplay,
  Thumbnail,
} from 'seyfert';

export { ButtonStyle, Spacing };

/** Message flag that switches Discord to the V2 component renderer. */
export const IS_COMPONENTS_V2: number = MessageFlags.IsComponentsV2;
/** Message flag that makes a reply visible only to the invoking user. */
export const EPHEMERAL: number = MessageFlags.Ephemeral;

/** Components Fade puts at the top level of a message. */
export type FadeComponent = Container | TextDisplay | Separator | MediaGallery | ActionRow<Button>;

/** A builder callback. The return value is ignored — the builder is mutated. */
type Build<T> = (builder: T) => unknown;

function textDisplay(content: string): TextDisplay {
  return new TextDisplay().setContent(content);
}

function separatorOf(divider: boolean, spacing: Spacing): Separator {
  return new Separator().setDivider(divider).setSpacing(spacing);
}

function buttonOf(customId: string, label: string, style: ButtonStyle, emoji?: string): Button {
  const button = new Button().setCustomId(customId).setLabel(label).setStyle(style);
  return emoji ? button.setEmoji(emoji) : button;
}

// ── SectionBuilder ────────────────────────────────────────────────────────────

/** Text lines in the left column, with an optional right-hand accessory. */
export class SectionBuilder {
  private readonly texts: TextDisplay[] = [];
  private accessory?: Button | Thumbnail;

  /** Add a text line to the left column (Discord allows at most 3). */
  text(content: string): this {
    this.texts.push(textDisplay(content));
    return this;
  }

  /** Set a Thumbnail as the right-hand accessory. */
  thumbnail(url: string, description?: string): this {
    const thumb = new Thumbnail().setMedia(url);
    if (description) thumb.setDescription(description);
    this.accessory = thumb;
    return this;
  }

  /** Set a Button as the right-hand accessory. */
  buttonAccessory(customId: string, label: string, style: ButtonStyle): this {
    this.accessory = buttonOf(customId, label, style);
    return this;
  }

  build(): Section {
    const section = new Section().addComponents(this.texts);
    if (this.accessory) section.setAccessory(this.accessory);
    return section;
  }
}

// ── MediaGalleryBuilder ───────────────────────────────────────────────────────

export class MediaGalleryBuilder {
  private readonly items: MediaGalleryItem[] = [];

  /** Add an image (Discord allows at most 10; Fade's cards use up to 4). */
  item(url: string, description?: string): this {
    const item = new MediaGalleryItem().setMedia(url);
    if (description) item.setDescription(description);
    this.items.push(item);
    return this;
  }

  build(): MediaGallery {
    return new MediaGallery().addItems(this.items);
  }
}

// ── ActionRowBuilder ──────────────────────────────────────────────────────────

export class ActionRowBuilder {
  private readonly components: Button[] = [];

  /** Add a regular button. */
  button(customId: string, label: string, style: ButtonStyle): this {
    this.components.push(buttonOf(customId, label, style));
    return this;
  }

  /** Add a button with an emoji prefix. */
  buttonEmoji(customId: string, label: string, style: ButtonStyle, emoji: string): this {
    this.components.push(buttonOf(customId, label, style, emoji));
    return this;
  }

  /** Add a link button (no custom_id, opens a URL). */
  link(url: string, label: string): this {
    this.components.push(new Button().setStyle(ButtonStyle.Link).setLabel(label).setURL(url));
    return this;
  }

  /**
   * Add a disabled button (greyed out, unclickable). Discord still requires a
   * unique `custom_id`, so one is generated and never routed.
   */
  buttonDisabled(label: string, style: ButtonStyle): this {
    this.components.push(buttonOf(`disabled_${randomUUID()}`, label, style).setDisabled(true));
    return this;
  }

  build(): ActionRow<Button> {
    return new ActionRow<Button>().addComponents(this.components);
  }
}

// ── ContainerBuilder ──────────────────────────────────────────────────────────

/** A card with an optional accent stripe down its left edge. */
export class ContainerBuilder {
  private readonly components: (TextDisplay | Separator | Section | MediaGallery | ActionRow<Button>)[] =
    [];
  private isSpoiler = false;

  /** `accent` is a 24-bit RGB integer, e.g. `Colour.FADE`. */
  constructor(private readonly accent?: number) {}

  spoiler(): this {
    this.isSpoiler = true;
    return this;
  }

  /** Add a TextDisplay inside this container. */
  text(content: string): this {
    this.components.push(textDisplay(content));
    return this;
  }

  /** Add a tight Separator inside this container. */
  separator(divider: boolean): this {
    this.components.push(separatorOf(divider, Spacing.Small));
    return this;
  }

  /** Add a roomier Separator inside this container. */
  separatorSpaced(divider: boolean): this {
    this.components.push(separatorOf(divider, Spacing.Large));
    return this;
  }

  /** Add a Section (text + optional thumbnail/button accessory). */
  section(build: Build<SectionBuilder>): this {
    const builder = new SectionBuilder();
    build(builder);
    this.components.push(builder.build());
    return this;
  }

  /** Add a MediaGallery inside this container. */
  mediaGallery(build: Build<MediaGalleryBuilder>): this {
    const builder = new MediaGalleryBuilder();
    build(builder);
    this.components.push(builder.build());
    return this;
  }

  /** Add an ActionRow (buttons) inside this container. */
  actionRow(build: Build<ActionRowBuilder>): this {
    const builder = new ActionRowBuilder();
    build(builder);
    this.components.push(builder.build());
    return this;
  }

  build(): Container {
    const container = new Container()
      .addComponents(this.components)
      .setSpoiler(this.isSpoiler);
    // The fix: Rust dropped this, so no card ever showed its accent stripe.
    if (this.accent !== undefined) container.setColor(this.accent);
    return container;
  }
}

// ── FadeResponse ──────────────────────────────────────────────────────────────

/**
 * The top-level message payload. Build it fluently, then spread `toMessage()`
 * into any Seyfert write / editOrReply / send call.
 */
export class FadeResponse {
  private readonly components: FadeComponent[] = [];
  private isEphemeral = false;

  /** Make the response only visible to the invoking user. */
  ephemeral(): this {
    this.isEphemeral = true;
    return this;
  }

  /** Append a Container (card with optional accent stripe). */
  container(accent: number | undefined, build: Build<ContainerBuilder>): this {
    const builder = new ContainerBuilder(accent);
    build(builder);
    this.components.push(builder.build());
    return this;
  }

  /** Append a bare TextDisplay (outside any container). */
  text(content: string): this {
    this.components.push(textDisplay(content));
    return this;
  }

  /** Append a Separator outside a container. */
  separator(divider: boolean): this {
    this.components.push(separatorOf(divider, Spacing.Small));
    return this;
  }

  /** Append a MediaGallery outside a container. */
  mediaGallery(build: Build<MediaGalleryBuilder>): this {
    const builder = new MediaGalleryBuilder();
    build(builder);
    this.components.push(builder.build());
    return this;
  }

  /** Append a classic ActionRow (buttons) outside a container. */
  actionRow(build: Build<ActionRowBuilder>): this {
    const builder = new ActionRowBuilder();
    build(builder);
    this.components.push(builder.build());
    return this;
  }

  /** Message flags: always V2, plus ephemeral when requested. */
  get flags(): number {
    return this.isEphemeral ? IS_COMPONENTS_V2 | EPHEMERAL : IS_COMPONENTS_V2;
  }

  /** The top-level component builders. */
  toComponents(): FadeComponent[] {
    return [...this.components];
  }

  /** Body for `ctx.write` / `ctx.editOrReply` / `channel.messages.write`. */
  toMessage(): { flags: number; components: FadeComponent[]; allowed_mentions: { replied_user: boolean; parse: [] } } {
    return {
      flags: this.flags,
      components: this.toComponents(),
      allowed_mentions: { replied_user: false, parse: [] },
    };
  }

  /** Raw JSON, for the few places that hit the Discord REST API directly. */
  toJSON(): { flags: number; components: unknown[] } {
    return { flags: this.flags, components: this.components.map(c => c.toJSON()) };
  }
}

/** Start a new V2 response — the terse form of `new FadeResponse()`. */
export function response(): FadeResponse {
  return new FadeResponse();
}
