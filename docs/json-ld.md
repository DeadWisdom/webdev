# JSON-LD Primer

JSON-LD (JavaScript Object Notation for Linked Data) is a method of encoding Linked Data using JSON. It lets you add meaning to JSON by mapping keys to globally unique identifiers (IRIs).

## The @context Field

The `@context` defines how to interpret keys in your JSON. It maps short property names to full IRIs:

```json
{
  "@context": {
    "name": "https://schema.org/name",
    "homepage": "https://schema.org/url"
  },
  "name": "Alice",
  "homepage": "https://alice.example.com"
}
```

You can also reference external contexts by URL:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Person",
  "name": "Alice"
}
```

Or combine multiple contexts:

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "customField": "https://example.org/ns/customField"
    }
  ]
}
```

## Field Uniqueness via IRIs

Every property in JSON-LD maps to a unique IRI. Two different vocabularies can both have a `name` field, but they're distinct because they expand to different IRIs:

```json
{
  "@context": {
    "displayName": "https://schema.org/name",
    "asName": "https://www.w3.org/ns/activitystreams#name"
  }
}
```

This prevents collisions when mixing vocabularies.

## Properties Can Have Multiple Values

In JSON-LD, any property can have multiple values using an array:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "to": [
    "https://example.org/users/bob",
    "https://example.org/users/charlie"
  ],
  "tag": [
    {
      "type": "Mention",
      "href": "https://example.org/users/bob",
      "name": "@bob"
    },
    {
      "type": "Hashtag",
      "href": "https://example.org/tags/json",
      "name": "#json"
    }
  ]
}
```

When processing JSON-LD, always handle properties as potentially having multiple values, even if you only expect one.

## Functional Properties

Some vocabularies define certain properties as **functional**, meaning they should only have one value. ActivityStreams uses this for properties like:

- `id` - unique identifier
- `published` - publication date
- `startTime` / `endTime` - temporal bounds
- `duration`

Non-functional properties (can have multiple values):
- `to`, `cc`, `bcc` - recipients
- `tag` - attached tags/mentions
- `attachment` - media attachments

When defining your own vocabulary, consider whether a property logically should have exactly one value (functional) or potentially many.

## ActivityStreams Examples

### Creating an Activity

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "id": "https://example.org/activities/1",
  "actor": "https://example.org/users/alice",
  "published": "2024-01-15T10:30:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://example.org/users/alice/followers"],
  "object": {
    "type": "Note",
    "id": "https://example.org/notes/1",
    "content": "Hello, world!",
    "attributedTo": "https://example.org/users/alice"
  }
}
```

### A Person Actor

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Person",
  "id": "https://example.org/users/alice",
  "name": "Alice",
  "preferredUsername": "alice",
  "inbox": "https://example.org/users/alice/inbox",
  "outbox": "https://example.org/users/alice/outbox",
  "followers": "https://example.org/users/alice/followers",
  "following": "https://example.org/users/alice/following"
}
```

### A Collection

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "id": "https://example.org/users/alice/outbox",
  "totalItems": 42,
  "first": "https://example.org/users/alice/outbox?page=1"
}
```

## Practical Tips

1. **Always include @context** - Without it, your JSON has no semantic meaning.

2. **Use established vocabularies** - ActivityStreams, Schema.org, and others provide well-defined terms.

3. **Normalize when processing** - Use a JSON-LD library to expand documents to their canonical form for consistent handling.

4. **Handle arrays defensively** - Even single values might come as arrays; always normalize in your code:
   ```typescript
   const toArray = (value) => Array.isArray(value) ? value : [value];
   const recipients = toArray(activity.to);
   ```

5. **Use `@id` for references** - Link to other objects by their IRI rather than embedding:
   ```json
   { "actor": "https://example.org/users/alice" }
   ```
   vs embedding the full object.

6. **Compact vs Expanded form** - JSON-LD can be processed in expanded form (full IRIs) or compacted (using context). Choose based on your needs.
