# Obsidian Base View Builder Skill

This skill helps you create custom Obsidian Base views by generating complete, production-ready code based on the Obsidian Developer Documentation.

## Overview

Bases is a core Obsidian plugin that displays dynamic views of notes as tables, cards, lists, and more. This skill helps you create custom views that render data from note properties.

## Capabilities

This skill can help you:

1. **Create a custom Bases view** - Generate the complete view class with proper structure
2. **Register the view** - Set up the registration with the plugin
3. **Add configuration options** - Create user-facing controls (text, toggle, dropdown, slider, etc.)
4. **Display data** - Render properties from your notes in various formats
5. **Handle grouping** - Organize entries by property values
6. **Support interactions** - Add click handlers, hover previews, file links
7. **Optimize performance** - Generate efficient rendering code for large datasets

## Prerequisites

To use this skill effectively, ensure you have:

- A working Obsidian plugin project set up
- Basic knowledge of TypeScript and the Plugin class
- An Obsidian vault for testing (preferably a dedicated dev vault)

## Usage Patterns

### Quick Start

When you want to build a new Base view, describe:
- **View type** (list, card, table, custom grid, Kanban board, calendar view, etc.)
- **Properties to display** (file name, custom frontmatter properties, formulas)
- **Grouping** (optional - group by property or date)
- **Sorting** (optional - sort order)
- **Configuration options** (user settings like separators, display format, etc.)

### Generate Code

The skill will generate:
1. View type constant
2. Plugin registration code
3. View class with proper extends BasesView
4. onDataUpdated rendering logic
5. All necessary imports
6. Configuration options (if needed)

## Code Template

Here's a template that this skill can generate:

## File Path Handling for Images

When working with image properties in Bases views, proper path handling is critical. **Don't manually construct `app://` URLs** - instead, use Obsidian's built-in path resolution.

### Key Principles

1. **Use `vault.getResourcePath(file)`** - This is the official API for getting browser-loadable image URIs
2. **Don't construct URLs manually** - Vault-specific UUIDs, encoding, and prefixes are complex
3. **Handle multiple property formats** - Users may store paths as wikilinks, bare paths, or external URLs

### Image Property Formats

Property values can come in many forms:

```yaml
# Wiki link syntax
cover: "[[Attachments/photo.jpg]]"
cover: "![[Attachments/photo.jpg]]"  # Embed

# With display text
cover: "[[photo.jpg|My Photo]]"

# With subpath
cover: "[[photo.jpg#block-id]]"

# Bare vault path
cover: "diary/_Attachments/photo.jpg"

# External URL
cover: "https://example.com/photo.jpg"

# Data URL
cover: "data:image/png;base64,..."
```

### Helper Function Pattern

Use this pattern to resolve any image property to a proper URI:

```typescript
import { TFile, TFolder, normalizePath } from 'obsidian';

function resolveImagePath(
  app: App,
  rawValue: any,
  sourcePath: string
): string | null {
  if (rawValue == null) return null;

  // Convert Bases Value objects to string
  const value =
    typeof rawValue === 'object' && 'toString' in rawValue
      ? String(rawValue)
      : String(rawValue);

  const trimmed = value.trim();
  if (!trimmed) return null;

  // External URLs: use directly
  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  // Strip wiki/embed syntax: [[path]], ![[path]], [text](path)
  let link = trimmed
    .replace(/^!?\[\[|\]\]$/g, '')
    .replace(/^!?\[/, '')
    .replace(/\]\(.*\)$/, '')
    .trim();

  // Remove display text: [[path|label]] → path
  link = link.split('|')?.[0]?.trim() ?? '';
  
  // Remove subpath markers: [[path#heading]] → path
  link = link.split('#')?.[0]?.trim() ?? '';
  
  if (!link) return null;

  // Try as exact vault path first
  const normalizedPath = normalizePath(link);
  const directFile = app.vault.getAbstractFileByPath(normalizedPath);
  if (directFile instanceof TFile) {
    return app.vault.getResourcePath(directFile);
  }

  // Resolve relative to source note's location
  const resolvedFile = app.metadataCache.getFirstLinkpathDest(
    link,
    sourcePath
  );
  
  if (resolvedFile && resolvedFile instanceof TFile) {
    return app.vault.getResourcePath(resolvedFile);
  }

  return null;
}
```

