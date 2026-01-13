# ActivityStreams & Activity Vocabulary Primer

ActivityStreams 2.0 is a JSON-LD based format for describing social activities and content. The Activity Vocabulary defines the core types and properties.

## Core Concepts

ActivityStreams has three fundamental object categories:

1. **Object** - Base type for all things (notes, images, profiles, etc.)
2. **Activity** - Describes an action (Create, Like, Follow, etc.)
3. **Actor** - Entities that perform activities (Person, Organization, Service)

## Basic Structure

Every ActivityStreams document uses the AS2 context:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "id": "https://example.org/notes/1",
  "content": "Hello, world!"
}
```

## Common Properties

### Identity & Metadata

| Property | Description | Functional |
|----------|-------------|------------|
| `id` | Unique IRI identifier | Yes |
| `type` | Object type(s) | No |
| `name` | Display name | No |
| `summary` | Short description | No |
| `content` | Primary content (HTML allowed) | No |

### Temporal Properties

| Property | Description | Functional |
|----------|-------------|------------|
| `published` | When created | Yes |
| `updated` | Last modified | Yes |
| `startTime` | When activity begins | Yes |
| `endTime` | When activity ends | Yes |
| `duration` | Time span (xsd:duration) | Yes |

### Attribution & Addressing

| Property | Description | Functional |
|----------|-------------|------------|
| `attributedTo` | Creator/author | No |
| `to` | Primary recipients | No |
| `cc` | Secondary recipients | No |
| `bcc` | Hidden recipients | No |
| `audience` | Intended audience | No |

## Object Types

### Content Objects

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "id": "https://example.org/notes/123",
  "attributedTo": "https://example.org/users/alice",
  "content": "<p>This is a <strong>note</strong>.</p>",
  "published": "2024-01-15T10:00:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://example.org/users/alice/followers"]
}
```

Common content types: `Note`, `Article`, `Image`, `Video`, `Audio`, `Document`, `Page`, `Event`

### Media Objects

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Image",
  "mediaType": "image/jpeg",
  "url": "https://example.org/images/photo.jpg",
  "width": 1920,
  "height": 1080
}
```

### Links

Links wrap URLs with additional metadata:

```json
{
  "type": "Link",
  "href": "https://example.org/article",
  "mediaType": "text/html",
  "hreflang": "en",
  "name": "Read the article"
}
```

## Activity Types

Activities describe actions. The core properties:

- `actor` - Who performed the activity
- `object` - What the activity affects
- `target` - Where the object is directed
- `result` - Outcome of the activity
- `origin` - Where the object came from
- `instrument` - What was used to perform the activity

### Create

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Create",
  "actor": "https://example.org/users/alice",
  "object": {
    "type": "Note",
    "content": "Hello!"
  }
}
```

### Like / Announce (boost/repost)

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Like",
  "actor": "https://example.org/users/bob",
  "object": "https://example.org/notes/123"
}
```

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Announce",
  "actor": "https://example.org/users/bob",
  "object": "https://example.org/notes/123"
}
```

### Follow / Accept / Reject

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Follow",
  "id": "https://example.org/activities/follow/1",
  "actor": "https://example.org/users/bob",
  "object": "https://example.org/users/alice"
}
```

Accept a follow:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Accept",
  "actor": "https://example.org/users/alice",
  "object": "https://example.org/activities/follow/1"
}
```

### Update / Delete

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Update",
  "actor": "https://example.org/users/alice",
  "object": {
    "id": "https://example.org/notes/123",
    "type": "Note",
    "content": "Updated content"
  }
}
```

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Delete",
  "actor": "https://example.org/users/alice",
  "object": "https://example.org/notes/123"
}
```

### Undo

Reverses a previous activity:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Undo",
  "actor": "https://example.org/users/bob",
  "object": {
    "type": "Like",
    "actor": "https://example.org/users/bob",
    "object": "https://example.org/notes/123"
  }
}
```

### Other Activity Types

- **Add/Remove** - Add/remove objects to/from collections
- **Move** - Move object from origin to target
- **Block** - Block an actor
- **Flag** - Report content

## Actor Types

### Person

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Person",
  "id": "https://example.org/users/alice",
  "name": "Alice",
  "preferredUsername": "alice",
  "summary": "Just a person",
  "inbox": "https://example.org/users/alice/inbox",
  "outbox": "https://example.org/users/alice/outbox",
  "followers": "https://example.org/users/alice/followers",
  "following": "https://example.org/users/alice/following",
  "icon": {
    "type": "Image",
    "url": "https://example.org/users/alice/avatar.png"
  }
}
```

Other actor types: `Application`, `Group`, `Organization`, `Service`

## Collections

Collections are lists of objects:

### OrderedCollection

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollection",
  "id": "https://example.org/users/alice/outbox",
  "totalItems": 100,
  "first": "https://example.org/users/alice/outbox?page=1",
  "last": "https://example.org/users/alice/outbox?page=10"
}
```

### OrderedCollectionPage

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "OrderedCollectionPage",
  "id": "https://example.org/users/alice/outbox?page=1",
  "partOf": "https://example.org/users/alice/outbox",
  "next": "https://example.org/users/alice/outbox?page=2",
  "orderedItems": [
    { "type": "Create", "..." : "..." },
    { "type": "Announce", "..." : "..." }
  ]
}
```

## Tags & Mentions

Use the `tag` property for hashtags and mentions:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "content": "Hello @bob, check out #activitypub",
  "tag": [
    {
      "type": "Mention",
      "href": "https://example.org/users/bob",
      "name": "@bob"
    },
    {
      "type": "Hashtag",
      "href": "https://example.org/tags/activitypub",
      "name": "#activitypub"
    }
  ]
}
```

## Public Addressing

The special IRI for public content:

```
https://www.w3.org/ns/activitystreams#Public
```

Put in `to` for fully public, or `cc` for unlisted (public but not on public timelines).

## Practical Tips

1. **Always set `id`** - Objects should have unique, dereferenceable IRIs.

2. **Normalize multi-value properties** - Properties like `to`, `cc`, `tag` can be single values or arrays:
   ```typescript
   const asArray = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
   ```

3. **Handle `type` as array** - Objects can have multiple types:
   ```json
   { "type": ["Person", "Organization"] }
   ```

4. **Use `attributedTo` for authorship** - Don't assume `actor` on nested objects.

5. **Check `mediaType`** - Content can be plain text or HTML; check before rendering.

6. **Respect `audience`** - Filter content based on addressing properties.

7. **Tombstones for deletions** - Replace deleted objects with:
   ```json
   {
     "type": "Tombstone",
     "id": "https://example.org/notes/123",
     "deleted": "2024-01-15T12:00:00Z"
   }
   ```
