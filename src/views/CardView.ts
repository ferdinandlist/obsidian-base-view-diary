import {
	Plugin,
	BasesView,
	QueryController,
	HoverParent,
	HoverPopover,
	Keymap,
	parsePropertyId,
	TFile,
	TFolder,
	normalizePath,
	Platform,
} from 'obsidian';
import { BasesViewConfig, BasesQueryResult, BasesEntryGroup, Value } from 'obsidian';

export const CardViewType = 'card-view';

export class CardView extends BasesView implements HoverParent {
	readonly type = CardViewType;
	private containerEl: HTMLElement;
	hoverPopover: HoverPopover | null = null;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.containerEl = parentEl.createDiv('card-view-container');
	}

	public async onDataUpdated(): Promise<void> {
		const { app, config, data } = this;

		// Clear previous content
		this.containerEl.empty();

		// Get user configuration
		const imageProp = String(config.get('imageProp')).trim();
		const excerptProp = String(config.get('excerptProp')).trim();
		const cardHeight = Number(config.get('cardHeight')) || 200;

		// Get ordered properties for display
		const order = config.getOrder();

		// Render grouped data
		for (const group of data.groupedData) {
			// Create group wrapper
			const groupEl = this.containerEl.createDiv('card-view-group');

			// Show group title if grouped
			if (group.hasKey()) {
				const groupTitle = groupEl.createDiv('card-view-group-title');
				groupTitle.createSpan({ text: String(group.key) });
			}

			// Create cards container
			const cardsContainer = groupEl.createDiv('card-view-cards');

			// Render each entry as a card
			for (const entry of group.entries) {
				const card = await this.createCard(entry, imageProp, excerptProp, order, cardHeight);
				cardsContainer.appendChild(card);
			}
		}
	}

	/**
	 * Create a single card element for an entry
	 * Layout: fixed Title, a scrollable body (Image → Excerpt) that caps at the
	 * configured card height, then fixed Properties (values only) pinned at the
	 * bottom of the card so they always stay visible.
	 */
	private async createCard(
		entry: any,
		imageProp: string,
		excerptProp: string,
		order: string[],
		cardHeight: number
	): Promise<HTMLElement> {
		const { app } = this;

		// Create card wrapper
		const cardEl = this.containerEl.createDiv('card-view-card');

		// Title at the top (without file extension)
		const titleEl = cardEl.createDiv('card-view-card-title');
		const titleText = String(entry.file.basename);
		const titleLink = titleEl.createEl('a', {
			text: titleText,
			href: '#',
		});

		// Handle title link clicks
		titleLink.onClickEvent((evt) => {
			if (evt.button === 0 || evt.button === 1) {
				evt.preventDefault();
				const modEvent = Keymap.isModEvent(evt);
				void app.workspace.openLinkText(entry.file.path, '', modEvent);
			}
		});

		// Add hover preview
		titleLink.addEventListener('mouseover', (evt) => {
			app.workspace.trigger('hover-link', {
				event: evt,
				source: 'bases',
				hoverParent: this,
				targetEl: titleLink,
				linktext: entry.file.path,
			});
		});

		titleLink.addEventListener('mouseleave', () => {
			app.workspace.trigger('hover-link-gone', {
				source: 'bases',
				linktext: entry.file.path,
			});
		});

		// Scrollable body: image + excerpt only. The body caps at the configured
		// card height and scrolls when its content overflows.
		const bodyEl = cardEl.createDiv('card-view-card-body');
		bodyEl.style.maxHeight = `${cardHeight}px`;

		// Image if present
		const imageUrl = this.getImage(entry, imageProp);
		if (imageUrl) {
			const imgEl = bodyEl.createEl('img', {
				cls: 'card-view-card-image',
			});
			imgEl.src = imageUrl;
			imgEl.alt = '';
		}

		// Excerpt if present
		let excerptText: string | null = null;
		
		if (excerptProp) {
			const excerptValue = entry.getValue(excerptProp as any);
			if (excerptValue && excerptValue.isTruthy()) {
				excerptText = this.stripEmbeds(excerptValue.toString()).trim();
			}
		}
		
		// If no excerpt property or empty, use first 300 chars of note content
		if (!excerptText) {
			excerptText = await this.getNoteExcerpt(entry.file);
		}
		
		if (excerptText) {
			const excerptEl = bodyEl.createDiv('card-view-card-excerpt');
			excerptEl.setText(excerptText);
		}

		// Properties if present (values only, no labels)
		const hasProperties = await this.hasAnyProperties(entry, order, imageProp, excerptProp);
		if (hasProperties) {
			// Properties live outside the scroll body so they stay pinned at the
			// bottom of the card and remain visible.
			const propertiesContainer = cardEl.createDiv('card-view-card-properties');
			
			for (const propertyName of order) {
				// Skip name (title) and image/excerpt properties
				const { type, name } = parsePropertyId(propertyName as any);
				if (name === 'name') continue;
				if (imageProp && name === imageProp) continue;
				if (excerptProp && name === excerptProp) continue;

				const value = entry.getValue(propertyName);
				if (!value || !value.isTruthy()) continue;

				// Create property value element
				const propEl = propertiesContainer.createDiv('card-view-card-property');
				
				// Get raw value string
				let valueStr = value.toString().trim();
				
				// Strip property name prefix for tag/list properties (e.g., "tags\n#tag1, #tag2")
				const lines = valueStr.split('\n');
				if (lines.length > 1) {
					// Check if first line looks like a property name (short, no #)
					const firstLine = lines[0].trim();
					if (firstLine.length < 20 && !firstLine.includes('#')) {
						// This is likely a property name prefix, skip it
						valueStr = lines.slice(1).join('\n').trim();
					}
				}
				
				// Skip if value is empty after cleanup
				if (!valueStr) continue;
				
				// Render value
				if (name === 'file') {
					// File property - create link
					const fileLinkEl = propEl.createEl('a', {
						text: valueStr,
						href: '#',
					});
					fileLinkEl.onClickEvent((evt) => {
						if (evt.button === 0 || evt.button === 1) {
							evt.preventDefault();
							const modEvent = Keymap.isModEvent(evt);
							void app.workspace.openLinkText(valueStr, '', modEvent);
						}
					});
				} else if (name === 'tag' || valueStr.startsWith('#')) {
					// Tag property - render as pills
					// Split by common delimiters (comma, newline, space)
					const tags = valueStr.split(/,|\n|\s+/).filter((tag: string) => tag.trim());
					
					for (const tag of tags) {
						const trimmedTag = tag.trim();
						if (!trimmedTag) continue;
						
						// Ensure tag starts with #
						const fullTag = trimmedTag.startsWith('#') ? trimmedTag : `#${trimmedTag}`;
						
						// Create pill-style tag link
						const tagLink = propEl.createEl('span', {
							cls: 'card-view-tag-pill',
							text: fullTag,
						});
						
						tagLink.onClickEvent((evt) => {
							if (evt.button === 0 || evt.button === 1) {
								evt.preventDefault();
								
								// Open the search with the tag query using obsidian://search URI
								const searchQuery = `tag:${fullTag}`;
								const url = `obsidian://search?query=${encodeURIComponent(searchQuery)}`;
								
								window.open(url);
							}
						});
					}
				} else {
					// Regular property value
					propEl.setText(valueStr);
				}
			}
		}

		return cardEl;
	}

	/**
	 * Check if entry has any properties to display
	 */
	private async hasAnyProperties(
		entry: any,
		order: string[],
		imageProp: string,
		excerptProp: string
	): Promise<boolean> {
		for (const propertyName of order) {
			const { name } = parsePropertyId(propertyName as any);
			if (name === 'name') continue;
			if (imageProp && name === imageProp) continue;
			if (excerptProp && name === excerptProp) continue;

			const value = entry.getValue(propertyName);
			if (value && value.isTruthy()) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Remove Obsidian embeds so they don't render as literal text in excerpts.
	 * Strips wiki embeds (![[...]]) and markdown image embeds (![alt](url)),
	 * then collapses leftover horizontal whitespace. Newlines are preserved so
	 * paragraph detection in getNoteExcerpt keeps working.
	 */
	private stripEmbeds(text: string): string {
		return text
			.replace(/!\[\[.*?\]\]/g, '')
			.replace(/!\[[^\]]*?\]\([^)]*?\)/g, '')
			.replace(/[ \t]{2,}/g, ' ');
	}

	/**
	 * Get the first 300 characters of a note's content as excerpt
	 * Extracts the first paragraph (consecutive lines without blank lines)
	 */
	private async getNoteExcerpt(file: TFile): Promise<string | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			if (!content) return null;
			
			// Remove frontmatter
			let text = content;
			if (content.startsWith('---')) {
				const frontmatterEnd = content.indexOf('---', 3);
				if (frontmatterEnd > 0) {
					text = content.substring(frontmatterEnd + 3);
				}
			}
			
			// Strip embeds (e.g. ![[image.png]]) so they don't appear as text
			text = this.stripEmbeds(text);
			
			// Get first paragraph (consecutive non-empty lines)
			const lines = text.split('\n');
			const paragraphLines: string[] = [];
			
			for (const line of lines) {
				const trimmed = line.trim();
				
				// Skip leading blank lines
				if (trimmed === '' && paragraphLines.length === 0) {
					continue;
				}
				
				// Stop at first blank line (end of paragraph)
				if (trimmed === '') {
					break;
				}
				
				paragraphLines.push(trimmed);
			}
			
			if (paragraphLines.length === 0) return null;
			
			// Join lines with spaces and truncate to 300 chars
			const fullText = paragraphLines.join(' ');
			
			if (fullText.length <= 300) {
				return fullText;
			} else {
				return fullText.substring(0, 300) + '...';
			}
		} catch (e) {
			// If we can't read the file, return null
			return null;
		}
	}

	/**
	 * Get image URL from entry via configured property
	 * Uses vault.getResourcePath() for proper app:// URLs
	 */
	private getImage(entry: any, imagePropName: string): string | null {
		// Only use configured property (no fallback to attachments)
		if (!imagePropName) {
			return null;
		}

		const imageValue = entry.getValue(imagePropName as any);
		if (!imageValue || !imageValue.isTruthy()) {
			return null;
		}

		// Get the raw string value
		let rawValue = String(imageValue);
		const trimmedValue = rawValue.trim();
		
		if (!trimmedValue) {
			return null;
		}

		// Handle external URLs directly
		if (/^(https?:|data:|blob:)/i.test(trimmedValue)) {
			return trimmedValue;
		}

		// Strip wiki/embed syntax: [[path]], ![[path]], [text](path)
		let linkPath = trimmedValue
			.replace(/^!?\[\[|\]\]$/g, '')
			.replace(/^!?\[/, '')
			.replace(/\]\(.*\)$/, '')
			.trim();

		// Remove optional display text: [[path|label]]
		linkPath = linkPath.split('|')?.[0]?.trim() ?? '';
		
		// Remove subpath markers: [[path#heading]]
		linkPath = linkPath.split('#')?.[0]?.trim() ?? '';
		
		if (!linkPath) {
			return null;
		}

		// First, try resolving as an exact vault path
		const normalizedPath = normalizePath(linkPath);
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		
		if (file instanceof TFile) {
			return this.app.vault.getResourcePath(file);
		}

		// If not found, try resolving relative to the note's location
		const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(
			linkPath,
			entry.file.path
		);
		
		if (resolvedFile && resolvedFile instanceof TFile) {
			return this.app.vault.getResourcePath(resolvedFile);
		}

		return null;
	}

	// Hover parent interface implementation
	onMouseEnterLink(linktext: string, element: HTMLElement): void {
		// Optional: Custom hover enter logic
	}

	onMouseLeaveLink(linktext: string): void {
		// Optional: Custom hover leave logic
	}
}