### Using in a Bases View

```typescript
public onDataUpdated(): void {
  const imageProperty = String(this.config.get('imageProp') ?? '');
  if (!imageProperty) return;

  for (const group of this.data.groupedData) {
    for (const entry of group.entries) {
      const rawValue = entry.getValue(imageProperty);
      const imageSrc = resolveImagePath(this.app, rawValue, entry.file.path);

      if (!imageSrc) continue;

      const img = this.containerEl.createEl('img', {
        cls: 'my-card-image',
      });
      img.src = imageSrc;
      img.alt = entry.file.basename;
    }
  }
}
```

### Common Pitfalls

❌ **Don't:**
```typescript
// Manual app:// URL - fragile and wrong
img.src = `app://${vaultUuid}/${encodedPath}`;
```

✅ **Do:**
```typescript
// Proper resource path
const file = app.vault.getAbstractFileByPath(normalizedPath);
img.src = app.vault.getResourcePath(file);
```

❌ **Don't:**
```typescript
// Assume paths are simple strings
img.src = rawPropertyValue;  // Might be [[path]] or relative
```

✅ **Do:**
```typescript
// Always resolve through the API
const file = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
img.src = app.vault.getResourcePath(file);
```

### Key Takeaways

1. **Always use `vault.getResourcePath(TFile)`** for proper browser URIs
2. **Strip wiki syntax** before path resolution
3. **Try multiple resolution strategies**: exact path first, then relative to note
4. **Handle external URLs** as a special case - they don't need resolution
5. **Always validate the file exists** before using the path

```typescript
import { Plugin, BasesView, QueryController, HoverParent, HoverPopover, Keymap, parsePropertyId } from 'obsidian';
import { BasesViewConfig, BasesQueryResult, BasesEntryGroup, BasesEntry, Value } from 'obsidian';

// Define unique view type ID
export const MyCustomViewType = 'my-custom-view';

export default class MyPlugin extends Plugin {
    async onload() {
        // Register the Bases view
        this.registerBasesView(MyCustomViewType, {
            name: 'My Custom View',
            icon: 'lucide-graduation-cap', // Use lucide icon name
            factory: (controller, containerEl) => {
                return new MyCustomView(controller, containerEl);
            },
            options: () => ([
                // User-configurable options
                {
                    type: 'text',
                    displayName: 'Property separator',
                    key: 'separator',
                    default: ' - ',
                },
                {
                    type: 'toggle',
                    displayName: 'Show file paths',
                    key: 'showPaths',
                    default: false,
                },
            ]),
        });
    }
}

// View class
export class MyCustomView extends BasesView implements HoverParent {
    readonly type = MyCustomViewType;
    private containerEl: HTMLElement;
    hoverPopover: HoverPopover | null = null;

    constructor(controller: QueryController, parentEl: HTMLElement) {
        super(controller);
        this.containerEl = parentEl.createDiv('my-custom-view-container');
    }

    public async onDataUpdated(): Promise<void> {
        const { app, config, data } = this;

        // Clear previous content
        this.containerEl.empty();

        // Get user config
        const separator = String(config.get('separator')) || ' - ';
        const showPaths = config.get('showPaths');

        // Get ordered properties
        const order = config.getOrder();

        // Handle grouped data
        for (const group of data.groupedData) {
            const groupEl = this.containerEl.createDiv('my-group');
            
            if (group.hasKey()) {
                groupEl.createDiv('my-group-title', { text: String(group.key) });
            }

            const listEl = groupEl.createDiv('my-group-list');

            for (const entry of group.entries) {
                const itemEl = listEl.createDiv('my-entry');

                for (const propertyName of order) {
                    const { type, name } = parsePropertyId(propertyName);
                    const value = entry.getValue(propertyName);

                    if (!value || !value.isTruthy()) continue;

                    // Add separator between properties
                    // ...

                    // Handle different property types
                    if (name === 'name' && type === 'file') {
                        // Render clickable file link
                        const linkEl = itemEl.createEl('a', {
                            text: String(entry.file.name),
                        });

                        linkEl.onClickEvent((evt) => {
                            if (evt.button === 0 || evt.button === 1) {
                                evt.preventDefault();
                                const modEvent = Keymap.isModEvent(evt);
                                void app.workspace.openLinkText(entry.file.path, '', modEvent);
                            }
                        });

                        // Add hover preview
                        linkEl.addEventListener('mouseover', (evt) => {
                            app.workspace.trigger('hover-link', {
                                event: evt,
                                source: 'bases',
                                hoverParent: this,
                                targetEl: linkEl,
                                linktext: entry.file.path,
                            });
                        });
                    } else {
                        // Render regular property value
                        itemEl.createSpan({
                            text: value.toString(),
                        });
                    }
                }
            }
        }
    }

    // Optional: Handle hover parent interface
    onMouseEnterLink(linktext: string, element: HTMLElement): void {
        // Implement if needed
    }

    onMouseLeaveLink(linktext: string): void {
        // Implement if needed
    }
}
```

## Configuration Options Reference

### Available Option Types

| Type | Description | Example |
|------|-------------|---------|
| `'text'` | Text input field | Separator character |
| `'toggle'` | True/false switch | Show/hide paths |
| `'dropdown'` | Dropdown menu | Select format |
| `'slider'` | Range slider | Opacity, size |
| `'multitext'` | Multi-line text | Long descriptions |

### Option Properties

```typescript
{
    type: 'text' | 'toggle' | 'dropdown' | 'slider' | 'multitext',
    displayName: string,        // Label shown to user
    key: string,                // Unique identifier for config
    default: any,               // Default value
    placeholder?: string,       // For text inputs
    options?: Record<string, string>, // For dropdown
}
```

## Best Practices

### Performance

1. **Handle large datasets**: Views may render thousands of entries
2. **Reuse DOM elements**: Don't just empty and re-render
3. **Defer expensive operations**: Only compute what's visible
4. **Use grouped data**: When grouping is configured, use `groupedData`

### Code Quality

1. **Use registered callbacks**: Register all listeners with `this.register*` methods
2. **Implement cleanup**: Handle view unloading properly
3. **Type safety**: Use TypeScript types from obsidian package
4. **Error handling**: Gracefully handle missing or invalid data

### UX Considerations

1. **Provide sensible defaults**: Don't force users to configure everything
2. **Make options discoverable**: Clear, descriptive labels
3. **Support keyboard navigation**: Standard Obsidian behaviors
4. **Enable hover previews**: Use the hover-link event system

## API Reference

### Key Classes

- **`BasesView`** - Base class for all Bases views
  - Properties: `type`, `config`, `data`, `app`, `allProperties`
  - Methods: `onDataUpdated()` (abstract), `createFileForView()`

- **`BasesViewConfig`** - View configuration
  - Methods: `get(key)`, `getOrder()`, `getSort()`, `getDisplayName()`

- **`BasesQueryResult`** - Query results
  - Properties: `groupedData`, `ungroupedData`

- **`BasesEntryGroup`** - Group of entries
  - Properties: `entries`, `key`

- **`BasesEntry`** - Single entry
  - Methods: `getValue(propertyId)`
  - Properties: `file`

## Examples

### 1. Simple List View

Display file names with a custom separator.

### 2. Card View

Display properties in a card layout with styling.

### 3. Kanban Board

Group by a status property, show cards in columns.

### 4. Calendar View

Group by date property, show entries in calendar format.

### 5. Gallery View

Display files with thumbnails or icons.

## Common Issues

### View doesn't appear in list
- Check that `registerBasesView` is called in `onload()`
- Verify the view type ID is unique
- Ensure `main.js` is rebuilt and Obsidian reloaded

### Properties not showing
- Verify property IDs are correct using `parsePropertyId()`
- Check if properties are included in the order
- Use `entry.getValue()` correctly

### Performance issues
- Consider only rendering visible entries
- Use virtual scrolling for large datasets
- Avoid creating new objects in render loop

## Getting Help

If you need assistance:
1. Check the [Obsidian Developer Documentation](https://docs.obsidian.md)
2. Join the [Obsidian Discord server](https://discord.gg/obsidianmd)
3. Ask in the "obsidian-bases" or "plugin-dev" channels

---

**Need help building a specific Base view?** Just describe what you want to create, and I'll generate the complete code for you.
